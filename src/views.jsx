import { useMemo, useRef, useState, useEffect } from 'react';
import Icon from './icons.jsx';
import { TopBar, IconBtn, TaskTree, TaskItem, Group, Empty, useUi } from './components.jsx';
import { useStore, alive, sortTasks, PRIORITY_COLORS, PRIORITY_NAMES } from './store.jsx';
import { MONTHS, MONTHS_GEN, WD_MON, WD_LOWER, addDays, diffDays, parseKey, todayKey, weekStart, relLabel, fmtLong } from './date.js';

function MenuBtn() {
  const ui = useUi();
  return <IconBtn name="menu" className="menu-btn" onClick={ui.openDrawer} />;
}

function CompletedGroup({ tasks, all }) {
  if (!tasks.length) return null;
  return (
    <Group title="Выполнено" count={tasks.length} defaultOpen={false}>
      <TaskTree tasks={tasks.sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0))} all={all} />
    </Group>
  );
}

/* ---------------- Inbox / Today / Tag / Filter ---------------- */
export function ListView({ route }) {
  const { data, archiveDone, setSettings } = useStore();
  const ui = useUi();
  const [sort, setSort] = useState('date');
  const t = todayKey();
  const all = data.tasks.filter(alive);
  let title = '';
  let list = [];
  let showProject = true;
  if (route.view === 'inbox') {
    title = 'Входящие';
    list = all.filter((x) => !x.projectId);
    showProject = false;
  } else if (route.view === 'today') {
    title = 'Сегодня';
    list = all.filter((x) => x.date && (x.date === t || (x.date < t && !x.done)) && !(x.done && x.doneAt && new Date(x.doneAt).toDateString() !== new Date().toDateString() && x.date !== t));
  } else if (route.view === 'tag') {
    const tag = data.tags.find((x) => x.id === route.id);
    title = tag ? '#' + tag.name : 'Тег';
    list = all.filter((x) => x.tags.includes(route.id));
  }
  const open = sortTasks(
    list.filter((x) => !x.done),
    sort
  );
  const done = data.settings.showCompleted ? list.filter((x) => x.done) : [];
  const overdue = route.view === 'today' ? open.filter((x) => x.date < t) : [];
  const rest = route.view === 'today' ? open.filter((x) => x.date >= t) : open;
  return (
    <div className="view">
      <TopBar title={title} left={<MenuBtn />}>
        {route.view === 'today' && <IconBtn name="calendar" onClick={() => ui.go({ view: 'calendar' })} />}
        <IconBtn
          name="more"
          onClick={(e) =>
            ui.menu(e.currentTarget, [
              { icon: 'sort', label: 'По дате', active: sort === 'date', onClick: () => setSort('date') },
              { icon: 'flag', label: 'По приоритету', active: sort === 'priority', onClick: () => setSort('priority') },
              { icon: 'list', label: 'По названию', active: sort === 'title', onClick: () => setSort('title') },
              { divider: true },
              { icon: 'check', label: data.settings.showCompleted ? 'Скрыть выполненные' : 'Показать выполненные', onClick: () => setSettings({ showCompleted: !data.settings.showCompleted }) },
              { icon: 'archive', label: 'Архивировать выполненные', onClick: () => archiveDone() },
            ])
          }
        />
      </TopBar>
      <div className="scroll">
        {open.length === 0 && done.length === 0 && <Empty text={route.view === 'today' ? 'На сегодня задач нет. Отдыхайте!' : 'Здесь пока пусто'} />}
        {overdue.length > 0 && (
          <Group title={<span className="red">Просрочено</span>} count={overdue.length}>
            <TaskTree tasks={overdue} all={all} showProject={showProject} />
          </Group>
        )}
        {overdue.length > 0 && rest.length > 0 ? (
          <Group title={'Сегодня'} count={rest.length}>
            <TaskTree tasks={rest} all={all} showProject={showProject} />
          </Group>
        ) : (
          <TaskTree tasks={rest} all={all} showProject={showProject} />
        )}
        <CompletedGroup tasks={done} all={all} />
        <div className="list-pad" />
      </div>
    </div>
  );
}

