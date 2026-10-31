// Checklist inside a task: light items with a tick, not separate tasks.
// They don't show up in lists or calendars, only inside their task.

const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

// "- Капуста", "• лук", "1) морковь", "☐ соль", "[x] сахар" → item titles; a ticked mark keeps the tick
const MARK = /^\s*(?:\[( |x|х)\]|[-–—•*·▫▪☐☑✓✔□■]|\d+[.)](?=\s))\s*/i;
const DONE_MARK = /^\s*(?:\[(x|х)\]|[▪☑✓✔■])/i;

export function parseItems(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => ({ title: line.replace(MARK, '').trim(), done: DONE_MARK.test(line) }))
    // section headings like "Ингредиенты:" and lone dashes are not items
    .filter((it) => it.title && !/:$/.test(it.title) && !/^[^\wа-яё]*$/i.test(it.title));
}

export const mkItem = (title, done = false) => ({ id: uid(), title, done });

export const itemsOf = (task) => (Array.isArray(task?.checklist) ? task.checklist : []);

export function progress(task) {
  const items = itemsOf(task);
  return { done: items.filter((i) => i.done).length, total: items.length };
}

// Plain text for a calendar description or a message
export function checklistText(task) {
  return itemsOf(task)
    .map((i) => (i.done ? '☑ ' : '☐ ') + i.title)
    .join('\n');
}
