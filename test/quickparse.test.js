import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuick } from '../src/quickparse.js';

// Monday 26 Oct 2026, 13:00
const now = new Date(2026, 9, 26, 13, 0);
const projects = [{ id: 'w', name: 'Работа' }, { id: 'h', name: 'Дом и семья' }, { id: 'f', name: 'Финансы' }];
const tags = [{ id: 't1', name: 'звонки' }];
const q = (s) => parseQuick(s, { projects, tags, now });

test('deadline, duration, project, priority', () => {
  const r = q('Отчёт по проекту Х до пятницы 2ч #работа !3');
  assert.equal(r.title, 'Отчёт по проекту Х');
  assert.equal(r.deadline, '2026-10-30');
  assert.equal(r.date, null);
  assert.equal(r.duration, 120);
  assert.equal(r.projectId, 'w');
  assert.equal(r.priority, 3);
});

test('day and time', () => {
  assert.deepEqual(pick(q('позвонить маме завтра в 19')), { title: 'позвонить маме', date: '2026-10-27', time: '19:00' });
  assert.deepEqual(pick(q('созвон в среду в 11:30')), { title: 'созвон', date: '2026-10-28', time: '11:30' });
  assert.deepEqual(pick(q('ужин в 7 вечера')), { title: 'ужин', date: '2026-10-26', time: '19:00' });
  assert.deepEqual(pick(q('зарядка в 9 утра')), { title: 'зарядка', date: '2026-10-27', time: '09:00' }); // 9:00 already passed today
});
const pick = (r) => ({ title: r.title, date: r.date, time: r.time });

test('calendar dates and relative dates', () => {
  assert.equal(q('оплатить налог 1 декабря').date, '2026-12-01');
  assert.equal(q('оплатить налог до 15.11').deadline, '2026-11-15');
  assert.equal(q('продлить страховку 10 марта').date, '2027-03-10');
  assert.equal(q('проверить через 3 дня').date, '2026-10-29');
  assert.equal(q('ревизия через неделю').date, '2026-11-02');
  assert.equal(q('поездка на выходных').date, '2026-10-31');
  assert.equal(q('план на следующей неделе').date, '2026-11-02');
  assert.equal(q('отчёт к концу месяца').deadline, '2026-10-31');
});

test('durations in different forms', () => {
  assert.equal(q('читать 30 мин').duration, 30);
  assert.equal(q('ремонт 1,5 часа').duration, 90);
  assert.equal(q('ремонт 1ч 30м').duration, 90);
  assert.equal(q('пробежка полчаса').duration, 30);
});

test('tags, partial project names, unknown tags', () => {
  const r = q('обзвон #звонки #дом #новое');
  assert.deepEqual(r.tags, ['t1']);
  assert.equal(r.projectId, 'h');
  assert.deepEqual(r.newTags, ['новое']);
  assert.equal(r.title, 'обзвон');
});

test('plain text stays untouched', () => {
  const r = q('Купить краску для веранды');
  assert.equal(r.title, 'Купить краску для веранды');
  assert.equal(r.date, null);
  assert.equal(r.time, null);
  assert.equal(r.priority, 0);
});
