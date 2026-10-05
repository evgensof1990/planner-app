import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { addDays, todayKey } from './date.js';
import { stamp, merge, canon, getCfg, setCfg, readGist, writeGist, findGist, createGist } from './sync.js';

const KEY = 'planner-data-v1';

export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

export const mkTask = (f = {}) => ({
  id: uid(),
  title: '',
  notes: '',
  done: false,
  doneAt: null,
  date: null,
  time: null,
  remind: null, // minutes before, null = off
  priority: 0, // 0 none, 1 low, 2 medium, 3 high
  projectId: null,
  sectionId: null,
  tags: [],
  parentId: null,
  deleted: false,
  createdAt: Date.now(),
  order: Date.now(),
  ...f,
});

function seed() {
  const t = todayKey();
  const work = uid();
  const home = uid();
  const sWork = uid();
  const tasks = [
    mkTask({ title: 'Добро пожаловать в Плановик 👋', date: t, priority: 3 }),
    mkTask({ title: 'Нажмите «+», чтобы добавить задачу', date: t }),
    mkTask({ title: 'Удерживайте задачу, чтобы открыть меню действий', date: t }),
    mkTask({ title: 'Купить продукты', date: addDays(t, 1), time: '18:00', projectId: home }),
    mkTask({ title: 'Разобрать входящие', notes: 'Задачи без даты и проекта попадают во «Входящие»' }),
    mkTask({ title: 'Подготовить план на неделю', projectId: work, date: addDays(t, 2), priority: 2 }),
    mkTask({ title: 'Созвон с командой', projectId: work, sectionId: sWork, date: addDays(t, 1), time: '11:00' }),
  ];
  const parent = mkTask({ title: 'Ремонт на балконе', projectId: home });
  tasks.push(parent, mkTask({ title: 'Замерить стены', projectId: home, parentId: parent.id, done: true, doneAt: Date.now() }), mkTask({ title: 'Выбрать краску', projectId: home, parentId: parent.id }));
  return {
    tasks,
    projects: [
      { id: work, name: 'Работа', emoji: '💼', description: '', view: 'list', sections: [{ id: sWork, name: 'В работе' }], archived: false, sort: 'manual' },
      { id: home, name: 'Дом', emoji: '🏡', description: '', view: 'list', sections: [], archived: false, sort: 'manual' },
    ],
    tags: [],
    habits: [
      { id: uid(), name: 'Спорт > 20 мин', emoji: '🏋️', color: '#5cc97b', log: {}, createdAt: t },
      { id: uid(), name: 'Чистое питание', emoji: '🥗', color: '#4fc3f7', log: {}, createdAt: t },
      { id: uid(), name: 'Английский 15 мин', emoji: '🇬🇧', color: '#a984f0', log: {}, createdAt: t },
    ],
    pomo: { sessions: [] },
    settings: { name: 'Мой плановик', pomoMinutes: 25, showCompleted: true },
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw);
      const s = seed();
      return { ...s, ...d, settings: { ...s.settings, ...(d.settings || {}) }, pomo: d.pomo || s.pomo };
    }
  } catch (e) {
    /* ignore */
  }
  return seed();
}

const Ctx = createContext(null);

