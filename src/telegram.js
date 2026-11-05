// טלגרם: שליחה לכל המשתמשים המורשים + עיצוב ההתראות (HTML: הדגשות וקישורים).
import { pathToFileURL } from 'node:url';
import { loadConfig } from './config.js';
import { describe, esc } from './check.js';
import { rowNum } from './seats.js';

export function chatIds(tg) {
  return [...(tg.chatIds || []), ...(tg.chatId ? [tg.chatId] : [])].map(String).filter((id) => id && !id.startsWith('PUT_'));
}

export function isConfigured(tg) {
  return tg?.botToken && !tg.botToken.startsWith('PUT_');
}

export async function api(tg, method, body) {
  const res = await fetch(`https://api.telegram.org/bot${tg.botToken}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`Telegram ${method}: ${json.description}`);
  return json.result;
}

const stripTags = (t) => t.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** שולח לכל האנשים שברשימה (או לאחד מסוים אם ניתן `to`). אם ה-HTML נשבר – שולח כטקסט רגיל. */
export async function sendTelegram(tg, text, to) {
  if (!isConfigured(tg)) {
    console.log('[telegram לא מוגדר] ההודעה הייתה:\n' + stripTags(text));
    return;
  }
  for (const id of to ? [to] : chatIds(tg)) {
    try {
      await api(tg, 'sendMessage', { chat_id: id, text, parse_mode: 'HTML', disable_web_page_preview: true });
    } catch (e) {
      if (!/parse entities/i.test(e.message)) throw e;
      await api(tg, 'sendMessage', { chat_id: id, text: stripTags(text), disable_web_page_preview: true });
    }
  }
}

const byQuantity = (opts) => {
  const m = new Map();
  for (const o of opts) m.set(o.quantity, [...(m.get(o.quantity) || []), o]);
  return [...m].sort((a, b) => a[0] - b[0]);
};

const header = (event) => {
  const [title, ...rest] = event.name.split(': ');
  const name = rest.length ? rest.join(': ') : title;
  return [`🎟️ <b>${esc(name)}</b>`, ...(event.date ? [`📅 ${esc(event.date)}`] : [])];
};
const link = (url) => `🔗 <a href="${esc(url)}">לעמוד המופע</a>`;

/**
 * הודעה על אירוע: מה הכי קרוב שנמצא, לכל כמות ולכל אזור – גם אם זה רחוק משורה 4.
 * improvedOnly=true → רק מה שהשתפר מאז הפעם הקודמת.
 */
export function formatReport(event, options, { improvedOnly = false, targetRow = 4 } = {}) {
  if (!options.length) {
    return [...header(event), '', '😕 כרגע אין מקומות צמודים פנויים.', 'אבדוק שוב כל שעה ואודיע ברגע שיימצא משהו.', '', link(event.url)].join('\n');
  }
  const upgrade = improvedOnly && options.some((o) => o.previous);
  const lines = [...header(event), '', upgrade ? '⬆️ <b>נמצאו מקומות קרובים יותר!</b>' : '🏆 <b>המקומות הכי קרובים שמצאתי:</b>'];
  for (const [q, opts] of byQuantity(options)) {
    lines.push('', `👥 <b>${q} כרטיסים צמודים</b>`);
    for (const o of [...opts].sort((a, b) => rowNum(a.row) - rowNum(b.row))) {
      const mark = rowNum(o.row) <= targetRow ? '🎯' : '▫️';
      const was = o.previous ? ` <i>(היה שורה ${esc(o.previous.row)})</i>` : '';
      lines.push(`${mark} ${esc(describe(o))}${was}`);
    }
  }
  lines.push('', `🎯 = שורה 1–${targetRow}`, link(event.url));
  if (!upgrade) lines.push('', 'אמשיך לבדוק כל שעה ואודיע רק אם יימצא משהו קרוב יותר.');
  return lines.join('\n');
}

/** סיכום אחד לכל המופעים מהסריקה הכללית – רק מה שבשורות 1–targetRow. */
export function formatDigest(results, targetRow = 4) {
  const rows = results
    .map((r) => ({ r, good: r.improved.filter((o) => rowNum(o.row) <= targetRow) }))
    .filter((x) => x.good.length)
    .map((x) => {
      const best = new Map();
      for (const o of x.good) if (!best.has(o.quantity) || rowNum(o.row) < rowNum(best.get(o.quantity).row)) best.set(o.quantity, o);
      return { ...x, best: [...best].sort((a, b) => a[0] - b[0]), top: Math.min(...x.good.map((o) => rowNum(o.row))) };
    })
    .sort((a, b) => a.top - b.top);
  if (!rows.length) return null;
  const lines = [`📰 <b>סריקה כללית – ${rows.length} מופעים עם מקומות בשורות 1–${targetRow}</b>`];
  for (const { r, best } of rows.slice(0, 12)) {
    const [, ...rest] = r.event.name.split(': ');
    lines.push(
      '',
      `🎟️ <b>${esc(rest.join(': ') || r.event.name)}</b>${r.event.date ? ` · ${esc(r.event.date)}` : ''}`,
      ...best.map(([q, o]) => `   👥 ${q}: ${esc(o.section)} · שורה ${esc(o.row)}`),
      `   <a href="${esc(r.event.url)}">לעמוד המופע</a>`
    );
  }
  if (rows.length > 12) lines.push('', `ועוד ${rows.length - 12} מופעים...`);
  lines.push('', '💡 למעקב צמוד אחרי מופע – שלח לי את הקישור שלו.');
  return lines.join('\n');
}

// הרצה ישירה: npm run telegram-test → שולח הודעת בדיקה לכולם
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cfg = loadConfig();
  await sendTelegram(cfg.telegram, '✅ <b>הסוכן מחובר לטלגרם ועובד</b>');
  console.log(`נשלחה הודעת בדיקה ל-${chatIds(cfg.telegram).length} אנשים`);
}
