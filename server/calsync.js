// Two-way sync between planner tasks and Yandex Calendar over CalDAV.
// Tasks with a date become events in two dedicated calendars (work / personal): with a time as timed
// events, without one as all-day events;
// moving or deleting such an event in Yandex Calendar updates the task. Other calendars are read-only
// and feed the "busy" picture used for planning.
import { createHash } from 'node:crypto';
import { parseEvents, expandEvents, escapeText } from '../src/icalparse.js';
import { keyOf, pad } from '../src/date.js';
import { areaOf, DEFAULT_DURATION } from '../src/scheduler.js';

export { areaOf, DEFAULT_DURATION };

const PAST_DAYS = 7;
const FUTURE_DAYS = 60;

export const taskStart = (t) => {
  const [y, m, d] = t.date.split('-').map(Number);
  const [hh, mm] = t.time.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm);
};

const utc = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');

// RFC 5545 line folding (75 octets)
function fold(line) {
  const out = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch);
    if (bytes + b > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = '';
      bytes = 0;
    }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join('\r\n ');
}

const dateStamp = (key) => key.replace(/-/g, '');

export function taskIcs(task) {
  let when;
  if (task.time) {
    const start = taskStart(task);
    const end = new Date(start.getTime() + (task.duration || DEFAULT_DURATION) * 6e4);
    when = [`DTSTART:${utc(start)}`, `DTEND:${utc(end)}`];
  } else {
    const [y, m, d] = task.date.split('-').map(Number);
    // all-day: shown above the day's grid and not counted as busy
    when = [`DTSTART;VALUE=DATE:${dateStamp(task.date)}`, `DTEND;VALUE=DATE:${dateStamp(keyOf(new Date(y, m - 1, d + 1)))}`, 'TRANSP:TRANSPARENT'];
  }
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Planovik//RU',
    'BEGIN:VEVENT',
    `UID:planner-${task.id}`,
    `DTSTAMP:${utc(new Date())}`,
    ...when,
    `SUMMARY:${escapeText((task.done ? '✓ ' : '') + (task.title || 'Задача'))}`,
    ...(task.notes ? [`DESCRIPTION:${escapeText(task.notes)}`] : []),
    `X-PLANOVIK-TASK:${task.id}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}

const hashOf = (task, cal) => createHash('sha1').update(JSON.stringify([task.title, task.notes || '', task.date, task.time || null, task.duration || DEFAULT_DURATION, !!task.done, cal])).digest('hex');

export class CalendarSync {
  constructor({ store, dav, workName, personalName, log = console }) {
    this.store = store;
    this.dav = dav;
    this.names = { work: workName, personal: personalName };
    this.log = log;
    this.chain = Promise.resolve();
  }

  // Serialised: pull (calendar changes -> tasks), then push (tasks -> calendar)
  run() {
    this.chain = this.chain.then(async () => {
      const st = this.store.state;
      try {
        await this.pull();
        await this.push();
        st.error = null;
      } catch (e) {
        st.error = e.message;
        this.log.error('[calsync]', e.message, e.body || '');
      }
      st.syncedAt = Date.now();
      this.store.saveState();
    });
    return this.chain;
  }

  // Matched loosely: "Плановик · Работа" and "плановик работа" are the same calendar
  ownCal(area) {
    const norm = (s) => s.toLowerCase().replace(/[^a-zа-яё0-9]/g, '');
    const name = norm(this.names[area]);
    return this.store.state.calendars.find((c) => norm(c.name) === name);
  }

  async pull() {
    const st = this.store.state;
    st.calendars = (await this.dav.calendars()).filter((c) => c.events);
    const own = new Set(['work', 'personal'].map((a) => this.ownCal(a)?.href).filter(Boolean));
    const now = Date.now();
    const from = new Date(now - PAST_DAYS * 864e5);
    const to = new Date(now + FUTURE_DAYS * 864e5);
    const events = [];
    for (const cal of st.calendars) {
      // own calendars are read in full: an event outside the window must not look deleted
      const objs = own.has(cal.href) ? await this.dav.events(cal.href) : await this.dav.events(cal.href, from, to);
      if (own.has(cal.href)) this.applyCalendarEdits(cal, objs);
      const raw = objs.flatMap((o) => parseEvents(o.ics).events);
      for (const e of expandEvents(raw, from.getTime(), to.getTime()))
        events.push({ cal: cal.href, calName: cal.name, color: cal.color, own: own.has(cal.href), title: e.title, start: e.start.getTime(), end: e.end.getTime(), allDay: e.allDay, busy: e.busy, uid: e.uid });
    }
    st.events = events;
    st.pulledAt = now;
  }

  // Events of our tasks that were moved, resized or deleted in Yandex Calendar
  applyCalendarEdits(cal, objs) {
    const st = this.store.state;
    st.hidden ||= {};
    const byHref = new Map(objs.map((o) => [o.href, o]));
    const edits = [];
    for (const [taskId, link] of Object.entries(st.links)) {
      if (link.cal !== cal.href) continue;
      const o = byHref.get(link.href);
      if (!o) {
        edits.push({ taskId, gone: true });
        delete st.links[taskId];
        continue;
      }
      if (o.etag && link.etag && o.etag === link.etag) continue;
      const ev = parseEvents(o.ics).events.find((e) => e.recurrenceId == null);
      link.etag = o.etag;
      if (!ev) continue;
      edits.push({ taskId, start: ev.start, allDay: ev.allDay, minutes: Math.max(5, Math.round((ev.end - ev.start) / 6e4)), link });
    }
    if (!edits.length) return;
    this.store.mutate((d) => {
      for (const e of edits) {
        const t = d.tasks.find((x) => x.id === e.taskId);
        if (!t) continue;
        if (e.gone) {
          // removed from the calendar: keep the task, drop its slot and don't put it back for that day
          if (t.time) t.time = null;
          if (t.date) st.hidden[t.id] = t.date;
          continue;
        }
        const date = keyOf(e.start);
        if (e.allDay) {
          if (t.date !== date || t.time) {
            Object.assign(t, { date, time: null });
            this.log.info?.('[calsync] task moved in calendar', t.id, date);
          }
        } else {
          const time = `${pad(e.start.getHours())}:${pad(e.start.getMinutes())}`;
          if (t.date !== date || t.time !== time || (t.duration || DEFAULT_DURATION) !== e.minutes) {
            Object.assign(t, { date, time, duration: e.minutes });
            this.log.info?.('[calsync] task moved in calendar', t.id, date, time);
          }
        }
        e.link.hash = hashOf(t, cal.href);
      }
    });
  }

  async push() {
    const st = this.store.state;
    const { tasks, projects } = this.store.data;
    st.hidden ||= {};
    const want = new Map();
    // all-day tasks from long ago would only clutter the calendar
    const oldest = keyOf(new Date(Date.now() - PAST_DAYS * 864e5));
    for (const t of tasks) {
      if (!t.date || t.deleted) continue;
      if (!t.time && (st.hidden[t.id] === t.date || t.date < oldest)) continue;
      delete st.hidden[t.id];
      const cal = this.ownCal(areaOf(t, projects));
      if (cal) want.set(t.id, { t, cal: cal.href });
    }
    for (const [taskId, link] of Object.entries(st.links)) {
      const w = want.get(taskId);
      if (w && w.cal === link.cal) continue;
      await this.dav.remove(link.href, link.etag);
      delete st.links[taskId];
    }
    for (const [taskId, { t, cal }] of want) {
      const h = hashOf(t, cal);
      const link = st.links[taskId];
      if (link && link.hash === h) continue;
      const href = link?.href || `${cal.replace(/\/?$/, '/')}planner-${taskId}.ics`;
      try {
        let etag = await this.dav.put(href, taskIcs(t), link?.etag || null);
        if (!etag) etag = await this.dav.etagOf(href);
        st.links[taskId] = { href, etag, hash: h, cal };
      } catch (e) {
        if (e.status === 412) continue; // edited in Yandex meanwhile: the next pull brings it in first
        throw e;
      }
    }
  }

  // Busy intervals and foreign events for the app: [{start, end, ...}] in [from, to]
  events(from, to) {
    return this.store.state.events.filter((e) => e.end > from && e.start < to);
  }
}
