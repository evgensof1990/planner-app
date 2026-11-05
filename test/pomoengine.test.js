import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advance, initialPomo, leftSec, pomoCfg } from '../src/pomoengine.js';

const cfg = pomoCfg({ pomoMinutes: 25, pomoShort: 5, pomoLong: 15, pomoEvery: 2 });
const running = (over) => ({ ...initialPomo(25), running: true, endAt: 1000, ...over });

test('nothing ends before endAt, and time left comes from the clock', () => {
  assert.equal(advance(running(), cfg, 999), null);
  assert.equal(advance({ ...initialPomo(), running: false }, cfg, 5000), null);
  assert.equal(leftSec(running({ endAt: 61000 }), 1000), 60);
});

test('a late check still ends the period (throttled background tab)', () => {
  const r = advance(running(), cfg, 1000 + 7 * 6e4);
  assert.equal(r.done, 'work');
  assert.equal(r.next.phase, 'short');
  assert.equal(r.next.running, false);
  assert.equal(r.next.left, 5 * 60);
  assert.equal(r.next.cycles, 1);
});

test('every Nth work period is followed by a long break, then the count restarts', () => {
  let r = advance(running({ cycles: 1 }), cfg, 2000);
  assert.equal(r.next.phase, 'long');
  r = advance({ ...r.next, running: true, endAt: 3000 }, cfg, 3000);
  assert.equal(r.done, 'long');
  assert.equal(r.next.phase, 'work');
  assert.equal(r.next.cycles, 0);
});

test('auto mode starts the next period right away', () => {
  const r = advance(running(), { ...cfg, auto: true }, 1000);
  assert.equal(r.next.running, true);
  assert.equal(r.next.endAt, 1000 + 5 * 6e4);
});
