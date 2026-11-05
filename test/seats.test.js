import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findAdjacentBlocks } from '../src/seats.js';

const S = (section, row, seat, available = true, price = null) => ({ section, row, seat, available, price });

test('מוצא רצף צמוד באזור מועדף בלבד', () => {
  const seats = [S('A', 3, 1), S('A', 3, 2), S('A', 3, 3, false), S('A', 3, 4), S('B', 1, 1), S('B', 1, 2)];
  const r = findAdjacentBlocks(seats, { preferredSections: ['A'], minAdjacent: 2 });
  assert.deepEqual(r.map((b) => [b.section, b.row, b.seats]), [['A', 3, [1, 2]]]);
});

test('מספור זוגי/אי-זוגי עם seatStep=2', () => {
  const seats = [S('יציע', 5, 1), S('יציע', 5, 3), S('יציע', 5, 5), S('יציע', 5, 2)];
  const r = findAdjacentBlocks(seats, { minAdjacent: 3, seatStep: 2 });
  assert.deepEqual(r[0].seats, [1, 3, 5]);
});

test('מסנן לפי מחיר מקסימלי', () => {
  const seats = [S('A', 1, 1, true, 500), S('A', 1, 2, true, 500), S('A', 2, 1, true, 200), S('A', 2, 2, true, 200)];
  const r = findAdjacentBlocks(seats, { minAdjacent: 2, maxPrice: 300 });
  assert.equal(r.length, 1);
  assert.equal(r[0].row, 2);
});
