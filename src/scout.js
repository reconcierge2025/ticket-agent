// "הסייר": מופעים חדשים שעלו, מעקב אחרי אמנים (/follow), ואתרי כרטיסים חדשים שהסוכן מוצא לבד.
import { eventKey, externalDomains } from './discover.js';
import { siteFor } from './sites.js';
import { esc } from './check.js';
import { log } from './config.js';
import { matchesArtist } from './translit.js';
import { starFor } from './artists.js';

const norm = (s) => String(s || '').toLowerCase().replace(/["'״׳]/g, '').trim();

// ---------- מעקב אחרי אמנים ----------
export function follow(db, owner, kw) {
  db.follows ||= [];
  const k = kw.trim();
  if (!k) return false;
  if (!db.follows.some((f) => f.owner === owner && norm(f.kw) === norm(k))) db.follows.push({ owner, kw: k, at: new Date().toISOString() });
  return true;
}
export function unfollow(db, owner, kw) {
  const before = (db.follows ||= []).length;
  db.follows = db.follows.filter((f) => !(f.owner === owner && norm(f.kw) === norm(kw)));
  return db.follows.length < before;
}
export const followsOf = (db, owner) => (db.follows || []).filter((f) => f.owner === owner);

/** מזהה קצר לקישור (לכפתורים – טלגרם מגביל ל-64 תווים). */
function shortId(db, url) {
  db.links ||= {};
  const existing = Object.entries(db.links).find(([, u]) => u === url);
  if (existing) return existing[0];
  const id = String((db.linkSeq = (db.linkSeq || 0) + 1));
  db.links[id] = url;
  const ids = Object.keys(db.links);
  if (ids.length > 500) for (const old of ids.slice(0, ids.length - 500)) delete db.links[old];
  return id;
}

/**
 * מופעים חדשים שעלו מאז הסריקה הקודמת.
 * בפעם הראשונה רק לומד מה קיים (בלי הודעות). אחר כך:
 * - מי שעוקב אחרי אמן מקבל הודעה אישית כשעולה לו מופע
 * - כולם מקבלים סיכום "🆕 עלו מופעים חדשים" (אפשר לכבות: newShowsDigest=false)
 */
export async function announceNewShows(db, cfg, found, notify, skipKeys = new Set()) {
  db.known ||= {};
  const fresh = found.filter((e) => !db.known[eventKey(e.url)] && !skipKeys.has(eventKey(e.url)));
  const firstRun = !db.knownSeeded;
  for (const e of found) db.known[eventKey(e.url)] ||= new Date().toISOString();
  db.knownSeeded = true;
  if (firstRun || !fresh.length) return [];

  const nameOf = (e) => e.name.split(': ').slice(1).join(': ') || e.name;
  // התראות אישיות לעוקבים
  for (const f of db.follows || []) {
    const hits = fresh.filter((e) => matchesArtist(f.kw, e.name)); // גם כשהשם באנגלית (לפי צליל)
    if (!hits.length) continue;
    await notify(
      `⭐ <b>עלה מופע חדש של ${esc(f.kw)}!</b>\n\n` + hits.slice(0, 8).map((e) => `🎟️ ${esc(nameOf(e))}`).join('\n'),
      { to: f.owner, urgent: true, buttons: hits.slice(0, 4).map((e) => [{ text: `👀 עקוב: ${nameOf(e).slice(0, 28)}`, data: `w:${shortId(db, e.url)}` }]) }
    );
  }
  // סיכום כללי
  if (cfg.newShowsDigest !== false) {
    await notify(
      `🆕 <b>עלו ${fresh.length} מופעים חדשים</b>\n\n` +
        fresh.slice(0, 12).map((e) => `🎟️ <a href="${esc(e.url)}">${esc(nameOf(e).slice(0, 60))}</a>`).join('\n') +
        (fresh.length > 12 ? `\nועוד ${fresh.length - 12}...` : '') +
        '\n\n💡 <code>/follow שם אמן</code> – ואודיע לך אישית כשעולה לו מופע.',
      { urgent: false, buttons: fresh.slice(0, 5).map((e) => [{ text: `👀 עקוב: ${nameOf(e).slice(0, 28)}`, data: `w:${shortId(db, e.url)}` }]) }
    );
  }
  return fresh;
}

export const linkFor = (db, id) => db.links?.[id] || null;

/** הקטלוג: כל המופעים מהסריקה האחרונה (לחיפוש מיידי כשמוסיפים אמן). */
export function saveCatalog(db, found) {
  db.catalog = { at: new Date().toISOString(), events: found.map((e) => ({ name: e.name, url: e.url })) };
}

/** הופעות קיימות של אמן בקטלוג → הודעה + כפתורי "👀 עקוב". null אם אין קטלוג עדיין. */
export function existingShowsMessage(db, artist) {
  if (!db.catalog?.events?.length) return null;
  const hits = db.catalog.events.filter((e) => matchesArtist(artist, e.name));
  const nameOf = (e) => e.name.split(': ').slice(1).join(': ') || e.name;
  if (!hits.length) return { text: `🔍 כרגע אין הופעות של ${esc(artist)} באתרים שאני סורק.\nאודיע לך ברגע שתעלה הופעה.` };
  return {
    text:
      `🎤 <b>מצאתי ${hits.length === 1 ? 'הופעה קיימת' : `${hits.length} הופעות קיימות`} של ${esc(artist)}:</b>\n\n` +
      hits.slice(0, 10).map((e) => `🎟️ <a href="${esc(e.url)}">${esc(nameOf(e).slice(0, 60))}</a> · ${esc(e.name.split(': ')[0])}`).join('\n') +
      '\n\nלחץ 👀 ואבדוק את המקומות הכי קרובים בכל התאריכים.',
    buttons: hits.slice(0, 5).map((e) => [{ text: `👀 ${nameOf(e).slice(0, 30)}`, data: `w:${shortId(db, e.url)}` }]),
  };
}

// ---------- אמנים מובילים ----------
/**
 * הופעות של אמנים מהרשימה המובנית (artists.js) – גם קיימות וגם חדשות.
 * כל מופע מדווח פעם אחת בלבד. מחזיר את המופעים שדווחו (כדי שלא יופיעו שוב ב"מופעים חדשים").
 */
export async function announceStars(db, cfg, found, notify) {
  if (cfg.stars === false) return [];
  db.starSeen ||= {};
  const hits = [];
  for (const e of found) {
    const key = eventKey(e.url);
    if (db.starSeen[key]) continue;
    const star = starFor(e.name);
    if (!star) continue;
    db.starSeen[key] = new Date().toISOString();
    hits.push({ e, star });
  }
  if (!hits.length) return [];
  const nameOf = (e) => e.name.split(': ').slice(1).join(': ') || e.name;
  const site = (e) => e.name.split(': ')[0];
  const byStar = new Map();
  for (const h of hits) byStar.set(h.star.name, [...(byStar.get(h.star.name) || []), h.e]);
  const lines = [`⭐ <b>הופעות של אמנים מובילים (${byStar.size})</b>`];
  for (const [name, evs] of [...byStar].slice(0, 15)) {
    lines.push('', `🎤 <b>${esc(name)}</b>`);
    for (const e of evs.slice(0, 3)) lines.push(`   <a href="${esc(e.url)}">${esc(nameOf(e).slice(0, 55))}</a> · ${esc(site(e))}`);
  }
  if (byStar.size > 15) lines.push('', `ועוד ${byStar.size - 15} אמנים...`);
  lines.push('', 'לחץ 👀 כדי שאבדוק את המקומות הכי קרובים ואעקוב אחרי המופע.');
  await notify(lines.join('\n'), {
    urgent: false,
    buttons: hits.slice(0, 6).map(({ e, star }) => [{ text: `👀 ${star.name}: ${nameOf(e).slice(0, 22)}`, data: `w:${shortId(db, e.url)}` }]),
  });
  return hits.map((h) => h.e);
}

// ---------- אתרים חדשים שהסוכן מוצא לבד ----------
const BLOCK = /access denied|attention required|verify you are human|captcha|just a moment|forbidden|blocked|רק רגע/i;

/** בודק עד 3 דומיינים חדשים בכל סבב: נגיש? חוסם? איזו פלטפורמה? */
export async function probeNewSites(browser, db, notify, limit = 3) {
  db.candidates ||= {};
  const todo = [...externalDomains].filter(([host]) => !siteFor(`https://${host}/`) && !db.candidates[host] && !db.learned?.[host]).slice(0, limit);
  const found = [];
  for (const [host, info] of todo) {
    const page = await browser.newPage({ locale: 'he-IL' });
    const c = { from: info.from, at: new Date().toISOString() };
    try {
      const res = await page.goto(`https://${host}/`, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await page.waitForTimeout(2500);
      const title = (await page.title()).slice(0, 60);
      const html = (await page.content()).slice(0, 400000);
      const text = await page.evaluate(() => document.body?.innerText?.slice(0, 20000) || '').catch(() => '');
      c.title = title;
      c.status = res?.status();
      const sellsTickets = /כרטיס|הופעות|הזמנת|tickets?\b|concerts?|shows?\b|events?\b|entradas|billets|karten/i.test(`${title} ${text}`);
      c.kind =
        (c.status >= 400 && c.status !== 404) || BLOCK.test(title)
          ? 'blocked'
          : !sellsTickets
            ? 'not-tickets'
          : /\/booking\/features\//.test(html)
            ? 'kupat-like'
            : /seatmap\.vivenu\.com|vivenu/.test(html)
              ? 'vivenu'
              : /ticketmaster/i.test(host)
                ? 'ticketmaster'
                : 'avail';
    } catch (e) {
      c.kind = 'down';
      c.error = e.message.split('\n')[0].slice(0, 80);
    } finally {
      await page.close().catch(() => {});
    }
    db.candidates[host] = c;
    log(`  [סייר] ${host}: ${c.kind}`);
    if (!['blocked', 'down', 'not-tickets'].includes(c.kind)) found.push([host, c]);
  }
  if (found.length) {
    const kindHe = { 'kupat-like': '🟢 מערכת כמו קופת ת"א (מושבים)', vivenu: '🟢 מפת vivenu (מושבים)', ticketmaster: '🟢 Ticketmaster', avail: '🟡 זמינות ומחיר' };
    await notify(
      `🔎 <b>מצאתי לבד ${found.length === 1 ? 'אתר כרטיסים חדש' : `${found.length} אתרי כרטיסים חדשים`}</b>\n\n` +
        found.map(([h, c]) => `• <b>${esc(h)}</b> – ${kindHe[c.kind] || c.kind}${c.title ? `\n  <i>${esc(c.title)}</i>` : ''}\n  (קישור מתוך ${esc(c.from)})`).join('\n') +
        '\n\nשלח לי קישור למופע מהאתר ואתחיל לעבוד איתו.',
      { urgent: false }
    );
  }
  return found;
}
