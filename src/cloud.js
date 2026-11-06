// הסוכן ב-GitHub Actions (חינם, בלי שרת): כל חצי שעה עונה להודעות שהצטברו,
// בודק מה שביקשת, ופעם בשעה עושה סבב מלא. המצב נשמר ב-state/ ונשמר חזרה לריפו.
// (כשהשרת ב-Railway פועל – מכבים את זה עם המשתנה USE_SERVER=true בגיטהאב.)
import fs from 'node:fs';
import path from 'node:path';
import { loadRuntimeConfig, log, dataDir } from './config.js';
import { load, save } from './storage.js';
import { api, isConfigured } from './telegram.js';
import { createMessenger } from './messenger.js';
import { handleUpdates } from './bot.js';
import { createAgent } from './core.js';

const cfg = loadRuntimeConfig();
cfg.headless = true;
cfg.browserChannel = process.env.BROWSER_CHANNEL ?? '';
if (!isConfigured(cfg.telegram)) throw new Error('חסר TELEGRAM_BOT_TOKEN ב-GitHub Secrets');

const db = load();
const { notify, flush } = createMessenger(cfg, db);
const agent = createAgent({ cfg, db, notify, mode: 'cloud' });
const pending = [];

// 1. הודעות וכפתורים שהצטברו מאז ההרצה הקודמת
const offsetFile = path.join(dataDir(), 'telegram-offset.json');
let offset = 0;
try {
  offset = JSON.parse(fs.readFileSync(offsetFile, 'utf8')).offset || 0;
} catch {}
const updates = await api(cfg.telegram, 'getUpdates', { offset, timeout: 0, allowed_updates: ['message', 'callback_query'] });
offset = await handleUpdates(cfg, updates, agent.handlers(pending), offset);
fs.mkdirSync(dataDir(), { recursive: true });
fs.writeFileSync(offsetFile, JSON.stringify({ offset }));
if (updates.length) await api(cfg.telegram, 'getUpdates', { offset, timeout: 0 }); // מאשר שטופלו

// 2. בדיקות שביקשת עכשיו
const forced = pending.length > 0;
while (pending.length) await pending.shift()();

// 3. מעקב צפוף + סבב מלא פעם בשעה + סיכום יומי
await agent.checkHot();
const due = !db.lastCycle || Date.now() - Date.parse(db.lastCycle) >= ((cfg.checkEveryMinutes ?? 60) - 5) * 60000;
if (due && !forced) await agent.runCycle();
else log(due ? 'דילוג על סבב מלא – רצה בדיקה שביקשת' : 'עוד לא הגיע זמן הסבב המלא');
await agent.heartbeat();
await flush();
save(db);
