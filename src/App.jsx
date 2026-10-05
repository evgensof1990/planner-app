import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import Icon from './icons.jsx';
import { UiCtx, Menu } from './components.jsx';
import { useStore, forgetJustDone, PRIORITY_COLORS, PRIORITY_NAMES } from './store.jsx';
import { todayKey, setWeekStart } from './date.js';
import { QuickAdd, DateSheet, ProjectPicker, TagPicker, TaskDetail, PromptSheet, ProjectEdit, HabitEdit, ConfirmSheet } from './sheets.jsx';
import { ListView, PlansView, ProjectView, SearchView, TrashView, ArchiveView, FilterView, NotificationsView } from './views.jsx';
import { HabitsView } from './habits.jsx';
import { CalendarView } from './calendar.jsx';
import { PomodoroView, PomoStatsView, pomoEndReminder } from './pomodoro.jsx';
import { Sidebar } from './sidebar.jsx';
import { SettingsSheet } from './settings.jsx';
import { TOOL_ITEMS, TOOL_SHORT, THEMES, DEFAULT_ACCENT, isHidden } from './layout.js';
import { isNative, syncNotifications, taskReminders, ensurePermission } from './notify.js';

const HOME = { view: 'today' };
const NO_FAB = new Set(['pomo', 'pomoStats', 'search', 'trash', 'archive', 'habits']);

