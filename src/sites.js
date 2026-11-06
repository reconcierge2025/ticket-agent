// מאגר האתרים שהסוכן מכיר: מה הוא יודע לעשות בכל אחד.
// הרמות נקבעו בבדיקה אמיתית של כל אתר (נובמבר 2026).
//
// full    🟢 מושבים + השורות הכי קרובות + מצב קנייה
// seats   🟢 מושבים + השורות הכי קרובות (התראות)
// listings🟡 רשימת כרטיסים למכירה עם אזור ושורה (שוק משני)
// avail   🟡 זמינות ומחיר (אירועים בלי מקומות מסומנים)
// guide   🔵 מנוע חיפוש – מפנה לאתרים אחרים
// blocked ⛔ חוסם סוכנים אוטומטיים (לא עוקפים)
// down    ❌ לא נגיש מהסוכן

export const LEVELS = {
  full: { icon: '🟢', he: 'מלאה: מושבים, שורות קרובות ומצב קנייה' },
  seats: { icon: '🟢', he: 'מושבים ושורות קרובות' },
  listings: { icon: '🟡', he: 'כרטיסים למכירה לפי אזור ושורה' },
  avail: { icon: '🟡', he: 'זמינות ומחיר' },
  guide: { icon: '🔵', he: 'מנוע חיפוש – מפנה לאתרים' },
  blocked: { icon: '⛔', he: 'חוסם סוכנים אוטומטיים' },
  down: { icon: '❌', he: 'לא נגיש' },
};

export const SITES = [
  // ישראל
  { name: 'קופת תל אביב', domains: ['kupat.co.il', '2207.co.il', 'tickets.comy.co.il', 'tickets.grayclub.co.il'], region: 'il', level: 'full', adapter: 'kupat', note: 'מצב קנייה: חלון פתוח + המושבים ללחיצה' },
  { name: 'טיקטמאסטר ישראל', domains: ['ticketmaster.co.il'], region: 'il', level: 'full', adapter: 'ticketmaster', note: 'מצב קנייה: בחירה אוטומטית עד עמוד התשלום' },
  { name: 'בראבו', domains: ['bravo.org.il'], region: 'il', level: 'full', adapter: 'bravo', note: 'מצב קנייה: חלון פתוח + המושבים ללחיצה' },
  { name: 'לאן', domains: ['leaan.co.il'], region: 'il', level: 'full', adapter: 'leaan', note: 'מפת vivenu · מצב קנייה: חלון פתוח + המושבים ללחיצה' },
  { name: 'GoShow', domains: ['goshow.co.il'], region: 'il', level: 'avail', adapter: 'avail' },
  { name: 'Eventer', domains: ['eventer.co.il'], region: 'il', level: 'avail', adapter: 'avail' },
  { name: 'GetIn', domains: ['get-in.com', 'getin.xyz'], region: 'il', level: 'avail', adapter: 'avail' },
  { name: 'MegaTickets', domains: ['megatickets.co.il'], region: 'il', level: 'avail', adapter: 'avail' },
  { name: "טיקצ'אק", domains: ['tickchak.co.il'], region: 'il', level: 'avail', adapter: 'avail', note: 'LIVE = אינדקס שמפנה לאתרים אחרים' },
  { name: 'לייב טיקטס', domains: ['livetickets.co.il'], region: 'il', level: 'avail', adapter: 'avail', note: 'חבילות לחו"ל' },
  { name: 'טיקט פלייס', domains: ['ticketplace.co.il'], region: 'il', level: 'avail', adapter: 'avail', note: 'כרטיסים לחו"ל' },
  { name: 'טיקט האוס', domains: ['ticket-house.com'], region: 'il', level: 'avail', adapter: 'avail', note: 'כרטיסים לחו"ל' },
  { name: 'איוונטים ישראל', domains: ['eventim.co.il'], region: 'il', level: 'blocked' },
  { name: 'זאפה', domains: ['zappa-club.co.il'], region: 'il', level: 'blocked', note: 'קבוצת Eventim' },
  { name: 'ToMix', domains: ['tomix.co.il'], region: 'il', level: 'down' },
  // ארה"ב וגלובלי
  { name: 'TicketNetwork', domains: ['ticketnetwork.com'], region: 'us', level: 'listings', adapter: 'ticketnetwork', note: 'שוק משני' },
  { name: 'Eventbrite', domains: ['eventbrite.com', 'eventbrite.co.uk'], region: 'us', level: 'avail', adapter: 'avail' },
  { name: 'Etix', domains: ['etix.com'], region: 'us', level: 'avail', adapter: 'avail' },
  { name: 'ShowClix / Leap', domains: ['showclix.com', 'leapevents.com'], region: 'us', level: 'avail', adapter: 'avail' },
  { name: 'Gametime', domains: ['gametime.co'], region: 'us', level: 'avail', adapter: 'avail', note: 'שוק משני' },
  { name: 'Ticketmaster', domains: ['ticketmaster.com'], region: 'us', level: 'blocked' },
  { name: 'Live Nation', domains: ['livenation.com'], region: 'us', level: 'blocked' },
  { name: 'AXS', domains: ['axs.com'], region: 'us', level: 'blocked' },
  { name: 'Dice', domains: ['dice.fm'], region: 'us', level: 'blocked' },
  { name: 'TicketWeb', domains: ['ticketweb.com'], region: 'us', level: 'blocked' },
  { name: 'Tix', domains: ['tix.com'], region: 'us', level: 'blocked' },
  { name: 'See Tickets US', domains: ['seetickets.us'], region: 'us', level: 'blocked' },
  // אירופה
  { name: 'Ticketline', domains: ['ticketline.co.uk'], region: 'eu', level: 'avail', adapter: 'avail' },
  { name: 'Wegow', domains: ['wegow.com'], region: 'eu', level: 'avail', adapter: 'avail' },
  { name: 'Billetweb', domains: ['billetweb.fr'], region: 'eu', level: 'avail', adapter: 'avail' },
  { name: 'MyTicket', domains: ['myticket.co.uk', 'myticket.de'], region: 'eu', level: 'avail', adapter: 'avail' },
  { name: 'Ents24', domains: ['ents24.com'], region: 'eu', level: 'guide' },
  { name: 'Eventim', domains: ['eventim.com', 'eventim.de'], region: 'eu', level: 'blocked' },
  { name: 'Ticketmaster UK', domains: ['ticketmaster.co.uk'], region: 'eu', level: 'blocked' },
  { name: 'See Tickets UK', domains: ['seetickets.com'], region: 'eu', level: 'blocked' },
  { name: 'Gigs and Tours', domains: ['gigsandtours.com'], region: 'eu', level: 'blocked' },
  { name: 'Skiddle', domains: ['skiddle.com'], region: 'eu', level: 'blocked' },
  { name: 'Gigantic', domains: ['gigantic.com'], region: 'eu', level: 'blocked' },
  { name: 'Fnac Spectacles', domains: ['fnacspectacles.com'], region: 'eu', level: 'blocked', note: 'קבוצת Eventim' },
  { name: 'Oeticket', domains: ['oeticket.com'], region: 'eu', level: 'blocked', note: 'קבוצת Eventim' },
  { name: 'Ticketcorner', domains: ['ticketcorner.ch'], region: 'eu', level: 'blocked', note: 'קבוצת Eventim' },
  { name: 'Billetlugen', domains: ['billetlugen.dk'], region: 'eu', level: 'blocked', note: 'קבוצת Eventim' },
  // שוק משני ומנועי חיפוש
  { name: 'Songkick', domains: ['songkick.com'], region: 'resale', level: 'guide' },
  { name: 'StubHub', domains: ['stubhub.com'], region: 'resale', level: 'blocked' },
  { name: 'Viagogo', domains: ['viagogo.com'], region: 'resale', level: 'blocked' },
  { name: 'SeatGeek', domains: ['seatgeek.com'], region: 'resale', level: 'blocked' },
  { name: 'TickPick', domains: ['tickpick.com'], region: 'resale', level: 'blocked' },
  { name: 'Vivid Seats', domains: ['vividseats.com'], region: 'resale', level: 'blocked' },
  { name: 'TicketSwap', domains: ['ticketswap.com'], region: 'resale', level: 'blocked' },
  { name: 'Twickets', domains: ['twickets.live'], region: 'resale', level: 'blocked' },
];