export function StoreProvider({ children }) {
  const [data, setData] = useState(load);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) {
      /* ignore */
    }
  }, [data]);

  // Completed tasks (imported, synced, or done before the archive existed) go to the archive
  useEffect(() => {
    const stale = (t) => t.done && !t.archived && !t.deleted && !t.parentId && !justDone.has(t.id);
    if (data.settings.autoArchive === false || !data.tasks.some(stale)) return;
    setData((d) => {
      const n = JSON.parse(JSON.stringify(d));
      n.tasks.forEach((t) => {
        if (stale(t)) t.archived = true;
      });
      return stamp(d, n);
    });
  }, [data]);

  const api = useMemo(() => {
    const mut = (fn) =>
      setData((d) => {
        const n = JSON.parse(JSON.stringify(d));
        fn(n);
        return stamp(d, n);
      });
    const task = (n, id) => n.tasks.find((t) => t.id === id);
    return {
      addTask: (f) => {
        const t = mkTask(f);
        mut((n) => n.tasks.push(t));
        return t;
      },
      updateTask: (id, patch) =>
        mut((n) => {
          const t = task(n, id);
          if (t) Object.assign(t, patch);
        }),
      toggleTask: (id) =>
        mut((n) => {
          const t = task(n, id);
          if (!t) return;
          t.done = !t.done;
          t.doneAt = t.done ? Date.now() : null;
          if (t.done) {
            justDone.add(t.id);
            if (!t.parentId && n.settings.autoArchive !== false) t.archived = true;
          } else {
            justDone.delete(t.id);
            t.archived = false;
          }
        }),
      deleteTask: (id) =>
        mut((n) => {
          n.tasks.forEach((t) => {
            if (t.id === id || t.parentId === id) t.deleted = true;
          });
        }),
      restoreTask: (id) =>
        mut((n) => {
          n.tasks.forEach((t) => {
            if (t.id === id || t.parentId === id) t.deleted = false;
          });
        }),
      purgeTask: (id) => mut((n) => (n.tasks = n.tasks.filter((t) => t.id !== id && t.parentId !== id))),
      emptyTrash: () => mut((n) => (n.tasks = n.tasks.filter((t) => !t.deleted))),
      archiveDone: (projectId) =>
        mut((n) =>
          n.tasks.forEach((t) => {
            if (t.done && (projectId === undefined || t.projectId === projectId)) t.archived = true;
          })
        ),
      clearArchive: () =>
        mut((n) =>
          n.tasks.forEach((t) => {
            if (t.archived && !t.deleted) t.deleted = true;
          })
        ),
      addProject: (f) => {
        const p = { id: uid(), name: 'Новый проект', emoji: '📁', description: '', view: 'list', sections: [], archived: false, sort: 'manual', ...f };
        mut((n) => n.projects.push(p));
        return p;
      },
      updateProject: (id, patch) =>
        mut((n) => {
          const p = n.projects.find((x) => x.id === id);
          if (p) Object.assign(p, patch);
        }),
      deleteProject: (id) =>
        mut((n) => {
          n.projects = n.projects.filter((p) => p.id !== id);
          n.tasks.forEach((t) => {
            if (t.projectId === id) t.deleted = true;
          });
        }),
      addSection: (projectId, name) =>
        mut((n) => {
          const p = n.projects.find((x) => x.id === projectId);
          if (p) p.sections.push({ id: uid(), name });
        }),
      renameSection: (projectId, sectionId, name) =>
        mut((n) => {
          const s = n.projects.find((x) => x.id === projectId)?.sections.find((x) => x.id === sectionId);
          if (s) s.name = name;
        }),
      deleteSection: (projectId, sectionId) =>
        mut((n) => {
          const p = n.projects.find((x) => x.id === projectId);
          if (!p) return;
          p.sections = p.sections.filter((s) => s.id !== sectionId);
          n.tasks.forEach((t) => {
            if (t.sectionId === sectionId) t.sectionId = null;
          });
        }),
      addTag: (name) => {
        const tg = { id: uid(), name };
        mut((n) => n.tags.push(tg));
        return tg;
      },
      deleteTag: (id) =>
        mut((n) => {
          n.tags = n.tags.filter((t) => t.id !== id);
          n.tasks.forEach((t) => (t.tags = t.tags.filter((x) => x !== id)));
        }),
      addHabit: (f) => mut((n) => n.habits.push({ id: uid(), log: {}, createdAt: todayKey(), color: '#a984f0', emoji: '✅', ...f })),
      updateHabit: (id, patch) =>
        mut((n) => {
          const h = n.habits.find((x) => x.id === id);
          if (h) Object.assign(h, patch);
        }),
      toggleHabit: (id, day) =>
        mut((n) => {
          const h = n.habits.find((x) => x.id === id);
          if (!h) return;
          if (h.log[day]) delete h.log[day];
          else h.log[day] = true;
        }),
      deleteHabit: (id) => mut((n) => (n.habits = n.habits.filter((h) => h.id !== id))),
      addPomo: (s) => mut((n) => n.pomo.sessions.push({ ts: Date.now(), date: todayKey(), ...s })),
      setSettings: (patch) => mut((n) => Object.assign(n.settings, patch)),
      importTickTick: (r, mode) =>
        mut((n) => {
          if (mode === 'replace') {
            n.tasks = r.tasks;
            n.projects = r.projects;
            n.tags = r.tags;
          } else {
            n.tasks.push(...r.tasks);
            n.projects.push(...r.projects);
            n.tags.push(...r.tags);
          }
        }),
      importData: (d) => setData((cur) => stamp(cur, JSON.parse(JSON.stringify({ ...seed(), ...d })))),
    };
  }, []);

  const sync = useSync(data, setData);

  return <Ctx.Provider value={{ data, ...api, sync }}>{children}</Ctx.Provider>;
}

