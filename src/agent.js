// הסוכן במחשב.
//   npm start                       → רץ כל הזמן: בוט טלגרם + בדיקה כל שעה + מצב קנייה
//   npm run check                   → בדיקה אחת של הכל ויציאה
//   npm run sale -- <קישור> <כמות>  → מצב קנייה מיידי לאירוע אחד
import { loadConfig, resolveEvent, log } from './config.js';
import { load } from './storage.js';
import { sendTelegram } from './telegram.js';
import { runLive, esc } from './check.js';
import { startBot } from './bot.js';
import { createAgent, withQuantity } from './core.js';

const args = process.argv.slice(2);
const cfg = loadConfig(args.find((a) => a.endsWith('.json')) || 'config.json');
const db = load();
const notify = (t) => sendTelegram(cfg.telegram, t).catch((e) => log(`שגיאת טלגרם: ${e.message}`));

// ---- מצב קנייה (חלון גלוי עם ההתחברות שלך) ----
const live = new Map();
function startLive(ev) {
  if (live.has(ev.url)) return live.get(ev.url);
  log(`[live] מתחיל: ${ev.name}`);
  const p = runLive(ev, { cfg, db, notify })
    .then((r) => log(`[live] ${ev.name}: ${r.status}`))
    .catch((e) => notify(`❌ <b>שגיאה במצב קנייה</b>\n${esc(ev.url)}\n<i>${esc(e.message.split('\n')[0])}</i>`))
    .finally(() => live.delete(ev.url));
  live.set(ev.url, p);
  return p;
}

const agent = createAgent({ cfg, db, notify, onFound: (ev) => ev.autoSelect && startLive(ev) });
const pending = [];
const drain = async () => {
  while (pending.length) await pending.shift()().catch((e) => log(`שגיאה: ${e.message}`));
};

if (args.includes('--once')) {
  await agent.runCycle();
  await Promise.all(live.values());
  process.exit(0);
} else if (args[0] === '--sale') {
  const q = Number(args[2]) || cfg.defaults?.quantity || 2;
  await startLive(withQuantity(resolveEvent(cfg, { url: args[1], autoSelect: true }), q));
  log('החלון נשאר פתוח. Ctrl+C לסגירה.');
} else {
  startBot(cfg, {
    ...agent.handlers(pending),
    onSale: (url, q) => {
      const ev = withQuantity(resolveEvent(cfg, { url, autoSelect: cfg.defaults?.autoSelectOnSale ?? true }), q || cfg.defaults?.quantity || 2);
      if (live.has(ev.url)) return '⏳ כבר עובד על המופע הזה.';
      startLive(ev);
      return `🚀 <b>מצב קנייה הופעל</b> · ${ev.quantity} כרטיסים\nפותח חלון במחשב, אחכה בתור אם יש, ואעדכן אותך בכל שלב.`;
    },
  });
  setInterval(drain, 2000);
  agent.runCycle();
  setInterval(() => agent.runCycle(), (cfg.checkEveryMinutes ?? 60) * 60000);
  notify('🟢 <b>סוכן הכרטיסים פועל</b> (במחשב)\nשלח /help לרשימת פקודות.');
}
