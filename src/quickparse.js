// Quick entry in one line of Russian text:
//   "отчёт по проекту до пятницы 2ч #работа !3" -> title, deadline, duration, project, priority
//   "позвонить маме завтра в 19" -> title, date, time
// Recognised pieces are cut out of the title; unknown #words become tags.
import { addDays, keyOf } from './date.js';

const MONTHS = ['январ', 'феврал', 'март', 'апрел', 'ма', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр'];
const MONTH_RE = '(январ[яь]|феврал[яь]|марта?|апрел[яь]|ма[яй]|июн[яь]|июл[яь]|августа?|сентябр[яь]|октябр[яь]|ноябр[яь]|декабр[яь])';
// weekday stems in all the forms people type: пятница / пятницу / пятницы / пт
const WEEKDAYS = [
  ['воскресень[еяю]|вс', 0],
  ['понедельник[а]?|пн', 1],
  ['вторник[а]?|вт', 2],
  ['сред[аеуы]|ср', 3],
  ['четверг[а]?|чт', 4],
  ['пятниц[аеуы]|пт', 5],
  ['суббот[аеуы]|сб', 6],
];
const B = '(?<![\\p{L}\\d])'; // word start
const E = '(?![\\p{L}\\d])'; // word end

// "в 11 часов" is a time, not a duration
const NOT_AT = '(?<!(?:^|\\s)(?:в|к)\\s+(?:\\d{1,2}\\s*час(?:а|ов)?\\s+)?)';
const DUR_PRE = '(?:(?:на|продолжительностью|длительностью)\\s+)?';
const COMMAND = /^(?:(?:создай|создать|добавь|добавить|поставь|поставить|запиши|записать|новая)(?:\s+(?:задачу|задача|напоминание))?|задача|напомни(?:ть)?(?:\s+мне)?)(?:[\s:,.-]+|$)/iu;

const norm = (s) => s.toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]/g, '');

function monthIndex(word) {
  const w = word.toLowerCase();
  if (/^ма[яй]$/.test(w)) return 4;
  if (/^март/.test(w)) return 2;
  return MONTHS.findIndex((m, i) => i !== 4 && i !== 2 && w.startsWith(m));
}

// The next date on that weekday (today counts only if `allowToday`)
function nextWeekday(today, wd, allowToday) {
  const d = new Date(today);
  let diff = (wd - d.getDay() + 7) % 7;
  if (diff === 0 && !allowToday) diff = 7;
  d.setDate(d.getDate() + diff);
  return keyOf(d);
}

// Date words at the start of `s`: returns [dateKey, matchedLength] or null
function dateAt(s, now) {
  const today = keyOf(now);
  let m;
  if ((m = s.match(new RegExp(`^(сегодня|завтра|послезавтра)${E}`, 'u')))) return [addDays(today, { сегодня: 0, завтра: 1, послезавтра: 2 }[m[1]]), m[0].length];
  if ((m = s.match(new RegExp(`^через\\s+(\\d+|один|одну|два|две|три|неделю|месяц)\\s*(дн[яейь]*|день|недел[юиь]|месяц[аев]*)?${E}`, 'u')))) {
    const words = { один: 1, одну: 1, два: 2, две: 2, три: 3 };
    let n = /^\d+$/.test(m[1]) ? +m[1] : words[m[1]] || 1;
    let unit = m[2] || '';
    if (m[1] === 'неделю') unit = 'недел';
    if (m[1] === 'месяц') unit = 'месяц';
    const days = unit.startsWith('недел') ? n * 7 : unit.startsWith('месяц') ? n * 30 : n;
    return [addDays(today, days), m[0].length];
  }
  if ((m = s.match(new RegExp(`^(на\\s+)?следующей\\s+неделе${E}`, 'u')))) return [nextWeekday(now, 1, false), m[0].length];
  if ((m = s.match(new RegExp(`^(на\\s+)?(этих\\s+)?выходных?${E}`, 'u')))) return [nextWeekday(now, 6, true), m[0].length];
  if ((m = s.match(new RegExp(`^конц[аеу]\\s+недели${E}`, 'u')))) return [nextWeekday(now, 5, true), m[0].length];
  if ((m = s.match(new RegExp(`^конц[аеу]\\s+месяца${E}`, 'u')))) return [keyOf(new Date(now.getFullYear(), now.getMonth() + 1, 0)), m[0].length];
  for (const [re, wd] of WEEKDAYS) if ((m = s.match(new RegExp(`^(${re})${E}`, 'u')))) return [nextWeekday(now, wd, true), m[0].length];
  if ((m = s.match(new RegExp(`^(\\d{1,2})\\s+${MONTH_RE}${E}`, 'u')))) {
    const mi = monthIndex(m[2]);
    let d = new Date(now.getFullYear(), mi, +m[1]);
    if (keyOf(d) < today) d = new Date(now.getFullYear() + 1, mi, +m[1]);
    return [keyOf(d), m[0].length];
  }
  if ((m = s.match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?(?!\d)/))) {
    let y = m[3] ? +m[3] : now.getFullYear();
    if (y < 100) y += 2000;
    let d = new Date(y, +m[2] - 1, +m[1]);
    if (!m[3] && keyOf(d) < today) d = new Date(y + 1, +m[2] - 1, +m[1]);
    return [keyOf(d), m[0].length];
  }
  return null;
}

