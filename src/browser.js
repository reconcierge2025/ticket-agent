// שני סוגי דפדפן:
// 1. סריקה רגילה – Edge נסתר וזמני, בלי התחברות (רק קורא מפות מושבים).
// 2. "דפדפן הקנייה" – חלון Edge גלוי עם פרופיל קבוע ב-data/profile.
//    שם אתה מתחבר פעם אחת בעצמך (גוגל / חשבון באתר), וההתחברות נשמרת.
//    הסוכן מחכה בתור ובוחר מקומות בחלון הזה, ואתה רק משלם.
import path from 'node:path';
import { chromium } from 'playwright';

export const PROFILE_DIR = path.resolve('data', 'profile');

export function launchScanner(cfg) {
  return chromium.launch({ headless: cfg.headless !== false, channel: cfg.browserChannel ?? 'msedge' });
}

let buyContext = null;

/** פותח (פעם אחת) את חלון הקנייה עם הפרופיל השמור. כל אירוע מקבל בו לשונית משלו. */
export async function getBuyContext(cfg) {
  if (buyContext) return buyContext;
  buyContext = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: cfg.buyHeadless === true, // רק לבדיקות
    channel: cfg.browserChannel ?? 'msedge',
    locale: 'he-IL',
    viewport: null,
  });
  buyContext.on('close', () => (buyContext = null));
  return buyContext;
}