/* ---------------- Filter ---------------- */
export function FilterView() {
  const { data } = useStore();
  const [prio, setPrio] = useState(-1);
  const [when, setWhen] = useState('all');
  const [tag, setTag] = useState(null);
  const t = todayKey();
  const all = data.tasks.filter(alive);
  const list = sortTasks(
    all.filter((x) => {
      if (x.done) return false;
      if (prio >= 0 && x.priority !== prio) return false;
      if (tag && !x.tags.includes(tag)) return false;
      if (when === 'today' && x.date !== t) return false;
      if (when === 'week' && !(x.date && x.date >= t && x.date <= addDays(t, 6))) return false;
      if (when === 'overdue' && !(x.date && x.date < t)) return false;
      if (when === 'nodate' && x.date) return false;
      return true;
    })
  );
  const Chips = ({ items, value, set }) => (
    <div className="chips-row">
      {items.map(([v, l]) => (
        <button key={String(v)} className={'chip' + (value === v ? ' accent' : ' ghost')} onClick={() => set(v)}>
          {l}
        </button>
      ))}
    </div>
  );
  return (
    <div className="view">
      <TopBar title="Фильтр" left={<MenuBtn />} />
      <div className="scroll">
        <div className="filter-box">
          <Chips items={[['all', 'Все даты'], ['today', 'Сегодня'], ['week', '7 дней'], ['overdue', 'Просрочено'], ['nodate', 'Без даты']]} value={when} set={setWhen} />
          <Chips items={[[-1, 'Любой приоритет'], [3, 'Высокий'], [2, 'Средний'], [1, 'Низкий'], [0, 'Без приоритета']]} value={prio} set={setPrio} />
          {data.tags.length > 0 && <Chips items={[[null, 'Все теги'], ...data.tags.map((x) => [x.id, '#' + x.name])]} value={tag} set={setTag} />}
        </div>
        {list.length === 0 ? <Empty text="Нет задач по этому фильтру" icon="filter" /> : <TaskTree tasks={list} all={all} />}
        <div className="list-pad" />
      </div>
    </div>
  );
}

/* ---------------- Plans ---------------- */
export function WeekStrip({ day, setDay, marks }) {
  const ws = weekStart(day);
  const t = todayKey();
  const touch = useRef();
  return (
    <div
      className="week"
      onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        const dx = e.changedTouches[0].clientX - touch.current;
        if (Math.abs(dx) > 50) setDay(addDays(day, dx < 0 ? 7 : -7));
      }}
    >
      {[0, 1, 2, 3, 4, 5, 6].map((i) => {
        const k = addDays(ws, i);
        return (
          <button key={k} className={'wd' + (k === day ? ' sel' : '') + (k === t ? ' today' : '')} onClick={() => setDay(k)}>
            <span className="wd-n">{WD_MON[i]}</span>
            <span className="wd-d">{parseKey(k).getDate()}</span>
            {marks.has(k) && <i />}
          </button>
        );
      })}
    </div>
  );
}

export function PlansView({ day, setDay }) {
  const { data, archiveDone } = useStore();
  const ui = useUi();
  const [compact, setCompact] = useState(false);
  const t = todayKey();
  const all = data.tasks.filter(alive);
  const dated = all.filter((x) => x.date);
  const marks = useMemo(() => new Set(dated.filter((x) => !x.done).map((x) => (x.date < t ? t : x.date))), [data.tasks]);
  const d = parseKey(day);
  const groups = [];
  for (let i = 0; i < 14; i++) {
    const k = addDays(day, i);
    let tasks = dated.filter((x) => (k === t ? x.date === t || (x.date < t && !x.done) : x.date === k));
    if (!data.settings.showCompleted) tasks = tasks.filter((x) => !x.done);
    if (tasks.length || k === day) groups.push([k, tasks]);
  }
  return (
    <div className="view">
      <TopBar title="Планы" left={<MenuBtn />}>
        <IconBtn name={compact ? 'list' : 'kanban'} onClick={() => setCompact(!compact)} title="Вид" />
        <IconBtn
          name="more"
          onClick={(e) =>
            ui.menu(e.currentTarget, [
              { icon: 'star', label: 'Перейти к сегодня', onClick: () => setDay(t) },
              { icon: 'archive', label: 'Архивировать выполненные', onClick: () => archiveDone() },
            ])
          }
        />
      </TopBar>
      <div className="month-row">
        <button className="month-btn" onClick={() => ui.openDate({ date: day }, (v) => v.date && setDay(v.date))}>
          {MONTHS[d.getMonth()]} {d.getFullYear()} <Icon name="chevD" size={16} />
        </button>
        <div className="month-nav">
          <IconBtn name="chevL" size={18} onClick={() => setDay(addDays(day, -7))} />
          <IconBtn name="chevR" size={18} onClick={() => setDay(addDays(day, 7))} />
        </div>
      </div>
      <WeekStrip day={day} setDay={setDay} marks={marks} />
      <div className="scroll">
        {groups.map(([k, tasks]) => {
          const dd = parseKey(k);
          const lbl = k === t ? 'сегодня' : k === addDays(t, 1) ? 'завтра' : MONTHS_GEN[dd.getMonth()];
          const open = sortTasks(tasks.filter((x) => !x.done));
          const done = tasks.filter((x) => x.done);
          return (
            <Group
              key={k}
              title={
                <span>
                  <b className="gd">{dd.getDate()}</b> {lbl} <span className="muted">{WD_LOWER[dd.getDay()]}</span>
                </span>
              }
              count={open.length}
            >
              {tasks.length === 0 && <div className="hint pad">Нет задач на этот день</div>}
              <div className={compact ? 'compact' : ''}>
                <TaskTree tasks={[...open, ...done]} all={all} showDate={!compact} />
              </div>
            </Group>
          );
        })}
        <div className="list-pad" />
      </div>
    </div>
  );
}

