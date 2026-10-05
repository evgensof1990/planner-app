// Read-only web calendars (iCal / .ics links): download, parse, cache per device.
import { CapacitorHttp } from '@capacitor/core';
import { isNative } from './notify.js';
import { keyOf, pad } from './date.js';

const CKEY = 'planner-ical';
const listeners = new Set();

const loadCache = () => {
  try {
    return JSON.parse(localStorage.getItem(CKEY)) || {};
  } catch (e) {
    return {};
  }
};
let cache = loadCache();
const saveCache = () => {
  try {
    localStorage.setItem(CKEY, JSON.stringify(cache));
  } catch (e) {
    /* ignore */
  }
  listeners.forEach((f) => f());
};
export const onCalendarsChange = (f) => (listeners.add(f), () => listeners.delete(f));
export const calendarInfo = (id) => cache[id] || null;
export const dropCalendar = (id) => {
  delete cache[id];
  saveCache();
};

async function download(url) {
  url = url.trim().replace(/^webcal:\/\//i, 'https://');
  if (isNative) {
    const r = await CapacitorHttp.get({ url, responseType: 'text' });
    if (r.status >= 400) throw new Error('Сервер календаря ответил ошибкой ' + r.status);
    return typeof r.data === 'string' ? r.data : String(r.data);
  }
  let r;
  try {
    r = await fetch(url, { cache: 'no-store' });
  } catch (e) {
    throw new Error('Браузер не смог загрузить календарь: сервер не разрешает чтение с сайтов. В приложении на Android он загрузится.');
  }
  if (!r.ok) throw new Error('Сервер календаря ответил ошибкой ' + r.status);
  return r.text();
}

// "20261005" | "20261005T090000" | "20261005T090000Z" -> Date
function parseDT(v, params) {
  const m = v.match(/^(\d{4})(\d\d)(\d\d)(?:T(\d\d)(\d\d)(\d\d)?(Z)?)?/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (h === undefined) return { date: new Date(+y, mo - 1, +d), allDay: true };
  if (z) return { date: new Date(Date.UTC(+y, mo - 1, +d, +h, +mi, +(s || 0))), allDay: false };
  const tz = (params.match(/TZID=([^;:]+)/) || [])[1];
  let date = new Date(+y, mo - 1, +d, +h, +mi, +(s || 0));
  if (tz) {
    // shift wall-clock time in tz to the device's local time
    try {
      const asUtc = Date.UTC(+y, mo - 1, +d, +h, +mi, +(s || 0));
      const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
          .formatToParts(new Date(asUtc))
          .map((p) => [p.type, p.value])
      );
      const tzWall = Date.UTC(+parts.year, parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
      date = new Date(asUtc - (tzWall - asUtc));
    } catch (e) {
      /* unknown tz: keep as local */
    }
  }
  return { date, allDay: false };
}

const DAYS = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

// Expands an event into occurrences inside [from, to]
function expand(ev, from, to) {
  const out = [];
  const dur = ev.end - ev.start;
  const push = (s) => {
    if (s.getTime() + dur >= from && s <= to && !ev.exdates.has(s.getTime())) out.push(s);
  };
  if (!ev.rrule) {
    push(ev.start);
    return out.map((s) => [s, dur]);
  }
  const r = Object.fromEntries(ev.rrule.split(';').map((p) => p.split('=')));
  const interval = +(r.INTERVAL || 1);
  const until = r.UNTIL ? parseDT(r.UNTIL, '')?.date : null;
  const count = r.COUNT ? +r.COUNT : Infinity;
  const byday = r.BYDAY ? r.BYDAY.split(',').map((x) => DAYS[x.slice(-2)]).filter((x) => x !== undefined) : null;
  let n = 0;
  const cur = new Date(ev.start);
  for (let guard = 0; guard < 3000 && n < count; guard++) {
    if (until && cur > until) break;
    if (cur > to) break;
    if (r.FREQ === 'WEEKLY' && byday) {
      const ws = new Date(cur);
      ws.setDate(ws.getDate() - ws.getDay());
      for (let i = 0; i < 7 && n < count; i++) {
        const d = new Date(ws);
        d.setDate(ws.getDate() + i);
        if (!byday.includes(d.getDay()) || d < ev.start) continue;
        if ((until && d > until) || d > to) break;
        n++;
        push(d);
      }
      cur.setDate(cur.getDate() + 7 * interval);
      continue;
    }
    n++;
    push(new Date(cur));
    if (r.FREQ === 'DAILY') cur.setDate(cur.getDate() + interval);
    else if (r.FREQ === 'WEEKLY') cur.setDate(cur.getDate() + 7 * interval);
    else if (r.FREQ === 'MONTHLY') cur.setMonth(cur.getMonth() + interval);
    else if (r.FREQ === 'YEARLY') cur.setFullYear(cur.getFullYear() + interval);
    else break;
  }
  return out.map((s) => [s, dur]);
}

export function parseIcs(text) {
  const lines = text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
  const now = Date.now();
  const from = now - 90 * 864e5;
  const to = now + 400 * 864e5;
  const events = [];
  let ev = null;
  let name = '';
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') ev = { exdates: new Set() };
    else if (line === 'END:VEVENT') {
      if (ev && ev.start && ev.status !== 'CANCELLED') {
        if (!ev.end) ev.end = new Date(ev.start.getTime() + (ev.allDay ? 864e5 : 36e5));
        for (const [s, dur] of expand(ev, from, to)) {
          const e = new Date(s.getTime() + dur);
          events.push({
            title: ev.title || 'Событие',
            date: keyOf(s),
            time: ev.allDay ? null : `${pad(s.getHours())}:${pad(s.getMinutes())}`,
            dur: ev.allDay ? 0 : Math.max(15, Math.round((e - s) / 6e4)),
          });
        }
      }
      ev = null;
    } else {
      const i = line.indexOf(':');
      if (i < 0) continue;
      const head = line.slice(0, i);
      const val = line.slice(i + 1);
      const [key, ...pp] = head.split(';');
      const params = pp.join(';');
      if (!ev) {
        if (key === 'X-WR-CALNAME') name = val;
        continue;
      }
      if (key === 'SUMMARY') ev.title = val.replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\n/gi, ' ');
      else if (key === 'DTSTART') {
        const p = parseDT(val, params);
        if (p) [ev.start, ev.allDay] = [p.date, p.allDay];
      } else if (key === 'DTEND') ev.end = parseDT(val, params)?.date;
      else if (key === 'RRULE') ev.rrule = val;
      else if (key === 'STATUS') ev.status = val;
      else if (key === 'EXDATE') val.split(',').forEach((v) => { const p = parseDT(v, params); if (p) ev.exdates.add(p.date.getTime()); });
    }
  }
  return { name, events };
}

export async function refreshCalendar(cal) {
  try {
    const { name, events } = parseIcs(await download(cal.url));
    cache[cal.id] = { fetchedAt: Date.now(), name, events, error: null };
  } catch (e) {
    cache[cal.id] = { ...(cache[cal.id] || { events: [] }), error: e.message };
  }
  saveCache();
  return cache[cal.id];
}

export function refreshStale(calendars = []) {
  calendars.filter((c) => c.on !== false && (!cache[c.id] || Date.now() - (cache[c.id].fetchedAt || 0) > 30 * 6e4)).forEach(refreshCalendar);
}

// Items in the shape the calendar view draws
export function calendarItems(calendars = []) {
  const out = [];
  for (const c of calendars) {
    if (c.on === false) continue;
    (cache[c.id]?.events || []).forEach((e, i) => out.push({ ...e, id: `ext-${c.id}-${i}`, ext: true, color: c.color, calName: c.name, done: false, priority: 0 }));
  }
  return out;
}
