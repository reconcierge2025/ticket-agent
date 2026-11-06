// הלוגיקה המשותפת למחשב, לשרת ולענן: בדיקות, מעקב, בריאות האתרים, סיכום יומי, פקודות וכפתורים.
import { resolveEvent, log, israelNow } from './config.js';
import { save, once } from './storage.js';
import { formatReport, formatDigest, formatAvail } from './telegram.js';
import { siteFor, sitesText, LEVELS } from './sites.js';
import { launchScanner } from './browser.js';
import { checkEvent, pickAdapter, targetRowOf, esc } from './check.js';
import { discover, eventKey } from './discover.js';
import * as watches from './watches.js';

/** כמות ספציפית אם ביקשת, אחרת כל הטווח (ברירת מחדל 2–5). */
export const withQuantity = (ev, q) => (q ? { ...ev, quantity: q, quantities: [q] } : ev);
/** מפרק תוצאה של אירוע עם כמה תאריכים לתוצאות נפרדות. */
const flat = (r) => (r.parts ? r.parts.flatMap(flat) : [r]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const short = (url) => url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 45);
const SITE_NAMES = { kupat: 'קופת ת"א', ticketmaster: 'Ticketmaster', generic: 'אתר כללי' };

/** אירוע מתוך רשומת מעקב. */
export const watchEvent = (cfg, w) =>
  withQuantity(resolveEvent(cfg, { url: w.url, watchId: w.id, owner: w.owner, hot: w.hot, ...(w.maxPrice ? { maxPrice: w.maxPrice } : {}) }), w.quantity);

/**
 * notify(text, { to, urgent, buttons }) – מגיע מ-messenger.js
 * onSale(url, qty, ctx) – מצב קנייה (רק במחשב); בלעדיו הכפתור והפקודה מסבירים שזה במחשב בלבד.
 */
