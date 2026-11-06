// בדיקה חיה של "הסייר": סריקה קצרה, מופעים חדשים, ואתרי כרטיסים שהסוכן מוצא לבד. בלי טלגרם.
// הרצה: node test/scout-live.js
import { loadConfig } from '../src/config.js';
import { launchScanner } from '../src/browser.js';
import { discover, externalDomains } from '../src/discover.js';
import { announceNewShows, probeNewSites } from '../src/scout.js';
import { sitesText } from '../src/sites.js';

const cfg = loadConfig('config.example.json');
cfg.sites = cfg.sites.filter((s) => s.enabled !== false).map((s) => ({ ...s, maxPages: 6, maxEvents: 20 }));
const db = {};
const sent = [];
const notify = async (t) => sent.push(t.replace(/<[^>]+>/g, ''));
const browser = await launchScanner(cfg);
const found = await discover(browser, cfg);
console.log(`מופעים שנמצאו: ${found.length}`);
await announceNewShows(db, cfg, found, notify);
console.log(`אחרי סריקה ראשונה (לומד): ${Object.keys(db.known).length} מופעים מוכרים, ${sent.length} הודעות`);
// מדמה מופע חדש שעלה
await announceNewShows(db, cfg, [...found, { name: 'קופת ת"א: מופע חדש לבדיקה', url: 'https://tickets.kupat.co.il/booking/features/99999?prsntId=1' }], notify);
console.log('הודעת מופעים חדשים:\n' + sent.at(-1));
console.log(`\nדומיינים חיצוניים שנאספו: ${[...externalDomains.keys()].join(', ') || '—'}`);
await probeNewSites(browser, db, notify, 4);
console.log('\nמועמדים שנבדקו:', JSON.stringify(db.candidates, null, 1));
await browser.close();
console.log('\n--- /sites (סוף) ---\n' + sitesText(db).replace(/<[^>]+>/g, '').split('\n').slice(-12).join('\n'));
