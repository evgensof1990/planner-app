import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import Icon from './icons.jsx';
import { UiCtx, Menu } from './components.jsx';
import { useStore, PRIORITY_COLORS, PRIORITY_NAMES } from './store.jsx';
import { todayKey } from './date.js';
import { QuickAdd, DateSheet, ProjectPicker, TagPicker, TaskDetail, PromptSheet, ProjectEdit, HabitEdit } from './sheets.jsx';
import { ListView, PlansView, ProjectView, SearchView, TrashView, FilterView, NotificationsView } from './views.jsx';
import { HabitsView } from './habits.jsx';
import { CalendarView } from './calendar.jsx';
import { PomodoroView, PomoStatsView, pomoEndReminder } from './pomodoro.jsx';
import { Sidebar, SettingsSheet } from './sidebar.jsx';
import { isNative, syncNotifications, taskReminders, ensurePermission } from './notify.js';

const HOME = { view: 'today' };
const NO_FAB = new Set(['pomo', 'pomoStats', 'search', 'trash', 'habits']);

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
        setRoute((cur) => {
          if (cur.view === r.view && cur.id === r.id) return cur;
          setHistory((h) => [...h.slice(-30), cur]);
          return r;
        });
      },
      back: () => {
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
      editProject: (project) => push('projectEdit', { project }),
      editHabit: (habit) => push('habitEdit', { habit }),
      openSettings: () => push('settings'),
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
  stateRef.current = { menu, sheets, drawer, route, history };
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
    const onKey = (e) => e.key === 'Escape' && handleBack();
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
    case 'filter':
      view = <FilterView />;
      break;
    case 'notifications':
      view = <NotificationsView />;
      break;
    default:
      view = <ListView route={HOME} />;
  }

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
