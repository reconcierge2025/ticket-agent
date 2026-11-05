// בדיקה מקצה לקצה מול אתר מדומה (test/site): סריקת אתר, התראות, תור, בחירת מקומות ועד עמוד התשלום.
// הרצה: node test/e2e.js
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveEvent } from '../src/config.js';
import { launchScanner, getBuyContext } from '../src/browser.js';
import { checkEvent, runLive } from '../src/check.js';
import { discover } from '../src/discover.js';

const site = (f) => pathToFileURL(path.resolve('test', 'site', f)).href;
const cfg = {
  headless: true,
  buyHeadless: true, // בבדיקה בלבד – באמת החלון גלוי
  defaults: {
    quantity: 2,
    zones: [
      { name: 'VIP', match: ['VIP'], maxRow: 3 },
      { name: 'אולם', match: ['אולם'], maxRow: 3 },
      { name: 'יציע', match: ['יציע'], maxRow: 3 },
    ],
  },
  queue: { pollSeconds: 1, notifyAtPositions: [300, 50] },
  sites: [
    {
      name: 'מדומה',
      host: '', // קבצים מקומיים – אין דומיין
      listUrl: site('events.html'),
      eventLinkSelector: 'a.event',
      generic: { seatSelector: '.seat', availableSelector: '.available', priceAttr: 'data-price' },
    },
  ],
};
const msgs = [];
const notify = async (t) => msgs.push(t);
const db = { seen: {}, history: [] };

const browser = await launchScanner(cfg);
const found = await discover(browser, cfg);
assert.deepEqual(found.map((e) => e.name), ['הופעה גדולה בהיכל', 'מכירה עם תור']);
console.log('✔ סריקת אתר: נמצאו 2 אירועים (קישור "אודות" סונן)');

const r1 = await checkEvent(browser, found[0], { cfg, db, notify });
assert.deepEqual(r1.results.map((b) => `${b.zone} ${b.row}:${b.seats}`), ['VIP 1:5,6', 'VIP 1:2,3', 'VIP 2:1,2', 'אולם 2:4,5']);
console.log('✔ מקומות טובים בכל אזור:', r1.results.map((b) => `${b.zone} שורה ${b.row} [${b.seats}]`).join(' | '));
const r2 = await checkEvent(browser, found[0], { cfg, db, notify });
assert.equal(r2.fresh.length, 0);
console.log('✔ בדיקה חוזרת: אין התראה כפולה');

const r3 = await checkEvent(browser, found[1], { cfg, db, notify });
assert.equal(r3.status, 'queue');
console.log('✔ זיהוי תור בסריקה רגילה → הצעה ל-/sale');
await browser.close();

const ev = resolveEvent(cfg, { url: site('queue.html'), name: 'מכירה עם תור', quantity: 2, autoSelect: true, generic: cfg.sites[0].generic });
const live = await runLive(ev, { cfg, db, notify });
assert.equal(live.status, 'checkout');
const picked = decodeURIComponent(new URL(live.page.url()).searchParams.get('seats'));
assert.equal(picked, 'VIP-1-5,VIP-1-6');
console.log('✔ מצב קנייה: חיכה בתור, בחר', picked, 'והגיע לעמוד התשלום');
await (await getBuyContext(cfg)).close();

console.log('\n--- הודעות טלגרם שהיו נשלחות ---');
for (const m of msgs) console.log(m, '\n');
