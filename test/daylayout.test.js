import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutDay } from '../src/daylayout.js';

const cols = (items) => layoutDay(items).map((e) => `${e.x.id}:${e.col}/${e.cols}`);

test('overlapping events sit side by side, separate ones take the full width', () => {
  const items = [
    { id: 'a', time: '15:00', ext: true, dur: 30 },
    { id: 'b', time: '15:00', duration: 60 },
    { id: 'c', time: '15:50', ext: true, dur: 60 },
    { id: 'd', time: '18:00', ext: true, dur: 90 },
  ];
  assert.deepEqual(cols(items), ['b:0/2', 'a:1/2', 'c:1/2', 'd:0/1']);
});

test('tasks without duration take 30 minutes', () => {
  const [e] = layoutDay([{ id: 'a', time: '23:50' }]);
  assert.equal(e.end - e.start, 10); // clipped at midnight
});
