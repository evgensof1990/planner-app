import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { TopBar, IconBtn, useUi, AreaToggle } from './components.jsx';
import Icon from './icons.jsx';
import { useStore, PRIORITY_COLORS } from './store.jsx';
import { layoutDay } from './daylayout.js';
import { calendarItems, onCalendarsChange, refreshStale, taskColors, taskCalendarName } from './ical.js';
import { areaOf } from './scheduler.js';
import { MONTHS, MONTHS_GEN, REPEATS, WD, WD_MON, addDays, monthGrid, parseKey, todayKey, pad, weekStart } from './date.js';

const HOUR = 54;
const YANDEX_CALENDAR_URL = 'https://calendar.yandex.ru/week?uid=474876932';

export function YandexCalendarLink({ className = '' }) {
  return (
    <a className={'ya-cal-link ' + className} href={YANDEX_CALENDAR_URL} target="_blank" rel="noreferrer" title="Открыть Яндекс Календарь">
      <img src="./yandex-calendar.png" alt="Яндекс Календарь" />
    </a>
  );
}
const MODES = [
  ['day', 'День', 1],
  ['3day', '3 дня', 3],
  ['week', 'Неделя', 7],
  ['month', 'Месяц', 0],
];

export function CalendarView({ day, setDay }) {
  const { data, toggleTask } = useStore();
  const ui = useUi();
  const [mode, setMode] = useState(() => (window.innerWidth >= 900 ? 'week' : '3day'));
  const gridRef = useRef();
  const touch = useRef();
  const t = todayKey();
  const span = MODES.find((m) => m[0] === mode)[2];
  const startDay = mode === 'week' ? weekStart(day) : day;
  const days = [...Array(span).keys()].map((i) => addDays(startDay, i));
  const [, bump] = useState(0);
  useEffect(() => onCalendarsChange(() => bump((x) => x + 1)), []);
  useEffect(() => refreshStale(data.settings.calendars), [data.settings.calendars]);
  // done tasks stay in the calendar (also once archived), with a check mark as in Yandex Calendar
  const tasks = [...data.tasks.filter((x) => !x.deleted && x.date), ...calendarItems(data.settings.calendars)];
  const label = (x) => (x.done ? '✓ ' : '') + x.title;
  const taskColor = taskColors(data.tasks, data.projects);
  const colorOf = (x) => (x.ext ? x.color : taskColor(x));
  // Events are filled with a pastel of their calendar's colour, as in Yandex Calendar (see .cal-ev in styles.css)
  const tint = (x) => {
    const c = colorOf(x) || (!x.ext && PRIORITY_COLORS[x.priority]);
    return c ? { '--ev': c } : undefined;
  };
  const hm = (min) => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;
  // a click on an event opens a small card next to it, as in Yandex Calendar
  const [pop, setPop] = useState(null);
  const closedAt = useRef(0);
  const open = (x, e, end) => setPop({ x, end, color: colorOf(x) || PRIORITY_COLORS[x.priority], rect: e.currentTarget.getBoundingClientRect() });
  const closePop = () => {
    closedAt.current = Date.now();
    setPop(null);
  };
  const d = parseKey(day);
  const now = new Date();

  useEffect(() => {
    if (gridRef.current) gridRef.current.scrollTop = Math.max(0, (now.getHours() - 1.5) * HOUR);
  }, [mode]);

  const shift = (dir) => {
    if (mode === 'month') {
      const nd = new Date(d.getFullYear(), d.getMonth() + dir, 1);
      setDay(`${nd.getFullYear()}-${pad(nd.getMonth() + 1)}-01`);
    } else setDay(addDays(day, dir * span));
  };
  const swipe = {
    onTouchStart: (e) => (touch.current = [e.touches[0].clientX, e.touches[0].clientY]),
    onTouchEnd: (e) => {
      const dx = e.changedTouches[0].clientX - touch.current[0];
      const dy = e.changedTouches[0].clientY - touch.current[1];
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) shift(dx < 0 ? 1 : -1);
    },
  };

  return (
    <div className="view">
      <TopBar
        title={`${MONTHS[d.getMonth()]} ${d.getFullYear()}`}
        left={
          <>
            <IconBtn name="menu" className="menu-btn" onClick={ui.openDrawer} />
            {/* on wide screens the link sits in the toolbar instead (App.jsx) */}
            <YandexCalendarLink className="phone-only" />
          </>
        }
      >
        <IconBtn name="chevL" size={18} onClick={() => shift(-1)} />
        <IconBtn name="chevR" size={18} onClick={() => shift(1)} />
        <IconBtn name="star" onClick={() => setDay(t)} title="Сегодня" />
        <IconBtn name="calendar" onClick={() => ui.openDate({ date: day }, (v) => v.date && setDay(v.date))} />
      </TopBar>
      <div className="seg">
        {MODES.map(([k, l]) => (
          <button key={k} className={mode === k ? 'on' : ''} onClick={() => setMode(k)}>
            {l}
          </button>
        ))}
      </div>
      {mode === 'month' ? (
        <div className="cal-month" {...swipe}>
          {WD_MON.map((w) => (
            <div key={w} className="cm-wd">
              {w}
            </div>
          ))}
          {monthGrid(d.getFullYear(), d.getMonth()).map((k, i) => {
            if (!k) return <div key={i} className="cm-cell empty" />;
            const list = tasks.filter((x) => x.date === k);
            return (
              <div
                key={i}
                className={'cm-cell' + (k === t ? ' today' : '')}
                onClick={() => {
                  setDay(k);
                  setMode('day');
                }}
              >
                <span className="cm-n">{parseKey(k).getDate()}</span>
                {list.slice(0, 3).map((x) => (
                  <span key={x.id} className={'cm-ev' + (x.done ? ' done' : '')} style={tint(x)}>
                    {label(x)}
                  </span>
                ))}
                {list.length > 3 && <span className="cm-more">+{list.length - 3}</span>}
              </div>
            );
          })}
        </div>
      ) : (
        <>
          <div className="cal-head" style={{ gridTemplateColumns: `44px repeat(${span}, 1fr)` }}>
            <span />
            {days.map((k) => (
              <button key={k} className={'ch-day' + (k === t ? ' today' : '')} onClick={() => setDay(k)}>
                <span>{WD[parseKey(k).getDay()].toLowerCase()}</span>
                <b>{parseKey(k).getDate()}</b>
              </button>
            ))}
          </div>
          <div className="cal-allday" style={{ gridTemplateColumns: `44px repeat(${span}, 1fr)` }}>
            <span className="cal-ad-l">весь день</span>
            {days.map((k) => (
              <div key={k} className="cal-ad-col">
                {tasks
                  .filter((x) => x.date === k && !x.time)
                  .map((x) => (
                    <button key={x.id} className={'cal-ev allday' + (x.done ? ' done' : '')} style={tint(x)} onClick={(e) => open(x, e)}>
                      {label(x)}
                    </button>
                  ))}
              </div>
            ))}
          </div>
          <div className="cal-grid-wrap" ref={gridRef} {...swipe}>
            <div className="cal-grid" style={{ gridTemplateColumns: `44px repeat(${span}, 1fr)`, height: HOUR * 24 }}>
              <div className="cal-hours">
                {[...Array(24).keys()].map((h) => (
                  <span key={h} style={{ top: h * HOUR }}>
                    {h ? pad(h) + ':00' : ''}
                  </span>
                ))}
              </div>
              {days.map((k) => (
                <div
                  key={k}
                  className="cal-col"
                  onClick={(e) => {
                    // the first click outside an open card only closes it
                    if (e.target !== e.currentTarget || Date.now() - closedAt.current < 400) return;
                    const y = e.nativeEvent.offsetY;
                    const h = Math.min(23, Math.floor(y / HOUR));
                    ui.quickAdd({ date: k, time: pad(h) + ':00' });
                  }}
                >
                  {[...Array(24).keys()].map((h) => (
                    <i key={h} className="cal-line" style={{ top: h * HOUR }} />
                  ))}
                  {k === t && <div className="cal-now" style={{ top: ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR }} />}
                  {layoutDay(tasks.filter((x) => x.date === k && x.time)).map(({ x, start, end, col, cols }) => {
                    const height = ((end - start) / 60) * HOUR - 2;
                    // tall enough for the time range on its own line, like Yandex Calendar
                    const tall = height >= 40;
                    return (
                      <button
                        key={x.id}
                        className={'cal-ev' + (x.done ? ' done' : '') + (tall ? ' tall' : height < 18 ? ' tiny' : '')}
                        style={{
                          top: (start / 60) * HOUR + 1,
                          height,
                          left: `calc(${(col / cols) * 100}% + 2px)`,
                          width: `calc(${100 / cols}% - 4px)`,
                          right: 'auto',
                          ...tint(x),
                        }}
                        title={`${x.time} ${x.title}`}
                        onClick={(e) => open(x, e, end)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          if (!x.ext) toggleTask(x.id);
                        }}
                      >
                        {tall ? (
                          <>
                            <span className="ev-time">
                              {x.time} – {hm(end)}
                            </span>
                            <span className="ev-title">{label(x)}</span>
                          </>
                        ) : (
                          <>
                            <span className="ev-time">{x.time}</span> <span className="ev-title">{label(x)}</span>
                          </>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
      {pop && <EventCard {...pop} onClose={closePop} />}
    </div>
  );
}

const toMin = (t) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
const hhmm = (min) => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;

// Date and time right in the event card: native pickers plus one-tap shifts
function WhenEditor({ task, onChange }) {
  const t = todayKey();
  const dur = task.duration || 30;
  const start = task.time ? toMin(task.time) : null;
  const shift = (min) => {
    const m = start + min;
    if (m < 0 || m + dur > 24 * 60) return onChange({ date: addDays(task.date, Math.floor(m / (24 * 60))), time: hhmm(((m % 1440) + 1440) % 1440) });
    onChange({ time: hhmm(m) });
  };
  return (
    <div className="when-edit">
      <div className="when-inputs">
        <input type="date" value={task.date} onChange={(e) => e.target.value && onChange({ date: e.target.value })} aria-label="Дата" />
        <input type="time" step="300" value={task.time || ''} onChange={(e) => onChange({ time: e.target.value || null })} aria-label="Начало" />
        {task.time && (
          <>
            <span>—</span>
            <input
              type="time"
              step="300"
              value={hhmm(Math.min(start + dur, 24 * 60 - 1))}
              onChange={(e) => {
                if (!e.target.value) return;
                const len = toMin(e.target.value) - start;
                if (len >= 5) onChange({ duration: len });
              }}
              aria-label="Конец"
            />
          </>
        )}
      </div>
      <div className="when-chips">
        {task.date !== t && <button onClick={() => onChange({ date: t })}>Сегодня</button>}
        {task.date !== addDays(t, 1) && <button onClick={() => onChange({ date: addDays(t, 1) })}>Завтра</button>}
        <button onClick={() => onChange({ date: addDays(task.date, 1) })}>+1 день</button>
        <button onClick={() => onChange({ date: addDays(task.date, 7) })}>+1 нед</button>
        {task.time && <button onClick={() => shift(-30)}>−30 мин</button>}
        {task.time && <button onClick={() => shift(30)}>+30 мин</button>}
        {task.time && <button onClick={() => shift(60)}>+1 ч</button>}
        {task.time ? <button onClick={() => onChange({ time: null })}>Весь день</button> : <button onClick={() => onChange({ time: '09:00' })}>Задать время</button>}
      </div>
    </div>
  );
}

const WD_FULL = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];

function EventCard({ x: item, end: evEnd, color, rect, onClose }) {
  const { data, toggleTask, deleteTask, restoreTask, addTask, updateTask } = useStore();
  const ui = useUi();
  const ref = useRef();
  const [pos, setPos] = useState({ top: -999, left: -999 });
  // date, time and area changes wait for «Готово»
  const [draft, setDraft] = useState(null);
  const swipe = useRef(null);
  const saved = item.ext ? item : data.tasks.find((t) => t.id === item.id);
  const task = saved && draft ? { ...saved, ...draft } : saved;

  useLayoutEffect(() => {
    const m = ref.current.getBoundingClientRect();
    const W = window.innerWidth;
    const H = window.innerHeight;
    // beside the event when there is room, else centred over it
    let left = rect.right + 10;
    if (left + m.width > W - 8) left = rect.left - m.width - 10;
    if (left < 8) left = Math.max(8, Math.min(W - m.width - 8, rect.left + rect.width / 2 - m.width / 2));
    const top = Math.max(8, Math.min(rect.top - 8, H - m.height - 8));
    setPos({ top, left });
  }, [rect, task?.done, !!draft]);

  useEffect(() => {
    const down = (e) => !ref.current?.contains(e.target) && !e.target.closest?.('.cal-ev') && onClose();
    const key = (e) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      onClose();
    };
    document.addEventListener('mousedown', down);
    window.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('mousedown', down);
      window.removeEventListener('keydown', key, true);
    };
  }, [onClose]);

  if (!task) return null;
  const d = parseKey(task.date);
  const hm = (min) => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;
  let end = evEnd;
  // own tasks: the end follows the task's length, so edits show at once
  if (!item.ext && task.time) end = toMin(task.time) + (task.duration || 30);
  const when = `${WD_FULL[d.getDay()]}, ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}` + (task.time ? `, ${task.time}${end ? ' — ' + hm(end) : ''}` : ', весь день');
  const project = !item.ext && data.projects.find((p) => p.id === task.projectId);
  const calName = item.ext ? task.calName : taskCalendarName(task, data.tasks, data.projects) || (areaOf(task, data.projects) === 'work' ? 'Работа' : 'Личное');
  const repeat = !item.ext && task.repeat && REPEATS.find((r) => r[0] === task.repeat)?.[1];
  const edit = () => {
    onClose();
    ui.openTask(task.id);
  };
  const duplicate = () => {
    const { id, createdAt, order, doneAt, seed, ...rest } = task;
    const copy = addTask({ ...rest, done: false });
    onClose();
    ui.openTask(copy.id);
  };
  const save = () => {
    updateTask(task.id, draft);
    setDraft(null);
    ui.toast('Сохранено');
  };
  // on a phone the card slides down to close, like a sheet
  const touch = {
    onTouchStart: (e) => {
      if (window.innerWidth > 600 || e.target.closest('input')) return;
      swipe.current = { y: e.touches[0].clientY, dy: 0 };
      ref.current.style.transition = 'none';
    },
    onTouchMove: (e) => {
      const s = swipe.current;
      if (!s) return;
      s.dy = Math.max(0, e.touches[0].clientY - s.y);
      ref.current.style.transform = `translateY(${s.dy}px)`;
    },
    onTouchEnd: () => {
      const s = swipe.current;
      swipe.current = null;
      if (!s) return;
      ref.current.style.transition = '';
      if (s.dy > 80) return onClose();
      ref.current.style.transform = '';
    },
  };
  const remove = () => {
    deleteTask(task.id);
    onClose();
    ui.toast('Задача перемещена в корзину', { label: 'Отменить', fn: () => restoreTask(task.id) });
  };

  return (
    <div className="ev-card" ref={ref} style={pos} role="dialog" {...touch}>
      <i className="ev-card-grip" />
      <div className="ev-card-head">
        <h3 className={task.done ? 'done' : ''} onClick={item.ext ? undefined : edit}>
          {task.title}
        </h3>
        {color && <i className="ev-card-dot" style={{ '--ev': color }} />}
        <button className="icon-btn sm" onClick={onClose} aria-label="Закрыть">
          <Icon name="close" size={18} />
        </button>
      </div>
      <dl className="ev-card-rows">
        <dt>Время и дата</dt>
        <dd>
          {item.ext || draft ? (
            when
          ) : (
            <button className="ev-card-when" onClick={() => setDraft({})}>
              {when} <Icon name="edit" size={15} />
            </button>
          )}
        </dd>
        {draft && <WhenEditor task={task} onChange={(p) => setDraft({ ...draft, ...p })} />}
        {draft && (
          <>
            <dt>Тип</dt>
            <dd>
              <AreaToggle value={areaOf(task, data.projects)} onChange={(area) => setDraft({ ...draft, area })} />
            </dd>
          </>
        )}
        {repeat && (
          <>
            <dt>Повтор</dt>
            <dd>{repeat}</dd>
          </>
        )}
        {project && (
          <>
            <dt>Проект</dt>
            <dd>{project.name}</dd>
          </>
        )}
        <dt>Календарь</dt>
        <dd>
          <i className="ev-card-cal" style={{ background: color || 'var(--text3)' }} />
          {calName || 'Без календаря'}
        </dd>
        {task.notes && (
          <>
            <dt>Описание</dt>
            <dd className="ev-card-notes">{task.notes}</dd>
          </>
        )}
      </dl>
      <div className="ev-card-actions">
        {draft ? (
          <>
            <div style={{ flex: 1 }} />
            <button className="ev-card-btn" onClick={() => setDraft(null)}>
              Отмена
            </button>
            <button className="ev-card-btn accent" onClick={save}>
              <Icon name="check" size={18} /> Готово
            </button>
          </>
        ) : item.ext ? (
          <a className="ev-card-btn wide" href={YANDEX_CALENDAR_URL} target="_blank" rel="noreferrer">
            Открыть в Яндекс Календаре
          </a>
        ) : (
          <>
            <button className={'ev-card-btn wide' + (task.done ? '' : ' accent')} onClick={() => toggleTask(task.id)}>
              <Icon name={task.done ? 'restore' : 'check'} size={18} /> {task.done ? 'Вернуть' : 'Выполнено'}
            </button>
            <div style={{ flex: 1 }} />
            <button className="ev-card-btn" onClick={duplicate} title="Дублировать" aria-label="Дублировать">
              <Icon name="copy" size={20} />
            </button>
            <button className="ev-card-btn" onClick={remove} title="Удалить" aria-label="Удалить">
              <Icon name="trash" size={20} />
            </button>
            <button className="ev-card-btn" onClick={edit} title="Редактировать" aria-label="Редактировать">
              <Icon name="edit" size={20} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

