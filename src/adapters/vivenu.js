// vivenu – פלטפורמת מפות מושבים שמשמשת אתרים רבים (למשל לאן).
// הדף מטמיע iframe של seatmap.vivenu.com עם מזהה אירוע; הנתונים ציבוריים:
//   /api/public/event/<id>/map?shrink=true  → אזורים, שורות, מושבים (sectionName / rowName / seatName / statusId)
//   /api/public/event/<id>/status           → { statusId: "booked" | ... } – מה שלא מופיע פנוי
const API = 'https://seatmap.vivenu.com/api/public/event/';

/** מוצא בדף את מזהה האירוע של vivenu (אם יש). */
export async function vivenuEventId(page, timeout = 20000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const id = await page
      .evaluate(() => {
        const html = [...document.querySelectorAll('iframe')].map((f) => `${f.src} ${f.srcdoc || ''}`).join(' ') + document.documentElement.innerHTML.slice(0, 300000);
        const m = html.match(/viInitEventId\s*=\s*\\?["']([a-f0-9]{24})/) || html.match(/api\/public\/event\/([a-f0-9]{24})/);
        return m ? m[1] : null;
      })
      .catch(() => null);
    if (id) return id;
    await page.waitForTimeout(1000);
  }
  return null;
}

function collectSeats(node, out) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) return node.forEach((n) => collectSeats(n, out));
  if (node._type === 6 && node.seatName !== undefined) out.push(node);
  for (const k of ['layers', 'sections', 'groups', 'rows', 'seats']) if (node[k]) collectSeats(node[k], out);
}

export async function vivenuSeats(eventId) {
  const [mapRes, statusRes] = await Promise.all([fetch(`${API}${eventId}/map?shrink=true`), fetch(`${API}${eventId}/status`)]);
  if (!mapRes.ok) return []; // אירוע בלי מפת מושבים (כניסה חופשית)
  const map = await mapRes.json();
  const status = statusRes.ok ? (await statusRes.json()).status || {} : {};
  const cats = Object.fromEntries((map.seatMap?.categories || []).map((c) => [c._id, c.name]));
  const raw = [];
  collectSeats(map.seatMap, raw);
  return raw.map((s) => ({
    section: s.sectionName || cats[s.categoryId] || 'אולם',
    row: s.rowName,
    seat: s.seatName,
    available: !status[s.statusId] || /^(free|available)$/i.test(status[s.statusId]),
    price: null,
  }));
}
