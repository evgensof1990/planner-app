import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CalDav } from '../server/caldav.js';
import { CalendarSync, taskIcs } from '../server/calsync.js';
import { Store } from '../server/store.js';
import { keyOf } from '../src/date.js';

// In-memory CalDAV server shaped like Yandex's responses
function fakeYandex() {
  const cals = {
    '/calendars/me%40yandex.ru/events-1/': { name: 'Личный календарь', objs: {} },
    '/calendars/me%40yandex.ru/events-2/': { name: 'Встречи Яндекса', objs: {} },
    '/calendars/me%40yandex.ru/events-3/': { name: 'Плановик · Работа', objs: {} },
    '/calendars/me%40yandex.ru/events-4/': { name: 'Плановик · Личное', objs: {} },
  };
  let n = 0;
  const ms = (inner) => `<?xml version="1.0" encoding="utf-8"?>\n<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">${inner}</D:multistatus>`;
  const ok = (href, props) => `<D:response><D:href>${href}</D:href><D:propstat><D:prop>${props}</D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>`;
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r/g, '&#13;');
  const calOf = (href) => Object.keys(cals).find((c) => href.startsWith(c) && href !== c);
  const calls = [];
  const fetchImpl = async (url, { method, headers = {}, body }) => {
    const path = new URL(url).pathname;
    calls.push(`${method} ${path}`);
    const res = (status, text = '', h = {}) => new Response(text, { status, headers: h });
    if (headers.Authorization !== 'Basic ' + Buffer.from('me@yandex.ru:secret').toString('base64')) return res(401);
    if (method === 'PROPFIND' && path === '/') return res(207, ms(ok('/', '<D:current-user-principal><D:href>/principals/users/me%40yandex.ru/</D:href></D:current-user-principal>')));
    if (method === 'PROPFIND' && path.startsWith('/principals/')) return res(207, ms(ok(path, '<C:calendar-home-set><D:href>/calendars/me%40yandex.ru/</D:href></C:calendar-home-set>')));
    if (method === 'PROPFIND' && path === '/calendars/me%40yandex.ru/')
      return res(
        207,
        ms(
          ok(path, '<D:resourcetype><D:collection/></D:resourcetype><D:displayname>me</D:displayname>') +
            Object.entries(cals)
              .map(([h, c]) => ok(h, `<D:resourcetype><D:collection/><C:calendar/></D:resourcetype><D:displayname>${c.name}</D:displayname><C:supported-calendar-component-set><C:comp name="VEVENT"/></C:supported-calendar-component-set>`))
              .join('')
        )
      );
    if (method === 'PROPFIND') {
      const c = calOf(path);
      const o = c && cals[c].objs[path];
      return o ? res(207, ms(ok(path, `<D:getetag>${o.etag}</D:getetag>`))) : res(404);
    }
    if (method === 'REPORT') {
      const c = cals[path];
      return res(207, ms(Object.entries(c.objs).map(([h, o]) => ok(h, `<D:getetag>${o.etag}</D:getetag><C:calendar-data>${esc(o.ics)}</C:calendar-data>`)).join('')));
    }
    if (method === 'PUT') {
      const c = calOf(path);
      const cur = cals[c].objs[path];
      if (headers['If-None-Match'] === '*' && cur) return res(412);
      if (headers['If-Match'] && (!cur || cur.etag !== headers['If-Match'])) return res(412);
      const etag = `"${++n}"`;
      cals[c].objs[path] = { ics: body, etag };
      return res(cur ? 204 : 201, '', { ETag: etag });
    }
    if (method === 'DELETE') {
      const c = calOf(path);
      delete cals[c].objs[path];
      return res(204);
    }
    return res(405);
  };
  // simulate a user edit in Yandex Calendar
  const edit = (href, fn) => {
    const c = calOf(href);
    const o = cals[c].objs[href];
    o.ics = fn(o.ics);
    o.etag = `"${++n}"`;
  };
  return { cals, fetchImpl, edit, calls };
}

const day = (offset) => keyOf(new Date(Date.now() + offset * 864e5));

function setup() {
  const y = fakeYandex();
  const store = new Store(mkdtempSync(join(tmpdir(), 'planner-')));
  const dav = new CalDav({ user: 'me@yandex.ru', password: 'secret', fetchImpl: y.fetchImpl });
  const sync = new CalendarSync({ store, dav, workName: 'Плановик · Работа', personalName: 'Плановик · Личное', log: { error() {}, info() {} } });
  return { y, store, sync };
}

const doc = (tasks, projects = []) => ({ tasks, projects, tags: [], habits: [], pomo: { sessions: [] }, settings: {}, deletedIds: {} });

