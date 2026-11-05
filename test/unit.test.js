import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findBestPerZone, rowNum } from '../src/seats.js';
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

test('פירוק פקודות טלגרם', () => {
  assert.deepEqual(parseCommand('/sale https://t.co/e/123 4'), { cmd: 'sale', url: 'https://t.co/e/123', quantity: 4, arg: 4 });
  assert.equal(parseCommand('https://t.co/e/99').cmd, 'watch');
  assert.equal(parseCommand('https://t.co/e/99').quantity, null);
  assert.equal(parseCommand('/remove 2').arg, 2);
  assert.equal(parseCommand('שלום'), null);
});

test('קריאת מיקום בתור', () => {
  assert.deepEqual(parseQueueText('מקומך בתור: 1,234 · זמן משוער 12 דקות'), { position: 1234, etaMinutes: 12 });
  assert.equal(parseQueueText('Your number in line: 87').position, 87);
});
