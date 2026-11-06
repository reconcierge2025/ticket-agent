// זמינות ומחיר – לאתרים בלי מקומות מסומנים (GoShow, Eventer, Eventbrite ועוד).
// קורא מהדף: האם יש כרטיסים למכירה, האם אזל, ובאילו מחירים. מתריע כשנפתח/חזר מלאי או כשהמחיר יורד.
import { declineCookies } from './util.js';
import { vivenuEventId, vivenuSeats } from './vivenu.js';

export const name = 'avail';
export const kind = 'avail';
export const matches = () => false; // נבחר לפי מאגר האתרים (sites.js)

const SOLD_OUT = /אזל(ו)?\b|הכרטיסים אזלו|sold\s*out|soldout|no tickets available|agotad[oa]s?|complet\b|ausverkauft|udsolgt/i;
const BUY = /לרכישה|להזמנ|הזמנת כרטיסים|רכישת כרטיסים|buy tickets|get tickets|book now|checkout|reserve|comprar|acheter|réserver|tickets kaufen|\+\s*$/im;
const PRICE = /(?:₪|ש"ח|US\$|\$|£|€)\s?(\d{1,3}(?:[,.]\d{3})*(?:\.\d{2})?)|(\d{1,3}(?:[,.]\d{3})*(?:\.\d{2})?)\s?(?:₪|ש"ח|€|£)/g;

export function readAvailability(text) {
  const prices = [];
  for (const m of text.matchAll(PRICE)) {
    const n = Number((m[1] || m[2]).replace(/,(?=\d{3})/g, ''));
    if (n >= 10 && n <= 20000) prices.push(n);
  }
  const currency = (text.match(/₪|ש"ח/) && '₪') || (text.match(/US\$|\$/) && '$') || (text.match(/£/) && '£') || (text.match(/€/) && '€') || '';
  const soldOut = SOLD_OUT.test(text);
  const canBuy = BUY.test(text);
  const uniq = [...new Set(prices)].sort((a, b) => a - b);
  return {
    checked: true,
    available: canBuy && uniq.length > 0 && !(soldOut && !canBuy),
    soldOut: soldOut && !canBuy,
    minPrice: uniq[0] ?? null,
    maxPrice: uniq[uniq.length - 1] ?? null,
    currency,
  };
}

export async function getSeats(page) {
  // אם יש באתר מפת vivenu – משתמשים בה (מושבים אמיתיים)
  const id = await vivenuEventId(page, 4000);
  return id ? vivenuSeats(id) : [];
}

export async function getAvailability(page) {
  await declineCookies(page);
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  const text = await page.evaluate(() => document.body?.innerText || '');
  return readAvailability(text);
}
