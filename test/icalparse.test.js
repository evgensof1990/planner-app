// Run with: TZ=Europe/Moscow node --test test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEvents, expandEvents, parseDuration } from '../src/icalparse.js';

const cal = (...evs) => ['BEGIN:VCALENDAR', 'X-WR-CALNAME:Тест', ...evs.flatMap((e) => ['BEGIN:VEVENT', ...e, 'END:VEVENT']), 'END:VCALENDAR'].join('\r\n');
const range = (a, b) => [new Date(a).getTime(), new Date(b).getTime()];
const hm = (d) => `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const run = (text, a, b) => expandEvents(parseEvents(text).events, ...range(a, b)).map((e) => hm(e.start));

test('weekly with BYDAY, TZID and EXDATE', () => {
  const t = cal(['UID:hold', 'SUMMARY:Холд', 'DTSTART;TZID=Europe/Moscow:20261026T130000', 'DTEND;TZID=Europe/Moscow:20261026T140000', 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', 'EXDATE;TZID=Europe/Moscow:20261028T130000']);
  assert.deepEqual(run(t, '2026-10-26T00:00', '2026-11-02T00:00'), ['10-26 13:00', '10-27 13:00', '10-29 13:00', '10-30 13:00']);
});

test('UTC times are converted to Moscow', () => {
  const t = cal(['UID:a', 'DTSTART:20261026T070000Z', 'DTEND:20261026T080000Z']);
  assert.deepEqual(run(t, '2026-10-26T00:00', '2026-10-27T00:00'), ['10-26 10:00']);
});

test('moved and cancelled occurrences of a recurring meeting', () => {
  const t = cal(
    ['UID:sync', 'SUMMARY:Синк', 'DTSTART;TZID=Europe/Moscow:20261026T140000', 'DTEND;TZID=Europe/Moscow:20261026T150000', 'RRULE:FREQ=DAILY;COUNT=5'],
    ['UID:sync', 'RECURRENCE-ID;TZID=Europe/Moscow:20261027T140000', 'DTSTART;TZID=Europe/Moscow:20261027T170000', 'DTEND;TZID=Europe/Moscow:20261027T180000'],
    ['UID:sync', 'RECURRENCE-ID;TZID=Europe/Moscow:20261028T140000', 'STATUS:CANCELLED', 'DTSTART;TZID=Europe/Moscow:20261028T140000', 'DTEND;TZID=Europe/Moscow:20261028T150000']
  );
  assert.deepEqual(run(t, '2026-10-26T00:00', '2026-11-05T00:00'), ['10-26 14:00', '10-27 17:00', '10-29 14:00', '10-30 14:00']);
});

test('monthly by ordinal weekday and last day', () => {
  const t = cal(['UID:m', 'DTSTART;TZID=Europe/Moscow:20261102T090000', 'DTEND;TZID=Europe/Moscow:20261102T093000', 'RRULE:FREQ=MONTHLY;BYDAY=1MO']);
  assert.deepEqual(run(t, '2026-11-01T00:00', '2027-02-01T00:00'), ['11-02 09:00', '12-07 09:00', '01-04 09:00']);
  const last = cal(['UID:l', 'DTSTART;TZID=Europe/Moscow:20261130T200000', 'DTEND;TZID=Europe/Moscow:20261130T203000', 'RRULE:FREQ=MONTHLY;BYMONTHDAY=-1;COUNT=3']);
  assert.deepEqual(run(last, '2026-11-01T00:00', '2027-06-01T00:00'), ['11-30 20:00', '12-31 20:00', '01-31 20:00']);
});

test('UNTIL, INTERVAL and long-running series', () => {
  const t = cal(['UID:w', 'DTSTART;TZID=Europe/Moscow:20240105T170000', 'DTEND;TZID=Europe/Moscow:20240105T173000', 'RRULE:FREQ=WEEKLY;INTERVAL=2;UNTIL=20261231T000000Z']);
  const got = run(t, '2026-10-26T00:00', '2026-11-30T00:00');
  assert.equal(got.length, 2);
  assert.ok(got.every((x) => x.endsWith('17:00')));
});

test('all-day events, DURATION and transparency', () => {
  const t = cal(['UID:bd', 'SUMMARY:ДР', 'DTSTART;VALUE=DATE:20200315', 'RRULE:FREQ=YEARLY', 'TRANSP:TRANSPARENT'], ['UID:d', 'DTSTART:20261026T120000', 'DURATION:PT1H30M']);
  const ev = expandEvents(parseEvents(t).events, ...range('2026-10-26T00:00', '2027-04-01T00:00'));
  assert.equal(ev.length, 2);
  assert.equal(ev[0].end - ev[0].start, 90 * 6e4);
  assert.equal(ev[1].allDay, true);
  assert.equal(ev[1].busy, false);
  assert.equal(hm(ev[1].start), '03-15 00:00');
});

test('alarms inside events are ignored', () => {
  const t = cal(['UID:x', 'SUMMARY:С напоминанием', 'DTSTART:20261026T120000', 'DTEND:20261026T130000', 'BEGIN:VALARM', 'TRIGGER:-PT15M', 'DESCRIPTION:Напоминание', 'END:VALARM']);
  const [e] = parseEvents(t).events;
  assert.equal(e.title, 'С напоминанием');
});

test('parseDuration', () => {
  assert.equal(parseDuration('PT45M'), 45 * 6e4);
  assert.equal(parseDuration('P1D'), 864e5);
});
