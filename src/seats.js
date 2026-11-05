// לוגיקה טהורה: מקבלת רשימת מושבים ומחזירה את המקומות הטובים בכל אזור.
// מושב: { id?, section, row, seat, price?, available }

const norm = (s) => String(s ?? '').trim().toLowerCase();
const HEB = 'אבגדהוזחטיכלמנסעפצקרשת';

/** הופך מספר שורה לערך מספרי: "2" → 2, "ב" → 2, "B" → 2. לא מזוהה → אינסוף (הכי רחוק). */
export function rowNum(row) {
  const r = String(row ?? '').trim();
  const n = parseInt(r, 10);
  if (Number.isFinite(n)) return n;
  if (r.length === 1 && HEB.includes(r)) return HEB.indexOf(r) + 1;
  if (/^[a-z]$/i.test(r)) return r.toUpperCase().charCodeAt(0) - 64;
  return Infinity;
}

export function matchesSection(section, patterns) {
  if (!patterns || patterns.length === 0) return true;
  const s = norm(section);
  return patterns.some((p) => s === norm(p) || s.includes(norm(p)));
}

/**
 * מוצא רצפים של מושבים פנויים צמודים באותה שורה.
 * seatStep: 1 = מספור רציף (1,2,3), 2 = מספור זוגי/אי-זוגי (1,3,5) – כל צד נבדק בנפרד.
 */
export function findAdjacentBlocks(seats, opts = {}) {
  const { preferredSections = [], minAdjacent = 2, maxPrice = 0, seatStep = 1 } = opts;

  const candidates = seats.filter(
    (s) =>
      s.available &&
      matchesSection(s.section, preferredSections) &&
      Number.isFinite(Number(s.seat)) &&
      (!maxPrice || !s.price || Number(s.price) <= maxPrice)
  );

  const byRow = new Map();
  for (const s of candidates) {
    const side = seatStep > 1 ? Number(s.seat) % seatStep : 0;
    const key = `${s.section}|||${s.row}|||${side}`;
    if (!byRow.has(key)) byRow.set(key, []);
    byRow.get(key).push(s);
  }

  const blocks = [];
  for (const rowSeats of byRow.values()) {
    const sorted = [...new Map(rowSeats.map((s) => [Number(s.seat), s])).values()].sort(
      (a, b) => Number(a.seat) - Number(b.seat)
    );
    let run = [sorted[0]];
    const flush = () => {
      if (run.length >= minAdjacent) {
        blocks.push({
          section: run[0].section,
          row: run[0].row,
          seats: run.map((s) => Number(s.seat)),
          prices: run.map((s) => s.price ?? null),
          items: run,
        });
      }
    };
    for (let i = 1; i < sorted.length; i++) {
      if (Number(sorted[i].seat) - Number(run[run.length - 1].seat) === seatStep) run.push(sorted[i]);
      else {
        flush();
        run = [sorted[i]];
      }
    }
    if (sorted.length) flush();
  }

  return blocks.sort((a, b) => b.seats.length - a.seats.length || rowNum(a.row) - rowNum(b.row));
}

/** חותך גוש ארוך לחלון של `quantity` מושבים הכי קרוב למרכז השורה. */
function bestWindow(block, quantity, center) {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i + quantity <= block.items.length; i++) {
    const w = block.seats.slice(i, i + quantity);
    const dist = Math.abs(w.reduce((a, b) => a + b, 0) / quantity - center);
    if (dist < bestDist) [best, bestDist] = [i, dist];
  }
  const cut = (arr) => arr.slice(best, best + quantity);
  return { ...block, seats: cut(block.seats), prices: cut(block.prices), items: cut(block.items), centerDist: bestDist };
}

/**
 * לכל אזור (VIP / אולם / יציע ...) מחזיר את המקומות הטובים ביותר:
 * `quantity` מושבים צמודים, בשורה הכי קרובה לבמה (עד maxRow), והכי קרוב למרכז השורה.
 * הסדר בתוצאה = סדר האזורים ב-config (העדיפות שלך).
 */
export function findBestPerZone(seats, opts = {}) {
  const { zones = [{ name: 'הכל', match: [] }], quantity = 2, seatStep = 1, maxPrice = 0 } = opts;

  // מרכז כל שורה מחושב מכל המושבים בה (גם תפוסים)
  const centers = new Map();
  for (const s of seats) {
    const k = `${s.section}|||${s.row}`;
    const n = Number(s.seat);
    if (!Number.isFinite(n)) continue;
    const c = centers.get(k) || { min: n, max: n };
    centers.set(k, { min: Math.min(c.min, n), max: Math.max(c.max, n) });
  }

  const results = [];
  for (const zone of zones) {
    const zoneSeats = seats.filter((s) => matchesSection(s.section, zone.match));
    const blocks = findAdjacentBlocks(zoneSeats, { minAdjacent: quantity, seatStep, maxPrice: zone.maxPrice ?? maxPrice })
      .filter((b) => !zone.maxRow || rowNum(b.row) <= zone.maxRow)
      .map((b) => {
        const c = centers.get(`${b.section}|||${b.row}`);
        return bestWindow(b, quantity, c ? (c.min + c.max) / 2 : 0);
      })
      .sort((a, b) => rowNum(a.row) - rowNum(b.row) || a.centerDist - b.centerDist);
    for (const b of blocks.slice(0, zone.maxResults ?? 3)) results.push({ zone: zone.name, ...b });
  }
  return results;
}

/**
 * לכל כמות כרטיסים (למשל 2,3,4,5) ולכל אזור – האפשרות הכי טובה.
 * מחזיר [{ quantity, zone, section, row, seats, prices, items, centerDist }]
 */
export function findBestOptions(seats, opts = {}) {
  const quantities = opts.quantities?.length ? opts.quantities : [opts.quantity || 2];
  const zones = (opts.zones || [{ name: 'הכל', match: [] }]).map((z) => ({ ...z, maxResults: 1 }));
  const out = [];
  for (const q of quantities) {
    for (const r of findBestPerZone(seats, { ...opts, zones, quantity: q })) out.push({ quantity: q, ...r });
  }
  return out;
}

/** האם אפשרות a טובה יותר מ-b: שורה קרובה יותר, או אותה שורה וקרוב יותר למרכז. */
export function isBetter(a, b) {
  if (!b) return true;
  const ra = rowNum(a.row);
  const rb = rowNum(b.row);
  return ra < rb || (ra === rb && a.centerDist < b.centerDist - 1);
}

export function blockKey(eventName, b) {
  return `${eventName}|${b.section}|${b.row}|${b.seats.join(',')}`;
}
