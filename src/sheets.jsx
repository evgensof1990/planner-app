import { useEffect, useRef, useState } from 'react';
import Icon from './icons.jsx';
import { Sheet, SheetHeader, Checkbox, useUi, DateChip, AreaToggle } from './components.jsx';
import { useStore, PRIORITY_COLORS, PRIORITY_NAMES } from './store.jsx';
import { MONTHS, WD_MON, REPEATS, addDays, monthGrid, parseKey, pad, relLabel, todayKey } from './date.js';
import { parseQuick } from './quickparse.js';
import { suggestSlots, slotLabel, areaOf, DEFAULT_DURATION } from './scheduler.js';
import { busyEvents } from './ical.js';
import { voiceAvailable, startRecording, recognize } from './voice.js';
import { parseItems, mkItem, itemsOf, progress } from './checklist.js';

export const REMIND_OPTIONS = [
  [null, 'Нет'],
  [0, 'Во время'],
  [5, 'За 5 минут'],
  [30, 'За 30 минут'],
  [60, 'За 1 час'],
  [1440, 'За 1 день'],
];
const remindLabel = (v) => (REMIND_OPTIONS.find((o) => o[0] === v) || REMIND_OPTIONS[0])[1];
export const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240];
export const durLabel = (m) => (m < 60 ? `${m} мин` : `${Math.floor(m / 60)} ч${m % 60 ? ` ${m % 60} мин` : ''}`);

export const EMOJIS = ['📁', '💼', '🏡', '💡', '💰', '🎯', '📚', '🏋️', '🚗', '✈️', '🛒', '❤️', '🧘', '🎨', '🧑‍💻', '📈', '🏝️', '⚠️', '🇬🇧', '🍎', '🥗', '🌙', '🔥', '⭐', '🎵', '🐶', '👶', '🛠️', '📝', '✅'];
export const COLORS = ['#a984f0', '#5cc97b', '#4fc3f7', '#f5b83d', '#f0574f', '#f78fb3', '#4f8ff7', '#9e9e9e'];