export function createAgent({ cfg, db, notify, onSale, mode = 'pc' }) {
  const target = targetRowOf(cfg.defaults || {});
  db.health ||= {};
  db.stats ||= { since: new Date().toISOString(), cycles: 0, checks: 0, errors: 0, alerts: 0 };

  const buttonsFor = (event) => {
    if (!event.watchId) return [[{ text: '🔗 לעמוד המופע', url: event.url }]];
    const w = watches.get(event.watchId);
    return [
      [
        { text: '🔄 בדוק עכשיו', data: `chk:${event.watchId}` },
        { text: w?.hot ? '🐢 מעקב רגיל' : '🔥 מעקב צפוף', data: `hot:${event.watchId}` },
      ],
      [{ text: '🛒 מצב קנייה', data: `sale:${event.watchId}` }, { text: '🔕 הפסק מעקב', data: `stop:${event.watchId}` }],
      [{ text: '🔗 לעמוד המופע', url: event.url }],
    ];
  };

  // ---------- בריאות האתרים ----------
  function track(site, ok, error) {
    const h = (db.health[site] ||= { fails: 0 });
    if (ok) {
      if (h.alerted) {
        notify(`✅ <b>${esc(SITE_NAMES[site] || site)} חזר לעבוד</b>`);
        h.alerted = false;
      }
      Object.assign(h, { fails: 0, lastOk: new Date().toISOString() });
    } else {
      h.fails++;
      h.lastError = String(error || 'לא נמצאו מושבים').split('\n')[0].slice(0, 200);
      h.lastErrorAt = new Date().toISOString();
      db.stats.errors++;
    }
  }
  async function healthAlerts() {
    for (const [site, h] of Object.entries(db.health)) {
      if (h.fails >= (cfg.healthFailThreshold ?? 3) && once(db, `health|${site}|${israelNow().date}`)) {
        h.alerted = true;
        await notify(
          `⚠️ <b>בעיה ב-${esc(SITE_NAMES[site] || site)}</b>\n${h.fails} בדיקות רצופות נכשלו.\nשגיאה אחרונה: <i>${esc(h.lastError)}</i>\n\nכנראה שהאתר שינה מבנה או חוסם. ייתכן שצריך לעדכן את הסוכן.`
        );
      }
    }
  }

  /** בדיקה של אירוע עם ניסיון חוזר, מעקב בריאות והפסקה מנומסת בין בקשות. */
  async function checkTracked(browser, ev) {
    const site = (await pickAdapter(ev)).name;
    for (let attempt = 1; ; attempt++) {
      try {
        const r = await checkEvent(browser, ev, { cfg, db, notify });
        db.stats.checks++;
        const parts = flat(r);
        const seats = parts.reduce((n, p) => n + (p.seats?.length || 0), 0);
        const readOk = seats > 0 || parts.some((p) => p.avail?.checked);
        // תור או אין תאריכים פתוחים = לא תקלה
        if (r.status !== 'queue' && parts.length) track(site, readOk, readOk ? null : 'האתר החזיר 0 מושבים');
        return r;
      } catch (e) {
        if (attempt >= 2) {
          track(site, false, e.message);
          throw e;
        }
        await sleep(5000);
      } finally {
        await sleep(cfg.politeDelayMs ?? 1500);
      }
    }
  }

  async function reportImprovements(r) {
    for (const part of flat(r)) {
      if (part.avail && ['opened', 'cheaper'].includes(part.availChange)) {
        db.stats.alerts++;
        await notify(formatAvail(part.event, part.avail, part.availChange), { to: part.event.owner, urgent: true, buttons: buttonsFor(part.event) });
        continue;
      }
      if (!part.improved.length) continue;
      db.stats.alerts++;
      await notify(formatReport(part.event, part.improved, { improvedOnly: true, targetRow: target }), {
        to: part.event.owner,
        urgent: !!part.event.hot, // מעקב צפוף = דחוף גם בשעות השקט
        buttons: buttonsFor(part.event),
      });
    }
  }

  /** בדיקה מיידית של מופע שביקשת – תמיד שולח מה הכי קרוב שנמצא (גם אם רחוק משורה 4). */
  async function checkNow(ev) {
    const browser = await launchScanner(cfg);
    try {
      const r = await checkTracked(browser, ev);
      const parts = flat(r).filter((p) => p.status !== 'queue');
      if (!parts.length && r.status !== 'queue') await notify(`😕 לא מצאתי תאריכים פתוחים למכירה ב:\n${esc(ev.url)}`, { to: ev.owner });
      for (const part of parts) {
        const text = part.avail ? formatAvail(part.event, part.avail) : formatReport(part.event, part.options, { targetRow: target });
        await notify(text, { to: ev.owner, buttons: buttonsFor(part.event) });
      }
    } catch (e) {
      await notify(`❌ לא הצלחתי לבדוק את המופע\n${esc(ev.url)}\n<i>${esc(e.message.split('\n')[0])}</i>`, { to: ev.owner });
    } finally {
      save(db);
      await browser.close();
    }
  }

  let running = false;
  /** סבב מלא: המופעים במעקב (התראה כשמשהו השתפר) + סריקה כללית (הודעת סיכום אחת). */
  async function runCycle() {
    if (running) return false;
    running = true;
    const browser = await launchScanner(cfg);
    try {
      const mine = [...(cfg.events || []).map((e) => withQuantity(resolveEvent(cfg, e), e.quantity)), ...watches.list().map((w) => watchEvent(cfg, w))];
      const found = await discover(browser, cfg);
      for (const site of (cfg.sites || []).filter((s) => s.listUrl && s.enabled !== false)) {
        const n = found.filter((e) => e.name.startsWith(`${site.name}:`)).length;
        track(`סריקה: ${site.name}`, n > 0, n ? null : 'לא נמצאו מופעים בעמוד הראשי');
      }
      const myKeys = new Set(mine.map((e) => eventKey(e.url)));
      const events = [...mine, ...found.filter((e) => !myKeys.has(eventKey(e.url)))];
      log(`סבב בדיקה: ${mine.length} במעקב + ${events.length - mine.length} מהסריקה הכללית`);

      const discovered = [];
      for (const ev of events) {
        try {
          const r = await checkTracked(browser, ev);
          log(`  ${ev.name}: ${r.status}, ${r.options.length} אפשרויות, ${r.improved.length} שיפורים`);
          if (ev.discovered) discovered.push(...flat(r));
          else await reportImprovements(r);
        } catch (e) {
          log(`  שגיאה ב-${ev.name}: ${e.message.split('\n')[0]}`);
        }
        save(db);
      }
      const digest = formatDigest(discovered, target);
      if (digest) await notify(digest, { urgent: false });
      db.lastCycle = new Date().toISOString();
      db.stats.cycles++;
      await healthAlerts();
      return true;
    } finally {
      save(db);
      await browser.close();
      running = false;
    }
  }

  let hotRunning = false;
  /** מעקב צפוף: רק המופעים שסימנת 🔥 (נקרא כל כמה דקות). */
  async function checkHot() {
    const hot = watches.list().filter((w) => w.hot);
    if (hotRunning || !hot.length) return;
    hotRunning = true;
    const browser = await launchScanner(cfg);
    try {
      for (const w of hot) {
        try {
          await reportImprovements(await checkTracked(browser, watchEvent(cfg, w)));
        } catch (e) {
          log(`  [hot] שגיאה ב-${w.url}: ${e.message.split('\n')[0]}`);
        }
      }
      await healthAlerts();
    } finally {
      save(db);
      await browser.close();
      hotRunning = false;
    }
  }

  // ---------- סיכום יומי ----------
  function statusText() {
    const s = db.stats;
    const w = watches.list();
    const lines = [
      `📊 <b>מצב הסוכן</b> (${mode === 'server' ? 'שרת' : mode === 'cloud' ? 'GitHub' : 'מחשב'})`,
      '',
      `🎟️ במעקב: ${w.length} מופעים${w.some((x) => x.hot) ? ` (🔥 ${w.filter((x) => x.hot).length} צפוף)` : ''}`,
      `🔄 סבב מלא אחרון: ${db.lastCycle ? new Date(db.lastCycle).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' }) : 'עוד לא'}`,
      `📈 מאז ${new Date(s.since).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' })}: ${s.cycles} סבבים · ${s.checks} בדיקות · ${s.alerts} התראות · ${s.errors} שגיאות`,
      '',
      '<b>האתרים:</b>',
      ...Object.entries(db.health).map(([site, h]) => `${h.fails ? '⚠️' : '✅'} ${esc(SITE_NAMES[site] || site)}${h.fails ? ` – ${h.fails} כשלונות: <i>${esc(h.lastError)}</i>` : ''}`),
    ];
    if (!Object.keys(db.health).length) lines.push('עוד לא נבדקו');
    return lines.join('\n');
  }
  async function heartbeat() {
    const now = israelNow();
    if (now.hour < (cfg.heartbeatHour ?? 9) || !once(db, `heartbeat|${now.date}`)) return;
    await notify(`☀️ <b>בוקר טוב – הסוכן פועל</b>\n\n${statusText().split('\n').slice(2).join('\n')}`, { urgent: true });
    db.stats = { since: new Date().toISOString(), cycles: 0, checks: 0, errors: 0, alerts: 0 };
    save(db);
  }

  // ---------- פקודות וכפתורים ----------
  const saleUnavailable = '🖥️ <b>מצב קנייה עובד רק במחשב</b>\nהוא צריך חלון דפדפן שבו אתה מחובר ומשלם.\nהפעל את הסוכן במחשב (npm start) ושלח שם /sale.';

  const handlers = (pending) => ({
    onWatch: (url, q, { from, maxPrice } = {}) => {
      const site = siteFor(url);
      if (site && ['blocked', 'down', 'guide'].includes(site.level)) {
        const why = { blocked: 'חוסם סוכנים אוטומטיים, ואני לא עוקף הגנות כאלה', down: 'לא נגיש מהסוכן', guide: 'הוא מנוע חיפוש שמפנה לאתרים אחרים – שלח לי את הקישור לאתר המכירה עצמו' }[site.level];
        return `${LEVELS[site.level].icon} <b>${esc(site.name)}</b> ${why}.\n\nלרשימת האתרים שאני עובד איתם: /sites`;
      }
      const w = watches.add({ url, owner: from, ...(q ? { quantity: q } : {}), ...(maxPrice ? { maxPrice } : {}) });
      pending.push(() => checkNow(watchEvent(cfg, w)));
      const what = q ? `${q} כרטיסים` : `${(cfg.defaults?.quantities || [2]).join('/')} כרטיסים`;
      return `✅ <b>נוסף למעקב</b> (#${w.id} · ${what}${maxPrice ? ` · עד ${maxPrice} ₪` : ''})\n\n🔍 בודק את כל התאריכים ושולח לך מה הכי קרוב שמצאתי.\nאחר כך אודיע רק כשיימצא משהו קרוב יותר.`;
    },
    onSale: (url, q, ctx) => (onSale ? onSale(url, q, ctx) : saleUnavailable),
    onList: (from) => {
      const w = watches.list(from);
      if (!w.length) return '📋 אין לך מופעים במעקב.\nשלח לי קישור למופע כדי להתחיל.';
      return {
        text:
          '📋 <b>המופעים שלך במעקב:</b>\n\n' +
          w
            .map((x) => `${x.hot ? '🔥' : '▫️'} <b>#${x.id}</b> <a href="${esc(x.url)}">${esc(short(x.url))}</a>${x.quantity ? ` · ${x.quantity} כרט'` : ''}${x.maxPrice ? ` · עד ${x.maxPrice} ₪` : ''}`)
            .join('\n'),
        buttons: w.slice(0, 8).map((x) => [
          { text: `🔄 #${x.id}`, data: `chk:${x.id}` },
          { text: x.hot ? `🐢 #${x.id}` : `🔥 #${x.id}`, data: `hot:${x.id}` },
          { text: `🔕 #${x.id}`, data: `stop:${x.id}` },
        ]),
      };
    },
    onRemove: (id, from) => {
      const r = watches.remove(id, from);
      return r ? `🔕 הוסר מהמעקב (#${r.id}):\n${esc(r.url)}` : 'אין מספר כזה ברשימה שלך. שלח /list.';
    },
    onCheck: () => {
      if (running) return '⏳ סבב בדיקה כבר רץ.';
      pending.push(() => runCycle());
      return '🔍 בודק את כל המופעים עכשיו...';
    },
    onStatus: () => statusText(),
    onSites: () => sitesText(),
    onButton: (action, id, from) => {
      const w = watches.get(id);
      if (!w) return 'המופע הזה כבר לא במעקב.';
      if (action === 'stop') return handlers(pending).onRemove(id, from);
      if (action === 'chk') {
        pending.push(() => checkNow(watchEvent(cfg, w)));
        return `🔄 בודק עכשיו את #${w.id}...`;
      }
      if (action === 'hot') {
        const on = !w.hot;
        watches.update(id, { hot: on });
        const every = cfg.hotEveryMinutes ?? 3;
        return on
          ? `🔥 <b>מעקב צפוף הופעל</b> ל-#${w.id}\nאבדוק כל ${every} דקות${mode === 'cloud' ? ' (ב-GitHub: כל חצי שעה – לבדיקה כל כמה דקות צריך את השרת)' : ''}, והתראות יגיעו גם בשעות השקט.`
          : `🐢 #${w.id} חזר למעקב רגיל (כל שעה).`;
      }
      if (action === 'sale') return onSale ? onSale(w.url, w.quantity, { from }) : saleUnavailable;
      return null;
    },
  });

  return { checkNow, runCycle, checkHot, heartbeat, statusText, handlers, isRunning: () => running };
}
