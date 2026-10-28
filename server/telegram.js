// Telegram bot logic. The VM cannot reach Telegram, so a Cloudflare Worker (deploy/telegram-worker.js)
// sits in between: it forwards updates here and executes the Bot API calls we return, and every
// minute it collects proactive messages (morning plan, review reminder) from the outbox.
// Nothing here talks to Telegram directly.
import { randomInt } from 'node:crypto';
import { parseQuick } from '../src/quickparse.js';
import { suggestSlots, slotLabel, planBatch, areaOf, DEFAULT_DURATION } from '../src/scheduler.js';
import { addDays, keyOf, parseKey, todayKey, relLabel, WD } from '../src/date.js';

const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const dur = (m) => (m < 60 ? `${m} мин` : `${Math.floor(m / 60)} ч${m % 60 ? ` ${m % 60} мин` : ''}`);
const alive = (t) => !t.deleted && !t.archived;

export const APP_URL = 'https://app.myrenthub.ru/';

const HELP = [
  'Пишите задачи как обычно, я разберу дату, время, длительность и проект:',
  '• <i>купить краску завтра в 19</i>',
  '• <i>отчёт до пятницы 2ч #работа !3</i>',
  '• <i>позвонить в БТИ 30м</i> — предложу время',
  'Можно голосом.',
  '',
  '/today — план на сегодня',
  '/week — неделя',
  '/plan — разложить задачи без времени на сегодня',
].join('\n');

export class TelegramBot {
  constructor({ store, calsync = null, stt = null, digestTime = '08:30', log = console }) {
    this.store = store;
    this.calsync = calsync;
    this.stt = stt;
    this.digestTime = digestTime;
    this.log = log;
  }

  get tg() {
    const st = this.store.state;
    st.tg ||= { chat: null, pair: null, outbox: [], sent: {}, seenAt: 0 };
    return st.tg;
  }

  save() {
    this.store.saveState();
  }

  status() {
    return { bound: !!this.tg.chat, relaySeenAt: this.tg.seenAt || null, voice: !!this.stt };
  }

  // A short code the user sends as "/start CODE" to bind their chat
  pair() {
    const code = String(randomInt(100000, 999999));
    this.tg.pair = { code, until: Date.now() + 15 * 6e4 };
    this.save();
    return { code, until: this.tg.pair.until };
  }

  events(from, to) {
    return this.calsync ? this.calsync.events(from, to).filter((e) => !e.own) : [];
  }

  slotsFor(task, count = 3) {
    const d = this.store.data;
    return suggestSlots(task, { tasks: d.tasks.filter(alive), projects: d.projects, events: this.events(Date.now() - 864e5, Date.now() + 25 * 864e5), rules: d.settings.planRules, count });
  }

  task(id) {
    return this.tg.drafts?.[id]?.task || this.store.data.tasks.find((t) => t.id === id);
  }

  // ---------- incoming ----------
  async handle(update, voice) {
    this.tg.seenAt = Date.now();
    try {
      if (update.callback_query) return this.onCallback(update.callback_query);
      const msg = update.message;
      if (!msg) return [];
      const chat = msg.chat.id;
      const text = (msg.text || '').trim();
      if (!this.tg.chat || (this.tg.pair && /^\/start\s+\d{6}$/.test(text))) return this.onUnbound(chat, text);
      if (chat !== this.tg.chat) return [];
      if (msg.voice || msg.audio) return await this.onVoice(chat, voice);
      if (!text) return [this.say(chat, 'Пришлите задачу текстом или голосом.')];
      const cmd = text.match(/^\/(\w+)/)?.[1];
      if (cmd) this.tg.await = null;
      if (cmd === 'start' || cmd === 'help') return [this.say(chat, HELP)];
      if (cmd === 'today') return [this.say(chat, this.dayText(todayKey()))];
      if (cmd === 'week') return [this.say(chat, this.weekText())];
      if (cmd === 'plan') return [this.planOffer(chat)];
      return this.fromText(chat, text);
    } finally {
      this.save();
    }
  }

  onUnbound(chat, text) {
    const code = text.match(/^\/start\s+(\d{6})$/)?.[1];
    const p = this.tg.pair;
    if (code && p && p.code === code && Date.now() < p.until) {
      this.tg.chat = chat;
      this.tg.pair = null;
      return [this.say(chat, '✅ Бот привязан к вашему планнеру.\n\n' + HELP)];
    }
    return [this.say(chat, 'Чтобы привязать бота, откройте в приложении «Настройки → Синхронизация → Telegram» и отправьте сюда код: /start 123456')];
  }

