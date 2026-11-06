// קופת בראבו (bravo.org.il).
// דף מופע:  https://bravo.org.il/announce/87168        (כל התאריכים)
// דף תאריך: https://bravo.org.il/announce/buy/211753   (מפת מושבים)
//
// דף התאריך טוען בעצמו ajax/show/seance-page-data: לכל אזור → שורות → מושבים, עם Active=1 למושב פנוי ומחיר.
import { waitFor, captureJson, declineCookies } from './util.js';

export const name = 'bravo';
export const matches = (url) => /bravo\.org\.il\/announce\//.test(url);
export const isListing = (url, event = {}) => !event.expanded && !/\/announce\/buy\//.test(url);

export async function listPerformances(page) {
  await page.waitForSelector('a[href*="/announce/buy/"]', { timeout: 20000 }).catch(() => {});
  const links = await page.$$eval('a[href*="/announce/buy/"]', (els) => els.map((a) => ({ url: a.href.split('#')[0], text: a.innerText.trim().replace(/\s+/g, ' ') })));
  const best = new Map();
  for (const l of links) if (!best.has(l.url) || l.text.length > best.get(l.url).length) best.set(l.url, l.text);
  return [...best].map(([url, text]) => ({ url, label: (text.match(/[^,]*\d{1,2}\.\d{1,2}\.\d{4}[^,]*·\s*\d{1,2}:\d{2}/)?.[0] || text).trim().slice(0, 60) }));
}

export function prepare(page) {
  return captureJson(page, { data: /\/ajax\/show\/seance-page-data/ });
}

const clean = (s) => String(s ?? '').replace(/&nbsp;/g, ' ').trim();

export async function getSeats(page, event, data) {
  await declineCookies(page);
  await waitFor(() => data.data, 30000);
  const tb = data.data.Seance?.TicketsBlock || {};
  const seats = [];
  for (const b of tb.Seats?.Blocks || []) {
    const zone = clean(b.He?.Zone) || 'אולם';
    for (const r of b.Rows || []) {
      for (const s of r.Seats || []) {
        const n = clean(s.Seat);
        if (!n) continue;
        seats.push({ section: zone, row: clean(r.Row), seat: n, available: Number(s.Active) === 1, price: Number(s.Price) || null });
      }
    }
  }
  // אולמות בלי טבלת מושבים מלאה – רק הפנויים מהמפה
  if (!seats.length) {
    for (const r of tb.SeatsOnMap?.Rows || []) {
      for (const s of r.Seats || []) seats.push({ section: clean(r.He?.Zone) || 'אולם', row: clean(r.Row), seat: clean(s.Seat), available: true, price: Number(s.Price) || null });
    }
  }
  return seats;
}
