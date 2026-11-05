// פותח את חלון הקנייה כדי שתתחבר בעצמך (גוגל / חשבון באתר הכרטיסים).
// ההתחברות נשמרת ב-data/profile והסוכן ישתמש בה כשהוא מגיע לתשלום.
// שימוש: npm run login -- "https://אתר-הכרטיסים"   (אפשר כמה כתובות)
// חשוב: לסגור את הסוכן (npm start) לפני, כי שניהם משתמשים באותו פרופיל.
import { loadConfig } from './config.js';
import { getBuyContext } from './browser.js';

const cfg = loadConfig();
const urls = process.argv.slice(2);
const ctx = await getBuyContext({ ...cfg, buyHeadless: false });
const pages = ctx.pages();
for (const [i, url] of (urls.length ? urls : ['https://accounts.google.com']).entries()) {
  const page = i === 0 && pages[0] ? pages[0] : await ctx.newPage();
  await page.goto(url);
}
console.log('התחבר בחלון שנפתח (גוגל / האתר). כשסיימת – סגור את החלון, וההתחברות תישמר.');
await new Promise((r) => ctx.on('close', r));
console.log('נשמר ✔');