/* ---------------- Project ---------------- */
export function ProjectView({ route }) {
  const { data, updateProject, deleteProject, addSection, renameSection, deleteSection, archiveDone, updateTask } = useStore();
  const ui = useUi();
  const p = data.projects.find((x) => x.id === route.id);
  const [page, setPage] = useState(0);
  if (!p) return <Empty text="Проект не найден" />;
  const all = data.tasks.filter((x) => alive(x) && x.projectId === p.id);
  const archivedCount = data.tasks.filter((x) => x.archived && !x.deleted && x.projectId === p.id).length;
  const roots = all.filter((x) => !x.parentId || !all.some((y) => y.id === x.parentId));
  const bySection = (sid) => sortTasks(roots.filter((x) => (x.sectionId || null) === sid && (data.settings.showCompleted || !x.done)), p.sort || 'manual').sort((a, b) => a.done - b.done);
  const cols = [{ id: null, name: 'Новые' }, ...p.sections];
  const menu = (e) =>
    ui.menu(e.currentTarget, [
      { icon: 'sort', label: 'Сортировать: вручную', active: (p.sort || 'manual') === 'manual', onClick: () => updateProject(p.id, { sort: 'manual' }) },
      { icon: 'calendar', label: 'Сортировать: по дате', active: p.sort === 'date', onClick: () => updateProject(p.id, { sort: 'date' }) },
      { icon: 'flag', label: 'Сортировать: по приоритету', active: p.sort === 'priority', onClick: () => updateProject(p.id, { sort: 'priority' }) },
      { divider: true },
      { icon: p.view === 'kanban' ? 'list' : 'kanban', label: p.view === 'kanban' ? 'Вид: список' : 'Вид: канбан', onClick: () => updateProject(p.id, { view: p.view === 'kanban' ? 'list' : 'kanban' }) },
      { icon: 'edit', label: 'Редактировать проект', onClick: () => ui.editProject(p) },
      { icon: 'layers', label: 'Новая секция', onClick: () => ui.prompt({ title: 'Новая секция', placeholder: 'Название секции', onSave: (n) => addSection(p.id, n) }) },
      { divider: true },
      { icon: 'archive', label: 'Архивировать выполненные', onClick: () => archiveDone(p.id) },
      { icon: 'folder', label: 'Архивировать проект', onClick: () => (updateProject(p.id, { archived: true }), ui.go({ view: 'inbox' })) },
      {
        icon: 'trash',
        label: 'Удалить проект',
        danger: true,
        onClick: () => {
          ui.confirm(`Удалить проект «${p.name}»? Задачи попадут в корзину.`, () => {
            deleteProject(p.id);
            ui.go({ view: 'inbox' });
          });
        },
      },
    ]);
  const sectionMenu = (e, s) =>
    ui.menu(e.currentTarget, [
      { icon: 'plus', label: 'Добавить задачу', onClick: () => ui.quickAdd({ projectId: p.id, sectionId: s.id }) },
      s.id && { icon: 'edit', label: 'Переименовать', onClick: () => ui.prompt({ title: 'Секция', value: s.name, onSave: (n) => renameSection(p.id, s.id, n) }) },
      s.id && { icon: 'trash', label: 'Удалить секцию', danger: true, onClick: () => deleteSection(p.id, s.id) },
    ]);
  return (
    <div className="view">
      <TopBar
        title={
          <span>
            <span className="emoji">{p.emoji}</span> {p.name}
          </span>
        }
        sub={p.description ? 'Цель: ' + p.description : null}
        left={<MenuBtn />}
        onTitle={() => ui.editProject(p)}
      >
        <IconBtn name={p.view === 'kanban' ? 'list' : 'kanban'} onClick={() => updateProject(p.id, { view: p.view === 'kanban' ? 'list' : 'kanban' })} />
        <IconBtn name="more" onClick={menu} />
      </TopBar>
      {p.view === 'kanban' ? (
        <>
          <div
            className="kanban"
            onScroll={(e) => {
              const el = e.currentTarget;
              setPage(Math.round(el.scrollLeft / (el.firstChild?.offsetWidth || 1)));
            }}
          >
            {cols.map((s) => {
              const list = bySection(s.id);
              return (
                <div key={s.id || 'none'} className="kcol">
                  <div className="kcol-head">
                    <span>{s.name}</span>
                    <span className="count">{list.filter((x) => !x.done).length}</span>
                    <div style={{ flex: 1 }} />
                    <IconBtn name="plus" size={18} onClick={() => ui.quickAdd({ projectId: p.id, sectionId: s.id })} />
                    <IconBtn name="dots" size={18} onClick={(e) => sectionMenu(e, s)} />
                  </div>
                  <div className="kcol-body">
                    {list.map((tk) => (
                      <div key={tk.id} className="kcard">
                        <TaskTree tasks={[tk]} all={all} showProject={false} />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            <div className="kcol add-col">
              <button className="btn" onClick={() => ui.prompt({ title: 'Новая секция', placeholder: 'Название колонки', onSave: (n) => addSection(p.id, n) })}>
                <Icon name="plus" size={18} /> Колонка
              </button>
            </div>
          </div>
          <div className="pager">
            {[...cols, 0].map((_, i) => (
              <i key={i} className={i === page ? 'on' : ''} />
            ))}
          </div>
        </>
      ) : (
        <div className="scroll">
          <TaskTree tasks={bySection(null)} all={all} showProject={false} />
          {p.sections.map((s) => {
            const list = bySection(s.id);
            return (
              <Group key={s.id} title={s.name} count={list.filter((x) => !x.done).length} right={<IconBtn name="dots" size={16} onClick={(e) => (e.stopPropagation(), sectionMenu(e, s))} />}>
                {list.length === 0 && <div className="hint pad">Пустая секция</div>}
                <TaskTree tasks={list} all={all} showProject={false} />
              </Group>
            );
          })}
          <button className="row-btn add-section" onClick={() => ui.prompt({ title: 'Новая секция', placeholder: 'Название секции', onSave: (n) => addSection(p.id, n) })}>
            <Icon name="layers" size={20} /> <span>Новая секция</span>
          </button>
          {archivedCount > 0 && (
            <button
              className="row-btn muted"
              onClick={() => {
                ui.confirm('Вернуть задачи из архива?', () => data.tasks.filter((x) => x.archived && x.projectId === p.id).forEach((x) => updateTask(x.id, { archived: false })), 'Вернуть');
              }}
            >
              <span>Задачи в архиве</span>
              <span style={{ flex: 1 }} />
              <span>{archivedCount}</span>
              <Icon name="chevR" size={16} />
            </button>
          )}
          {all.length === 0 && <Empty text="В проекте пока нет задач" icon="folder" />}
          <div className="list-pad" />
        </div>
      )}
    </div>
  );
}

/* ---------------- Search ---------------- */
export function SearchView() {
  const { data } = useStore();
  const ui = useUi();
  const [q, setQ] = useState('');
  const [tab, setTab] = useState('tasks');
  const s = q.trim().toLowerCase();
  const all = data.tasks.filter((x) => !x.deleted);
  const tasks = s ? all.filter((x) => x.title.toLowerCase().includes(s) || x.notes.toLowerCase().includes(s)) : [];
  const projects = s ? data.projects.filter((p) => p.name.toLowerCase().includes(s)) : [];
  const sections = s ? data.projects.flatMap((p) => p.sections.filter((x) => x.name.toLowerCase().includes(s)).map((x) => ({ ...x, p }))) : [];
  const tags = s ? data.tags.filter((t) => t.name.toLowerCase().includes(s)) : [];
  const tabs = [
    ['tasks', 'Задачи'],
    ['projects', 'Проекты'],
    ['sections', 'Секции'],
    ['tags', 'Теги'],
  ];
  return (
    <div className="view">
      <div className="topbar">
        <button className="icon-btn" onClick={() => ui.back()}>
          <Icon name="chevL" />
        </button>
        <div className="search-box top">
          <Icon name="search" size={18} />
          <input autoFocus placeholder="Поиск" value={q} onChange={(e) => setQ(e.target.value)} />
          {q && (
            <button className="icon-btn sm" onClick={() => setQ('')}>
              <Icon name="close" size={16} />
            </button>
          )}
        </div>
      </div>
      <div className="tabs">
        {tabs.map(([k, l]) => (
          <button key={k} className={'tab' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>
      <div className="scroll">
        {!s ? (
          <Empty text="Чтобы начать поиск, введите запрос в строку вверху экрана" icon="search" />
        ) : tab === 'tasks' ? (
          tasks.length ? tasks.map((t) => <TaskItem key={t.id} task={t} />) : <Empty text="Ничего не найдено" icon="search" />
        ) : tab === 'projects' ? (
          projects.map((p) => (
            <button key={p.id} className="row-btn" onClick={() => ui.go({ view: 'project', id: p.id })}>
              <span className="emoji">{p.emoji}</span> <span>{p.name}</span>
            </button>
          ))
        ) : tab === 'sections' ? (
          sections.map((x) => (
            <button key={x.id} className="row-btn" onClick={() => ui.go({ view: 'project', id: x.p.id })}>
              <Icon name="layers" size={18} /> <span>{x.name}</span> <span className="muted">— {x.p.name}</span>
            </button>
          ))
        ) : (
          tags.map((t) => (
            <button key={t.id} className="row-btn" onClick={() => ui.go({ view: 'tag', id: t.id })}>
              <Icon name="tag" size={18} /> <span>{t.name}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

/* ---------------- Trash ---------------- */
export function TrashView() {
  const { data, restoreTask, purgeTask, emptyTrash } = useStore();
  const ui = useUi();
  const list = data.tasks.filter((t) => t.deleted && !(t.parentId && data.tasks.find((p) => p.id === t.parentId)?.deleted));
  return (
    <div className="view">
      <TopBar title="Корзина" left={<MenuBtn />}>
        {list.length > 0 && <IconBtn name="trash" onClick={() => ui.confirm('Удалить всё из корзины навсегда?', emptyTrash, 'Очистить')} title="Очистить корзину" />}
      </TopBar>
      <div className="scroll">
        {list.length === 0 && <Empty text="Корзина пуста" icon="trash" />}
        {list.map((t) => (
          <div key={t.id} className="trash-row">
            <div className="task-body" onClick={() => ui.openTask(t.id)}>
              <div className="task-title">{t.title || 'Без названия'}</div>
              {t.date && <div className="task-meta">{fmtLong(t.date)}</div>}
            </div>
            <IconBtn name="restore" title="Восстановить" onClick={() => restoreTask(t.id)} />
            <IconBtn name="close" title="Удалить навсегда" onClick={() => purgeTask(t.id)} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Upcoming reminders ---------------- */
export function NotificationsView() {
  const { data } = useStore();
  const t = todayKey();
  const list = sortTasks(data.tasks.filter((x) => alive(x) && !x.done && x.date && x.time && x.date >= t));
  return (
    <div className="view">
      <TopBar title="Ближайшие события" left={<MenuBtn />} />
      <div className="scroll">
        {list.length === 0 ? <Empty text="Нет задач со временем. Укажите время у задачи, чтобы получить напоминание." icon="bell" /> : list.map((x) => <TaskItem key={x.id} task={x} />)}
      </div>
    </div>
  );
}
