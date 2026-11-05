// בוט טלגרם: מקבל פקודות רק מהאנשים שברשימה ב-config (telegram.chatIds).
// במחשב – רץ כל הזמן (startBot). בענן – קורא את ההודעות שהצטברו בכל הרצה (handleUpdates).
import { api, chatIds, isConfigured, sendTelegram } from './telegram.js';
import { log } from './config.js';

export const HELP = `👋 <b>אני סוכן הכרטיסים שלך</b>

🔗 <b>שלח קישור למופע</b> – אבדוק את כל התאריכים, אשלח מה הכי קרוב שמצאתי (2–5 כרטיסים), ואמשיך לבדוק כל שעה

<b>פקודות:</b>
/watch &lt;קישור&gt; &lt;כמות&gt; – מעקב על כמות מסוימת
/sale &lt;קישור&gt; &lt;כמות&gt; – מצב קנייה: תור ← מקומות ← עמוד תשלום (במחשב בלבד)
/list – מה במעקב
/remove &lt;מספר&gt; – הסרה מהמעקב
/check – לבדוק הכל עכשיו
/myid – מספר הצ'אט שלך`;

/** מפרק הודעה לפקודה. מחזיר null אם לא זוהתה. */
export function parseCommand(text) {
  const t = String(text || '').trim();
  const url = t.match(/https?:\/\/\S+/)?.[0] || null;
  const nums = t.replace(url || '', '').match(/\b\d{1,2}\b/g);
  const quantity = nums ? Number(nums[nums.length - 1]) : null;
  const cmd = t.startsWith('/') ? t.slice(1).split(/[\s@]/)[0].toLowerCase() : url ? 'watch' : null;
  if (!cmd) return null;
  return { cmd, url, quantity, arg: nums ? Number(nums[0]) : null };
}

/** מטפל ברשימת עדכונים מטלגרם. מחזיר את ה-offset הבא. */
export async function handleUpdates(cfg, updates, h, offset = 0) {
  const allowed = new Set(chatIds(cfg.telegram));
  for (const u of updates) {
    offset = Math.max(offset, u.update_id + 1);
    const msg = u.message;
    if (!msg?.text) continue;
    const from = String(msg.chat.id);
    const reply = (t) => sendTelegram(cfg.telegram, t, from).catch((e) => log(`שגיאת טלגרם: ${e.message}`));
    if (!allowed.has(from)) {
      await reply(`🔒 <b>אין לך הרשאה לסוכן הזה</b>\nמספר הצ'אט שלך: <code>${from}</code>\nשלח אותו לבעלים כדי שיוסיף אותך.`);
      continue;
    }
    log(`טלגרם (${msg.from?.first_name || from}): ${msg.text}`);
    const c = parseCommand(msg.text);
    if (!c || c.cmd === 'start' || c.cmd === 'help') await reply(HELP);
    else if (c.cmd === 'myid') await reply(`מספר הצ'אט שלך: <code>${from}</code>`);
    else if (c.cmd === 'watch' && c.url) await reply(await h.onWatch(c.url, c.quantity));
    else if (c.cmd === 'sale' && c.url) await reply(await h.onSale(c.url, c.quantity));
    else if (c.cmd === 'list') await reply(await h.onList());
    else if (c.cmd === 'remove' && c.arg) await reply(await h.onRemove(c.arg));
    else if (c.cmd === 'check') await reply(await h.onCheck());
    else await reply('לא הבנתי 🤔\n\n' + HELP);
  }
  return offset;
}

export function startBot(cfg, h) {
  if (!isConfigured(cfg.telegram)) return log('טלגרם לא מוגדר – הבוט לא פעיל');
  let offset = 0;
  (async () => {
    for (;;) {
      try {
        const updates = await api(cfg.telegram, 'getUpdates', { offset, timeout: 30 });
        offset = await handleUpdates(cfg, updates, h, offset);
      } catch (e) {
        log(`שגיאת טלגרם: ${e.message}`);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  })();
  log(`הבוט פעיל, ${chatIds(cfg.telegram).length} משתמשים מורשים`);
}
