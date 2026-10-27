import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/store.js';
import { TelegramBot } from '../server/telegram.js';
import { todayKey } from '../src/date.js';

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

test('a text message becomes a task; a deadline brings slot buttons', async () => {
  const { store, bot } = await bound();
  const [a] = await bot.handle(msg('купить краску завтра в 19'));
  const t = store.data.tasks.find((x) => x.title === 'купить краску');
  assert.equal(t.time, '19:00');
  assert.match(a.params.text, /купить краску/);
  const [b] = await bot.handle(msg('отчёт до пятницы 2ч #работа'));
  const r = store.data.tasks.find((x) => x.title === 'отчёт');
  assert.equal(r.projectId, 'w');
  const keys = b.params.reply_markup.inline_keyboard;
  assert.ok(keys.length >= 2);
  const pick = keys[0][0].callback_data;
  assert.match(pick, /^s\|/);
  const out = await bot.handle(cb(pick));
  assert.equal(out[1].method, 'editMessageText');
  const placed = store.data.tasks.find((x) => x.id === r.id);
  assert.ok(placed.time);
  assert.equal(placed.duration, 120);
  assert.ok(placed.updatedAt > 0);
});

test('cancel puts the task in the trash', async () => {
  const { store, bot } = await bound();
  await bot.handle(msg('ерунда'));
  const t = store.data.tasks[0];
  await bot.handle(cb('d|' + t.id));
  assert.equal(store.data.tasks[0].deleted, true);
});

test('voice goes through speech recognition', async () => {
  const { store, bot } = await bound({ stt: async (buf, fmt) => (fmt === 'oggopus' && buf.length ? 'позвонить маме завтра в 19' : '') });
  const r = await bot.handle({ message: { chat: { id: CHAT }, voice: { file_id: 'x' } } }, Buffer.from('ogg').toString('base64'));
  assert.match(r[0].params.text, /позвонить маме/);
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

test('«Своё время»: the next message sets the time of that task', async () => {
  const { store, bot } = await bound();
  const [b] = await bot.handle(msg('отчёт до пятницы 2ч'));
  const t = store.data.tasks.find((x) => x.title === 'отчёт');
  const own = b.params.reply_markup.inline_keyboard.flat().find((k) => k.text.includes('Своё время'));
  assert.equal(own.callback_data, 'c|' + t.id);
  await bot.handle(cb(own.callback_data));
  const out = await bot.handle(msg('завтра в 11 30'));
  assert.equal(store.data.tasks.length, 1);
  assert.equal(t.id, store.data.tasks[0].id);
  assert.equal(store.data.tasks[0].time, '11:30');
  assert.equal(store.data.tasks[0].duration, 120);
  assert.equal(out[0].method, 'editMessageText');
  // the message after that is a new task again
  await bot.handle(msg('купить хлеб'));
  assert.equal(store.data.tasks.length, 2);
});