export default function App() {
  const store = useStore();
  const { data } = store;
  const [route, setRoute] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem('route')) || HOME;
    } catch (e) {
      return HOME;
    }
  });
  const [history, setHistory] = useState([]);
  const [sheets, setSheets] = useState([]);
  const [menu, setMenu] = useState(null);
  const [drawer, setDrawer] = useState(false);
  const [toast, setToast] = useState(null);
  const [planDay, setPlanDay] = useState(todayKey());
  const [calDay, setCalDay] = useState(todayKey());
  const toastTimer = useRef();
  setWeekStart(data.settings.weekStart === 0 ? 0 : 1);

  // theme and accent colour
  const theme = data.settings.theme || 'dark';
  const accent = data.settings.accent || DEFAULT_ACCENT;
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.style.setProperty('--accent', accent);
    const bg = (THEMES.find((x) => x[0] === theme) || THEMES[2])[2];
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
    if (isNative)
      import('@capacitor/status-bar')
        .then(({ StatusBar, Style }) => {
          StatusBar.setStyle({ style: theme === 'light' || theme === 'gray' ? Style.Light : Style.Dark });
          StatusBar.setBackgroundColor({ color: bg });
        })
        .catch(() => {});
  }, [theme, accent]);

  useEffect(() => sessionStorage.setItem('route', JSON.stringify(route)), [route]);

  const push = (type, props = {}) => setSheets((s) => [...s, { type, props, key: Math.random() }]);
  const pop = () => setSheets((s) => s.slice(0, -1));

  const syncNotify = useCallback(() => {
    syncNotifications([...taskReminders(data.tasks), ...pomoEndReminder()]);
  }, [data.tasks]);

  useEffect(() => {
    const id = setTimeout(syncNotify, 400);
    return () => clearTimeout(id);
  }, [syncNotify]);

  useEffect(() => {
    if (data.tasks.some((t) => t.time && t.remind !== null && !t.done)) ensurePermission();
  }, [data.tasks]);

  const ui = useMemo(
    () => ({
      store,
      go: (r) => {
        setDrawer(false);
        setSheets([]);
        forgetJustDone();
        setRoute((cur) => {
          if (cur.view === r.view && cur.id === r.id) return cur;
          setHistory((h) => [...h.slice(-30), cur]);
          return r;
        });
      },
      back: () => {
        forgetJustDone();
        setHistory((h) => {
          setRoute(h.length ? h[h.length - 1] : HOME);
          return h.slice(0, -1);
        });
      },
      openDrawer: () => setDrawer(true),
      closeDrawer: () => setDrawer(false),
      quickAdd: (defaults) => push('quick', { defaults }),
      openTask: (id) => push('task', { id }),
      openDate: (value, onSave, timeFirst) => push('date', { value, onSave, timeFirst }),
      openProjectPicker: (value, onPick) => push('project', { value, onPick }),
      openTags: (value, onPick) => push('tags', { value, onPick }),
      prompt: (props) => push('prompt', props),
      confirm: (text, onYes, okLabel, alt) => push('confirm', { text, onYes, okLabel, alt }),
      editProject: (project) => push('projectEdit', { project }),
      editHabit: (habit) => push('habitEdit', { habit }),
      openSettings: (tab) => push('settings', { tab: typeof tab === 'string' ? tab : undefined }),
      menu: (anchor, items) => setMenu({ anchor, items }),
      toast: (text, action) => {
        clearTimeout(toastTimer.current);
        setToast({ text, action });
        toastTimer.current = setTimeout(() => setToast(null), action ? 4000 : 2200);
      },
      syncNotify,
    }),
    [store, syncNotify]
  );

  ui.taskMenu = (task, el) =>
    ui.menu(el, [
      { icon: 'open', label: 'Открыть задачу', onClick: () => ui.openTask(task.id) },
      { icon: 'calendar', label: 'Дата и время', onClick: () => ui.openDate(task, (v) => store.updateTask(task.id, v)) },
      { icon: 'star', label: 'На сегодня', onClick: () => store.updateTask(task.id, { date: todayKey() }) },
      { divider: true },
      ...[3, 2, 1, 0].map((p) => ({ icon: 'flag', color: PRIORITY_COLORS[p] || 'var(--text2)', label: PRIORITY_NAMES[p], active: task.priority === p, onClick: () => store.updateTask(task.id, { priority: p }) })),
      { divider: true },
      { icon: 'noProject', label: 'Перенести в…', onClick: () => ui.openProjectPicker(task.projectId, (projectId, sectionId) => store.updateTask(task.id, { projectId, sectionId })) },
      { icon: 'sub', label: 'Добавить подзадачу', onClick: () => ui.quickAdd({ parentId: task.id, projectId: task.projectId, sectionId: task.sectionId }) },
      {
        icon: 'trash',
        label: 'Удалить',
        danger: true,
        onClick: () => {
          store.deleteTask(task.id);
          ui.toast('Задача перемещена в корзину', { label: 'Отменить', fn: () => store.restoreTask(task.id) });
        },
      },
    ]);

  // Back button (Android) and Escape (desktop)
  const stateRef = useRef();
  stateRef.current = { menu, sheets, drawer, route, history, hotkey: data.settings.hotkey !== false };
  useEffect(() => {
    const handleBack = () => {
      const s = stateRef.current;
      if (s.menu) setMenu(null);
      else if (s.sheets.length) pop();
      else if (s.drawer) setDrawer(false);
      else if (s.history.length) ui.back();
      else if (s.route.view !== HOME.view) setRoute(HOME);
      else if (isNative) CapApp.exitApp();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') return handleBack();
      // quick add hotkey: N (outside text fields)
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const s = stateRef.current;
      if ((e.code === 'KeyN' || e.key === 'n' || e.key === 'т') && s.hotkey && !s.sheets.length) {
        e.preventDefault();
        ui.quickAdd(s.fabDefaults());
      }
    };
    window.addEventListener('keydown', onKey);
    let sub;
    if (isNative) CapApp.addListener('backButton', handleBack).then((h) => (sub = h));
    return () => {
      window.removeEventListener('keydown', onKey);
      sub?.remove();
    };
  }, []);

  const fabDefaults = () => {
    const t = todayKey();
    switch (route.view) {
      case 'today':
        return { date: t };
      case 'plans':
        return { date: planDay };
      case 'calendar':
        return { date: calDay };
      case 'project':
        return { projectId: route.id };
      case 'tag':
        return { tags: [route.id] };
      default:
        return {};
    }
  };

  let view;
  switch (route.view) {
    case 'inbox':
    case 'today':
    case 'noproject':
    case 'someday':
    case 'tag':
      view = <ListView route={route} key={route.view + route.id} />;
      break;
    case 'plans':
      view = <PlansView day={planDay} setDay={setPlanDay} />;
      break;
    case 'project':
      view = <ProjectView route={route} key={route.id} />;
      break;
    case 'habits':
      view = <HabitsView />;
      break;
    case 'calendar':
      view = <CalendarView day={calDay} setDay={setCalDay} />;
      break;
    case 'pomo':
      view = <PomodoroView />;
      break;
    case 'pomoStats':
      view = <PomoStatsView />;
      break;
    case 'search':
      view = <SearchView />;
      break;
    case 'trash':
      view = <TrashView />;
      break;
    case 'archive':
      view = <ArchiveView />;
      break;
    case 'filter':
      view = <FilterView />;
      break;
    case 'notifications':
      view = <NotificationsView />;
      break;
    default:
      view = <ListView route={HOME} />;
  }

  stateRef.current.fabDefaults = fabDefaults;

  const tabs = [
    ['menu', 'Меню', null],
    ['inbox', 'Входящие', 'inbox'],
    ['star', 'Сегодня', 'today'],
    ['calendar', 'Планы', 'plans'],
  ];

  const renderSheet = (s) => {
    const p = { ...s.props, onClose: pop, key: s.key };
    switch (s.type) {
      case 'quick':
        return <QuickAdd {...p} />;
      case 'task':
        return <TaskDetail {...p} />;
      case 'date':
        return <DateSheet {...p} />;
      case 'project':
        return <ProjectPicker {...p} />;
      case 'tags':
        return <TagPicker {...p} />;
      case 'prompt':
        return <PromptSheet {...p} />;
      case 'confirm':
        return <ConfirmSheet {...p} />;
      case 'projectEdit':
        return <ProjectEdit {...p} />;
      case 'habitEdit':
        return <HabitEdit {...p} />;
      case 'settings':
        return <SettingsSheet {...p} />;
      default:
        return null;
    }
  };

  return (
    <UiCtx.Provider value={ui}>
      <div className={'app' + (drawer ? ' drawer-open' : '')}>
        <aside className="side-wrap">
          <Sidebar route={route} />
        </aside>
        <div className="drawer-backdrop" onClick={() => setDrawer(false)} />
        <main className="main">
          <Toolbar route={route} ui={ui} />
          {view}
          {!NO_FAB.has(route.view) && (
            <button className="fab" onClick={() => ui.quickAdd(fabDefaults())} aria-label="Добавить задачу">
              <Icon name="plus" size={28} stroke={2.2} />
            </button>
          )}
          {!['pomo', 'pomoStats', 'search'].includes(route.view) && (
            <nav className="bottom-nav">
              {tabs.map(([ic, label, v]) => (
                <button key={label} className={'bn' + (v && route.view === v ? ' on' : '')} onClick={() => (v ? ui.go({ view: v }) : setDrawer(true))}>
                  <Icon name={ic} size={21} />
                  <span>{label}</span>
                </button>
              ))}
              <span className="bn-fab-space" />
            </nav>
          )}
        </main>
        {sheets.map(renderSheet)}
        {menu && <Menu anchor={menu.anchor} items={menu.items} onClose={() => setMenu(null)} />}
        {toast && (
          <div className="toast">
            <span>{toast.text}</span>
            {toast.action && (
              <button
                onClick={() => {
                  toast.action.fn();
                  setToast(null);
                }}
              >
                {toast.action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </UiCtx.Provider>
  );
}

function Toolbar({ route, ui }) {
  const { data, setSettings } = useStore();
  const st = data.settings;
  const collapsed = !!st.toolCollapsed;
  const t = todayKey();
  const now = new Date();
  const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const soon = data.tasks.some((x) => !x.deleted && !x.archived && !x.done && x.date === t && x.time && x.time >= hm);
  const items = TOOL_ITEMS.filter(([k]) => !isHidden(st.toolHidden, k) && (!collapsed || TOOL_SHORT.has(k)));
  const act = {
    calendar: () => ui.go({ view: 'calendar' }),
    pomo: () => ui.go({ view: 'pomo' }),
    notifications: () => ui.go({ view: 'notifications' }),
    habits: () => ui.go({ view: 'habits' }),
    filter: () => ui.go({ view: 'filter' }),
    settings: () => ui.openSettings(),
    tags: (e) =>
      data.tags.length
        ? ui.menu(
            e.currentTarget,
            data.tags.map((tg) => ({ icon: 'tag', label: '#' + tg.name, active: route.view === 'tag' && route.id === tg.id, onClick: () => ui.go({ view: 'tag', id: tg.id }) }))
          )
        : ui.toast('Тегов пока нет. Добавьте тег в задаче через #'),
  };
  if (route.view === 'pomo' || route.view === 'pomoStats') return null;
  return (
    <div className="toolbar">
      {items.map(([k, label, ic]) =>
        k === 'search' ? (
          <button key={k} className="tb-search" onClick={() => ui.go({ view: 'search' })}>
            <Icon name="search" size={16} /> Поиск
          </button>
        ) : (
          <button key={k} className={'tb-btn' + (route.view === k ? ' on' : '')} title={label} onClick={act[k]}>
            <Icon name={ic} size={20} />
            {k === 'notifications' && soon && <i className="badge" />}
          </button>
        )
      )}
      <span className="tb-sep" />
      <button className="tb-btn" title={collapsed ? 'Показать все кнопки' : 'Свернуть'} onClick={() => setSettings({ toolCollapsed: !collapsed })}>
        <Icon name={collapsed ? 'dchevL' : 'dchevR'} size={18} />
      </button>
    </div>
  );
}