  async onVoice(chat, voice) {
    if (!this.stt) return [this.say(chat, 'Распознавание голоса не настроено на сервере. Пока пишите текстом.')];
    if (!voice) return [this.say(chat, 'Не получилось скачать голосовое. Слишком длинное? До 30 секунд.')];
    let text;
    try {
      text = (await this.stt(Buffer.from(voice, 'base64'), 'oggopus')).trim();
    } catch (e) {
      this.log.error?.('stt', e.message);
      return [this.say(chat, 'Не удалось распознать голос: ' + e.message)];
    }
    if (!text) return [this.say(chat, 'Ничего не расслышал, попробуйте ещё раз.')];
    return [this.say(chat, `🎙 «${esc(text)}»`), ...this.fromText(chat, text)];
  }

  // After «Своё время» the next message is the time for that task, not a new task
  fromText(chat, text) {
    const w = this.tg.await;
    this.tg.await = null;
    const t = w && Date.now() < w.until && this.task(w.id);
    if (!t || !alive(t)) return [this.addFromText(chat, text)];
    const q = parseQuick(text, { projects: this.store.data.projects, tags: [] });
    if (!q.date && !q.time) {
      this.tg.await = w;
      return [this.say(chat, 'Не понял время. Напишите, например, <i>в 11:30</i> или <i>завтра в 15</i>. /today — выйти.')];
    }
    const patch = { date: q.date, time: q.time, ...(q.duration ? { duration: q.duration } : {}) };
    if (this.drafts[t.id]) {
      // still a draft: show it again with the new time and let the user confirm
      Object.assign(t, patch);
      return [this.edit(chat, w.mid, `<b>${esc(t.title)}</b>\n${this.meta(t)}`), this.confirm(chat, t)];
    }
    this.store.mutate((n) => Object.assign(n.tasks.find((x) => x.id === t.id), patch));
    const done = `✅ <b>${esc(t.title)}</b>\n${this.meta(this.task(t.id))}`;
    return [this.edit(chat, w.mid, done), this.say(chat, done, [[{ text: '✏️ Изменить время', callback_data: `c|${t.id}` }]])];
  }

  // A new task stays a draft until the user confirms it or picks a time
  get drafts() {
    const tg = this.tg;
    tg.drafts ||= {};
    for (const [id, x] of Object.entries(tg.drafts)) if (Date.now() - x.at > 3 * 864e5) delete tg.drafts[id];
    return tg.drafts;
  }

  addFromText(chat, text) {
    const d = this.store.data;
    const q = parseQuick(text, { projects: d.projects, tags: d.tags });
    const t = {
      id: uid(),
      title: q.title || text,
      notes: '',
      done: false,
      doneAt: null,
      // without a date it goes to today, so it shows in «Сегодня» and the calendar instead of getting lost
      date: q.date || todayKey(),
      time: q.time,
      deadline: q.deadline,
      duration: q.duration,
      remind: null,
      priority: q.priority,
      projectId: q.projectId,
      sectionId: null,
      tags: [...q.tags],
      parentId: null,
      deleted: false,
      createdAt: Date.now(),
      order: Date.now(),
    };
    this.drafts[t.id] = { task: t, newTags: q.newTags, at: Date.now() };
    if (!t.time && (t.duration || t.deadline)) return this.slotOffer(chat, t, `<b>${esc(t.title)}</b>\n${this.meta(t)}\n\nКогда сделать?`);
    return this.confirm(chat, t);
  }

  // switches a draft between the personal and the work calendar
  areaKey(t) {
    return { text: areaOf(t, this.store.data.projects) === 'work' ? '🏠 Сделать личной' : '💼 Сделать рабочей', callback_data: `a|${t.id}` };
  }