/* ---------------- Quick add ---------------- */
export function QuickAdd({ defaults = {}, onClose }) {
  const { data, addTask, addTag } = useStore();
  const ui = useUi();
  const [title, setTitle] = useState('');
  const [f, setF] = useState({ date: null, time: null, remind: null, projectId: null, sectionId: null, priority: 0, tags: [], parentId: null, ...defaults });
  const inp = useRef();
  useEffect(() => {
    setTimeout(() => inp.current?.focus(), 60);
  }, []);
  const [rec, setRec] = useState(null); // {stop} while recording, 'busy' while recognising
  const recRef = useRef(null);
  const stopVoice = async () => {
    const r = recRef.current;
    if (!r || r === 'busy') return;
    recRef.current = 'busy';
    setRec('busy');
    try {
      const text = await recognize(await r.stop());
      if (text) setTitle((t) => (t.trim() ? t.trim() + ' ' : '') + text);
      else ui.toast('Ничего не расслышал');
    } catch (e) {
      ui.toast(e.message);
    }
    recRef.current = null;
    setRec(null);
    inp.current?.focus();
  };
  const toggleVoice = async () => {
    if (recRef.current) return stopVoice();
    try {
      const r = await startRecording();
      recRef.current = r;
      setRec(r);
      setTimeout(() => recRef.current === r && stopVoice(), r.maxMs);
    } catch (e) {
      ui.toast('Нет доступа к микрофону');
    }
  };
  useEffect(() => () => recRef.current?.stop?.(), []);
  // what the typed line says: "отчёт до пятницы 2ч #работа"
  const q = parseQuick(title, { projects: data.projects, tags: data.tags });
  const eff = {
    ...f,
    date: q.date || f.date,
    time: q.time || (q.date ? null : f.time),
    deadline: q.deadline || f.deadline || null,
    duration: q.duration || f.duration || null,
    priority: q.priority || f.priority,
    projectId: q.projectId || f.projectId,
    sectionId: q.projectId ? null : f.sectionId,
    tags: [...new Set([...f.tags, ...q.tags])],
  };
  const project = data.projects.find((p) => p.id === eff.projectId);
  // refocus the input after a nested sheet closes so Enter keeps working
  const setFF = (v) => {
    setF(v);
    setTimeout(() => inp.current?.focus(), 80);
  };
  const create = () => {
    const tags = [...eff.tags, ...q.newTags.map((name) => (data.tags.find((t) => t.name === name) || addTag(name)).id)];
    return addTask({ ...eff, tags, title: q.title || title.trim() });
  };
  const submit = (plan) => {
    if (!title.trim()) return;
    const t = create();
    setTitle('');
    // a task with a length or a deadline but no time gets a slot offer right away
    if (!t.time && (plan || t.duration || t.deadline)) ui.suggestTime(t);
    else {
      ui.toast('Задача добавлена');
      inp.current?.focus();
    }
  };
  return (
    <Sheet onClose={onClose} className="quick-add">
      <div className="qa-row">
        <input
          ref={inp}
          className="qa-input"
          placeholder="Например: отчёт до пятницы 2ч #работа"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        {voiceAvailable() && (
          <button className={'icon-btn mic' + (rec ? ' on' : '')} title="Сказать голосом" onClick={toggleVoice} disabled={rec === 'busy'}>
            <Icon name="mic" size={20} />
          </button>
        )}
        <button
          className="icon-btn"
          title="Открыть полностью"
          onClick={() => {
            const t = create();
            onClose();
            ui.openTask(t.id);
          }}
        >
          <Icon name="expand" size={20} />
        </button>
      </div>
      <div className="qa-chips">
        <AreaToggle value={areaOf(eff, data.projects)} onChange={(area) => setFF({ ...f, area })} />
        {eff.date && (
          <span className="chip accent">
            {relLabel(eff.date)}
            {!q.date && (
              <button onClick={() => setF({ ...f, date: null, time: null })}>
                <Icon name="close" size={14} />
              </button>
            )}
          </span>
        )}
        {eff.time ? (
          <span className="chip accent">
            {eff.time}
            {!q.time && (
              <button onClick={() => setF({ ...f, time: null })}>
                <Icon name="close" size={14} />
              </button>
            )}
          </span>
        ) : (
          <>
            <button className="chip ghost" onClick={() => ui.openDate(f, (v) => setFF({ ...f, ...v }), true)}>
              Время
            </button>
            {title.trim() && (
              <button className="chip ghost" onClick={() => submit(true)}>
                <Icon name="clock" size={14} /> Подобрать время
              </button>
            )}
          </>
        )}
        {eff.deadline && <span className="chip accent">до {relLabel(eff.deadline).toLowerCase()}</span>}
        {eff.duration && <span className="chip accent">{durLabel(eff.duration)}</span>}
        {q.projectId && project && (
          <span className="chip accent">
            {project.emoji} {project.name}
          </span>
        )}
        {eff.priority > 0 && (
          <span className="chip" style={{ color: PRIORITY_COLORS[eff.priority] }}>
            <Icon name="flag" size={14} /> {PRIORITY_NAMES[eff.priority]}
          </span>
        )}
        {eff.tags.map((id) => {
          const t = data.tags.find((x) => x.id === id);
          return t ? (
            <span key={id} className="chip">
              #{t.name}
            </span>
          ) : null;
        })}
        {q.newTags.map((name) => (
          <span key={name} className="chip">
            #{name} <small>новый</small>
          </span>
        ))}
      </div>
      <div className="qa-tools">
        <button className="icon-btn" onClick={() => ui.openDate(f, (v) => setFF({ ...f, ...v }))} style={eff.date ? { color: 'var(--accent)' } : undefined}>
          <Icon name="calendar" />
        </button>
        <button className="icon-btn" onClick={() => ui.openTags(f.tags, (tags) => setFF({ ...f, tags }))}>
          <Icon name="tag" />
        </button>
        <button
          className="icon-btn"
          style={{ color: PRIORITY_COLORS[eff.priority] || undefined }}
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
        <button className={'send-btn' + (title.trim() ? ' on' : '')} onClick={() => submit()}>
          <Icon name="send" size={20} />
        </button>
      </div>
    </Sheet>
  );
}

