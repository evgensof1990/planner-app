export const pad = (n) => String(n).padStart(2, '0');
export const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseKey = (k) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const todayKey = () => keyOf(new Date());
export const addDays = (k, n) => {
  const d = parseKey(k);
  d.setDate(d.getDate() + n);
  return keyOf(d);
};
export const diffDays = (a, b) => Math.round((parseKey(b) - parseKey(a)) / 864e5);

export const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
export const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export const MONTHS_SHORT = ['янв', 'февр', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сент', 'окт', 'нояб', 'дек'];
export const WD = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
export const WD_LOWER = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
// Weekday labels in display order; mutated in place by setWeekStart
export const WD_MON = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
let firstDay = 1; // 1 = Monday, 0 = Sunday
export const setWeekStart = (n) => {
  firstDay = n === 0 ? 0 : 1;
  const order = firstDay ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6];
  order.forEach((w, i) => (WD_MON[i] = WD[w]));
};
// position of a date inside its week (0..6)
export const weekPos = (d) => (d.getDay() - firstDay + 7) % 7;

export const weekStart = (k) => {
  const d = parseKey(k);
  d.setDate(d.getDate() - weekPos(d));
  return keyOf(d);
};

export const fmtLong = (k) => {
  const d = parseKey(k);
  return `${WD[d.getDay()]}, ${pad(d.getDate())} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
};

export const relLabel = (k) => {
  const t = todayKey();
  const diff = diffDays(t, k);
  if (diff === 0) return 'Сегодня';
  if (diff === 1) return 'Завтра';
  if (diff === -1) return 'Вчера';
  const d = parseKey(k);
  const s = `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
  return d.getFullYear() === new Date().getFullYear() ? s : `${s} ${d.getFullYear()}`;
};

export const monthGrid = (year, month) => {
  // full weeks, null for padding
  const first = new Date(year, month, 1);
  const lead = weekPos(first);
  const days = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(keyOf(new Date(year, month, d)));
  while (cells.length % 7) cells.push(null);
  return cells;
};

export const fmtDuration = (sec) => {
  sec = Math.round(sec);
  if (sec < 60) return `${sec}с`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}м`;
  const h = Math.floor(m / 60);
  return `${h}ч ${m % 60}м`;
};
