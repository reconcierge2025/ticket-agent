// שולח לטלגרם שלך דוח אמיתי על מופע אחד – כדי לראות איך ההודעות נראות.
// הרצה: node test/telegram-preview.js <קישור>
import { loadConfig, resolveEvent, log } from '../src/config.js';
import { sendTelegram } from '../src/telegram.js';
import { createAgent } from '../src/core.js';

process.env.AGENT_DATA_DIR ||= 'data/preview';
const cfg = loadConfig('config.json');
const db = { seen: {}, best: {}, history: [] };
const notify = (t) => sendTelegram(cfg.telegram, t).catch((e) => log(`שגיאת טלגרם: ${e.message}`));
const agent = createAgent({ cfg, db, notify });
await agent.checkNow(resolveEvent(cfg, { url: process.argv[2] }));
console.log('נשלח');
