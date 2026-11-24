import { test } from 'node:test';
import assert from 'node:assert/strict';
import { repeatDates } from '../src/date.js';

test('daily task shows on every later day of the week', () => {
  const t = { id: 'a', date: '2026-11-25', repeat: 'daily' };
  assert.deepEqual(repeatDates(t, '2026-11-23', '2026-11-29'), ['2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29']);
});

test('an overdue task still shows inside the visible range', () => {
  const t = { id: 'a', date: '2026-11-01', repeat: 'weekly' };
  assert.deepEqual(repeatDates(t, '2026-11-23', '2026-11-29'), ['2026-11-29']);
});

test('weekdays skip the weekend', () => {
  const t = { id: 'a', date: '2026-11-27', repeat: 'weekdays' };
  assert.deepEqual(repeatDates(t, '2026-11-23', '2026-12-02'), ['2026-11-30', '2026-12-01', '2026-12-02']);
});

test('done, deleted, subtasks and plain tasks give nothing', () => {
  const r = (x) => repeatDates({ id: 'a', date: '2026-11-25', repeat: 'daily', ...x }, '2026-11-23', '2026-11-29');
  assert.deepEqual(r({ done: true }), []);
  assert.deepEqual(r({ deleted: true }), []);
  assert.deepEqual(r({ parentId: 'p' }), []);
  assert.deepEqual(r({ repeat: null }), []);
});
