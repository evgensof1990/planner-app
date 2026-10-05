import { useEffect, useRef, useState } from 'react';
import Icon from './icons.jsx';
import { Sheet, SheetHeader, Checkbox, useUi, DateChip } from './components.jsx';
import { useStore, PRIORITY_COLORS, PRIORITY_NAMES } from './store.jsx';
import { MONTHS, WD_MON, addDays, monthGrid, parseKey, pad, relLabel, todayKey } from './date.js';

export const REMIND_OPTIONS = [
  [null, 'Нет'],
  [0, 'Во время'],
  [5, 'За 5 минут'],
  [30, 'За 30 минут'],
  [60, 'За 1 час'],
  [1440, 'За 1 день'],
];
const remindLabel = (v) => (REMIND_OPTIONS.find((o) => o[0] === v) || REMIND_OPTIONS[0])[1];

export const EMOJIS = ['📁', '💼', '🏡', '💡', '💰', '🎯', '📚', '🏋️', '🚗', '✈️', '🛒', '❤️', '🧘', '🎨', '🧑‍💻', '📈', '🏝️', '⚠️', '🇬🇧', '🍎', '🥗', '🌙', '🔥', '⭐', '🎵', '🐶', '👶', '🛠️', '📝', '✅'];
export const COLORS = ['#a984f0', '#5cc97b', '#4fc3f7', '#f5b83d', '#f0574f', '#f78fb3', '#4f8ff7', '#9e9e9e'];

/* ---------------- Quick add ---------------- */
export function QuickAdd({ defaults = {}, onClose }) {
  const { data, addTask } = useStore();
  const ui = useUi();
  const [title, setTitle] = useState('');
  const [f, setF] = useState({ date: null, time: null, remind: null, projectId: null, sectionId: null, priority: 0, tags: [], parentId: null, ...defaults });
  const inp = useRef();
  useEffect(() => {
    setTimeout(() => inp.current?.focus(), 60);
  }, []);
  const project = data.projects.find((p) => p.id === f.projectId);
  // refocus the input after a nested sheet closes so Enter keeps working
  const setFF = (v) => {
    setF(v);
    setTimeout(() => inp.current?.focus(), 80);
  };
  const submit = () => {
    if (!title.trim()) return;
    addTask({ ...f, title: title.trim() });
    setTitle('');
    ui.toast('Задача добавлена');
    inp.current?.focus();
  };
  return (
    <Sheet onClose={onClose} className="quick-add">
      <div className="qa-row">
        <input
          ref={inp}
          className="qa-input"
          placeholder="Новая задача"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        <button
          className="icon-btn"
          title="Открыть полностью"
          onClick={() => {
            const t = addTask({ ...f, title: title.trim() });
            onClose();
            ui.openTask(t.id);
          }}
        >
          <Icon name="expand" size={20} />
        </button>
      </div>
      <div className="qa-chips">
        {f.date && (
          <span className="chip accent">
            {relLabel(f.date)}
            <button onClick={() => setF({ ...f, date: null, time: null })}>
              <Icon name="close" size={14} />
            </button>
          </span>
        )}
        {f.time ? (
          <span className="chip accent">
            {f.time}
            <button onClick={() => setF({ ...f, time: null })}>
              <Icon name="close" size={14} />
            </button>
          </span>
        ) : (
          <button className="chip ghost" onClick={() => ui.openDate(f, (v) => setFF({ ...f, ...v }), true)}>
            Время
          </button>
        )}
        {f.priority > 0 && (
          <span className="chip" style={{ color: PRIORITY_COLORS[f.priority] }}>
            <Icon name="flag" size={14} /> {PRIORITY_NAMES[f.priority]}
          </span>
        )}
        {f.tags.map((id) => {
          const t = data.tags.find((x) => x.id === id);
          return t ? (
            <span key={id} className="chip">
              #{t.name}
            </span>
          ) : null;
        })}
      </div>
      <div className="qa-tools">
        <button className="icon-btn" onClick={() => ui.openDate(f, (v) => setFF({ ...f, ...v }))} style={f.date ? { color: 'var(--accent)' } : undefined}>
          <Icon name="calendar" />
        </button>
        <button className="icon-btn" onClick={() => ui.openTags(f.tags, (tags) => setFF({ ...f, tags }))}>
          <Icon name="tag" />
        </button>
        <button
          className="icon-btn"
          style={{ color: PRIORITY_COLORS[f.priority] || undefined }}
          onClick={(e) =>
            ui.menu(
              e.currentTarget,
              [3, 2, 1, 0].map((p) => ({ icon: 'flag', color: PRIORITY_COLORS[p] || 'var(--text2)', label: PRIORITY_NAMES[p], active: f.priority === p, onClick: () => setF({ ...f, priority: p }) }))
            )
          }
        >
          <Icon name="flag" />
        </button>
        <button className="qa-project" onClick={() => ui.openProjectPicker(f.projectId, (projectId, sectionId) => setFF({ ...f, projectId, sectionId }))}>
          {project ? <span>{project.emoji}</span> : <Icon name="noProject" size={18} />}
          <span>{project ? project.name : 'Без проекта'}</span>
        </button>
        <div style={{ flex: 1 }} />
        <button className={'send-btn' + (title.trim() ? ' on' : '')} onClick={submit}>
          <Icon name="send" size={20} />
        </button>
      </div>
    </Sheet>
  );
}

