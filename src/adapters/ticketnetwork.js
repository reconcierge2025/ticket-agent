// TicketNetwork (שוק משני, ארה"ב) – רשימת מודעות: אזור, שורה, כמה כרטיסים, מחיר.
// קישור: https://www.ticketnetwork.com/tickets/7729965/...
// כל מודעה = כרטיסים צמודים באותה שורה (המוכר לא מפרט מספרי מושבים).
import { declineCookies } from './util.js';

export const name = 'ticketnetwork';
export const kind = 'listings';
export const matches = (url) => /ticketnetwork\.com\/tickets\/\d+/.test(url);

export function parseListings(text) {
  const re = /Section ([^\n]+)\n[^\n]*\nRow ([^\n]+)\n(\d+) Tickets? available[\s\S]*?US\$([\d,.]+) (?:each|ea)/g;
  const out = [];
  for (const m of text.matchAll(re)) out.push({ section: m[1].trim(), row: m[2].trim(), count: Number(m[3]), price: Number(m[4].replace(/,/g, '')) });
  return out;
}

export async function getSeats(page) {
  await declineCookies(page);
  await page.waitForFunction(() => /Tickets? available/.test(document.body?.innerText || ''), null, { timeout: 30000 });
  // גלילה כדי לטעון עוד מודעות
  for (let i = 0; i < 4; i++) {
    await page.mouse.wheel(0, 4000);
    await page.waitForTimeout(800);
  }
  const listings = parseListings(await page.evaluate(() => document.body.innerText));
  // כל מודעה הופכת ל"מושבים" צמודים משלה (מספור נפרד לכל מודעה כדי שלא יתחברו)
  const seats = [];
  listings.forEach((l, k) => {
    for (let n = 1; n <= l.count; n++) seats.push({ section: l.section, row: l.row, seat: k * 100 + n, available: true, price: l.price, currency: '$', listing: l.count });
  });
  return seats;
}

/** אזורים לפי שם הגוש בלי המספר: "400 Level 402" → "400 Level". */
export function zonesFor(seats) {
  const names = [...new Set(seats.map((s) => s.section.replace(/\s*\d+[A-Z]?$/i, '').trim() || s.section))];
  return names.map((n) => ({ name: n, match: [n] }));
}
