// שמירת ממצאים בקובץ JSON: "השיא" לכל אירוע/אזור/כמות + היסטוריה.
// מתריעים רק כשנמצא משהו קרוב יותר מהשיא הקודם.
import fs from 'node:fs';
import path from 'node:path';
import { isBetter } from './seats.js';

const DATA_DIR = path.resolve(process.env.AGENT_DATA_DIR || 'data');
const FILE = path.join(DATA_DIR, 'found.json');

export function load() {
  try {
    const db = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return { seen: {}, best: {}, history: [], ...db };
  } catch {
    return { seen: {}, best: {}, history: [] };
  }
}

export function save(db) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(db, null, 2), 'utf8');
}

const strip = ({ items, ...o }) => o;

/** מעדכן את השיאים של האירוע ומחזיר רק את האפשרויות שהשתפרו (או חדשות). */
export function updateBest(db, event, options) {
  const best = (db.best[event.url] ||= {});
  const now = new Date().toISOString();
  const improved = [];
  for (const o of options) {
    const key = `${o.zone}|${o.quantity}`;
    if (isBetter(o, best[key])) {
      improved.push({ ...o, previous: best[key] || null });
      best[key] = { ...strip(o), foundAt: now };
      db.history.push({ foundAt: now, event: event.name, url: event.url, ...strip(o) });
    }
  }
  if (db.history.length > 5000) db.history.splice(0, db.history.length - 5000);
  return improved;
}

/**
 * זמינות לאתרים בלי מקומות מסומנים. מחזיר מה השתנה:
 * 'first' בפעם הראשונה · 'opened' כשנפתח/חזר מלאי · 'cheaper' כשהמחיר הנמוך ירד · 'closed' כשאזל · null בלי שינוי
 */
export function updateAvail(db, event, a) {
  db.avail ||= {};
  const prev = db.avail[event.url];
  db.avail[event.url] = { available: a.available, minPrice: a.minPrice, at: new Date().toISOString() };
  if (!prev) return 'first';
  if (a.available && !prev.available) return 'opened';
  if (!a.available && prev.available) return 'closed';
  if (a.available && a.minPrice && prev.minPrice && a.minPrice < prev.minPrice) return 'cheaper';
  return null;
}

/** האם כבר שלחנו את המפתח הזה (להתראות חד-פעמיות כמו "יש תור"). */
export function once(db, key) {
  if (db.seen[key]) return false;
  db.seen[key] = new Date().toISOString();
  return true;
}
