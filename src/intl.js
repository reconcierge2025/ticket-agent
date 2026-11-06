// הופעות בחו"ל דרך ממשקים רשמיים (API) – בלי לעקוף שום חסימה:
//   Ticketmaster Discovery API → Ticketmaster בארה"ב/בריטניה/אירופה/קנדה/אוסטרליה + Live Nation
//   SeatGeek API               → מחיר הכי זול כרגע ומספר כרטיסים בשוק (ארה"ב בעיקר)
// מפתחות חינמיים: TICKETMASTER_API_KEY (developer.ticketmaster.com), SEATGEEK_CLIENT_ID (seatgeek.com/account/develop)
// מחזירים תאריכים, ערים, אולמות, מתי נפתחת המכירה, טווח מחירים ומצב. (אין בממשקים האלה מפת מושבים.)
import { esc } from './check.js';
import { log } from './config.js';
import { matchesArtist } from './translit.js';

export const keys = (cfg = {}) => ({
  ticketmaster: process.env.TICKETMASTER_API_KEY || cfg.apis?.ticketmasterKey || '',
  seatgeek: process.env.SEATGEEK_CLIENT_ID || cfg.apis?.seatgeekClientId || '',
});
export const intlEnabled = (cfg) => Object.values(keys(cfg)).some(Boolean);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** מופעי מחווה / להקות כיסוי – לא האמן עצמו. */
const TRIBUTE = /tribute|cover band|salute to|a celebration of|experience of|מחווה/i;
const real = (s) => !TRIBUTE.test(s.name);

// ---------- Ticketmaster Discovery ----------
export function parseTicketmaster(json, artist) {
  return (json?._embedded?.events || [])
    .map((e) => {
      const v = e._embedded?.venues?.[0] || {};
      const p = e.priceRanges?.[0];
      const attractions = (e._embedded?.attractions || []).map((a) => a.name);
      return {
        provider: 'Ticketmaster',
        id: `tm:${e.id}`,
        artist,
        name: e.name,
        attractions,
        date: e.dates?.start?.localDate || null,
        time: e.dates?.start?.localTime?.slice(0, 5) || null,
        city: v.city?.name || '',
        country: v.country?.countryCode || '',
        venue: v.name || '',
        url: e.url,
        status: e.dates?.status?.code || null, // onsale / offsale / cancelled / rescheduled / postponed
        onsale: e.sales?.public?.startDateTime || null,
        presales: (e.sales?.presales || []).map((s) => ({ name: s.name, start: s.startDateTime, end: s.endDateTime })),
        minPrice: p?.min ?? null,
        maxPrice: p?.max ?? null,
        currency: p?.currency || null,
      };
    })
    .filter((s) => real(s) && (matchesArtist(artist, s.name) || s.attractions.some((a) => matchesArtist(artist, a))));
}

async function searchTicketmaster(key, artist) {
  const url = `https://app.ticketmaster.com/discovery/v2/events.json?apikey=${encodeURIComponent(key)}&keyword=${encodeURIComponent(artist)}&classificationName=music&size=50&sort=date,asc`;
  const res = await fetch(url);
  if (res.status === 429) throw new Error('Ticketmaster: חרגנו ממכסת הבקשות להיום');
  if (!res.ok) throw new Error(`Ticketmaster API ${res.status}`);
  return parseTicketmaster(await res.json(), artist);
}

// ---------- SeatGeek ----------
export function parseSeatgeek(json, artist) {
  return (json?.events || [])
    .map((e) => ({
      provider: 'SeatGeek',
      id: `sg:${e.id}`,
      artist,
      name: e.title,
      attractions: (e.performers || []).map((p) => p.name),
      date: e.datetime_local?.slice(0, 10) || null,
      time: e.time_tbd ? null : e.datetime_local?.slice(11, 16) || null,
      city: e.venue?.city || '',
      country: e.venue?.country || '',
      venue: e.venue?.name || '',
      url: e.url,
      status: 'onsale',
      onsale: null,
      presales: [],
      minPrice: e.stats?.lowest_price ?? null,
      maxPrice: e.stats?.highest_price ?? null,
      currency: 'USD',
      listings: e.stats?.listing_count ?? null,
    }))
    .filter((s) => real(s) && (matchesArtist(artist, s.name) || s.attractions.some((a) => matchesArtist(artist, a))));
}

async function searchSeatgeek(clientId, artist) {
  const url = `https://api.seatgeek.com/2/events?q=${encodeURIComponent(artist)}&taxonomies.name=concert&per_page=50&client_id=${encodeURIComponent(clientId)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`SeatGeek API ${res.status}`);
  return parseSeatgeek(await res.json(), artist);
}

/** כל ההופעות בחו"ל של אמן, מכל הממשקים שיש להם מפתח. */
export async function searchArtistAbroad(cfg, artist) {
  const k = keys(cfg);
  const out = [];
  for (const [name, fn, key] of [['Ticketmaster', searchTicketmaster, k.ticketmaster], ['SeatGeek', searchSeatgeek, k.seatgeek]]) {
    if (!key) continue;
    try {
      out.push(...(await fn(key, artist)));
    } catch (e) {
      log(`  [חו"ל] ${name} · ${artist}: ${e.message}`);
    }
    await sleep(250); // לא יותר מ-4 בקשות בשנייה
  }
  const countries = (cfg.intl?.countries || []).map((c) => c.toUpperCase());
  return out.filter((s) => s.status !== 'cancelled' && (!countries.length || countries.includes(String(s.country).toUpperCase())));
}

