// Pure iCalendar parsing and recurrence expansion, shared by the app and the server.
// Times are converted to the runtime's local zone (the server runs with TZ=Europe/Moscow).

export const unfold = (text) => text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);

export const unescapeText = (v) => v.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
export const escapeText = (v) => String(v).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');

// Shift a wall-clock time in `tz` to an absolute Date
function zoned(y, mo, d, h, mi, s, tz) {
  const asUtc = Date.UTC(y, mo, d, h, mi, s);
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
        .formatToParts(new Date(asUtc))
        .map((p) => [p.type, p.value])
    );
    const tzWall = Date.UTC(+parts.year, parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
    return new Date(asUtc - (tzWall - asUtc));
  } catch (e) {
    return new Date(y, mo, d, h, mi, s); // unknown tz: keep as local
  }
}

// "20261005" | "20261005T090000" | "20261005T090000Z" -> {date, allDay}
export function parseDT(v, params = '') {
  const m = v.match(/^(\d{4})(\d\d)(\d\d)(?:T(\d\d)(\d\d)(\d\d)?(Z)?)?/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (h === undefined) return { date: new Date(+y, mo - 1, +d), allDay: true };
  if (z) return { date: new Date(Date.UTC(+y, mo - 1, +d, +h, +mi, +(s || 0))), allDay: false };
  const tz = (params.match(/TZID=("?)([^;:"]+)\1/) || [])[2];
  if (tz) return { date: zoned(+y, mo - 1, +d, +h, +mi, +(s || 0), tz), allDay: false };
  return { date: new Date(+y, mo - 1, +d, +h, +mi, +(s || 0)), allDay: false };
}

// Raw VEVENTs: {uid, title, start, end, allDay, rrule, exdates:Set<ms>, recurrenceId:ms|null, status, transp, raw}
export function parseEvents(text) {
  const events = [];
  let name = '';
  let ev = null;
  let depth = 0; // nested components inside VEVENT (VALARM)
  for (const line of unfold(text)) {
    if (line === 'BEGIN:VEVENT') {
      ev = { exdates: new Set(), recurrenceId: null, uid: '', title: '', status: '', transp: '' };
      continue;
    }
    if (line === 'END:VEVENT') {
      if (ev && ev.start) {
        if (!ev.end) ev.end = new Date(ev.start.getTime() + (ev.allDay ? 864e5 : ev.dur ?? 0));
        delete ev.dur;
        events.push(ev);
      }
      ev = null;
      continue;
    }
    if (ev && line.startsWith('BEGIN:')) depth++;
    if (ev && line.startsWith('END:')) depth--;
    if (ev && depth > 0) continue;
    const i = line.indexOf(':');
    if (i < 0) continue;
    const head = line.slice(0, i);
    const val = line.slice(i + 1);
    const [key, ...pp] = head.split(';');
    const params = pp.join(';');
    if (!ev) {
      if (key === 'X-WR-CALNAME') name = unescapeText(val);
      continue;
    }
    if (key === 'UID') ev.uid = val;
    else if (key === 'SUMMARY') ev.title = unescapeText(val).replace(/\n/g, ' ');
    else if (key === 'DTSTART') {
      const p = parseDT(val, params);
      if (p) [ev.start, ev.allDay] = [p.date, p.allDay];
    } else if (key === 'DTEND') ev.end = parseDT(val, params)?.date;
    else if (key === 'DURATION') ev.dur = parseDuration(val);
    else if (key === 'RRULE') ev.rrule = val;
    else if (key === 'STATUS') ev.status = val.toUpperCase();
    else if (key === 'TRANSP') ev.transp = val.toUpperCase();
    else if (key === 'RECURRENCE-ID') ev.recurrenceId = parseDT(val, params)?.date.getTime() ?? null;
    else if (key === 'EXDATE')
      val.split(',').forEach((v) => {
        const p = parseDT(v, params);
        if (p) ev.exdates.add(p.date.getTime());
      });
  }
  return { name, events };
}

export function parseDuration(v) {
  const m = v.match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return 0;
  const [, sign, w, d, h, mi, s] = m;
  const ms = ((+w || 0) * 7 * 864e5) + ((+d || 0) * 864e5) + ((+h || 0) * 36e5) + ((+mi || 0) * 6e4) + ((+s || 0) * 1e3);
  return sign === '-' ? -ms : ms;
}

const DAYS = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

const withTime = (day, t) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), t.getHours(), t.getMinutes(), t.getSeconds());
const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();

