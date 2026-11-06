// בוט טלגרם: מקבל פקודות וכפתורים רק מהאנשים שברשימה ב-config (telegram.chatIds).
// במחשב/בשרת – רץ כל הזמן (startBot). בענן (GitHub) – קורא את מה שהצטבר בכל הרצה (handleUpdates).
import { api, chatIds, isConfigured, sendTelegram } from './telegram.js';
import { log } from './config.js';

export const HELP = `👋 <b>אני סוכן הכרטיסים שלך</b>

🔗 <b>שלח קישור למופע</b> – אבדוק את כל התאריכים, אשלח מה הכי קרוב (2–5 כרטיסים) ואמשיך לעקוב.
אפשר להוסיף כמות ומחיר: <code>קישור 3 עד 300</code>

<b>פקודות:</b>
/list – המופעים שלך במעקב (עם כפתורים)
/hot &lt;מספר&gt; – מעקב צפוף (כל כמה דקות) למופע חם
/sale &lt;קישור&gt; &lt;כמות&gt; – מצב קנייה עכשיו (במחשב)
/sale &lt;קישור&gt; &lt;כמות&gt; 10:00 – מצב קנייה בשעה שהמכירה נפתחת
/remove &lt;מספר&gt; – הסרה מהמעקב
/check – לבדוק הכל עכשיו
/follow &lt;אמן&gt; – הודעה כשעולה לו מופע חדש (או פשוט: <code>עקוב אחרי שלמה ארצי</code>) · /follows – הרשימה
/sites – האתרים שאני מכיר (כולל מה שלמדתי ומצאתי לבד)
/status – מצב המערכת
/myid – מספר הצ'אט שלך`;

/** כתיבה חופשית בעברית → פקודה ("עקוב אחרי נועה קירל" = /follow נועה קירל). */
const HEBREW = [
  [/^(?:תעקוב|עקוב|לעקוב)(?:\s+אחרי)?\s+(.+)$/, 'follow'],
  [/^(?:הפסק|תפסיק|להפסיק)\s+לעקוב(?:\s+אחרי)?\s+(.+)$/, 'unfollow'],
];

