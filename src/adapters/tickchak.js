// טיקצ'אק LIVE – עמוד אירוע שמכיל כמה מופעים/קטגוריות (למשל "צמאה תשפ"ז" עם גברים, נשים, יריד, נוער, התוועדויות).
// כל מופע בעמוד מקושר לעמוד המכירה שלו. המתאם קורא את כל המופעים וסטטוס כל אחד:
//   soldout – "אזל המלאי"
//   buy     – "לאתר המכירה" / "לרכישה" (נפתח למכירה)
//   info    – "לפרטים והרשמה" / "לפרטים נוספים" (אין מכירה ישירה)
// הקנייה עצמה נעשית אצלך באתר המכירה. הסוכן רק מתריע כשמשהו עובר ל"buy".
import { esc } from '../check.js';

export const name = 'tickchak';
export const kind = 'subevents';
export const matches = (url) => /live\.tickchak\.co\.il\/(?!shows|cities|artists|dates|today|hanukkah|mor|ben-zur|omer-adam|NEXT|parties|toursandattractions|cantorial-music|football|musical|concerts|theater|standup|childrens-shows|Lectures|performances-for-women|abu-table|central|northern|southern|judea-and-samaria|haifa-district|jerusalem-district|tuna|hananbenari|ishayribo|shlomo-artzi|dudu-tassa|bini-landau|kids)[a-z0-9-]+\/?$/i.test(url);

export function statusOf(text) {
  if (/אזל/.test(text)) return 'soldout';
  if (/לאתר המכירה|לרכישה|הזמנת כרטיסים|לרכישת/.test(text)) return 'buy';
  return 'info';
}

/**
 * כל המופעים בעמוד – גם כאלה שהם קישור לאתר המכירה וגם כרטיסים שפותחים פרטים ("למודעה").
 * כל כרטיס מזוהה לפי הטקסט שלו (תאריך + שם), כך שהזיהוי יציב גם בלי קישור.
 */