/* ---------------- Date & time ---------------- */
export function MonthCalendar({ value, onPick, marks }) {
  const base = value ? parseKey(value) : new Date();
  const [ym, setYm] = useState([base.getFullYear(), base.getMonth()]);
  const cells = monthGrid(ym[0], ym[1]);
  const t = todayKey();
  const shift = (n) => {
    const d = new Date(ym[0], ym[1] + n, 1);
    setYm([d.getFullYear(), d.getMonth()]);
  };
  return (
    <div className="mcal">
      <div className="mcal-head">
        <button className="icon-btn sm" onClick={() => shift(-1)}>
          <Icon name="chevL" size={18} />
        </button>
        <span>
          {MONTHS[ym[1]]} {ym[0]} г.
        </span>
        <button className="icon-btn sm" onClick={() => shift(1)}>
          <Icon name="chevR" size={18} />
        </button>
      </div>
      <div className="mcal-grid">
        {WD_MON.map((w) => (
          <div key={w} className="mcal-wd">
            {w}
          </div>
        ))}
        {cells.map((k, i) =>
          k ? (
            <button key={i} className={'mcal-day' + (k === value ? ' sel' : '') + (k === t ? ' today' : '')} onClick={() => onPick(k)}>
              {parseKey(k).getDate()}
              {marks?.has(k) && <i />}
            </button>
          ) : (
            <span key={i} />
          )
        )}
      </div>
    </div>
  );
}

