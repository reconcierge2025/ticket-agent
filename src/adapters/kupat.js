// קופת תל אביב ומערכות ההזמנה האחיות (tickets.kupat / tickets.comy / tickets.grayclub ...).
// קישור מופע: https://tickets.kupat.co.il/booking/features/441?prsntId=56503
//
// הדף טוען בעצמו: presentations (כל התאריכים של האירוע)
//                  seatplan (מבנה האולם: אזורים, שורות, מושבים)
//                  seats-status (רשימת המושבים הפנויים בלבד)
//                  ticketGroups (מחיר לכל רמת מחיר)
// אנחנו רק מקשיבים לתשובות האלה. מפת המושבים מצוירת כתמונה (canvas) והאתר לא מציע
// "בחירה אוטומטית", לכן במצב קנייה הסוכן פותח את המופע בחלון שלך ואומר בדיוק על אילו מושבים ללחוץ.
import { waitFor, captureJson } from './util.js';

export const name = 'kupat';
export const matches = (url) => /\/booking\/features\/\d+/.test(url);
/** כל קישור הוא גם "רשימה": בודקים את כל התאריכים של האירוע (פעם אחת). */
export const isListing = (url, event = {}) => !event.expanded;

export function prepare(page) {
  return captureJson(page, {
    presentations: /\/api\/presentations\/\?featureIds=/,
    plan: /\/api\/seats\/seatplan\?/,
    status: /\/api\/seats\/seats-status\?/,
    groups: /\/api\/presentations\/\d+\/ticketGroups/,
  });
}

const DAYS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

export async function listPerformances(page, event, data) {
  await waitFor(() => data.presentations, 30000, 'רשימת תאריכים');
  const u = new URL(page.url());
  const feature = u.pathname.match(/features\/(\d+)/)[1];
  return (data.presentations.presentations || [])
    .filter((p) => !p.soldout && String(p.featureId) === feature)
    .map((p) => {
      const d = new Date(p.dateTime.replace(' ', 'T'));
      const date = `יום ${DAYS[d.getDay()]}' ${d.getDate()}.${d.getMonth() + 1} ${p.dateTime.slice(11, 16)}`;
      return { url: `${u.origin}/booking/features/${feature}?prsntId=${p.id}`, label: `${date} · ${p.venueName}`, name: p.featureName };
    });
}

export async function getSeats(page, event, data) {
  await waitFor(() => data.plan && data.status, 40000);
  await waitFor(() => data.groups, 8000).catch(() => {}); // מחירים – לא חובה

  // מושב פנוי: [sectionId, group, x, y, ?, ticketGroupId, ...]
  const free = new Map();
  for (const e of data.status.seats || []) free.set(`${e[0]}|${e[1]}|${e[3]}|${e[2]}`, e[5]);

  const price = {};
  for (const [id, g] of Object.entries(data.groups?.ticketGroups || {})) price[id] = g.tickets?.[0]?.price ?? null;

  const seats = [];
  for (const sec of Object.values(data.plan.sections || {})) {
    for (const [g, grp] of Object.entries(sec.groups || {})) {
      for (const [y, row] of Object.entries(grp.rows || {})) {
        for (const [x, s] of Object.entries(row.S || {})) {
          const tg = free.get(`${sec.VenueSectionId}|${g}|${y}|${x}`);
          seats.push({
            section: sec.SectionName,
            row: row.r,
            seat: s[9],
            available: tg !== undefined,
            price: tg !== undefined ? price[tg] ?? null : null,
          });
        }
      }
    }
  }
  return seats;
}