  confirm(chat, t, messageId) {
    const keys = [
      [{ text: '✅ Создать', callback_data: `ok|${t.id}` }, this.areaKey(t)],
      t.time ? [{ text: '✏️ Другое время', callback_data: `c|${t.id}` }] : [{ text: '🕒 Подобрать время', callback_data: `p|${t.id}` }, { text: '✏️ Своё время', callback_data: `c|${t.id}` }],
      [{ text: '↩️ Отменить', callback_data: `d|${t.id}` }],
    ];
    const text = `Создать задачу?\n<b>${esc(t.title)}</b>\n${this.meta(t)}`;
    return messageId ? this.edit(chat, messageId, text, keys) : this.say(chat, text, keys);
  }

  // Saves a draft (with the patch) to the planner, or updates an existing task
  commit(id, patch = {}) {
    const dr = this.drafts[id];
    this.store.mutate((n) => {
      if (!dr) return Object.assign(n.tasks.find((x) => x.id === id), patch);
      const t = Object.assign(dr.task, patch, { createdAt: Date.now() });
      for (const name of dr.newTags) {
        const tg = n.tags.find((x) => x.name === name) || { id: uid(), name };
        if (!n.tags.includes(tg)) n.tags.push(tg);
        t.tags.push(tg.id);
      }
      n.tasks.push(t);
    });
    delete this.drafts[id];
    return this.task(id);
  }

  meta(t) {
    const d = this.store.data;
    const p = d.projects.find((x) => x.id === t.projectId);
    const parts = [];
    if (t.date) parts.push(`📅 ${relLabel(t.date)}${t.time ? ' ' + t.time : ', без времени'}`);
    else parts.push('📥 без даты');
    if (t.duration) parts.push(`⏱ ${dur(t.duration)}`);
    if (t.deadline) parts.push(`⏰ до ${relLabel(t.deadline).toLowerCase()}`);
    if (p) parts.push(`${p.emoji || '📁'} ${esc(p.name)}`);
    parts.push(areaOf(t, d.projects) === 'work' ? '💼 рабочая' : '🏠 личная');
    if (t.priority) parts.push('🚩'.repeat(t.priority));
    return parts.join(' · ');
  }

  slotOffer(chat, t, text, messageId) {
    const slots = this.slotsFor(t);
    const keys = slots.map((s) => [{ text: (s.late ? '⚠️ ' : '') + slotLabel(s), callback_data: `s|${t.id}|${s.date}|${s.time}|${s.duration}` }]);
    keys.push([{ text: '✏️ Своё время', callback_data: `c|${t.id}` }, { text: 'Без времени', callback_data: `n|${t.id}` }]);
    keys.push(this.drafts[t.id] ? [this.areaKey(t), { text: '↩️ Отменить', callback_data: `d|${t.id}` }] : [{ text: '↩️ Отменить', callback_data: `d|${t.id}` }]);
    const body = slots.length ? text : text + '\n\nСвободных окон в ближайшие три недели нет.';
    return messageId ? this.edit(chat, messageId, body, keys) : this.say(chat, body, keys);
  }

