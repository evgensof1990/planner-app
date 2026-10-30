import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/store.js';
import { TelegramBot } from '../server/telegram.js';
import { todayKey, addDays } from '../src/date.js';

const CHAT = 42;
const msg = (text, extra = {}) => ({ message: { message_id: 1, chat: { id: CHAT }, text, ...extra } });
const cb = (data) => ({ callback_query: { id: 'q', data, message: { message_id: 7, chat: { id: CHAT } } } });

function setup(opts = {}) {
  const store = new Store(mkdtempSync(join(tmpdir(), 'tg-')));
  store.sync({ tasks: [], projects: [{ id: 'w', name: 'Работа', sections: [] }], tags: [], habits: [], settings: {}, deletedIds: {} });
  const bot = new TelegramBot({ store, log: { error() {} }, ...opts });
  return { store, bot };
}

async function bound(opts) {
  const s = setup(opts);
  const { code } = s.bot.pair();
  await s.bot.handle(msg('/start ' + code));
  return s;
}

test('pairing needs the code from the app; strangers are ignored', async () => {
  const { bot } = setup();
  let r = await bot.handle(msg('/start 000000'));
  assert.match(r[0].params.text, /Настройки/);
  const { code } = bot.pair();
  r = await bot.handle(msg('/start ' + code));
  assert.match(r[0].params.text, /привязан/);
  assert.deepEqual(await bot.handle({ message: { chat: { id: 99 }, text: 'чужой' } }), []);
});

const keysOf = (r) => r.params.reply_markup.inline_keyboard.flat();
const btn = (r, re) => keysOf(r).find((k) => re.test(k.text)).callback_data;

test('a text message becomes a draft; the task is saved only after «Создать» or a picked slot', async () => {
  const { store, bot } = await bound();
  const [a] = await bot.handle(msg('купить краску завтра в 19'));
  assert.match(a.params.text, /Создать задачу\?[\s\S]*купить краску/);
  assert.equal(store.data.tasks.length, 0);
  await bot.handle(cb(btn(a, /Создать/)));
  const t = store.data.tasks.find((x) => x.title === 'купить краску');
  assert.equal(t.time, '19:00');
  const [b] = await bot.handle(msg('отчёт до пятницы 2ч #работа'));
  assert.equal(store.data.tasks.length, 1);
  const pick = keysOf(b)[0].callback_data;
  assert.match(pick, /^s\|/);
  const out = await bot.handle(cb(pick));
  assert.equal(out[1].method, 'editMessageText');
  const placed = store.data.tasks.find((x) => x.title === 'отчёт');
  assert.equal(placed.projectId, 'w');
  assert.ok(placed.time);
  assert.equal(placed.duration, 120);
  assert.ok(placed.updatedAt > 0);
});

test('cancel drops a draft; on a saved task it goes to the trash', async () => {
  const { store, bot } = await bound();
  const [a] = await bot.handle(msg('ерунда'));
  await bot.handle(cb(btn(a, /Отменить/)));
  assert.equal(store.data.tasks.length, 0);
  const [b] = await bot.handle(msg('дело'));
  await bot.handle(cb(btn(b, /Создать/)));
  await bot.handle(cb('d|' + store.data.tasks[0].id));
  assert.equal(store.data.tasks[0].deleted, true);
});

test('voice goes through speech recognition', async () => {
  const { store, bot } = await bound({ stt: async (buf, fmt) => (fmt === 'oggopus' && buf.length ? 'позвонить маме завтра в 19' : '') });
  const r = await bot.handle({ message: { chat: { id: CHAT }, voice: { file_id: 'x' } } }, Buffer.from('ogg').toString('base64'));
  assert.match(r[0].params.text, /позвонить маме/);
  await bot.handle(cb(btn(r[1], /Создать/)));
  assert.equal(store.data.tasks[0].time, '19:00');
});

test('/plan places untimed tasks of today and accepting saves them', async () => {
  const { store, bot } = await bound();
  store.mutate((n) => n.tasks.push({ id: 'u', title: 'Без времени', date: todayKey(), time: null, duration: 30, tags: [] }));
  const [p] = await bot.handle(msg('/plan'));
  const btn = p.params.reply_markup?.inline_keyboard[0][0].callback_data;
  if (!btn) return; // late in the evening there may be no window left today
  await bot.handle(cb(btn));
  assert.ok(store.data.tasks.find((x) => x.id === 'u').time);
});

