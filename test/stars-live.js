// בדיקה חיה: שמות מופעים מהסריקה (כולל שם האמן), אמנים מובילים שיש להם הופעות, וחיפוש מיידי לאמן. בלי טלגרם.
// הרצה: node test/stars-live.js
import { loadConfig } from '../src/config.js';
import { launchScanner } from '../src/browser.js';
import { discover } from '../src/discover.js';
import { announceStars, saveCatalog, existingShowsMessage } from '../src/scout.js';

const cfg = loadConfig('config.example.json');
cfg.sites = cfg.sites.filter((s) => s.enabled !== false && !s.scoutOnly);
const db = {};
const sent = [];
const browser = await launchScanner(cfg);
const found = await discover(browser, cfg);
await browser.close();
console.log(`מופעים: ${found.length}\nדוגמאות לשמות:`);
for (const e of found.slice(0, 6).concat(found.slice(-4))) console.log('  ', e.name);
await announceStars(db, cfg, found, async (t) => sent.push(t.replace(/<[^>]+>/g, '')));
console.log('\n--- הודעת אמנים מובילים ---\n' + (sent[0] || '(אין)'));
saveCatalog(db, found);
for (const a of ['שלמה ארצי', 'Omer Adam', 'Berry Sakharof']) console.log(`\n--- /follow ${a} ---\n` + existingShowsMessage(db, a).text.replace(/<[^>]+>/g, ''));
