// Finds time for a task: free slots inside the right windows (work hours for work tasks,
// personal windows for everything else), around calendar events and tasks already placed.
// Pure functions, shared by the app and the server.
import { addDays, keyOf, parseKey, pad } from './date.js';

export const DEFAULT_DURATION = 30;

export const DEFAULT_RULES = {
  work: { days: [1, 2, 3, 4, 5], windows: [['10:00', '18:00']] },
  personal: { weekdays: [['09:00', '10:00'], ['18:00', '20:00']], weekend: [['10:00', '20:00']] },
  review: { day: 5, start: '17:00', minutes: 30 }, // weekly review, kept free
  step: 15, // minutes between candidate starts
  lead: 15, // earliest start: now + lead
  horizonDays: 21,
};

export function areaOf(task, projects = []) {
  if (task.area) return task.area;
  const p = projects.find((x) => x.id === task.projectId);
  if (p?.area) return p.area;
  return p && /работ/i.test(p.name) ? 'work' : 'personal';
}

const toMin = (hm) => {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
};
const hm = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
const at = (day, min) => {
  const d = parseKey(day);
  d.setMinutes(min);
  return d.getTime();
};

export function windowsFor(day, area, rules = DEFAULT_RULES) {
  const wd = parseKey(day).getDay();
  if (area === 'work') return rules.work.days.includes(wd) ? rules.work.windows.map(([a, b]) => [toMin(a), toMin(b)]) : [];
  const wins = wd === 0 || wd === 6 ? rules.personal.weekend : rules.personal.weekdays;
  return wins.map(([a, b]) => [toMin(a), toMin(b)]);
}

// Busy intervals [start, end] in ms: calendar events (all-day and "free" ones don't block),
// tasks that already have a time, and the weekly review
export function busyIntervals({ tasks = [], events = [], excludeId = null, from, to, rules = DEFAULT_RULES }) {
  const out = [];
  for (const e of events) if (!e.allDay && e.busy !== false && e.end > from && e.start < to) out.push([e.start, e.end]);
  for (const t of tasks) {
    if (t.id === excludeId || !t.date || !t.time || t.deleted || t.done) continue;
    const s = at(t.date, toMin(t.time));
    out.push([s, s + (t.duration || DEFAULT_DURATION) * 6e4]);
  }
  if (rules.review) {
    for (let d = keyOf(new Date(from)); at(d, 0) < to; d = addDays(d, 1))
      if (parseKey(d).getDay() === rules.review.day) {
        const s = at(d, toMin(rules.review.start));
        out.push([s, s + rules.review.minutes * 6e4]);
      }
  }
  return out.sort((a, b) => a[0] - b[0]);
}

// Up to `count` options [{date, time, duration, late}], each from a different window of a
// different stretch of time, earliest first. `late` marks options after the deadline.
export function suggestSlots(task, { tasks = [], projects = [], events = [], rules = DEFAULT_RULES, now = new Date(), count = 3 } = {}) {
  const duration = task.duration || DEFAULT_DURATION;
  const area = areaOf(task, projects);
  const today = keyOf(now);
  const startDay = task.date && task.date > today ? task.date : today;
  const lastDay = addDays(startDay, rules.horizonDays);
  const from = now.getTime() + rules.lead * 6e4;
  const busy = busyIntervals({ tasks, events, excludeId: task.id, from: at(startDay, 0), to: at(lastDay, 24 * 60), rules });
  const deadlineEnd = task.deadline ? at(task.deadline, 24 * 60) : Infinity;
  const out = [];
  for (let day = startDay; day <= lastDay && out.length < count; day = addDays(day, 1)) {
    for (const [ws, we] of windowsFor(day, area, rules)) {
      if (out.length >= count) break;
      for (let m = ws; m + duration <= we; m += rules.step) {
        const s = at(day, m);
        const e = s + duration * 6e4;
        if (s < from) continue;
        const clash = busy.find(([bs, be]) => bs < e && be > s);
        if (clash) {
          // jump to the end of the clash, rounded up to the step
          const endMin = Math.ceil((clash[1] - at(day, 0)) / 6e4 / rules.step) * rules.step;
          m = Math.max(m, endMin - rules.step);
          continue;
        }
        out.push({ date: day, time: hm(m), duration, late: e > deadlineEnd });
        break; // one option per window
      }
    }
  }
  return out;
}

// Short human label: "Сегодня 18:00–19:00", "Чт, 29 окт 09:00–09:30"
export function slotLabel({ date, time, duration }, now = new Date()) {
  const start = toMin(time);
  const range = `${time}–${hm((start + duration) % (24 * 60))}`;
  const today = keyOf(now);
  if (date === today) return `Сегодня ${range}`;
  if (date === addDays(today, 1)) return `Завтра ${range}`;
  const d = parseKey(date);
  const wd = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][d.getDay()];
  const mon = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'][d.getMonth()];
  return `${wd}, ${d.getDate()} ${mon} ${range}`;
}
