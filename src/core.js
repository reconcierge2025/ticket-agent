// הלוגיקה המשותפת למחשב (agent.js) ולענן (cloud.js): בדיקה מיידית, סבב בדיקה, פקודות טלגרם.
import { resolveEvent, log } from './config.js';
import { save } from './storage.js';
import { formatReport, formatDigest } from './telegram.js';
import { launchScanner } from './browser.js';
import { checkEvent, targetRowOf, esc } from './check.js';
import { discover, eventKey } from './discover.js';
import * as watches from './watches.js';

/** כמות ספציפית אם ביקשת, אחרת כל הטווח (ברירת מחדל 2–5). */
export const withQuantity = (ev, q) => (q ? { ...ev, quantity: q, quantities: [q] } : ev);
/** מפרק תוצאה של אירוע עם כמה תאריכים לתוצאות נפרדות. */
const flat = (r) => (r.parts ? r.parts.flatMap(flat) : [r]);

export function createAgent({ cfg, db, notify, onFound }) {
  const target = targetRowOf(cfg.defaults || {});

  /** בדיקה מיידית של מופע שביקשת – תמיד שולח מה הכי קרוב שנמצא (גם אם רחוק משורה 4). */
  async function checkNow(ev) {
    const browser = await launchScanner(cfg);
    try {
      const r = await checkEvent(browser, ev, { cfg, db, notify });
      const parts = flat(r).filter((p) => p.status !== 'queue');
      if (!parts.length && r.status !== 'queue') await notify(`😕 לא מצאתי תאריכים פתוחים למכירה ב:\n${esc(ev.url)}`);
      for (const part of parts) await notify(formatReport(part.event, part.options, { targetRow: target }));
    } catch (e) {
      await notify(`❌ לא הצלחתי לבדוק את המופע\n${esc(ev.url)}\n<i>${esc(e.message.split('\n')[0])}</i>`);
    } finally {
      save(db);
      await browser.close();
    }
  }

  let running = false;
  /** סבב בדיקה: המופעים שלך (התראה רק כשמשהו השתפר) + סריקה כללית (הודעת סיכום אחת). */
  async function runCycle() {
    if (running) return false;
    running = true;
    const browser = await launchScanner(cfg);
    try {
      const mine = [...(cfg.events || []), ...watches.list()].map((e) => withQuantity(resolveEvent(cfg, e), e.quantity));
      const found = await discover(browser, cfg);
      const myKeys = new Set(mine.map((e) => eventKey(e.url)));
      const events = [...mine, ...found.filter((e) => !myKeys.has(eventKey(e.url)))];
      log(`סבב בדיקה: ${mine.length} שלך + ${events.length - mine.length} מהסריקה הכללית`);

      const discovered = [];
      for (const ev of events) {
        try {
          const r = await checkEvent(browser, ev, { cfg, db, notify });
          log(`  ${ev.name}: ${r.status}, ${r.options.length} אפשרויות, ${r.improved.length} שיפורים`);
          if (ev.discovered) discovered.push(...flat(r));
          else
            for (const part of flat(r)) {
              if (!part.improved.length) continue;
              await notify(formatReport(part.event, part.improved, { improvedOnly: true, targetRow: target }));
              onFound?.(part.event);
            }
        } catch (e) {
          log(`  שגיאה ב-${ev.name}: ${e.message.split('\n')[0]}`);
        }
        save(db);
      }
      const digest = formatDigest(discovered, target);
      if (digest) await notify(digest);
      db.lastCycle = new Date().toISOString();
      return true;
    } finally {
      save(db);
      await browser.close();
      running = false;
    }
  }

  /** פקודות טלגרם (onSale מגיע מבחוץ – רק במחשב). */
  const handlers = (pending) => ({
    onWatch: (url, q) => {
      const n = watches.add({ url, ...(q ? { quantity: q } : {}) });
      pending.push(() => checkNow(withQuantity(resolveEvent(cfg, { url }), q)));
      const what = q ? `${q} כרטיסים` : `${(cfg.defaults?.quantities || [2]).join('/')} כרטיסים`;
      return `✅ <b>נוסף למעקב</b> (${what})\nיש עכשיו ${n} מופעים במעקב.\n\n🔍 בודק את כל התאריכים ושולח לך מה הכי קרוב שמצאתי.\nאחר כך אודיע רק כשיימצא משהו קרוב יותר.`;
    },
    onList: () => {
      const w = watches.list();
      if (!w.length) return '📋 אין מופעים במעקב.\nשלח לי קישור למופע כדי להתחיל.';
      return '📋 <b>במעקב:</b>\n' + w.map((x, i) => `${i + 1}. <a href="${esc(x.url)}">${esc(x.url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 45))}</a>${x.quantity ? ` · ${x.quantity} כרטיסים` : ''}`).join('\n') + '\n\nלהסרה: /remove &lt;מספר&gt;';
    },
    onRemove: (n) => {
      const r = watches.remove(n);
      return r ? `🗑️ הוסר מהמעקב:\n${esc(r.url)}` : 'אין מספר כזה ברשימה. שלח /list לרשימה.';
    },
    onCheck: () => {
      if (running) return '⏳ בדיקה כבר רצה.';
      pending.push(() => runCycle());
      return '🔍 בודק את כל המופעים עכשיו...';
    },
  });

  return { checkNow, runCycle, handlers, isRunning: () => running };
}
