import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findBestPerZone, findBestOptions, rowNum } from '../src/seats.js';
import { inQuietHours } from '../src/messenger.js';
import { israelNow } from '../src/config.js';
import { parseCommand } from '../src/bot.js';
import { parseQueueText } from '../src/queue.js';

const S = (section, row, seat, available = true) => ({ section, row, seat, available });

test('שורות בעברית/אנגלית/מספרים', () => {
  assert.equal(rowNum('2'), 2);
  assert.equal(rowNum('ב'), 2);
  assert.equal(rowNum('B'), 2);
  assert.equal(rowNum('???'), Infinity);
});

test('המקומות הטובים בכל אזור: שורה קרובה, מרכז השורה, עד maxRow', () => {
  const seats = [];
  for (let n = 1; n <= 10; n++) seats.push(S('VIP', 1, n, [1, 2, 3, 5, 6].includes(n)));
  for (let n = 1; n <= 10; n++) seats.push(S('אולם', 2, n, [4, 5].includes(n)));
  for (let n = 1; n <= 10; n++) seats.push(S('יציע', 4, n, true)); // שורה 4 – מעבר ל-maxRow
  const zones = [
    { name: 'VIP', match: ['VIP'], maxRow: 3 },
    { name: 'אולם', match: ['אולם'], maxRow: 3 },
    { name: 'יציע', match: ['יציע'], maxRow: 3 },
  ];
  const r = findBestPerZone(seats, { zones, quantity: 2 });
  assert.deepEqual(
    r.map((b) => [b.zone, b.row, b.seats]),
    [
      ['VIP', 1, [5, 6]], // הכי קרוב למרכז
      ['VIP', 1, [2, 3]],
      ['אולם', 2, [4, 5]],
    ]
  );
});

test('פירוק פקודות טלגרם: כמות, מחיר ושעה', () => {
  assert.deepEqual(parseCommand('/sale https://t.co/e/123 4'), { cmd: 'sale', url: 'https://t.co/e/123', quantity: 4, arg: 4, maxPrice: null, time: null });
  assert.deepEqual(parseCommand('/sale https://t.co/e/123 2 10:00'), { cmd: 'sale', url: 'https://t.co/e/123', quantity: 2, arg: 2, maxPrice: null, time: '10:00' });
  const w = parseCommand('https://t.co/e/9 3 עד 300');
  assert.equal(w.cmd, 'watch');
  assert.equal(w.quantity, 3);
  assert.equal(w.maxPrice, 300);
  assert.equal(parseCommand('https://t.co/e/9 250₪').maxPrice, 250);
  assert.equal(parseCommand('/hot 7').arg, 7);
  assert.equal(parseCommand('https://t.co/e/99').cmd, 'watch');
  assert.equal(parseCommand('https://t.co/e/99').quantity, null);
  assert.equal(parseCommand('/remove 2').arg, 2);
  assert.equal(parseCommand('שלום'), null);
});

test('שעות שקט (גם מעבר לחצות)', () => {
  const q = { from: 23, to: 8 };
  assert.equal(inQuietHours(q, 23), true);
  assert.equal(inQuietHours(q, 3), true);
  assert.equal(inQuietHours(q, 8), false);
  assert.equal(inQuietHours(q, 15), false);
  assert.equal(inQuietHours(undefined, 3), false);
});

test('מחיר מקסימלי מסנן מקומות יקרים', () => {
  const seats = [1, 2, 3, 4].map((n) => ({ section: 'אולם', row: 1, seat: n, available: true, price: 500 }))
    .concat([1, 2].map((n) => ({ section: 'אולם', row: 3, seat: n, available: true, price: 200 })));
  const r = findBestOptions(seats, { quantities: [2], maxPrice: 300, zones: [{ name: 'אולם', match: ['אולם'] }] });
  assert.equal(r[0].row, 3);
});

test('תאריך ושעה לפי שעון ישראל', () => {
  const n = israelNow(new Date('2026-11-06T22:30:00Z')); // 00:30 בישראל (חורף, UTC+2)
  assert.equal(n.date, '2026-11-07');
  assert.equal(n.hour, 0);
});

test('קריאת מיקום בתור', () => {
  assert.deepEqual(parseQueueText('מקומך בתור: 1,234 · זמן משוער 12 דקות'), { position: 1234, etaMinutes: 12 });
  assert.equal(parseQueueText('Your number in line: 87').position, 87);
});