test('tasks with a time are pushed to the right calendar; others are not', async () => {
  const { y, store, sync } = setup();
  store.sync(
    doc(
      [
        { id: 't1', title: 'Отчёт', date: day(1), time: '11:00', projectId: 'pw', duration: 90, updatedAt: 1 },
        { id: 't2', title: 'Купить краску', date: day(1), time: '18:00', updatedAt: 1 },
        { id: 't3', title: 'Без времени', date: day(1), time: null, updatedAt: 1 },
      ],
      [{ id: 'pw', name: 'Работа', updatedAt: 1 }]
    )
  );
  await sync.run();
  assert.equal(store.state.error, null);
  const work = Object.keys(y.cals['/calendars/me%40yandex.ru/events-3/'].objs);
  const personal = Object.keys(y.cals['/calendars/me%40yandex.ru/events-4/'].objs);
  assert.deepEqual(work, ['/calendars/me%40yandex.ru/events-3/planner-t1.ics']);
  assert.deepEqual(personal, ['/calendars/me%40yandex.ru/events-4/planner-t2.ics']);
  const ics = y.cals['/calendars/me%40yandex.ru/events-3/'].objs[work[0]].ics;
  assert.match(ics, /SUMMARY:Отчёт/);
  // second run with no changes writes nothing
  const before = y.calls.filter((c) => c.startsWith('PUT')).length;
  await sync.run();
  assert.equal(y.calls.filter((c) => c.startsWith('PUT')).length, before);
});

test('moving and deleting an event in Yandex Calendar updates the task', async () => {
  const { y, store, sync } = setup();
  store.sync(doc([{ id: 'a', title: 'Спорт', date: day(2), time: '09:00', updatedAt: 1 }, { id: 'b', title: 'Звонок', date: day(2), time: '18:00', updatedAt: 1 }]));
  await sync.run();
  const cal = '/calendars/me%40yandex.ru/events-4/';
  const target = new Date(Date.now() + 3 * 864e5);
  target.setHours(19, 0, 0, 0);
  const stamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  y.edit(cal + 'planner-a.ics', (ics) => ics.replace(/DTSTART:\S+/, 'DTSTART:' + stamp(target)).replace(/DTEND:\S+/, 'DTEND:' + stamp(new Date(target.getTime() + 36e5))));
  delete y.cals[cal].objs[cal + 'planner-b.ics'];
  await sync.run();
  const a = store.data.tasks.find((t) => t.id === 'a');
  const b = store.data.tasks.find((t) => t.id === 'b');
  assert.equal(a.date, day(3));
  assert.equal(a.time, '19:00');
  assert.equal(a.duration, 60);
  assert.ok(a.updatedAt > 1, 'stamped for clients');
  assert.equal(b.time, null);
  assert.equal(store.state.links.b, undefined);
  // the move is not echoed back as a new write
  const puts = y.calls.filter((c) => c.startsWith('PUT')).length;
  await sync.run();
  assert.equal(y.calls.filter((c) => c.startsWith('PUT')).length, puts);
});

test('completing, rescheduling and deleting a task updates the calendar', async () => {
  const { y, store, sync } = setup();
  const cal = '/calendars/me%40yandex.ru/events-4/';
  store.sync(doc([{ id: 'c', title: 'Йога', date: day(1), time: '19:00', updatedAt: 1 }]));
  await sync.run();
  store.sync(doc([{ id: 'c', title: 'Йога', date: day(1), time: '19:00', done: true, updatedAt: 2 }]));
  await sync.run();
  assert.match(y.cals[cal].objs[cal + 'planner-c.ics'].ics, /SUMMARY:✓ Йога/);
  store.sync({ ...doc([]), deletedIds: { c: Date.now() } });
  await sync.run();
  assert.deepEqual(Object.keys(y.cals[cal].objs), []);
});

test('foreign events, including recurring ones, feed the busy list', async () => {
  const { y, store, sync } = setup();
  const d = new Date();
  d.setHours(13, 0, 0, 0);
  const stamp = (x) => x.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  y.cals['/calendars/me%40yandex.ru/events-2/'].objs['/calendars/me%40yandex.ru/events-2/hold.ics'] = {
    etag: '"h"',
    ics: ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:hold', 'SUMMARY:Холд', `DTSTART:${stamp(d)}`, `DTEND:${stamp(new Date(d.getTime() + 36e5))}`, 'RRULE:FREQ=DAILY;COUNT=3', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n'),
  };
  await sync.run();
  const holds = sync.events(Date.now() - 864e5, Date.now() + 10 * 864e5).filter((e) => e.title === 'Холд');
  assert.equal(holds.length, 3);
  assert.equal(holds[0].calName, 'Встречи Яндекса');
  assert.equal(holds[0].own, false);
});

test('wrong password surfaces a readable error', async () => {
  const y = fakeYandex();
  const store = new Store(mkdtempSync(join(tmpdir(), 'planner-')));
  const sync = new CalendarSync({ store, dav: new CalDav({ user: 'me@yandex.ru', password: 'bad', fetchImpl: y.fetchImpl }), workName: 'Плановик · Работа', personalName: 'Плановик · Личное', log: { error() {} } });
  await sync.run();
  assert.match(store.state.error, /пароль приложения/);
});

test('ICS escapes text and folds long lines', () => {
  const ics = taskIcs({ id: 'x', title: 'Длинная задача, с запятой; и точкой с запятой '.repeat(4), date: '2026-11-02', time: '09:00' });
  assert.ok(ics.split('\r\n').every((l) => Buffer.byteLength(l) <= 75));
  assert.match(ics.replace(/\r\n /g, ''), /задача\\, с запятой\\;/);
  assert.match(ics, /DTSTART:20261102T060000Z/);
});
