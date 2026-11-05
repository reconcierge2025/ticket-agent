// רשימת האירועים שהוספת דרך טלגרם (/watch) – נשמרת ב-data/watches.json
import fs from 'node:fs';
import path from 'node:path';

const FILE = path.resolve(process.env.AGENT_DATA_DIR || 'data', 'watches.json');

export function list() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return [];
  }
}

function write(items) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(items, null, 2), 'utf8');
}

export function add(item) {
  const items = list().filter((w) => w.url !== item.url);
  items.push({ ...item, addedAt: new Date().toISOString() });
  write(items);
  return items.length;
}

export function remove(index) {
  const items = list();
  const [removed] = items.splice(index - 1, 1);
  write(items);
  return removed;
}
