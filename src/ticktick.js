// Import of a TickTick backup (Settings → Account → Generate Backup, CSV).
import { uid, mkTask } from './store.jsx';

export function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

const pad = (n) => String(n).padStart(2, '0');

// "2026-09-09T00:00:00+0000" -> {date: '2026-09-09', time: '00:00'} in the task's timezone
function toLocal(s, tz) {
  if (!s) return null;
  const d = new Date(s.replace(/([+-]\d\d)(\d\d)$/, '$1:$2'));
  if (isNaN(d)) return null;
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', { timeZone: tz || undefined, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
        .formatToParts(d)
        .map((p) => [p.type, p.value])
    );
    return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}`, ts: d.getTime() };
  } catch (e) {
    return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}`, ts: d.getTime() };
  }
}

const EMOJI_RE = /^((?:[\u{1F1E6}-\u{1F1FF}]{2})|(?:\p{Extended_Pictographic}(?:️|⃣|[\u{1F3FB}-\u{1F3FF}]|‍\p{Extended_Pictographic}️?)*))\s*/u;
const PRIORITY = { 0: 0, 1: 1, 3: 2, 5: 3 };

export function convertTickTick(text) {
  const rows = parseCSV(text);
  const hi = rows.findIndex((r) => r.includes('Title') && r.includes('List Name'));
  if (hi < 0) throw new Error('Это не похоже на резервную копию TickTick');
  const h = rows[hi];
  const col = (r, name) => {
    const i = h.indexOf(name);
    return i >= 0 ? (r[i] || '').trim() : '';
  };
  const projects = new Map();
  const tags = new Map();
  const tasks = [];
  const idMap = new Map();
  const parentOf = [];
  const getProject = (name, column, view) => {
    if (!name || name.toLowerCase() === 'inbox' || name === 'Входящие') return [null, null];
    let p = projects.get(name);
    if (!p) {
      const m = name.match(EMOJI_RE);
      p = { id: uid(), name: m ? name.slice(m[0].length).trim() || name : name, emoji: m ? m[1] : '📁', description: '', view: view === 'kanban' ? 'kanban' : 'list', sections: [], archived: false, sort: 'manual' };
      projects.set(name, p);
    }
    let sectionId = null;
    if (column) {
      let s = p.sections.find((x) => x.name === column);
      if (!s) {
        s = { id: uid(), name: column };
        p.sections.push(s);
      }
      sectionId = s.id;
    }
    return [p.id, sectionId];
  };
  for (const r of rows.slice(hi + 1)) {
    const title = col(r, 'Title');
    if (!title && !col(r, 'Content')) continue;
    const tz = col(r, 'Timezone');
    const [projectId, sectionId] = getProject(col(r, 'List Name'), col(r, 'Column Name'), col(r, 'View Mode'));
    const due = toLocal(col(r, 'Due Date') || col(r, 'Start Date'), tz);
    const allDay = col(r, 'Is All Day') !== 'false';
    const status = col(r, 'Status');
    const done = status === '1' || status === '2';
    const completed = toLocal(col(r, 'Completed Time'), tz);
    const created = toLocal(col(r, 'Created Time'), tz);
    const tagIds = col(r, 'Tags')
      .split(',')
      .map((s) => s.trim().replace(/^#/, ''))
      .filter(Boolean)
      .map((name) => {
        if (!tags.has(name)) tags.set(name, { id: uid(), name });
        return tags.get(name).id;
      });
    let notes = col(r, 'Content');
    const checklist = col(r, 'Kind') === 'CHECKLIST' || col(r, 'Is Check list') === 'Y';
    const items = [];
    if (checklist && notes) {
      const lines = notes.split('\n');
      const rest = [];
      for (const line of lines) {
        const m = line.match(/^\s*([▫▪☐☑✓✔□■-])\s*(.+)$/);
        if (m) items.push({ title: m[2].trim(), done: m[1] === '▪' || m[1] === '☑' || m[1] === '✓' || m[1] === '✔' || m[1] === '■' });
        else if (line.trim()) rest.push(line);
      }
      notes = rest.join('\n');
    }
    const t = mkTask({
      title: title || notes.split('\n')[0],
      notes,
      done,
      doneAt: done ? completed?.ts || Date.now() : null,
      date: due ? due.date : null,
      time: due && !allDay ? due.time : null,
      remind: due && !allDay && col(r, 'Reminder') ? 0 : null,
      priority: PRIORITY[col(r, 'Priority')] || 0,
      projectId,
      sectionId,
      tags: tagIds,
      createdAt: created?.ts || Date.now(),
      order: Number(col(r, 'Order')) || 0,
      archived: status === '2' ? true : undefined,
    });
    if (t.archived === undefined) delete t.archived;
    tasks.push(t);
    if (col(r, 'taskId')) idMap.set(col(r, 'taskId'), t.id);
    if (col(r, 'parentId')) parentOf.push([t, col(r, 'parentId')]);
    items.forEach((it, i) => tasks.push(mkTask({ title: it.title, done: it.done, doneAt: it.done ? Date.now() : null, parentId: t.id, projectId, sectionId, order: i })));
  }
  for (const [t, pid] of parentOf) if (idMap.has(pid)) t.parentId = idMap.get(pid);
  return { tasks, projects: [...projects.values()], tags: [...tags.values()] };
}