export function parseQuick(text, { projects = [], tags = [], now = new Date() } = {}) {
  const out = { title: '', date: null, time: null, deadline: null, duration: null, priority: 0, projectId: null, tags: [], newTags: [], repeat: null, remind: null };
  // spoken hashtags: "хештег работа" -> "#работа"
  let s = (' ' + text + ' ').replace(/(\s)(?:хеш|хэш|хаш)тег\s+(?=[\p{L}\d])/giu, '$1#');
  const cut = (re, fn) => {
    s = s.replace(re, (...a) => {
      const r = fn(...a);
      return r === false ? a[0] : ' ';
    });
  };

  // "каждый день", "по будням", "ежемесячно" -> repeat
  const REPEAT_WORDS = [
    ['(?:каждый|каждого)\\s+будн(?:ий|его)\\s+(?:день|дня)|по\\s+будням', 'weekdays'],
    ['кажд(?:ый|ого)\\s+(?:день|дня)|ежедневно', 'daily'],
    ['каждую\\s+неделю|еженедельно', 'weekly'],
    ['каждый\\s+месяц|ежемесячно', 'monthly'],
    ['каждый\\s+год|ежегодно', 'yearly'],
  ];
  for (const [re, v] of REPEAT_WORDS)
    cut(new RegExp(B + '(?:' + re + ')' + E, 'iu'), () => {
      if (out.repeat) return false;
      out.repeat = v;
    });

  // #project or #tag
  cut(/(^|\s)#([\p{L}\d_-]+)/gu, (_, __, name) => {
    const n = norm(name);
    const p = projects.find((x) => !x.archived && norm(x.name) === n) || projects.find((x) => !x.archived && n.length >= 3 && norm(x.name).startsWith(n));
    if (p && !out.projectId) out.projectId = p.id;
    else {
      const t = tags.find((x) => norm(x.name) === n);
      if (t) out.tags.push(t.id);
      else out.newTags.push(name);
    }
  });

  // priority: !1..!3, !!!, !высокий
  cut(/(^|\s)(!{1,3}|![123]|!высок\p{L}*|!важн\p{L}*|!средн\p{L}*|!низк\p{L}*)(?=\s)/giu, (_, __, p) => {
    const v = p.toLowerCase();
    out.priority = /^![123]$/.test(v) ? +v[1] : /^!+$/.test(v) ? v.length : /высок|важн/.test(v) ? 3 : /средн/.test(v) ? 2 : 1;
  });

  // duration: 2ч, 1.5 часа, 30 мин, 1ч30м, полчаса
  cut(new RegExp(`${NOT_AT}${B}${DUR_PRE}(\\d+(?:[.,]\\d+)?)\\s*(?:ч|час|часа|часов)\\s*(?:(\\d+)\\s*(?:м|мин|минут[ы]?))?${E}`, 'giu'), (_, h, mm) => {
    out.duration = Math.round(parseFloat(h.replace(',', '.')) * 60) + (+mm || 0);
  });
  cut(new RegExp(`${NOT_AT}${B}${DUR_PRE}(\\d+)\\s*(?:м|мин|минут[ау]?)${E}`, 'giu'), (_, mm) => {
    out.duration = +mm;
  });
  cut(new RegExp(`${B}${DUR_PRE}(полчаса|час)${E}`, 'giu'), (_, w) => {
    out.duration = w.toLowerCase() === 'полчаса' ? 30 : 60;
  });

  // dates: "до/к <date>" is a deadline, "<date>" or "в/во <date>" is the day to do it
  let lower = s.toLowerCase();
  for (let i = 0; i < lower.length; i++) {
    if (i > 0 && /[\p{L}\d]/u.test(lower[i - 1])) continue;
    const pre = lower.slice(i).match(/^(до|к|ко|в|во|на)\s+/u);
    const at = pre ? i + pre[0].length : i;
    const hit = dateAt(lower.slice(at), now);
    if (!hit) continue;
    const isDeadline = pre && /^(до|к|ко)$/.test(pre[1]);
    if (isDeadline && !out.deadline) out.deadline = hit[0];
    else if (!isDeadline && !out.date) out.date = hit[0];
    else continue;
    s = s.slice(0, i) + ' ' + s.slice(at + hit[1]);
    lower = s.toLowerCase();
    i = -1;
  }

  // time: "в 15", "в 15:30", "15:30", "в 7 вечера", "в 9 утра",
  // and the way voice recognition writes it: "на 11 30", "в 14 0 0", "в 11 часов 30 минут"
  cut(new RegExp(`${B}(в|к|на)\\s+(\\d{1,2})(?:\\s*час(?:а|ов)?)?(?:(?:[:.]|\\s+)(\\d{2}|0\\s+\\d)(?:\\s*минут\\p{L}*)?)?(?:\\s+(утра|дня|вечера|ночи))?${E}`, 'giu'), (m, pre, h, mm, part) => {
    if (out.time) return false;
    mm = mm?.replace(/\s+/g, '');
    if (/^на$/i.test(pre) && !mm && !part) return false; // "на 3" alone is too vague
    let hh = +h;
    if (hh > 23 || (mm && +mm > 59)) return false;
    if (part && /вечера|дня/i.test(part) && hh < 12) hh += 12;
    out.time = `${String(hh).padStart(2, '0')}:${mm || '00'}`;
  });
  // "14:00", and spoken "14 00" / "14 0 0"
  cut(new RegExp(`${B}(\\d{1,2})(?::(\\d{2})|\\s+(?:00|0\\s+0))${E}`, 'gu'), (m, h, mm = '00') => {
    if (out.time || +h > 23 || +mm > 59) return false;
    out.time = `${h.padStart(2, '0')}:${mm}`;
  });
  // a bare time means the next such moment: today, or tomorrow if it has passed
  if (out.time && !out.date) {
    const [hh, mm] = out.time.split(':').map(Number);
    out.date = hh * 60 + mm > now.getHours() * 60 + now.getMinutes() ? keyOf(now) : addDays(keyOf(now), 1);
  }

  out.title = s.replace(/\s+/g, ' ').trim();
  // spoken commands: "создай задачу …", "напомни мне …"
  const bare = out.title.replace(COMMAND, '');
  // "напомни …" asks for a reminder at the task's time
  if (/^напомни/iu.test(out.title) && out.time) out.remind = 0;
  if (bare && bare !== out.title) out.title = bare[0].toUpperCase() + bare.slice(1);
  return out;
}