/* ---------------- Time suggestions ---------------- */
// Offers free slots for a task: the best one first, then alternatives; nothing is set until a tap
export function SlotSheet({ task: initial, onClose }) {
  const { data, updateTask } = useStore();
  const ui = useUi();
  const task = data.tasks.find((t) => t.id === initial.id) || initial;
  const [more, setMore] = useState(false);
  const [duration, setDuration] = useState(task.duration || DEFAULT_DURATION);
  const slots = suggestSlots({ ...task, duration }, { tasks: data.tasks, projects: data.projects, events: busyEvents(data.settings.calendars), rules: data.settings.planRules, count: 6 });
  const shown = more ? slots : slots.slice(0, 3);
  const pick = (s) => {
    updateTask(task.id, { date: s.date, time: s.time, duration: s.duration });
    ui.toast('Запланировано: ' + slotLabel(s));
    onClose();
  };
  return (
    <Sheet onClose={onClose}>
      <div className="sheet-title center">Когда сделать?</div>
      <div className="slot-task">{task.title}</div>
      <div className="slot-dur">
        {[15, 30, 60, 90, 120].map((m) => (
          <button key={m} className={'chip' + (m === duration ? ' accent' : ' ghost')} onClick={() => setDuration(m)}>
            {durLabel(m)}
          </button>
        ))}
      </div>
      <div className="rows">
        {!slots.length && <div className="row-btn muted">Свободного окна в ближайшие три недели не нашлось</div>}
        {shown.map((s, i) => (
          <button key={s.date + s.time} className={'row-btn boxed slot' + (i === 0 ? ' best' : '')} onClick={() => pick(s)}>
            <span>
              {slotLabel(s)}
              {s.late && <small className="slot-late"> после дедлайна</small>}
            </span>
            {i === 0 ? <span className="chip sm accent">Лучший</span> : <Icon name="check" size={18} />}
          </button>
        ))}
        {!more && slots.length > 3 && (
          <button className="row-btn muted" onClick={() => setMore(true)}>
            Ещё варианты
          </button>
        )}
      </div>
      <div className="sheet-actions">
        <button className="btn" onClick={onClose}>
          Без времени
        </button>
        <button
          className="btn"
          onClick={() => {
            onClose();
            ui.openDate(task, (v) => updateTask(task.id, { ...v, duration }), true);
          }}
        >
          Выбрать самому
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
export function ConfirmSheet({ text, onYes, okLabel = 'Удалить', alt, onClose }) {
  return (
    <Sheet onClose={onClose}>
      <div className="confirm-text">{text}</div>
      <div className="sheet-actions">
        <button
          className="btn"
          onClick={() => {
            onClose();
            alt?.fn();
          }}
        >
          {alt ? alt.label : 'Отменить'}
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
  const area = f.area || (/работ/i.test(f.name) ? 'work' : 'personal');
  const ok = () => {
    if (!f.name.trim()) return;
    if (project) updateProject(project.id, { name: f.name.trim(), emoji: f.emoji, description: f.description, area });
    else {
      const p = addProject({ name: f.name.trim(), emoji: f.emoji, description: f.description, area });
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
        <div className="seg area-seg">
          {[
            ['personal', 'Личное: утро и вечер'],
            ['work', 'Работа: 10–18 будни'],
          ].map(([k, l]) => (
            <button key={k} className={area === k ? 'on' : ''} onClick={() => setF({ ...f, area: k })}>
              {l}
            </button>
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

/* ---------------- Checklist ---------------- */
function Checklist({ task, onChange, onAllDone, autoFocus }) {
  const ui = useUi();
  const [text, setText] = useState('');
  const items = itemsOf(task);
  const { done, total } = progress(task);
  const set = (next) => {
    onChange(next);
    if (next.length && next.every((i) => i.done) && !items.every((i) => i.done)) onAllDone();
  };
  const add = (raw) => {
    const parsed = parseItems(raw);
    if (!parsed.length) return;
    onChange([...items, ...parsed.map((p) => mkItem(p.title, p.done))]);
    setText('');
  };
  return (
    <div className="checklist">
      <div className="cl-head">
        <Icon name="list" size={16} />
        <span>Чек-лист</span>
        {total > 0 && (
          <span className="cl-count">
            {done} из {total}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button
          className="icon-btn sm"
          aria-label="Действия с чек-листом"
          onClick={(e) =>
            ui.menu(e.currentTarget, [
              done > 0 && { icon: 'reset', label: 'Снять все отметки', onClick: () => onChange(items.map((i) => ({ ...i, done: false }))) },
              done > 0 && { icon: 'check', label: 'Убрать отмеченные', onClick: () => onChange(items.filter((i) => !i.done)) },
              { icon: 'trash', label: 'Удалить чек-лист', danger: true, onClick: () => ui.confirm('Удалить чек-лист?', () => onChange(null)) },
            ])
          }
        >
          <Icon name="more" size={18} />
        </button>
      </div>
      {total > 0 && (
        <div className="cl-bar">
          <div style={{ width: (done / total) * 100 + '%' }} />
        </div>
      )}
      {items.map((it) => (
        <div key={it.id} className={'sub-row cl-row' + (it.done ? ' done' : '')}>
          <Checkbox quiet checked={it.done} onChange={() => set(items.map((i) => (i.id === it.id ? { ...i, done: !i.done } : i)))} />
          <input value={it.title} onChange={(e) => onChange(items.map((i) => (i.id === it.id ? { ...i, title: e.target.value } : i)))} onBlur={(e) => !e.target.value.trim() && onChange(items.filter((i) => i.id !== it.id))} />
          <button className="icon-btn sm" aria-label="Удалить пункт" onClick={() => onChange(items.filter((i) => i.id !== it.id))}>
            <Icon name="close" size={16} />
          </button>
        </div>
      ))}
      <div className="sub-row add">
        <Icon name="plus" size={18} />
        <input
          autoFocus={autoFocus}
          placeholder={total ? 'Добавить пункт' : 'Пункт или вставьте список'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add(text)}
          onBlur={() => add(text)}
          onPaste={(e) => {
            // a pasted list becomes one item per line
            const pasted = e.clipboardData?.getData('text') || '';
            if (/\n/.test(pasted.trim())) {
              e.preventDefault();
              add(text + pasted);
            }
          }}
        />
      </div>
    </div>
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
  const [clOpen, setClOpen] = useState(false);
  if (!task) return null;
  const hasCl = Array.isArray(task.checklist);
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
        {!task.deleted && (
          <button
            className="icon-btn"
            aria-label="Удалить"
            onClick={() => {
              deleteTask(id);
              onClose();
              ui.toast('Задача перемещена в корзину', { label: 'Отменить', fn: () => restoreTask(id) });
            }}
          >
            <Icon name="trash" />
          </button>
        )}
        <button
          className="icon-btn"
          onClick={(e) =>
            ui.menu(e.currentTarget, [
              { icon: 'clock', label: 'Подобрать время', onClick: () => ui.suggestTime(task) },
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
        {(hasCl || clOpen) && (
          <Checklist
            task={task}
            autoFocus={clOpen && !itemsOf(task).length}
            onChange={(checklist) => {
              if (checklist === null) setClOpen(false);
              up({ checklist: checklist || undefined });
            }}
            onAllDone={() => !task.done && ui.toast('Всё отмечено', { label: 'Завершить задачу', fn: () => toggleTask(id) })}
          />
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
        <div className="plan-row">
          {!hasCl && !clOpen && (
            <button className="chip ghost" onClick={() => setClOpen(true)}>
              <Icon name="list" size={14} /> Чек-лист
            </button>
          )}
          {project?.description?.trim() && !task.parentId && (
            // a quarter result of a goal: its steps are subtasks with a date
            <button className="chip accent" onClick={() => ui.quickAdd({ parentId: id, projectId: task.projectId, sectionId: task.sectionId, date: todayKey() })}>
              <Icon name="plus" size={14} /> Шаг
            </button>
          )}
          <button
            className="chip ghost"
            onClick={(e) => ui.menu(e.currentTarget, DURATIONS.map((m) => ({ icon: 'timer', label: durLabel(m), active: (task.duration || DEFAULT_DURATION) === m, onClick: () => up({ duration: m }) })))}
          >
            <Icon name="timer" size={14} /> {durLabel(task.duration || DEFAULT_DURATION)}
          </button>
          {task.deadline ? (
            <span className="chip accent">
              <span onClick={() => ui.openDate({ date: task.deadline }, (v) => up({ deadline: v.date }))}>Дедлайн: {relLabel(task.deadline).toLowerCase()}</span>
              <button onClick={() => up({ deadline: null })}>
                <Icon name="close" size={14} />
              </button>
            </span>
          ) : (
            <button className="chip ghost" onClick={() => ui.openDate({ date: null }, (v) => up({ deadline: v.date }))}>
              <Icon name="flag" size={14} /> Дедлайн
            </button>
          )}
          <button
            className={'chip ' + (task.repeat ? 'accent' : 'ghost')}
            onClick={(e) => ui.menu(e.currentTarget, REPEATS.map(([k, l]) => ({ icon: 'reset', label: l, active: (task.repeat || null) === k, onClick: () => up({ repeat: k, date: task.date || (k ? todayKey() : null) }) })))}
          >
            <Icon name="reset" size={14} /> {task.repeat ? REPEATS.find((r) => r[0] === task.repeat)[1] : 'Повтор'}
          </button>
          {!task.time && !task.done && (
            <button className="chip ghost" onClick={() => ui.suggestTime(task)}>
              <Icon name="clock" size={14} /> Подобрать время
            </button>
          )}
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
        <AreaToggle
          value={areaOf(task, data.projects)}
          onChange={(area) => {
            up({ area });
            ui.toast(area === 'work' ? 'Задача рабочая: календарь «рабочее»' : 'Задача личная: календарь «личное»');
          }}
        />
        <div style={{ flex: 1 }} />
        <button className="icon-btn" onClick={() => ui.openTags(task.tags, (tags) => up({ tags }))}>
          <Icon name="tag" />
        </button>
      </div>
    </Sheet>
  );
}
