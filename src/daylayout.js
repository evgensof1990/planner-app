// Side-by-side columns for overlapping events, like in Yandex/Google Calendar.
// Returns [{x, top, height, col, cols}] with minutes from midnight.
export function layoutDay(items) {
  const evs = items
    .map((x) => {
      const [hh, mm] = x.time.split(':').map(Number);
      const start = hh * 60 + mm;
      return { x, start, end: Math.min(24 * 60, start + Math.max(15, x.ext ? x.dur || 30 : x.duration || 30)) };
    })
    .sort((a, b) => a.start - b.start || b.end - a.end);
  const out = [];
  let group = [];
  let groupEnd = -1;
  const flush = () => {
    const cols = Math.max(...group.map((e) => e.col)) + 1;
    group.forEach((e) => (e.cols = cols));
    out.push(...group);
    group = [];
  };
  for (const e of evs) {
    if (group.length && e.start >= groupEnd) flush();
    const ends = [];
    group.forEach((g) => (ends[g.col] = Math.max(ends[g.col] ?? -1, g.end)));
    let col = 0;
    while (ends[col] !== undefined && ends[col] > e.start) col++;
    e.col = col;
    group.push(e);
    groupEnd = Math.max(groupEnd, e.end);
  }
  if (group.length) flush();
  return out;
}