// ---------- עיצוב ----------
const flag = (cc) => (/^[A-Z]{2}$/i.test(cc || '') ? String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0))) : '🌍');
const money = (n, cur) => (n == null ? '' : `${{ USD: '$', GBP: '£', EUR: '€', ILS: '₪' }[cur] || ''}${Math.round(n)}${{ USD: 1, GBP: 1, EUR: 1, ILS: 1 }[cur] ? '' : ` ${cur || ''}`}`);
export const ilTime = (iso) => (iso ? new Date(iso).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const dmy = (d) => (d ? d.split('-').reverse().join('.') : '');

export function showLine(s) {
  const price = s.minPrice != null ? ` · 💰 ${money(s.minPrice, s.currency)}${s.maxPrice && s.maxPrice !== s.minPrice ? `–${money(s.maxPrice, s.currency)}` : ''}` : '';
  const sale = s.onsale && new Date(s.onsale) > new Date() ? `\n   🎫 המכירה נפתחת: ${ilTime(s.onsale)} (שעון ישראל)` : '';
  const listings = s.listings ? ` · ${s.listings} כרטיסים בשוק` : '';
  return `${flag(s.country)} <b>${dmy(s.date)}${s.time ? ` ${s.time}` : ''}</b> · ${esc(s.venue)}, ${esc(s.city)}${price}${listings} · <a href="${esc(s.url)}">${s.provider}</a>${sale}`;
}

// ---------- מעקב ושינויים ----------
/**
 * משווה הופעות של אמן למה שנשמר. מחזיר רשימת שינויים:
 *  new – הופעה חדשה · onsale – המכירה נפתחת בקרוב (24 שעות) · presale – פריסייל בקרוב ·
 *  cheaper – המחיר הזול ירד ב-10% לפחות · status – בוטל/נדחה
 */
export function diffShows(db, shows, { firstRun = false, now = Date.now() } = {}) {
  db.intl ||= {};
  const changes = [];
  for (const s of shows) {
    const prev = db.intl[s.id];
    const rec = { minPrice: s.minPrice, status: s.status, onsale: s.onsale, date: s.date, remindedSale: prev?.remindedSale, remindedPre: prev?.remindedPre };
    if (!prev) {
      if (!firstRun) changes.push({ kind: 'new', show: s });
    } else {
      if (s.minPrice != null && prev.minPrice != null && s.minPrice <= prev.minPrice * 0.9) changes.push({ kind: 'cheaper', show: s, was: prev.minPrice });
      if (s.status !== prev.status && ['rescheduled', 'postponed', 'offsale'].includes(s.status)) changes.push({ kind: 'status', show: s, was: prev.status });
    }
    const soon = (iso) => iso && new Date(iso) - now > 0 && new Date(iso) - now < 24 * 3600 * 1000;
    if (soon(s.onsale) && !rec.remindedSale) {
      changes.push({ kind: 'onsale', show: s });
      rec.remindedSale = true;
    }
    const pre = s.presales.find((p) => soon(p.start));
    if (pre && rec.remindedPre !== pre.start) {
      changes.push({ kind: 'presale', show: s, presale: pre });
      rec.remindedPre = pre.start;
    }
    db.intl[s.id] = rec;
  }
  return changes;
}

const HEAD = {
  new: (a) => `🌍 <b>${esc(a)} – הופעה חדשה בחו"ל</b>`,
  onsale: (a) => `⏰ <b>${esc(a)} – המכירה נפתחת בקרוב!</b>`,
  presale: (a) => `🔑 <b>${esc(a)} – פריסייל בקרוב</b>`,
  cheaper: (a) => `⬇️ <b>${esc(a)} – המחיר בחו"ל ירד</b>`,
  status: (a) => `⚠️ <b>${esc(a)} – שינוי בהופעה</b>`,
};

export function formatChanges(artist, changes) {
  const byKind = new Map();
  for (const c of changes) byKind.set(c.kind, [...(byKind.get(c.kind) || []), c]);
  const parts = [];
  for (const [kind, list] of byKind) {
    const lines = [HEAD[kind](artist)];
    for (const c of list.slice(0, 8)) {
      let extra = '';
      if (kind === 'cheaper') extra = ` <i>(היה ${money(c.was, c.show.currency)})</i>`;
      if (kind === 'status') extra = ` <i>(${{ rescheduled: 'נדחה לתאריך חדש', postponed: 'נדחה', offsale: 'הוצא מהמכירה' }[c.show.status] || c.show.status})</i>`;
      if (kind === 'presale') extra = `\n   🔑 ${esc(c.presale.name || 'פריסייל')}: ${ilTime(c.presale.start)} (שעון ישראל)`;
      lines.push(showLine(c.show) + extra);
    }
    if (list.length > 8) lines.push(`ועוד ${list.length - 8}...`);
    parts.push(lines.join('\n'));
  }
  return parts.join('\n\n');
}

export function formatExisting(artist, shows) {
  if (!shows.length) return `🌍 בחו"ל: כרגע אין הופעות של ${esc(artist)} ב-Ticketmaster/SeatGeek.`;
  const sorted = [...shows].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return [`🌍 <b>${esc(artist)} בחו"ל – ${shows.length} הופעות:</b>`, ...sorted.slice(0, 12).map(showLine), ...(shows.length > 12 ? [`ועוד ${shows.length - 12}...`] : [])].join('\n');
}