export async function getSubEvents(page, eventUrl) {
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const raw = await page.evaluate(() => {
    const isCard = (t) => /\d{1,2}\.\d{1,2}/.test(t) && t.length > 25 && t.length < 500 && /אזל המלאי|לאתר המכירה|למודעה|לפרטים/.test(t);
    const out = new Map();
    const triggers = [...document.querySelectorAll('a[href], button')].filter((e) => /אזל המלאי|לאתר המכירה|למודעה|לפרטים/.test(e.innerText || ''));
    for (const el of triggers) {
      let card = el;
      for (let i = 0; i < 8 && card.parentElement && !isCard(card.innerText || ''); i++) card = card.parentElement;
      if (!isCard(card.innerText || '')) continue;
      const text = card.innerText.trim();
      // מופע שמפנה לאתר המכירה: הקישור נותן מזהה יציב
      const link = [...card.querySelectorAll('a[href]')].map((a) => a.href).find((h) => /tickchak\.co\.il\/\d+/.test(h)) || '';
      const key = (link.match(/tickchak\.co\.il\/(\d+)/) || [])[1] || text.replace(/\s+/g, ' ').slice(0, 120);
      if (!out.has(key)) out.set(key, { key, link: link.split('?')[0], text });
    }
    return [...out.values()];
  });
  const STATUS_WORD = /^(אזל המלאי|לאתר המכירה|למודעה|לפרטים והרשמה|לפרטים נוספים|לפרטים|להזמנת כרטיסים|כל פרטי)$/;
  const items = raw.map((r) => {
    // כרטיסים בלי ירידות שורה: "24.11.26יום שלישי16:00לאתר המכירהיריד…" → מפרקים לשורות
    const flat = r.text
      .replace(/(\d{1,2}\.\d{1,2}\.\d{2})/g, '\n$1\n')
      .replace(/(יום [^\n\d]*?\d{1,2}:\d{2})/g, '\n$1\n')
      .replace(/(לאתר המכירה|למודעה|לפרטים והרשמה|אזל המלאי)/g, '\n$1\n');
    const lines = flat.split('\n').map((l) => l.trim()).filter(Boolean);
    const d = r.text.match(/(\d{1,2})\.(\d{1,2})(?:\.(\d{2}))?/);
    const time = (r.text.match(/\b(\d{1,2}:\d{2})\b/) || [])[1] || null;
    // תווית קריאה: השם והמקום בלבד – בלי מילות סטטוס, כפתורים, תאריכים, ימים ושעות
    const parts = lines.filter(
      (l) =>
        !STATUS_WORD.test(l) &&
        !/^\d{1,2}[./]\d{1,2}/.test(l) &&
        !/^(יום |מוצאי|שבת|ראשון|שני|שלישי|רביעי|חמישי)/.test(l) &&
        !/^\d{1,2}:\d{2}$/.test(l) &&
        !/^·?\s*\d{1,2}:\d{2}\s*·?$/.test(l) &&
        !/^[א-ת"׳'\s]{1,8}$/.test(l) &&
        !/^\d+$/.test(l)
    );
    const label = [...new Set(parts.map((p) => p.replace(/^·\s*/, '').trim()).filter(Boolean))]
      .join(' · ')
      .replace(/([^·\s])\s*(בנייני האומה|היכל [^·]+?)(?=\s*(·|$))/g, '$1 · $2')
      .replace(/\s*·\s*(·\s*)+/g, ' · ');
    const id = r.link ? r.link.match(/(\d+)$/)[1] : `h${Buffer.from(r.key).toString('base64').slice(0, 14)}`;
    return {
      id,
      url: r.link || eventUrl,
      date: d ? `${d[3] ? '20' + d[3] : '2026'}-${d[2].padStart(2, '0')}-${d[1].padStart(2, '0')}` : null,
      time,
      label: label || r.text.slice(0, 80),
      status: statusOf(r.text),
    };
  });
  // אותו מופע מופיע לפעמים כשני כרטיסים (הכפתור והכרטיס) – מאחדים לפי תאריך+שעה+שם
  const merged = new Map();
  for (const it of items) {
    const k = `${it.date}|${it.time}|${it.label}`;
    const prev = merged.get(k);
    // עדיף הכרטיס שיש לו קישור לאתר המכירה, ואחרת את הסטטוס "אזל"/"במכירה" על פני "פרטים"
    if (!prev || (it.url !== eventUrl && prev.url === eventUrl) || (prev.status === 'info' && it.status !== 'info')) merged.set(k, it);
  }
  return [...merged.values()];
}

/**
 * השוואה למה שנשמר: מופע שנוסף, או שעבר ל"buy" מכל סטטוס אחר.
 * בהרצה הראשונה רק לומד (בלי התראות).
 */
export function diffSubEvents(db, eventUrl, subs, { firstRun = false } = {}) {
  db.subs ||= {};
  const prev = (db.subs[eventUrl] ||= {});
  const changes = [];
  for (const s of subs) {
    const was = prev[s.id];
    if (!firstRun) {
      if (!was) changes.push({ kind: 'new', sub: s });
      else if (was !== 'buy' && s.status === 'buy') changes.push({ kind: 'opened', sub: s, was });
    }
    prev[s.id] = s.status;
  }
  return changes;
}

const ICON = { new: '🆕', opened: '🟢' };
const HEAD = { new: 'מופע חדש בעמוד', opened: 'נפתחה מכירה!' };

export function formatSubChanges(eventName, changes) {
  const lines = [`🎫 <b>${esc(eventName)}</b>`];
  for (const kind of ['opened', 'new']) {
    const list = changes.filter((c) => c.kind === kind);
    if (!list.length) continue;
    lines.push('', `${ICON[kind]} <b>${HEAD[kind]}</b>`);
    for (const c of list.slice(0, 10)) lines.push(`• ${esc(c.sub.label)}\n  <a href="${esc(c.sub.url)}">לאתר המכירה</a>`);
  }
  return lines.join('\n');
}

export function formatSubList(eventName, subs) {
  const groups = { buy: '🟢 במכירה עכשיו', info: 'ℹ️ פרטים בלבד', soldout: '🔴 אזל' };
  const lines = [`🎫 <b>${esc(eventName)}</b> · ${subs.length} מופעים`];
  for (const st of ['buy', 'info', 'soldout']) {
    const list = subs.filter((s) => s.status === st);
    if (!list.length) continue;
    lines.push('', `<b>${groups[st]} (${list.length})</b>`);
    for (const s of list.slice(0, 12)) lines.push(`• ${esc(s.label.slice(0, 70))}`);
    if (list.length > 12) lines.push(`ועוד ${list.length - 12}...`);
  }
  return lines.join('\n');
}
