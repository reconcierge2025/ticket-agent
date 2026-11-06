// שני סוגי דפדפן:
// 1. סריקה רגילה – Edge נסתר וזמני, בלי התחברות (רק קורא מפות מושבים).
// 2. "דפדפן הקנייה" – חלון Edge גלוי עם פרופיל קבוע ב-data/profile.
//    שם אתה מתחבר פעם אחת בעצמך (גוגל / חשבון באתר), וההתחברות נשמרת.
//    הסוכן מחכה בתור ובוחר מקומות בחלון הזה, ואתה רק משלם.
import path from 'node:path';
import { chromium } from 'playwright';

export const PROFILE_DIR = path.resolve('data', 'profile');

/**
 * סביבות שבהן הגישה לאינטרנט עוברת דרך שרת ביניים מוגדר (למשל סביבת הענן של Claude) –
 * הדפדפן משתמש באותו שרת ביניים כמו שאר הכלים בסביבה (HTTPS_PROXY). במחשב/בשרת רגיל אין הגדרה כזו.
 */
export function proxyFromEnv() {
  const server = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
  if (!server) return undefined;
  const bypass = process.env.NO_PROXY || process.env.no_proxy;
  return { server, ...(bypass ? { bypass } : {}) };
}

export function launchScanner(cfg) {
  return chromium.launch({ headless: cfg.headless !== false, channel: cfg.browserChannel ?? 'msedge', proxy: proxyFromEnv() });
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
    proxy: proxyFromEnv(),
  });
  buyContext.on('close', () => (buyContext = null));
  return buyContext;
}
