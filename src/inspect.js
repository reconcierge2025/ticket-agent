// כלי עזר להתאמה לאתר חדש: פותח את הדף בדפדפן גלוי, שומר את ה-HTML
// ואת כל תשובות ה-JSON מהשרת לתיקייה data/inspect – משם מזהים איך האתר מתאר מושבים.
// שימוש: npm run inspect -- "https://site/event/123"
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const url = process.argv[2];
if (!url) throw new Error('צריך לתת URL: npm run inspect -- "https://..."');
const out = path.resolve('data', 'inspect');
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ headless: false, channel: 'msedge' });
const page = await browser.newPage({ locale: 'he-IL' });
let n = 0;
page.on('response', async (res) => {
  if (!(res.headers()['content-type'] || '').includes('json')) return;
  try {
    const body = await res.text();
    fs.writeFileSync(path.join(out, `${String(++n).padStart(3, '0')}.json`), `// ${res.url()}\n${body}`);
  } catch {}
});

await page.goto(url, { waitUntil: 'domcontentloaded' });
console.log('הדפדפן פתוח. נווט למפת המושבים (בחר תאריך/כמות אם צריך) ואז לחץ Enter כאן...');
await new Promise((r) => process.stdin.once('data', r));
fs.writeFileSync(path.join(out, 'page.html'), await page.content());
console.log(`נשמרו page.html ו-${n} קבצי JSON ב-${out}`);
await browser.close();
process.exit(0);
