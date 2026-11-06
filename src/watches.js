// רשימת המופעים במעקב – לכל מופע: מזהה קצר, מי ביקש (owner), כמות, מחיר מקסימלי, מעקב צפוף (hot).
// נשמרת ב-<AGENT_DATA_DIR>/watches.json
import fs from 'node:fs';
import path from 'node:path';

const file = () => path.resolve(process.env.AGENT_DATA_DIR || 'data', 'watches.json');

export function list(owner) {
  let items = [];
  try {
    items = JSON.parse(fs.readFileSync(file(), 'utf8'));
  } catch {}
  // רשומות ישנות בלי מזהה – מקבלות מזהה
  let next = Math.max(0, ...items.map((w) => w.id || 0)) + 1;
  for (const w of items) w.id ||= next++;
  return owner ? items.filter((w) => !w.owner || w.owner === String(owner)) : items;
}

function write(items) {
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(items, null, 2), 'utf8');
}

/** מוסיף או מעדכן (אותו קישור + אותו אדם = אותה רשומה). מחזיר את הרשומה. */
export function add(item) {
  const items = list();
  const owner = item.owner ? String(item.owner) : undefined;
  const existing = items.find((w) => w.url === item.url && w.owner === owner);
  if (existing) {
    Object.assign(existing, item, { owner });
    write(items);
    return existing;
  }
  const w = { id: Math.max(0, ...items.map((x) => x.id)) + 1, ...item, owner, addedAt: new Date().toISOString() };
  items.push(w);
  write(items);
  return w;
}

export const get = (id) => list().find((w) => w.id === Number(id));

export function update(id, changes) {
  const items = list();
  const w = items.find((x) => x.id === Number(id));
  if (!w) return null;
  Object.assign(w, changes);
  write(items);
  return w;
}

/** הסרה לפי מזהה. owner – רק את שלו (או רשומות משותפות). */
export function remove(id, owner) {
  const items = list();
  const i = items.findIndex((w) => w.id === Number(id) && (!owner || !w.owner || w.owner === String(owner)));
  if (i < 0) return null;
  const [removed] = items.splice(i, 1);
  write(items);
  return removed;
}