const REGIONS = { il: '🇮🇱 ישראל', us: '🇺🇸 ארה"ב וגלובלי', eu: '🇪🇺 אירופה', resale: '🔁 שוק משני ומנועי חיפוש' };

/** האתר של קישור מסוים (לפי הדומיין). */
export function siteFor(url) {
  let host = '';
  try {
    host = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
  return SITES.find((s) => s.domains.some((d) => host === d || host.endsWith('.' + d))) || null;
}

/** הודעת /sites – כל האתרים לפי אזור ורמת תמיכה, כולל מה שהסוכן למד ומצא לבד. */
export function sitesText(db = {}) {
  const lines = ['🌐 <b>האתרים שאני מכיר</b>', ''];
  for (const [lvl, { icon, he }] of Object.entries(LEVELS)) if (lvl !== 'seats') lines.push(`${icon} ${he}`);
  for (const [region, title] of Object.entries(REGIONS)) {
    lines.push('', `<b>${title}</b>`);
    const order = Object.keys(LEVELS);
    for (const s of SITES.filter((x) => x.region === region).sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level))) {
      lines.push(`${LEVELS[s.level].icon} ${s.name}${s.note ? ` – <i>${s.note}</i>` : ''}`);
    }
  }
  const learned = Object.entries(db.learned || {});
  if (learned.length) {
    lines.push('', '<b>🧠 למדתי לבד</b> (אתרים ששלחת ועבדו)');
    for (const [host, l] of learned) lines.push(`${LEVELS[l.level]?.icon || '🟡'} ${host}`);
  }
  const cands = Object.entries(db.candidates || {}).filter(([, c]) => !['blocked', 'down', 'not-tickets'].includes(c.kind));
  if (cands.length) {
    lines.push('', '<b>🔎 מצאתי לבד</b> (עוד לא נוסו על מופע – שלח קישור)');
    for (const [host, c] of cands.slice(-15)) lines.push(`${c.kind === 'avail' ? '🟡' : '🟢'} ${host}${c.title ? ` – <i>${c.title.slice(0, 40)}</i>` : ''}`);
  }
  const n = (l) => SITES.filter((s) => l.includes(s.level)).length;
  lines.push('', `סה"כ ${SITES.length} אתרים: ${n(['full', 'seats'])} עם מושבים, ${n(['listings', 'avail'])} זמינות/רשימות, ${n(['guide'])} מנועי חיפוש, ${n(['blocked', 'down'])} חוסמים/לא נגישים.`);
  lines.push('', '💡 שלח לי קישור למופע מכל אתר 🟢/🟡 – וגם מאתר שלא ברשימה: אנסה לזהות אותו לבד.');
  return lines.join('\n');
}