export const useStore = () => useContext(Ctx);

function useSync(data, setData) {
  const [state, setState] = useState(() => ({ status: getCfg() ? 'idle' : 'off', last: getCfg()?.last || null, error: null }));
  const dataRef = useRef(data);
  dataRef.current = data;
  const running = useRef(false);
  const again = useRef(false);
  const synced = useRef(null);

  const syncNow = useCallback(async () => {
    const cfg = getCfg();
    if (!cfg) return;
    if (running.current) {
      again.current = true;
      return;
    }
    running.current = true;
    setState((s) => ({ ...s, status: 'syncing' }));
    try {
      const remote = await readGist(cfg.token, cfg.gistId);
      const merged = merge(dataRef.current, remote);
      const mc = canon(merged);
      if (mc !== canon(remote)) await writeGist(cfg.token, cfg.gistId, merged);
      synced.current = mc;
      if (mc !== canon(dataRef.current)) setData((cur) => merge(cur, merged));
      const last = Date.now();
      setCfg({ ...cfg, last });
      setState({ status: 'idle', last, error: null });
    } catch (e) {
      setState((s) => ({ ...s, status: 'error', error: e.message }));
    }
    running.current = false;
    if (again.current) {
      again.current = false;
      syncNow();
    }
  }, []);

  // push local changes shortly after they happen
  useEffect(() => {
    if (!getCfg() || canon(data) === synced.current) return;
    const id = setTimeout(syncNow, 1500);
    return () => clearTimeout(id);
  }, [data, syncNow]);

  // pull periodically and whenever the app comes back to the foreground
  useEffect(() => {
    if (state.status === 'off') return;
    syncNow();
    const iv = setInterval(() => document.visibilityState === 'visible' && syncNow(), 30000);
    const onVis = () => document.visibilityState === 'visible' && syncNow();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('online', syncNow);
    return () => {
      clearInterval(iv);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('online', syncNow);
    };
  }, [state.status === 'off', syncNow]);

  // returns {existing: data|null, gistId}
  const probe = async (token) => {
    const gistId = await findGist(token);
    return { gistId, existing: gistId ? await readGist(token, gistId) : null };
  };
  const connect = async (token, gistId, mode) => {
    if (!gistId) gistId = await createGist(token, dataRef.current);
    else if (mode === 'replace') {
      const remote = await readGist(token, gistId);
      synced.current = canon(remote);
      setData(remote);
    }
    setCfg({ token, gistId, last: null });
    setState({ status: 'idle', last: null, error: null });
    setTimeout(syncNow, 300);
  };
  const disconnect = () => {
    setCfg(null);
    synced.current = null;
    setState({ status: 'off', last: null, error: null });
  };
  return { ...state, syncNow, probe, connect, disconnect };
}

// ---- selectors
// Tasks completed during this session stay in place (struck through) until
// the screen is reopened or the page is reloaded; then they live in the archive.
export const justDone = new Set();
export const forgetJustDone = () => justDone.clear();
export const alive = (t) => !t.deleted && (!t.archived || justDone.has(t.id));
// Still shown among open tasks: not done, or done just now
export const pending = (t) => !t.done || justDone.has(t.id);
export const PRIORITY_COLORS = ['', '#4f8ff7', '#f5b83d', '#f0574f'];
export const PRIORITY_NAMES = ['Нет приоритета', 'Низкий', 'Средний', 'Высокий'];

export function sortTasks(list, mode = 'date') {
  const arr = [...list];
  const dateVal = (t) => (t.date ? t.date + (t.time || '99:99') : '9999');
  if (mode === 'priority') arr.sort((a, b) => b.priority - a.priority || dateVal(a).localeCompare(dateVal(b)));
  else if (mode === 'title') arr.sort((a, b) => a.title.localeCompare(b.title, 'ru'));
  else if (mode === 'manual') arr.sort((a, b) => a.order - b.order);
  else arr.sort((a, b) => dateVal(a).localeCompare(dateVal(b)) || b.priority - a.priority || a.order - b.order);
  return arr;
}