function TimePicker({ value, onChange }) {
  const [h, m] = (value || '09:00').split(':').map(Number);
  const [mode, setMode] = useState('h');
  const R = 104;
  const set = (hh, mm) => onChange(`${pad(hh)}:${pad(mm)}`);
  const items =
    mode === 'h'
      ? [...Array(24).keys()].map((v) => ({ v, r: v < 12 ? R : 66, a: (v % 12) * 30, label: v === 0 ? '00' : String(v) }))
      : [...Array(12).keys()].map((i) => ({ v: i * 5, r: R, a: i * 30, label: pad(i * 5) }));
  const cur = mode === 'h' ? h : m;
  const sel = items.find((it) => it.v === cur) || (mode === 'm' ? { r: R, a: m * 6 } : null);
  return (
    <div className="tp">
      <div className="tp-boxes">
        <button className={'tp-box' + (mode === 'h' ? ' on' : '')} onClick={() => setMode('h')}>
          {pad(h)}
        </button>
        <span className="tp-colon">:</span>
        <button className={'tp-box' + (mode === 'm' ? ' on' : '')} onClick={() => setMode('m')}>
          {pad(m)}
        </button>
      </div>
      <div className="tp-face">
        {sel && (
          <div className="tp-hand" style={{ height: sel.r, transform: `rotate(${sel.a}deg)` }}>
            <span />
          </div>
        )}
        <div className="tp-center" />
        {items.map((it) => {
          const rad = ((it.a - 90) * Math.PI) / 180;
          return (
            <button
              key={it.v}
              className={'tp-num' + (it.v === cur ? ' on' : '') + (it.r < R ? ' inner' : '')}
              style={{ left: 130 + it.r * Math.cos(rad), top: 130 + it.r * Math.sin(rad) }}
              onClick={() => {
                if (mode === 'h') {
                  set(it.v, m);
                  setMode('m');
                } else set(h, it.v);
              }}
            >
              {it.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DateSheet({ value, onSave, onClose, timeFirst }) {
  const [v, setV] = useState({ date: value.date || null, time: value.time || null, remind: value.remind ?? null });
  const [timeOpen, setTimeOpen] = useState(!!timeFirst);
  const t = todayKey();
  const quick = [
    ['star', 'Сегодня', () => setV({ ...v, date: t })],
    ['moon', 'Вечером', () => setV({ ...v, date: t, time: '18:00' })],
    ['sun', 'Завтра', () => setV({ ...v, date: addDays(t, 1) })],
    ['someday', 'Когда-нибудь', () => setV({ date: null, time: null, remind: null })],
  ];
  const activeQuick = !v.date ? 3 : v.date === t && v.time === '18:00' ? 1 : v.date === t ? 0 : v.date === addDays(t, 1) ? 2 : -1;
  const save = () => {
    onSave(v);
    onClose();
  };
  if (timeOpen) {
    return (
      <Sheet onClose={onClose}>
        <div className="sheet-title center">Время</div>
        <TimePicker value={v.time} onChange={(time) => setV({ ...v, time, date: v.date || t })} />
        <div className="sheet-actions">
          <button className="btn" onClick={() => (timeFirst ? onClose() : setTimeOpen(false))}>
            Отменить
          </button>
          <button
            className="btn primary"
            onClick={() => {
              const nv = { ...v, time: v.time || '09:00', date: v.date || t };
              if (timeFirst) {
                onSave(nv);
                onClose();
              } else {
                setV(nv);
                setTimeOpen(false);
              }
            }}
          >
            Сохранить
          </button>
        </div>
      </Sheet>
    );
  }
  return (
    <Sheet onClose={onClose}>
      <SheetHeader title="Дата и время" onClose={onClose} onOk={save} />
      <div className="quick-dates">
        {quick.map(([ic, label, fn], i) => (
          <button key={label} className={'qd' + (activeQuick === i ? ' on' : '')} onClick={fn}>
            <Icon name={ic} />
            <span>{label}</span>
          </button>
        ))}
      </div>
      <MonthCalendar value={v.date} onPick={(date) => setV({ ...v, date })} />
      <div className="rows">
        {v.date && (
          <button className="row-btn boxed" onClick={() => setV({ date: null, time: null, remind: null })}>
            <span>Сбросить дату</span>
            <Icon name="close" size={18} />
          </button>
        )}
        <div className="row-btn" onClick={() => setTimeOpen(true)}>
          <Icon name="clock" size={20} />
          <span>Время</span>
          {v.time && (
            <span className="chip sm">
              {v.time}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setV({ ...v, time: null, remind: null });
                }}
              >
                <Icon name="close" size={12} />
              </button>
            </span>
          )}
        </div>
        <div
          className={'row-btn' + (v.time ? '' : ' disabled')}
          onClick={() => {
            if (!v.time) return;
            const i = REMIND_OPTIONS.findIndex((o) => o[0] === v.remind);
            setV({ ...v, remind: REMIND_OPTIONS[(i + 1) % REMIND_OPTIONS.length][0] });
          }}
        >
          <Icon name="bell" size={20} />
          <span>Напомнить</span>
          {v.time && v.remind !== null && <span className="chip sm">{remindLabel(v.remind)}</span>}
        </div>
      </div>
      <div className="sheet-actions">
        <button className="btn" onClick={onClose}>
          Отменить
        </button>
        <button className="btn primary" onClick={save}>
          Сохранить
        </button>
      </div>
    </Sheet>
  );
}

/* ---------------- Project picker ---------------- */
export function ProjectPicker({ value, onPick, onClose }) {
  const { data, addProject } = useStore();
  const ui = useUi();
  const [q, setQ] = useState('');
  const list = data.projects.filter((p) => !p.archived && p.name.toLowerCase().includes(q.toLowerCase()));
  const pick = (pid, sid = null) => {
    onPick(pid, sid);
    onClose();
  };
  return (
    <Sheet onClose={onClose}>
      <SheetHeader title="Перенести в" onClose={onClose} />
      <div className="search-box">
        <Icon name="search" size={18} />
        <input placeholder="Начать поиск по проектам" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="pick-list">
        <button
          className="pick accent"
          onClick={() => {
            if (q.trim()) pick(addProject({ name: q.trim() }).id);
            else ui.prompt({ title: 'Новый проект', placeholder: 'Название проекта', onSave: (name) => pick(addProject({ name }).id) });
          }}
        >
          <Icon name="plus" size={20} /> {q.trim() ? `Создать «${q.trim()}»` : 'Добавить проект'}
        </button>
        <button className={'pick' + (!value ? ' on' : '')} onClick={() => pick(null)}>
          <Icon name="inbox" size={20} /> Входящие
        </button>
        <div className="pick-label">Мои проекты</div>
        {list.map((p) => (
          <div key={p.id}>
            <button className={'pick' + (value === p.id ? ' on' : '')} onClick={() => pick(p.id)}>
              <span className="emoji">{p.emoji}</span> {p.name}
            </button>
            {p.sections.map((s) => (
              <button key={s.id} className="pick sub" onClick={() => pick(p.id, s.id)}>
                <Icon name="layers" size={16} /> {s.name}
              </button>
            ))}
          </div>
        ))}
      </div>
    </Sheet>
  );
}

/* ---------------- Tags ---------------- */
export function TagPicker({ value, onPick, onClose }) {
  const { data, addTag } = useStore();
  const [sel, setSel] = useState(value || []);
  const [q, setQ] = useState('');
  const list = data.tags.filter((t) => t.name.toLowerCase().includes(q.toLowerCase()));
  const create = () => {
    const name = q.trim().replace(/^#/, '');
    if (!name) return;
    const t = addTag(name);
    setSel([...sel, t.id]);
    setQ('');
  };
  return (
    <Sheet onClose={onClose}>
      <SheetHeader
        title="Теги"
        onClose={onClose}
        onOk={() => {
          onPick(sel);
          onClose();
        }}
      />
      <div className="search-box">
        <Icon name="tag" size={18} />
        <input placeholder="Найти или создать тег" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} />
      </div>
      <div className="pick-list">
        {list.length === 0 && !q && <div className="hint">Таких тегов не найдено, но вы можете добавить его прямо сейчас</div>}
        {list.map((t) => (
          <button key={t.id} className="pick" onClick={() => setSel(sel.includes(t.id) ? sel.filter((x) => x !== t.id) : [...sel, t.id])}>
            <Icon name="tag" size={18} /> {t.name}
            <span style={{ flex: 1 }} />
            {sel.includes(t.id) && <Icon name="check" size={18} style={{ color: 'var(--accent)' }} />}
          </button>
        ))}
        <button className="pick accent" onClick={() => (q.trim() ? create() : setQ('#'))}>
          <Icon name="plus" size={20} /> {q.trim() ? `Добавить тег «${q.trim().replace(/^#/, '')}»` : 'Добавить тег'}
        </button>
      </div>
    </Sheet>
  );
}

/* ---------------- Confirm ---------------- */
export function ConfirmSheet({ text, onYes, okLabel = 'Удалить', onClose }) {
  return (
    <Sheet onClose={onClose}>
      <div className="confirm-text">{text}</div>
      <div className="sheet-actions">
        <button className="btn" onClick={onClose}>
          Отменить
        </button>
        <button
          className={'btn ' + (okLabel === 'Удалить' || okLabel === 'Очистить' ? 'danger-fill' : 'primary')}
          onClick={() => {
            onClose();
            onYes();
          }}
        >
          {okLabel}
        </button>
      </div>
    </Sheet>
  );
}

/* ---------------- Prompt ---------------- */
export function PromptSheet({ title, value = '', placeholder, onSave, onClose }) {
  const [v, setV] = useState(value);
  const ok = () => {
    if (v.trim()) onSave(v.trim());
    onClose();
  };
  return (
    <Sheet onClose={onClose}>
      <SheetHeader title={title} onClose={onClose} onOk={ok} />
      <div className="pad">
        <input className="field" autoFocus value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ok()} />
      </div>
    </Sheet>
  );
}

/* ---------------- Project edit ---------------- */
export function ProjectEdit({ project, onClose }) {
  const { addProject, updateProject } = useStore();
  const ui = useUi();
  const [f, setF] = useState(project || { name: '', emoji: '📁', description: '' });
  const ok = () => {
    if (!f.name.trim()) return;
    if (project) updateProject(project.id, { name: f.name.trim(), emoji: f.emoji, description: f.description });
    else {
      const p = addProject({ name: f.name.trim(), emoji: f.emoji, description: f.description });
      ui.go({ view: 'project', id: p.id });
    }
    onClose();
  };
  return (
    <Sheet onClose={onClose}>
      <SheetHeader title={project ? 'Редактировать проект' : 'Новый проект'} onClose={onClose} onOk={ok} />
      <div className="pad">
        <div className="field-row">
          <span className="emoji big">{f.emoji}</span>
          <input className="field" autoFocus placeholder="Название" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </div>
        <input className="field" placeholder="Цель или описание (необязательно)" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <div className="emoji-grid">
          {EMOJIS.map((e) => (
            <button key={e} className={f.emoji === e ? 'on' : ''} onClick={() => setF({ ...f, emoji: e })}>
              {e}
            </button>
          ))}
        </div>
      </div>
      <div className="sheet-actions">
        <button className="btn" onClick={onClose}>
          Отменить
        </button>
        <button className="btn primary" onClick={ok}>
          Сохранить
        </button>
      </div>
    </Sheet>
  );
}

/* ---------------- Habit edit ---------------- */
export function HabitEdit({ habit, onClose }) {
  const { addHabit, updateHabit, deleteHabit } = useStore();
  const ui = useUi();
  const [f, setF] = useState(habit || { name: '', emoji: '✅', color: COLORS[0] });
  const ok = () => {
    if (!f.name.trim()) return;
    if (habit) updateHabit(habit.id, { name: f.name.trim(), emoji: f.emoji, color: f.color });
    else addHabit({ name: f.name.trim(), emoji: f.emoji, color: f.color });
    onClose();
  };
  return (
    <Sheet onClose={onClose}>
      <SheetHeader title={habit ? 'Привычка' : 'Новая привычка'} onClose={onClose} onOk={ok} />
      <div className="pad">
        <div className="field-row">
          <span className="emoji big">{f.emoji}</span>
          <input className="field" autoFocus placeholder="Например: Читать 20 минут" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </div>
        <div className="color-row">
          {COLORS.map((c) => (
            <button key={c} className={f.color === c ? 'on' : ''} style={{ background: c }} onClick={() => setF({ ...f, color: c })} />
          ))}
        </div>
        <div className="emoji-grid">
          {EMOJIS.map((e) => (
            <button key={e} className={f.emoji === e ? 'on' : ''} onClick={() => setF({ ...f, emoji: e })}>
              {e}
            </button>
          ))}
        </div>
      </div>
      <div className="sheet-actions">
        {habit ? (
          <button
            className="btn danger"
            onClick={() => {
              ui.confirm('Удалить привычку?', () => {
                deleteHabit(habit.id);
                onClose();
              });
            }}
          >
            Удалить
          </button>
        ) : (
          <button className="btn" onClick={onClose}>
            Отменить
          </button>
        )}
        <button className="btn primary" onClick={ok}>
          Сохранить
        </button>
      </div>
    </Sheet>
  );
}

/* ---------------- Task detail ---------------- */
function AutoText({ value, onChange, className, placeholder }) {
  const ref = useRef();
  useEffect(() => {
    const el = ref.current;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, [value]);
  return <textarea ref={ref} rows={1} className={className} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />;
}

export function TaskDetail({ id, onClose }) {
  const { data, updateTask, toggleTask, deleteTask, addTask, restoreTask } = useStore();
  const ui = useUi();
  const task = data.tasks.find((t) => t.id === id);
  const [newSub, setNewSub] = useState('');
  if (!task) return null;
  const project = data.projects.find((p) => p.id === task.projectId);
  const section = project?.sections.find((s) => s.id === task.sectionId);
  const subs = data.tasks.filter((t) => t.parentId === id && !t.deleted).sort((a, b) => a.order - b.order);
  const parent = task.parentId && data.tasks.find((t) => t.id === task.parentId);
  const up = (p) => updateTask(id, p);
  const addSub = () => {
    if (!newSub.trim()) return;
    addTask({ title: newSub.trim(), parentId: id, projectId: task.projectId, sectionId: task.sectionId });
    setNewSub('');
  };
  return (
    <Sheet onClose={onClose} full>
      <div className="detail-top">
        <button className="icon-btn" onClick={onClose}>
          <Icon name="chevL" />
        </button>
        <Checkbox checked={task.done} priority={task.priority} onChange={() => toggleTask(id)} />
        {task.date ? (
          <DateChip task={task} onClick={() => ui.openDate(task, (v) => up(v))} />
        ) : (
          <button className="chip ghost" onClick={() => ui.openDate(task, (v) => up(v))}>
            <Icon name="calendar" size={15} /> Дата
          </button>
        )}
        <div style={{ flex: 1 }} />
        <button
          className="icon-btn"
          style={{ color: PRIORITY_COLORS[task.priority] || undefined }}
          onClick={(e) =>
            ui.menu(
              e.currentTarget,
              [3, 2, 1, 0].map((p) => ({ icon: 'flag', color: PRIORITY_COLORS[p] || 'var(--text2)', label: PRIORITY_NAMES[p], active: task.priority === p, onClick: () => up({ priority: p }) }))
            )
          }
        >
          <Icon name="flag" />
        </button>
        <button
          className="icon-btn"
          onClick={(e) =>
            ui.menu(e.currentTarget, [
              { icon: 'tag', label: 'Теги', onClick: () => ui.openTags(task.tags, (tags) => up({ tags })) },
              { icon: 'noProject', label: 'Перенести в…', onClick: () => ui.openProjectPicker(task.projectId, (projectId, sectionId) => up({ projectId, sectionId })) },
              { divider: true },
              task.deleted
                ? { icon: 'restore', label: 'Восстановить', onClick: () => restoreTask(id) }
                : {
                    icon: 'trash',
                    label: 'Удалить',
                    danger: true,
                    onClick: () => {
                      deleteTask(id);
                      onClose();
                      ui.toast('Задача перемещена в корзину', { label: 'Отменить', fn: () => restoreTask(id) });
                    },
                  },
            ])
          }
        >
          <Icon name="more" />
        </button>
      </div>
      <div className="detail-body">
        {parent && (
          <button className="parent-link" onClick={() => ui.openTask(parent.id)}>
            <Icon name="chevL" size={14} /> {parent.title}
          </button>
        )}
        <AutoText className={'detail-title' + (task.done ? ' done' : '')} placeholder="Что нужно сделать?" value={task.title} onChange={(title) => up({ title })} />
        <AutoText className="detail-notes" placeholder="Описание" value={task.notes} onChange={(notes) => up({ notes })} />
        {task.tags.length > 0 && (
          <div className="tag-row">
            {task.tags.map((tid) => {
              const t = data.tags.find((x) => x.id === tid);
              return t ? (
                <button key={tid} className="chip" onClick={() => ui.openTags(task.tags, (tags) => up({ tags }))}>
                  #{t.name}
                </button>
              ) : null;
            })}
          </div>
        )}
        <div className="subtasks">
          {subs.map((s) => (
            <div key={s.id} className={'sub-row' + (s.done ? ' done' : '')}>
              <Checkbox checked={s.done} onChange={() => toggleTask(s.id)} />
              <input value={s.title} onChange={(e) => updateTask(s.id, { title: e.target.value })} />
              <button className="icon-btn sm" onClick={() => ui.openTask(s.id)}>
                <Icon name="open" size={16} />
              </button>
            </div>
          ))}
          <div className="sub-row add">
            <Icon name="plus" size={18} />
            <input placeholder="Добавить подзадачу" value={newSub} onChange={(e) => setNewSub(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addSub()} onBlur={addSub} />
          </div>
        </div>
        {task.time && task.remind !== null && (
          <div className="detail-info">
            <Icon name="bell" size={16} /> Напоминание: {remindLabel(task.remind).toLowerCase()}
          </div>
        )}
      </div>
      <div className="detail-bottom">
        <button className="qa-project" onClick={() => ui.openProjectPicker(task.projectId, (projectId, sectionId) => up({ projectId, sectionId }))}>
          {project ? <span>{project.emoji}</span> : <Icon name="inbox" size={18} />}
          <span>
            {project ? project.name : 'Входящие'}
            {section ? ' / ' + section.name : ''}
          </span>
          <Icon name="chevD" size={16} />
        </button>
        <div style={{ flex: 1 }} />
        <button className="icon-btn" onClick={() => ui.openTags(task.tags, (tags) => up({ tags }))}>
          <Icon name="tag" />
        </button>
      </div>
    </Sheet>
  );
}