  onCallback(cb) {
    const chat = cb.message?.chat.id;
    const mid = cb.message?.message_id;
    const ack = (text) => ({ method: 'answerCallbackQuery', params: { callback_query_id: cb.id, ...(text ? { text } : {}) } });
    if (!this.tg.chat || chat !== this.tg.chat) return [ack()];
    const [kind, id, ...rest] = (cb.data || '').split('|');
    if (kind === 'pa') return this.acceptPlan(chat, mid, id, ack);
    const t = id && this.task(id);
    if (!t) return [ack('Задача не найдена'), this.edit(chat, mid, 'Задача уже удалена')];
    if (kind === 's') {
      const [date, time, duration] = rest;
      const s = { date, time, duration: +duration };
      this.commit(id, s);
      return [ack('Запланировано'), this.edit(chat, mid, `✅ <b>${esc(t.title)}</b>\n🕒 ${slotLabel(s)}`)];
    }
    if (kind === 'c') {
      this.tg.await = { id, mid, until: Date.now() + 15 * 6e4 };
      const hint = 'Напишите или скажите, когда: <i>в 11:30</i>, <i>завтра в 15</i>, <i>в пятницу в 9 утра</i>, <i>28.10 в 18:00 на 45 минут</i>';
      return [ack(), this.edit(chat, mid, `<b>${esc(t.title)}</b>\n${hint}`, [[{ text: '🕒 Подобрать время', callback_data: `p|${id}` }, { text: 'Без времени', callback_data: `n|${id}` }], [{ text: '↩️ Отменить', callback_data: `d|${id}` }]])];
    }
    if (kind === 'a') {
      const dr = this.drafts[id];
      const area = areaOf(t, this.store.data.projects) === 'work' ? 'personal' : 'work';
      if (!dr) {
        this.store.mutate((n) => (n.tasks.find((x) => x.id === id).area = area));
        return [ack(area === 'work' ? 'Теперь рабочая' : 'Теперь личная'), this.edit(chat, mid, `✅ <b>${esc(t.title)}</b>\n${this.meta(this.task(id))}`)];
      }
      dr.task.area = area;
      // windows differ for work and personal tasks, so slots are offered again
      const reshow = !dr.task.time && (dr.task.duration || dr.task.deadline) ? this.slotOffer(chat, dr.task, `<b>${esc(dr.task.title)}</b>\n${this.meta(dr.task)}\n\nКогда сделать?`, mid) : this.confirm(chat, dr.task, mid);
      return [ack(area === 'work' ? 'Рабочая' : 'Личная'), reshow];
    }
    if (kind === 'n' || kind === 'p') this.tg.await = null;
    if (kind === 'n' || kind === 'ok') {
      const fresh = !!this.drafts[id];
      const saved = this.commit(id, kind === 'n' ? { time: null } : {});
      return [ack(fresh ? 'Создано' : 'Готово'), this.edit(chat, mid, `✅ <b>${esc(saved.title)}</b>\n${this.meta(saved)}`)];
    }
    if (kind === 'p') return [ack(), this.slotOffer(chat, t, `<b>${esc(t.title)}</b>\nКогда сделать?`, mid)];
    if (kind === 'd') {
      if (this.drafts[id]) delete this.drafts[id];
      else this.store.mutate((n) => (n.tasks.find((x) => x.id === id).deleted = true));
      return [ack('Удалено'), this.edit(chat, mid, `<s>${esc(t.title)}</s> — отменено`)];
    }
    return [ack()];
  }

  // ---------- day plan ----------
  dayItems(day) {
    const d = this.store.data;
    const [y, m, dd] = day.split('-').map(Number);
    const from = new Date(y, m - 1, dd).getTime();
    const items = d.tasks.filter((t) => alive(t) && !t.done && !t.parentId && t.date === day && t.time).map((t) => ({ time: t.time, text: esc(t.title), dur: t.duration || DEFAULT_DURATION, task: true }));
    for (const e of this.events(from, from + 864e5)) {
      if (e.allDay) continue;
      const s = new Date(e.start);
      items.push({ time: `${String(s.getHours()).padStart(2, '0')}:${String(s.getMinutes()).padStart(2, '0')}`, text: `<i>${esc(e.title)}</i>`, dur: Math.round((e.end - e.start) / 6e4) });
    }
    return items.sort((a, b) => a.time.localeCompare(b.time));
  }

  untimed(day) {
    return this.store.data.tasks.filter((t) => alive(t) && !t.done && !t.parentId && t.date && t.date <= day && !t.time);
  }

  dayText(day, greeting = '') {
    const items = this.dayItems(day);
    const loose = this.untimed(day);
    const lines = [greeting || `<b>${relLabel(day)}, ${WD[parseKey(day).getDay()]}</b>`];
    if (!items.length && !loose.length) lines.push('Свободный день 🌿');
    for (const i of items) lines.push(`${i.task ? '▫️' : '▪️'} ${i.time} ${i.text}`);
    if (loose.length) {
      lines.push('', `Без времени (${loose.length}):`);
      loose.slice(0, 10).forEach((t) => lines.push(`• ${esc(t.title)}${t.date < day ? ' <i>(просрочено)</i>' : ''}`));
      lines.push('', '/plan — разложить их по свободным окнам');
    }
    return lines.join('\n');
  }

  weekText() {
    const t = todayKey();
    const out = [];
    for (let i = 0; i < 7; i++) {
      const day = addDays(t, i);
      const tasks = this.store.data.tasks.filter((x) => alive(x) && !x.done && !x.parentId && x.date === day).sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
      if (!tasks.length) continue;
      out.push(`<b>${relLabel(day)}, ${WD[parseKey(day).getDay()]}</b>`);
      tasks.forEach((x) => out.push(`• ${x.time ? x.time + ' ' : ''}${esc(x.title)}`));
      out.push('');
    }
    return out.join('\n').trim() || 'На неделю задач с датой нет.';
  }