/** מפרק הודעה: פקודה, קישור, כמות, מחיר מקסימלי ושעה. מחזיר null אם לא זוהתה. */
export function parseCommand(text) {
  let t = String(text || '').trim();
  for (const [re, cmd] of HEBREW) {
    const m = t.match(re);
    if (m && !/https?:\/\//.test(t)) t = `/${cmd} ${m[1]}`;
  }
  const url = t.match(/https?:\/\/\S+/)?.[0] || null;
  let rest = t.replace(url || '', ' ');

  const tm = rest.match(/\b(\d{1,2}):(\d{2})\b/);
  const time = tm && Number(tm[1]) < 24 && Number(tm[2]) < 60 ? `${tm[1].padStart(2, '0')}:${tm[2]}` : null;
  if (tm) rest = rest.replace(tm[0], ' ');

  const pm = rest.match(/(?:עד|מקסימום|max)\s*₪?\s*(\d{2,5})|₪\s*(\d{2,5})|(\d{2,5})\s*(?:₪|ש"ח|שח|שקל)/i);
  const maxPrice = pm ? Number(pm[1] || pm[2] || pm[3]) : null;
  if (pm) rest = rest.replace(pm[0], ' ');

  const nums = rest.match(/\b\d{1,2}\b/g);
  const cmd = t.startsWith('/') ? t.slice(1).split(/[\s@]/)[0].toLowerCase() : url ? 'watch' : null;
  if (!cmd) return null;
  const freeText = t.replace(/^\/\S+\s*/, '').replace(url || '', '').trim(); // טקסט חופשי אחרי הפקודה (לשם אמן)
  return { cmd, url, quantity: nums ? Number(nums[nums.length - 1]) : null, arg: nums ? Number(nums[0]) : null, maxPrice, time, rest: freeText };
}

/** פקודה שנשלחה בלי שם (למשל /follow מהתפריט) – ההודעה הבאה של אותו אדם היא השם. */
const awaiting = new Map();

/** מטפל ברשימת עדכונים מטלגרם (הודעות + לחיצות על כפתורים). מחזיר את ה-offset הבא. */
export async function handleUpdates(cfg, updates, h, offset = 0) {
  const allowed = new Set(chatIds(cfg.telegram));
  for (const u of updates) {
    offset = Math.max(offset, u.update_id + 1);
    try {
      // לחיצה על כפתור
      if (u.callback_query) {
        const q = u.callback_query;
        const from = String(q.message?.chat?.id ?? q.from.id);
        await api(cfg.telegram, 'answerCallbackQuery', { callback_query_id: q.id }).catch(() => {});
        if (!allowed.has(from)) continue;
        const [action, id] = String(q.data || '').split(':');
        log(`כפתור (${q.from?.first_name || from}): ${q.data}`);
        const answer = await h.onButton(action, id, from);
        if (answer) await sendTelegram(cfg.telegram, answer, from);
        continue;
      }

      const msg = u.message;
      if (!msg?.text) continue;
      const from = String(msg.chat.id);
      const reply = (r) => {
        const { text, buttons } = typeof r === 'string' ? { text: r } : r || {};
        return text ? sendTelegram(cfg.telegram, text, from, { buttons }) : null;
      };
      if (!allowed.has(from)) {
        await reply(`🔒 <b>אין לך הרשאה לסוכן הזה</b>\nמספר הצ'אט שלך: <code>${from}</code>\nשלח אותו לבעלים כדי שיוסיף אותך.`);
        continue;
      }
      log(`טלגרם (${msg.from?.first_name || from}): ${msg.text}`);
      let c = parseCommand(msg.text);
      // תשובה לשאלה "איזה אמן?" אחרי /follow או /unfollow בלי שם
      const waiting = awaiting.get(from);
      awaiting.delete(from);
      if (waiting && (!c || (c.cmd === 'watch' && !c.url)) && !msg.text.startsWith('/')) c = { cmd: waiting, rest: msg.text.trim() };
      if (c && ['follow', 'unfollow'].includes(c.cmd) && !c.rest) {
        awaiting.set(from, c.cmd);
        await reply(c.cmd === 'follow' ? '⭐ איזה אמן לעקוב? כתוב את השם בהודעה הבאה (למשל: <code>שלמה ארצי</code>)' : 'אחרי איזה אמן להפסיק לעקוב? כתוב את השם בהודעה הבאה.');
        continue;
      }
      const ctx = { from, maxPrice: c?.maxPrice, time: c?.time };
      if (!c || c.cmd === 'start' || c.cmd === 'help') await reply(HELP);
      else if (c.cmd === 'myid') await reply(`מספר הצ'אט שלך: <code>${from}</code>`);
      else if (c.cmd === 'watch' && c.url) await reply(await h.onWatch(c.url, c.quantity, ctx));
      else if (c.cmd === 'sale' && c.url) await reply(await h.onSale(c.url, c.quantity, ctx));
      else if (c.cmd === 'list') await reply(await h.onList(from));
      else if (c.cmd === 'remove' && c.arg) await reply(await h.onRemove(c.arg, from));
      else if (c.cmd === 'hot' && c.arg) await reply(await h.onButton('hot', c.arg, from));
      else if (c.cmd === 'check') await reply(await h.onCheck(from));
      else if (c.cmd === 'status') await reply(await h.onStatus(from));
      else if (c.cmd === 'sites') await reply(await h.onSites(from));
      else if (c.cmd === 'follow') await reply(await h.onFollow(c.rest, from));
      else if (c.cmd === 'unfollow') await reply(await h.onUnfollow(c.rest, from));
      else if (c.cmd === 'follows') await reply(await h.onFollows(from));
      else await reply('לא הבנתי 🤔\n\n' + HELP);
    } catch (e) {
      log(`שגיאה בטיפול בהודעה: ${e.message}`);
    }
  }
  return offset;
}

/** תפריט הפקודות שטלגרם מציג כשמקלידים "/" (עם הסברים בעברית). */
export const COMMANDS = [
  ['list', 'המופעים שלי במעקב'],
  ['follow', 'לעקוב אחרי אמן – הודעה כשעולה לו מופע'],
  ['follows', 'האמנים שאני עוקב אחריהם'],
  ['unfollow', 'להפסיק לעקוב אחרי אמן'],
  ['sale', 'מצב קנייה: קישור + כמות (+ שעה)'],
  ['hot', 'מעקב צפוף למופע: מספר מהרשימה'],
  ['check', 'לבדוק הכל עכשיו'],
  ['sites', 'האתרים שהסוכן מכיר'],
  ['status', 'מצב המערכת'],
  ['help', 'עזרה ורשימת פקודות'],
];

export function startBot(cfg, h) {
  if (!isConfigured(cfg.telegram)) return log('טלגרם לא מוגדר – הבוט לא פעיל');
  api(cfg.telegram, 'setMyCommands', { commands: COMMANDS.map(([command, description]) => ({ command, description })) }).catch((e) => log(`תפריט פקודות: ${e.message}`));
  let offset = 0;
  (async () => {
    for (;;) {
      try {
        const updates = await api(cfg.telegram, 'getUpdates', { offset, timeout: 30, allowed_updates: ['message', 'callback_query'] });
        offset = await handleUpdates(cfg, updates, h, offset);
      } catch (e) {
        log(`שגיאת טלגרם: ${e.message}`);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  })();
  log(`הבוט פעיל, ${chatIds(cfg.telegram).length} משתמשים מורשים`);
}