// Candidate days of one period (sorted), before COUNT/UNTIL filtering
function periodDays(r, freq, anchor, start) {
  const byday = r.BYDAY ? r.BYDAY.split(',').map((x) => ({ n: x.length > 2 ? parseInt(x, 10) : 0, wd: DAYS[x.slice(-2)] })) : null;
  const bymd = r.BYMONTHDAY ? r.BYMONTHDAY.split(',').map(Number) : null;
  const y = anchor.getFullYear();
  const m = anchor.getMonth();
  if (freq === 'DAILY') {
    if (byday && !byday.some((b) => b.wd === anchor.getDay())) return [];
    return [anchor];
  }
  if (freq === 'WEEKLY') {
    const wkst = DAYS[r.WKST || 'MO'];
    const ws = new Date(y, m, anchor.getDate() - ((anchor.getDay() - wkst + 7) % 7));
    const wds = byday ? byday.map((b) => b.wd) : [start.getDay()];
    const out = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() + i);
      if (wds.includes(d.getDay())) out.push(d);
    }
    return out;
  }
  const monthDays = (yy, mm) => {
    const dim = daysInMonth(yy, mm);
    if (bymd) return bymd.map((n) => (n > 0 ? n : dim + n + 1)).filter((n) => n >= 1 && n <= dim).sort((a, b) => a - b).map((n) => new Date(yy, mm, n));
    if (byday) {
      const out = [];
      for (const b of byday) {
        const all = [];
        for (let d = 1; d <= dim; d++) if (new Date(yy, mm, d).getDay() === b.wd) all.push(d);
        if (b.n === 0) out.push(...all);
        else {
          const d = b.n > 0 ? all[b.n - 1] : all[all.length + b.n];
          if (d) out.push(d);
        }
      }
      let days = [...new Set(out)].sort((a, b) => a - b);
      if (r.BYSETPOS) {
        const pos = r.BYSETPOS.split(',').map(Number);
        days = pos.map((p) => (p > 0 ? days[p - 1] : days[days.length + p])).filter(Boolean);
      }
      return days.map((n) => new Date(yy, mm, n));
    }
    const n = start.getDate();
    return n <= dim ? [new Date(yy, mm, n)] : []; // e.g. the 31st is skipped in shorter months
  };
  if (freq === 'MONTHLY') return monthDays(y, m);
  if (freq === 'YEARLY') {
    const months = r.BYMONTH ? r.BYMONTH.split(',').map((x) => +x - 1) : [start.getMonth()];
    if (!bymd && !byday) return months.map((mm) => (start.getDate() <= daysInMonth(y, mm) ? new Date(y, mm, start.getDate()) : null)).filter(Boolean);
    return months.flatMap((mm) => monthDays(y, mm));
  }
  return [];
}

// Start times of a recurring event inside [from, to] (ms), honouring EXDATE
export function occurrences(ev, from, to) {
  const dur = ev.end - ev.start;
  const keep = (s) => s.getTime() + Math.max(dur, 1) > from && s.getTime() <= to && !ev.exdates.has(s.getTime());
  if (!ev.rrule) return keep(ev.start) ? [ev.start] : [];
  const r = Object.fromEntries(ev.rrule.split(';').map((p) => p.split('=')));
  const freq = r.FREQ;
  const interval = Math.max(1, +(r.INTERVAL || 1));
  const until = r.UNTIL ? parseDT(r.UNTIL)?.date.getTime() : Infinity;
  const count = r.COUNT ? +r.COUNT : Infinity;
  const out = [];
  let n = 0;
  const s0 = ev.start;
  for (let p = 0; p < 5000 && n < count; p++) {
    let anchor;
    if (freq === 'DAILY') anchor = new Date(s0.getFullYear(), s0.getMonth(), s0.getDate() + p * interval);
    else if (freq === 'WEEKLY') anchor = new Date(s0.getFullYear(), s0.getMonth(), s0.getDate() + p * 7 * interval);
    else if (freq === 'MONTHLY') anchor = new Date(s0.getFullYear(), s0.getMonth() + p * interval, 1);
    else if (freq === 'YEARLY') anchor = new Date(s0.getFullYear() + p * interval, 0, 1);
    else break;
    if (anchor.getTime() > to + 400 * 864e5) break;
    let past = false;
    for (const day of periodDays(r, freq, anchor, s0)) {
      const s = ev.allDay ? new Date(day.getFullYear(), day.getMonth(), day.getDate()) : withTime(day, s0);
      if (s < s0) continue;
      if (s.getTime() > until || n >= count) {
        past = true;
        break;
      }
      n++;
      if (s.getTime() > to) {
        past = true;
        break;
      }
      if (keep(s)) out.push(s);
    }
    if (past) break;
  }
  return out;
}

// Expanded instances [{uid, title, start, end, allDay, busy}] in [from, to]; moved/cancelled occurrences applied
export function expandEvents(events, from, to) {
  const overrides = new Map(); // uid -> Set of recurrence-id ms
  for (const e of events) if (e.recurrenceId != null) (overrides.get(e.uid) || overrides.set(e.uid, new Set()).get(e.uid)).add(e.recurrenceId);
  const out = [];
  for (const e of events) {
    if (e.status === 'CANCELLED') continue;
    const dur = e.end - e.start;
    const moved = e.recurrenceId == null ? overrides.get(e.uid) : null;
    const starts = e.recurrenceId != null ? (e.start.getTime() + Math.max(dur, 1) > from && e.start.getTime() <= to ? [e.start] : []) : occurrences(e, from, to);
    for (const s of starts) {
      if (moved && moved.has(s.getTime())) continue;
      out.push({ uid: e.uid, title: e.title || 'Событие', start: s, end: new Date(s.getTime() + dur), allDay: !!e.allDay, busy: e.transp !== 'TRANSPARENT' });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}
