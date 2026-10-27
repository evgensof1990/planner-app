// Read-only web calendars (iCal / .ics links): download, parse, cache per device.
import { CapacitorHttp } from '@capacitor/core';
import { isNative } from './notify.js';
import { keyOf, pad } from './date.js';
import { parseEvents, expandEvents } from './icalparse.js';
import { getCfg, isServer, api } from './sync.js';
import { areaOf } from './scheduler.js';

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

export function parseIcs(text) {
  const { name, events } = parseEvents(text);
  const now = Date.now();
  return {
    name,
    events: expandEvents(events, now - 90 * 864e5, now + 400 * 864e5).map((e) => ({
      title: e.title,
      date: keyOf(e.start),
      time: e.allDay ? null : `${pad(e.start.getHours())}:${pad(e.start.getMinutes())}`,
      dur: e.allDay ? 0 : Math.max(15, Math.round((e.end - e.start) / 6e4)),
    })),
  };
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
  if (isServer(getCfg()) && (!cache[SERVER]?.colors || Date.now() - (cache[SERVER]?.fetchedAt || 0) > 5 * 6e4)) refreshServerEvents();
}

// Yandex Calendar events read by the own server; its task calendars are skipped (those events are tasks already)
const SERVER = '__server';
export async function refreshServerEvents() {
  const cfg = getCfg();
  if (!isServer(cfg)) return;
  const now = Date.now();
  try {
    const { events } = await api(cfg, `/api/events?from=${now - 30 * 864e5}&to=${now + 60 * 864e5}`);
    // colours of the task calendars in Yandex, by task id (event UID is planner-<task id>)
    const colors = {};
    for (const e of events) if (e.own && e.color && e.uid?.startsWith('planner-')) colors[e.uid.slice(8)] = e.color.slice(0, 7);
    cache[SERVER] = {
      fetchedAt: now,
      error: null,
      colors,
      events: events
        .filter((e) => !e.own)
        .map((e) => {
          const s = new Date(e.start);
          return { title: e.title, busy: e.busy, date: keyOf(s), time: e.allDay ? null : `${pad(s.getHours())}:${pad(s.getMinutes())}`, dur: e.allDay ? 0 : Math.max(15, Math.round((e.end - e.start) / 6e4)), color: e.color?.slice(0, 7), calName: e.calName };
        }),
    };
  } catch (e) {
    cache[SERVER] = { ...(cache[SERVER] || { events: [] }), fetchedAt: now, error: e.message };
  }
  saveCache();
}

// Colour of each task as in Yandex Calendar: of its own event, else of its area's calendar
export function taskColors(tasks, projects) {
  const own = cache[SERVER]?.colors || {};
  const byArea = {};
  for (const t of tasks) if (own[t.id]) byArea[areaOf(t, projects)] ||= own[t.id];
  return (t) => own[t.id] || byArea[areaOf(t, projects)] || null;
}

// Items in the shape the calendar view draws
export function calendarItems(calendars = []) {
  const out = [];
  for (const c of calendars) {
    if (c.on === false) continue;
    (cache[c.id]?.events || []).forEach((e, i) => out.push({ ...e, id: `ext-${c.id}-${i}`, ext: true, color: c.color, calName: c.name, done: false, priority: 0 }));
  }
  if (isServer(getCfg())) (cache[SERVER]?.events || []).forEach((e, i) => out.push({ ...e, id: `ext-srv-${i}`, ext: true, color: e.color || '#8a8f98', done: false, priority: 0 }));
  return out;
}

// Calendar events as busy intervals for the scheduler: {start, end, allDay, busy} in ms
export function busyEvents(calendars = []) {
  return calendarItems(calendars)
    .filter((e) => e.time)
    .map((e) => {
      const [y, m, d] = e.date.split('-').map(Number);
      const [hh, mm] = e.time.split(':').map(Number);
      const start = new Date(y, m - 1, d, hh, mm).getTime();
      return { start, end: start + (e.dur || 30) * 6e4, allDay: false, busy: e.busy };
    });
}
