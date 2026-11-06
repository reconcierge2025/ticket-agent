// הסוכן שרץ כל הזמן.
//   npm start                       → במחשב: בוט + בדיקה כל שעה + מעקב צפוף + מצב קנייה (גם מתוזמן)
//   npm run server                  → בשרת (Railway): כמו במחשב, בלי מצב קנייה
//   npm run check                   → סבב בדיקה אחד ויציאה
//   npm run sale -- <קישור> <כמות>  → מצב קנייה מיידי לאירוע אחד
import fs from 'node:fs';
import path from 'node:path';
import { loadRuntimeConfig, resolveEvent, log, israelNow, dataDir } from './config.js';
import { load, save } from './storage.js';
import { createMessenger } from './messenger.js';
import { sendPhoto } from './telegram.js';
import { runLive, esc } from './check.js';
import { startBot } from './bot.js';
import { createAgent, withQuantity } from './core.js';

const args = process.argv.slice(2);
const SERVER = args.includes('--server');
const cfg = loadRuntimeConfig(args.find((a) => a.endsWith('.json')));
if (SERVER) {
  cfg.headless = true;
  cfg.browserChannel = process.env.BROWSER_CHANNEL ?? '';
}
const db = load();
const { notify, flush } = createMessenger(cfg, db);

// ---------- מצב קנייה (רק במחשב: חלון גלוי שבו אתה מחובר ומשלם) ----------
const live = new Map();
const sessions = new Map(); // מזהה קצר → לשונית ההזמנה (לכפתור הביטול)
let nextSession = 1;
function startLive(ev) {
  if (live.has(ev.url)) return live.get(ev.url);
  log(`[live] מתחיל: ${ev.name}`);
  const p = runLive(ev, { cfg, db, notify })
    .then(async (r) => {
      log(`[live] ${ev.name}: ${r.status}`);
      if (!r.page || !['checkout', 'selected', 'ready'].includes(r.status)) return;
      // צילום מסך של ההזמנה לטלגרם + כפתור ביטול
      const id = nextSession++;
      sessions.set(String(id), r.page);
      const png = await r.page.screenshot({ fullPage: false }).catch(() => null);
      const caption =
        r.status === 'checkout'
          ? `🛒 <b>ההזמנה ממתינה לתשלום</b>\n${esc(ev.name)}\n\nזה מה שפתוח עכשיו בחלון במחשב. שלם שם – או לחץ ❌ כדי לבטל.`
          : `🖥️ <b>החלון במחשב פתוח על המופע</b>\n${esc(ev.name)}\n\nבחר את המושבים שבהודעה הקודמת ושלם – או לחץ ❌ כדי לסגור.`;
      const buttons = [[{ text: '❌ בטל וסגור את החלון', data: `cancel:${id}` }]];
      if (png) await sendPhoto(cfg.telegram, png, caption, ev.owner, { buttons }).catch((e) => log(`שגיאה בשליחת צילום: ${e.message}`));
      else await notify(caption, { to: ev.owner, buttons });
    })
    .catch((e) => notify(`❌ <b>שגיאה במצב קנייה</b>\n${esc(ev.url)}\n<i>${esc(e.message.split('\n')[0])}</i>`))
    .finally(() => live.delete(ev.url));
  live.set(ev.url, p);
  return p;
}
const saleEvent = (url, q) => withQuantity(resolveEvent(cfg, { url, autoSelect: cfg.defaults?.autoSelectOnSale ?? true }), q || cfg.defaults?.quantity || 2);

// מכירות מתוזמנות: /sale <קישור> <כמות> 10:00 → הסוכן נכנס 10 דקות לפני
const salesFile = () => path.join(dataDir(), 'sales.json');
const readSales = () => {
  try {
    return JSON.parse(fs.readFileSync(salesFile(), 'utf8'));
  } catch {
    return [];
  }
};
const writeSales = (s) => {
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(salesFile(), JSON.stringify(s, null, 2));
};
function scheduleSale(url, q, time) {
  const [H, M] = time.split(':').map(Number);
  const now = israelNow();
  let diff = H * 60 + M - (now.hour * 60 + now.minute);
  const tomorrow = diff <= 0;
  if (tomorrow) diff += 1440;
  const at = Date.now() + diff * 60000;
  const lead = cfg.saleLeadMinutes ?? 10;
  writeSales([...readSales().filter((s) => s.url !== url), { url, quantity: q, time, at, startAt: at - lead * 60000 }]);
  const day = tomorrow ? 'מחר' : 'היום';
  return `⏰ <b>מצב קנייה מתוזמן</b>\n${day} ב-${time} · ${q || cfg.defaults?.quantity || 2} כרטיסים\nאכנס ${lead} דקות לפני, אחכה בתור ואעדכן אותך בכל שלב.\n\n⚠️ המחשב צריך להיות דלוק והסוכן פועל.`;
}
function saleTick() {
  const due = readSales().filter((s) => Date.now() >= s.startAt);
  if (!due.length) return;
  writeSales(readSales().filter((s) => Date.now() < s.startAt));
  for (const s of due) {
    notify(`🚀 <b>המכירה נפתחת ב-${s.time}</b> – נכנס עכשיו לאתר.\n${esc(s.url)}`);
    startLive(saleEvent(s.url, s.quantity));
  }
}

