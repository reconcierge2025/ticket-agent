// שולח לטלגרם צילום מסך לדוגמה (עמוד תשלום מדומה) – כדי לראות איך נראית הודעת "ההזמנה ממתינה".
// הרצה: node test/photo-preview.js
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { loadConfig } from '../src/config.js';
import { sendPhoto } from '../src/telegram.js';

const cfg = loadConfig('config.json');
const b = await chromium.launch({ channel: cfg.browserChannel ?? 'msedge', headless: true });
const p = await b.newPage({ viewport: { width: 900, height: 500 } });
await p.goto(pathToFileURL(path.resolve('test/site/checkout.html')).href + '?seats=VIP-1-5,VIP-1-6');
const png = await p.screenshot();
await b.close();
await sendPhoto(
  cfg.telegram,
  png,
  '🧪 <b>בדיקה – לא הזמנה אמיתית</b>\n\n🛒 <b>ההזמנה ממתינה לתשלום</b>\nככה תיראה ההודעה כשהסוכן יתפוס מקומות: צילום של החלון במחשב + כפתור ביטול.',
  undefined,
  { buttons: [[{ text: '❌ בטל וסגור את החלון', data: 'cancel:0' }]] }
);
console.log('נשלח');
