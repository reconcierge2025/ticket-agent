// בדיקה חיה של מתאם טיקצ'אק: כל המופעים בעמוד אירוע וסטטוס כל אחד. בלי טלגרם ובלי קנייה.
// הרצה: node test/tickchak-live.js <קישור לעמוד האירוע>
import { loadRuntimeConfig, resolveEvent } from '../src/config.js';
import { launchScanner } from '../src/browser.js';
import { checkEvent } from '../src/check.js';
import { formatSubList } from '../src/adapters/tickchak.js';

const cfg = { ...loadRuntimeConfig('config.example.json'), telegram: {} };
const db = { seen: {}, best: {}, history: [] };
const browser = await launchScanner(cfg);
const r = await checkEvent(browser, resolveEvent(cfg, { url: process.argv[2] }), { cfg, db, notify: async () => {} });
await browser.close();
console.log('status:', r.status, '| מופעים:', r.subs?.length);
for (const s of r.subs || []) console.log(`  [${s.status}] ${s.date || '?'} ${s.time || ''} · ${s.label.slice(0, 60)}`);
console.log('\n--- הודעה ---\n' + formatSubList('צמאה תשפ"ז', r.subs || []).replace(/<[^>]+>/g, ''));