const onSale = SERVER
  ? null
  : (url, q, { time } = {}) => {
      if (time) return scheduleSale(url, q, time);
      const ev = saleEvent(url, q);
      if (live.has(ev.url)) return '⏳ כבר עובד על המופע הזה.';
      startLive(ev);
      return `🚀 <b>מצב קנייה הופעל</b> · ${ev.quantity} כרטיסים\nפותח חלון במחשב, אחכה בתור אם יש, ואעדכן אותך בכל שלב.`;
    };

// תפיסה אוטומטית (רק במופעים שסימנת 🤖) – רק במחשב
const onGrab = SERVER ? null : (ev) => startLive({ ...ev, autoSelect: true, quantity: ev.quantity || cfg.defaults?.quantity || 2, quantities: [ev.quantity || cfg.defaults?.quantity || 2] });
const onCancel = SERVER
  ? null
  : async (id) => {
      const page = sessions.get(String(id));
      if (!page) return 'ההזמנה הזאת כבר נסגרה.';
      sessions.delete(String(id));
      await page.close().catch(() => {});
      return '❌ <b>בוטל</b> – החלון נסגר בלי תשלום.\nהמושבים ישתחררו באתר תוך כמה דקות (כשתוקף השמירה שלהם נגמר).';
    };

const agent = createAgent({ cfg, db, notify, onSale, onGrab, onCancel, mode: SERVER ? 'server' : 'pc' });
const pending = [];
let draining = false;
async function drain() {
  if (draining) return;
  draining = true;
  try {
    while (pending.length) await pending.shift()().catch((e) => log(`שגיאה: ${e.message}`));
  } finally {
    draining = false;
  }
}
const safe = (fn) => () => fn().catch((e) => log(`שגיאה: ${e.message}`));

if (args.includes('--once')) {
  await agent.runCycle();
  await Promise.all(live.values());
  process.exit(0);
} else if (args[0] === '--sale') {
  await startLive(saleEvent(args[1], Number(args[2])));
  log('החלון נשאר פתוח. Ctrl+C לסגירה.');
} else {
  startBot(cfg, agent.handlers(pending));
  setInterval(drain, 2000);
  setInterval(safe(() => agent.runCycle()), (cfg.checkEveryMinutes ?? 60) * 60000);
  setInterval(safe(() => agent.checkHot()), (cfg.hotEveryMinutes ?? 3) * 60000);
  setInterval(safe(async () => (await agent.heartbeat(), await flush(), save(db))), 5 * 60000);
  if (!SERVER) setInterval(saleTick, 20000);
  safe(() => agent.runCycle())();
  notify(`🟢 <b>סוכן הכרטיסים פועל</b> (${SERVER ? 'שרת – פועל 24/7' : 'מחשב – כולל מצב קנייה'})\nשלח /help לרשימת פקודות.`);
  // ב-Railway בלי Volume כל עדכון גרסה מוחק את רשימת המעקב – מזהירים
  if (SERVER && process.env.RAILWAY_ENVIRONMENT_NAME !== undefined && !process.env.RAILWAY_VOLUME_MOUNT_PATH) {
    notify(
      '⚠️ <b>אין לשרת דיסק קבוע (Volume)</b>\nרשימת המעקב, האמנים והשיאים יימחקו בכל עדכון או הפעלה מחדש של השרת.\n\nלתיקון ב-Railway: קליק ימני על השירות ← <b>Attach Volume</b> ← Mount path: <code>/data</code>'
    );
  }
  // סגירה מסודרת (Railway שולח SIGTERM בעדכון גרסה)
  for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => (save(db), process.exit(0)));
}