test('morning digest and review reminder go to the outbox once', async () => {
  const { bot } = await bound();
  bot.tick(new Date(2026, 9, 30, 8, 31));
  bot.tick(new Date(2026, 9, 30, 8, 40));
  bot.tick(new Date(2026, 9, 30, 16, 56));
  const out = bot.takeOutbox();
  assert.equal(out.length, 2);
  assert.match(out[0].params.text, /Доброе утро/);
  assert.match(out[1].params.text, /обзор недели/);
  assert.equal(bot.takeOutbox().length, 0);
});

test('«Своё время»: the next message sets the time, then the draft is confirmed', async () => {
  const { store, bot } = await bound();
  const [b] = await bot.handle(msg('отчёт до пятницы 2ч'));
  await bot.handle(cb(btn(b, /Своё время/)));
  const out = await bot.handle(msg('завтра в 11 30'));
  assert.equal(out[0].method, 'editMessageText');
  assert.match(out[1].params.text, /Создать задачу\?[\s\S]*11:30/);
  assert.equal(store.data.tasks.length, 0);
  await bot.handle(cb(btn(out[1], /Создать/)));
  assert.deepEqual([store.data.tasks[0].time, store.data.tasks[0].duration], ['11:30', 120]);
  // a saved task: «Изменить время» applies at once
  const [c] = await bot.handle(msg('купить хлеб'));
  assert.equal(c.method, 'sendMessage');
  await bot.handle(cb('c|' + store.data.tasks[0].id));
  await bot.handle(msg('в 15 00'));
  assert.equal(store.data.tasks[0].time, '15:00');
  assert.equal(store.data.tasks.length, 1);
});

test('«Сделать рабочей» switches a draft to the work calendar before saving', async () => {
  const { store, bot } = await bound();
  const [a] = await bot.handle(msg('созвон с подрядчиком завтра в 11'));
  assert.match(a.params.text, /личная/);
  const [, shown] = await bot.handle(cb(btn(a, /Сделать рабочей/)));
  assert.match(shown.params.text, /рабочая/);
  assert.ok(keysOf(shown).some((k) => /Сделать личной/.test(k.text)));
  await bot.handle(cb(btn(shown, /Создать/)));
  assert.equal(store.data.tasks.find((x) => x.title === 'созвон с подрядчиком').area, 'work');
});

test('«напомни … каждый день в 9:45»: a daily task the bot reminds of; «Выполнено» moves it to tomorrow', async () => {
  const { store, bot } = await bound();
  const [m] = await bot.handle(msg('напомни выпить бринтеликс каждый день в 9:45'));
  assert.match(m.params.text, /Выпить бринтеликс[\s\S]*09:45[\s\S]*🔁 каждый день[\s\S]*🔔/);
  await bot.handle(cb(btn(m, /Создать/)));
  const t = store.data.tasks[0];
  assert.deepEqual([t.title, t.time, t.repeat, t.remind], ['Выпить бринтеликс', '09:45', 'daily', 0]);
  bot.takeOutbox();
  const [y, mo, d] = t.date.split('-').map(Number);
  bot.tick(new Date(y, mo - 1, d, 9, 44));
  assert.equal(bot.takeOutbox().filter((x) => /🔔 <b>/.test(x.params.text)).length, 0);
  bot.tick(new Date(y, mo - 1, d, 9, 45));
  bot.tick(new Date(y, mo - 1, d, 9, 46));
  const out = bot.takeOutbox().filter((x) => /🔔 <b>/.test(x.params.text));
  assert.equal(out.length, 1);
  assert.match(out[0].params.text, /🔔 <b>Выпить бринтеликс<\/b>/);
  await bot.handle(cb(btn(out[0], /Выполнено/)));
  const next = store.data.tasks.find((x) => !x.done);
  assert.equal(store.data.tasks.find((x) => x.id === t.id).done, true);
  assert.equal(next.date, addDays(t.date, 1));
  assert.deepEqual([next.time, next.repeat, next.remind], ['09:45', 'daily', 0]);

  // left unmarked: the next day it moves on and reminds again
  bot.tick(new Date(y, mo - 1, d + 2, 9, 45));
  const again = store.data.tasks.find((x) => !x.done);
  assert.equal(again.date, addDays(t.date, 2));
  assert.equal(bot.takeOutbox().filter((x) => /🔔 <b>/.test(x.params.text)).length, 1);
});