  planOffer(chat) {
    const day = todayKey();
    const d = this.store.data;
    const loose = this.untimed(day);
    if (!loose.length) return this.say(chat, 'На сегодня всё уже по времени 👌');
    // what does not fit today goes to the next free windows
    const plan = planBatch(loose, { day, spill: true, tasks: d.tasks.filter(alive), projects: d.projects, events: this.events(Date.now() - 864e5, Date.now() + 22 * 864e5), rules: d.settings.planRules });
    const key = uid();
    this.tg.plans = { [key]: plan.filter((p) => p.slot).map((p) => [p.task.id, p.slot.date, p.slot.time, p.slot.duration]) };
    const lines = ['<b>Предлагаю:</b>'];
    for (const p of plan) lines.push(p.slot ? `🕒 ${p.slot.date === day ? p.slot.time : slotLabel(p.slot)} ${esc(p.task.title)} (${dur(p.slot.duration)})` : `— ${esc(p.task.title)}: свободного окна нет`);
    const keys = this.tg.plans[key].length ? [[{ text: '✅ Принять', callback_data: `pa|${key}` }]] : [];
    return this.say(chat, lines.join('\n'), keys);
  }

  acceptPlan(chat, mid, key, ack) {
    const plan = this.tg.plans?.[key];
    if (!plan) return [ack('План устарел, отправьте /plan ещё раз')];
    this.store.mutate((n) => {
      for (const [id, date, time, duration] of plan) {
        const t = n.tasks.find((x) => x.id === id);
        if (t && !t.time) Object.assign(t, { date, time, duration });
      }
    });
    delete this.tg.plans[key];
    return [ack('Готово'), this.edit(chat, mid, this.dayText(todayKey(), '✅ <b>План на сегодня</b>'))];
  }

  // ---------- proactive ----------
  tick(now = new Date()) {
    if (!this.tg.chat) return;
    const day = keyOf(now);
    const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const sent = this.tg.sent;
    if (hm >= this.digestTime && hm < '12:00' && sent.digest !== day) {
      sent.digest = day;
      this.tg.outbox.push(this.say(this.tg.chat, this.dayText(day, `☀️ <b>Доброе утро! План на ${relLabel(day).toLowerCase()}:</b>`)));
    }
    const rv = this.store.data.settings.planRules?.review || { day: 5, start: '17:00' };
    if (now.getDay() === rv.day && hm >= minus(rv.start, 5) && hm <= rv.start && sent.review !== day) {
      sent.review = day;
      this.tg.outbox.push(this.say(this.tg.chat, `🗓 <b>Через 5 минут обзор недели</b> (${rv.start}, 30 минут).\nИтоги, хвосты, светофор финансов и план на следующую неделю.`, [[{ text: 'Открыть обзор', url: APP_URL + '#review' }]]));
    }
    this.save();
  }

  takeOutbox() {
    const out = this.tg.outbox.splice(0);
    this.tg.seenAt = Date.now();
    this.save();
    return out;
  }

  // ---------- Bot API calls the worker will make ----------
  say(chat, text, keys) {
    return { method: 'sendMessage', params: { chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true, ...(keys?.length ? { reply_markup: { inline_keyboard: keys } } : {}) } };
  }

  edit(chat, message_id, text, keys) {
    return { method: 'editMessageText', params: { chat_id: chat, message_id, text, parse_mode: 'HTML', ...(keys?.length ? { reply_markup: { inline_keyboard: keys } } : {}) } };
  }
}

function minus(hm, min) {
  const [h, m] = hm.split(':').map(Number);
  const t = h * 60 + m - min;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

// Yandex SpeechKit short audio recognition (up to 30 s / 1 MB)
export function speechKit(apiKey, fetchImpl = fetch) {
  return async (audio, format = 'oggopus') => {
    const q = new URLSearchParams({ lang: 'ru-RU', format, ...(format === 'lpcm' ? { sampleRateHertz: '16000' } : {}) });
    const r = await fetchImpl('https://stt.api.cloud.yandex.net/speech/v1/stt:recognize?' + q, { method: 'POST', headers: { Authorization: 'Api-Key ' + apiKey }, body: audio });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error_message || 'SpeechKit ответил ' + r.status);
    return j.result || '';
  };
}
