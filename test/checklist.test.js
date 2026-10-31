import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseItems, progress, checklistText } from '../src/checklist.js';
import { taskIcs } from '../server/calsync.js';

test('a pasted recipe becomes one item per line', () => {
  const items = parseItems('Ингредиенты:\n- Капуста\n• Красный лук\n1) Морковка\n\n—\n[x] Соль\n☑ Сахар');
  assert.deepEqual(
    items.map((i) => [i.title, i.done]),
    [
      ['Капуста', false],
      ['Красный лук', false],
      ['Морковка', false],
      ['Соль', true],
      ['Сахар', true],
    ]
  );
});

test('progress and text', () => {
  const task = { checklist: [{ id: 'a', title: 'Огурцы', done: true }, { id: 'b', title: 'Халапеньо', done: false }] };
  assert.deepEqual(progress(task), { done: 1, total: 2 });
  assert.deepEqual(progress({}), { done: 0, total: 0 });
  assert.equal(checklistText(task), '☑ Огурцы\n☐ Халапеньо');
});

test('the checklist goes to the calendar description', () => {
  const ics = taskIcs({ id: 't1', title: 'Купить продукты', notes: 'Магнит', date: '2026-10-31', time: '18:00', checklist: [{ id: 'a', title: 'Огурцы', done: false }] });
  assert.match(ics, /DESCRIPTION:Магнит\\n\\n☐ Огурцы/);
});
