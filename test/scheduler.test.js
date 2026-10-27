import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestSlots, slotLabel } from '../src/scheduler.js';

const now = new Date(2026, 9, 26, 13, 0); // Monday 13:00
const ms = (y, mo, d, h, mi = 0) => new Date(y, mo, d, h, mi).getTime();
const projects = [{ id: 'w', name: 'Работа' }];
const opts = (extra = {}) => ({ projects, now, ...extra });
const short = (r) => r.map((x) => `${x.date} ${x.time}`);

test('personal task goes to the evening windows, one option per window', () => {
  const r = suggestSlots({ id: 'a', title: 'Йога', duration: 60 }, opts());
  assert.deepEqual(short(r), ['2026-10-26 18:00', '2026-10-27 09:00', '2026-10-27 18:00']);
});

test('work task goes into 10–18 on weekdays, after now', () => {
  const r = suggestSlots({ id: 'a', projectId: 'w', duration: 120 }, opts());
  assert.deepEqual(short(r), ['2026-10-26 13:15', '2026-10-27 10:00', '2026-10-28 10:00']);
});

test('busy events and placed tasks are avoided', () => {
  const events = [{ start: ms(2026, 9, 26, 18), end: ms(2026, 9, 26, 18, 45), busy: true }];
  const tasks = [{ id: 'x', date: '2026-10-26', time: '19:00', duration: 30 }];
  const r = suggestSlots({ id: 'a', duration: 30 }, opts({ events, tasks }));
  assert.equal(short(r)[0], '2026-10-26 19:30');
});

test('all-day and free events do not block', () => {
  const events = [
    { start: ms(2026, 9, 26, 0), end: ms(2026, 9, 27, 0), allDay: true },
    { start: ms(2026, 9, 26, 18), end: ms(2026, 9, 26, 20), busy: false },
  ];
  assert.equal(short(suggestSlots({ id: 'a', duration: 60 }, opts({ events })))[0], '2026-10-26 18:00');
});

test('weekly review on Friday 17:00 stays free', () => {
  const fri = new Date(2026, 9, 30, 16, 30);
  const r = suggestSlots({ id: 'a', projectId: 'w', duration: 60 }, { projects, now: fri, count: 1 });
  assert.deepEqual(short(r), ['2026-11-02 10:00']); // 16:45–17:45 would hit the review, 17:30–18:30 runs past 18:00
});

test('options after the deadline are marked late', () => {
  const tasks = [{ id: 'x', date: '2026-10-26', time: '18:00', duration: 120 }];
  const r = suggestSlots({ id: 'a', duration: 60, deadline: '2026-10-26' }, opts({ tasks }));
  assert.equal(r[0].late, true);
});

test('weekends use the weekend window', () => {
  const sat = new Date(2026, 9, 31, 8, 0);
  assert.equal(short(suggestSlots({ id: 'a', duration: 180 }, { now: sat, count: 1 }))[0], '2026-10-31 10:00');
});

test('labels', () => {
  assert.equal(slotLabel({ date: '2026-10-26', time: '18:00', duration: 60 }, now), 'Сегодня 18:00–19:00');
  assert.equal(slotLabel({ date: '2026-10-29', time: '09:00', duration: 30 }, now), 'Чт, 29 окт 09:00–09:30');
});

test('repeat dates', async () => {
  const { nextRepeat } = await import('../src/date.js');
  assert.equal(nextRepeat('2026-11-30', 'monthly'), '2026-12-31');
  assert.equal(nextRepeat('2027-01-31', 'monthly'), '2027-02-28');
  assert.equal(nextRepeat('2026-11-05', 'monthly'), '2026-12-05');
  assert.equal(nextRepeat('2026-10-30', 'weekdays'), '2026-11-02');
  assert.equal(nextRepeat('2026-10-30', 'weekly'), '2026-11-06');
});

test('goal plan ids are unique and sections exist', async () => {
  const { goalsPlan } = await import('../src/goalsplan.js');
  const p = goalsPlan();
  const ids = [...p.projects, ...p.tasks, ...p.habits].map((x) => x.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const t of p.tasks) {
    const pr = p.projects.find((x) => x.id === t.projectId);
    assert.ok(pr);
    if (t.sectionId) assert.ok(pr.sections.some((s) => s.id === t.sectionId));
  }
});

test('a batch places tasks one after another without clashes', async () => {
  const { planBatch } = await import('../src/scheduler.js');
  const list = [
    { id: 'a', title: 'A', duration: 60, priority: 1 },
    { id: 'b', title: 'B', duration: 60, priority: 3 },
    { id: 'c', title: 'C', duration: 120 },
  ];
  const r = planBatch(list, { now, day: '2026-10-26' });
  assert.deepEqual(
    r.map((x) => [x.task.id, x.slot && x.slot.time]),
    [['b', '18:00'], ['a', '19:00'], ['c', null]]
  );
});

test('planBatch with spill moves what does not fit today to the next free slots', async () => {
  const { planBatch } = await import('../src/scheduler.js');
  const list = [
    { id: 'a', title: 'A', duration: 60, priority: 1 },
    { id: 'b', title: 'B', duration: 60, priority: 3 },
    { id: 'c', title: 'C', duration: 120 },
  ];
  const r = planBatch(list, { now, day: '2026-10-26', spill: true });
  assert.deepEqual(
    r.map((x) => [x.task.id, x.slot && x.slot.date, x.slot && x.slot.time]),
    [['b', '2026-10-26', '18:00'], ['a', '2026-10-26', '19:00'], ['c', '2026-10-27', '18:00']]
  );
});
