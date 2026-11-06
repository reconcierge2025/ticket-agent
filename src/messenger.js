// שליחת הודעות עם כללים:
// - to: לאדם מסוים (מי שביקש את המופע), אחרת לכולם
// - urgent: התראות דחופות (תור, קנייה, תקלה) – נשלחות תמיד
// - שעות שקט (quietHours): הודעות לא דחופות נשמרות ונשלחות בבוקר כהודעה אחת
// - buttons: כפתורים מתחת להודעה
import { sendTelegram } from './telegram.js';
import { israelNow, log } from './config.js';

export function inQuietHours(quiet, hour) {
  if (!quiet || quiet.from === undefined || quiet.to === undefined) return false;
  return quiet.from > quiet.to ? hour >= quiet.from || hour < quiet.to : hour >= quiet.from && hour < quiet.to;
}

export function createMessenger(cfg, db) {
  db.outbox ||= [];

  /** notify(text) – דחוף לכולם. notify(text, { to, urgent:false, buttons }) */
  async function notify(text, { to, urgent = true, buttons } = {}) {
    if (!urgent && inQuietHours(cfg.quietHours, israelNow().hour)) {
      db.outbox.push({ text, to: to || null });
      return;
    }
    await sendTelegram(cfg.telegram, text, to, { buttons }).catch((e) => log(`שגיאת טלגרם: ${e.message}`));
  }

  /** שולח את מה שהצטבר בשעות השקט (נקרא מדי פעם). */
  async function flush() {
    if (!db.outbox.length || inQuietHours(cfg.quietHours, israelNow().hour)) return;
    const items = db.outbox.splice(0);
    const byTo = new Map();
    for (const m of items) byTo.set(m.to, [...(byTo.get(m.to) || []), m.text]);
    for (const [to, texts] of byTo) {
      const head = `🌅 <b>בוקר טוב! מה שמצאתי בלילה (${texts.length}):</b>`;
      // הודעות ארוכות נשלחות בנפרד; קצרות מאוחדות
      let chunk = head;
      for (const t of texts) {
        if ((chunk + '\n\n' + t).length > 3800) {
          await sendTelegram(cfg.telegram, chunk, to || undefined).catch((e) => log(`שגיאת טלגרם: ${e.message}`));
          chunk = '';
        }
        chunk += (chunk ? '\n\n━━━━━━━━━━\n\n' : '') + t;
      }
      if (chunk) await sendTelegram(cfg.telegram, chunk, to || undefined).catch((e) => log(`שגיאת טלגרם: ${e.message}`));
    }
  }

  return { notify, flush };
}
