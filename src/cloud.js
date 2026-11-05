// הסוכן בענן (GitHub Actions) – עובד בלי שהמחשב דלוק.
// כל הרצה (כל חצי שעה): עונה להודעות שהצטברו בטלגרם, בודק מופעים חדשים שביקשת,
// ופעם בשעה (checkEveryMinutes) עושה סבב בדיקה מלא.
// הגדרות: config.example.json + סודות מ-GitHub Secrets:
//   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_IDS (מופרדים בפסיק)
// המצב נשמר בתיקייה state/ (AGENT_DATA_DIR) ונשמר חזרה לריפו בסוף ההרצה.
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, log } from './config.js';
import { load, save } from './storage.js';
import { api, sendTelegram, isConfigured } from './telegram.js';
import { handleUpdates } from './bot.js';
import { createAgent } from './core.js';

const cfg = loadConfig(fs.existsSync('config.json') ? 'config.json' : 'config.example.json');
cfg.headless = true;
cfg.browserChannel = process.env.BROWSER_CHANNEL ?? ''; // בענן: Chromium של Playwright
if (process.env.TELEGRAM_BOT_TOKEN) {
  cfg.telegram = {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    chatIds: (process.env.TELEGRAM_CHAT_IDS || '').split(',').map((s) => s.trim()).filter(Boolean),
  };
}
if (!isConfigured(cfg.telegram)) throw new Error('חסר TELEGRAM_BOT_TOKEN ב-GitHub Secrets');

const db = load();
const notify = (t) => sendTelegram(cfg.telegram, t).catch((e) => log(`שגיאת טלגרם: ${e.message}`));
const agent = createAgent({ cfg, db, notify });
const pending = [];

// 1. הודעות שהצטברו בטלגרם מאז ההרצה הקודמת
const offsetFile = path.join(process.env.AGENT_DATA_DIR || 'data', 'telegram-offset.json');
let offset = 0;
try {
  offset = JSON.parse(fs.readFileSync(offsetFile, 'utf8')).offset || 0;
} catch {}
const updates = await api(cfg.telegram, 'getUpdates', { offset, timeout: 0 });
offset = await handleUpdates(
  cfg,
  updates,
  {
    ...agent.handlers(pending),
    onSale: () => '🖥️ <b>מצב קנייה עובד רק במחשב</b>\nהוא צריך חלון דפדפן שבו אתה מחובר ומשלם.\nהפעל את הסוכן במחשב (npm start) ושלח שם /sale.',
  },
  offset
);
fs.mkdirSync(path.dirname(offsetFile), { recursive: true });
fs.writeFileSync(offsetFile, JSON.stringify({ offset }));
// מאשר לטלגרם שההודעות טופלו
if (updates.length) await api(cfg.telegram, 'getUpdates', { offset, timeout: 0 });

// 2. בדיקות שביקשת עכשיו (/watch, קישור, /check)
const forced = pending.length > 0;
while (pending.length) await pending.shift()();

// 3. סבב מלא פעם בשעה
const due = !db.lastCycle || Date.now() - Date.parse(db.lastCycle) >= ((cfg.checkEveryMinutes ?? 60) - 5) * 60000;
if (due && !forced) await agent.runCycle();
else log(due ? 'דילוג על סבב מלא – רצה בדיקה שביקשת' : 'עוד לא הגיע זמן הסבב המלא');
save(db);
