import { useEffect, useRef, useState } from 'react';
import Icon from './icons.jsx';
import { useUi } from './components.jsx';
import { useStore } from './store.jsx';
import { addDays, parseKey, relLabel, todayKey, WD } from './date.js';
import { parseQuick } from './quickparse.js';
import { MonthCalendar } from './sheets.jsx';

const TIMES = ['09:00', '12:00', '15:00', '18:00', '20:00'];

// days until the next given weekday (0 = Sun), never today
const nextWd = (t, wd) => addDays(t, ((wd - parseKey(t).getDay() + 7) % 7) || 7);

// Desktop toolbar: one line to add a task, with a calm popover for picking the day and time
export function QuickBar({ defaults = {} }) {
  const { data, addTask, addTag } = useStore();
  const ui = useUi();
  const [title, setTitle] = useState('');
  const [open, setOpen] = useState(false);
  const [cal, setCal] = useState(false);
  const [pick, setPick] = useState({ date: undefined, time: null });
  const box = useRef();
  const inp = useRef();
  const t = todayKey();

  useEffect(() => {
    if (!open) return;
    const off = (e) => box.current && !box.current.contains(e.target) && close();
    document.addEventListener('mousedown', off);
    return () => document.removeEventListener('mousedown', off);
  }, [open]);

  const close = () => {
    setOpen(false);
    setCal(false);
  };

  // what the text says wins over the pills: "созвон завтра в 15"
  const q = parseQuick(title, { projects: data.projects, tags: data.tags });
  const baseDate = pick.date === undefined ? defaults.date || null : pick.date;
  const date = q.date || baseDate;
  const time = q.time || (q.date ? null : pick.time);
  const fromText = !!(q.date || q.time);

  const setDate = (d) => {
    setPick((p) => ({ ...p, date: d, time: d ? p.time : null }));
    setCal(false);
    inp.current?.focus();
  };
  const setTime = (tm) => {
    setPick((p) => ({ date: tm && !(p.date === undefined ? defaults.date : p.date) ? t : p.date, time: tm }));
    inp.current?.focus();
  };

  const submit = () => {
    const raw = title.trim();
    if (!raw) return;
    const tags = [...new Set([...(defaults.tags || []), ...q.tags, ...q.newTags.map((name) => (data.tags.find((x) => x.name === name) || addTag(name)).id)])];
    addTask({
      ...defaults,
      title: q.title || raw,
      date: date || null,
      time: date ? time || null : null,
      deadline: q.deadline || null,
      duration: q.duration || null,
      priority: q.priority || 0,
      projectId: q.projectId || defaults.projectId || null,
      sectionId: q.projectId ? null : defaults.sectionId || null,
      repeat: q.repeat || null,
      tags,
    });
    ui.toast(`Задача добавлена${date ? ' · ' + relLabel(date).toLowerCase() : ''}${date && time ? ' в ' + time : ''}`);
    setTitle('');
    setPick((p) => ({ ...p, time: null }));
  };

  const onKey = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation?.();
      if (title) setTitle('');
      else {
        close();
        inp.current?.blur();
      }
    }
  };

  const d2 = addDays(t, 2);
  const days = [
    ['Сегодня', t],
    ['Завтра', addDays(t, 1)],
    [WD[parseKey(d2).getDay()], d2],
    ['Выходные', parseKey(t).getDay() === 6 ? t : nextWd(t, 6)],
    ['След. неделя', nextWd(t, 1)],
  ].filter(([, k], i, a) => a.findIndex((x) => x[1] === k) === i);
  const known = days.some(([, k]) => k === date);

  const dateLabel = date ? relLabel(date) : 'Без даты';

  return (
    <div className={'qb' + (open ? ' open' : '')} ref={box}>
      <div className="qb-field" onClick={() => inp.current?.focus()}>
        <Icon name="plus" size={18} stroke={2} />
        <input
          ref={inp}
          value={title}
          placeholder="Новая задача"
          onChange={(e) => setTitle(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
        />
        <button
          className={'qb-when' + (date ? ' set' : '') + (fromText ? ' text' : '')}
          title="Дата и время"
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
            inp.current?.focus();
          }}
        >
          <Icon name="calendar" size={15} />
          <span>
            {dateLabel}
            {date && time ? ', ' + time : ''}
          </span>
        </button>
      </div>

      {open && (
        <div className="qb-pop" onMouseDown={(e) => e.target.tagName !== 'INPUT' && e.preventDefault()}>
          <div className="qb-label">Когда</div>
          <div className="qb-pills">
            {days.map(([label, k]) => (
              <button key={label} className={'qb-pill' + (date === k ? ' on' : '')} onClick={() => setDate(k)}>
                {label}
              </button>
            ))}
            <button className={'qb-pill icon' + (cal || (date && !known) ? ' on' : '')} title="Выбрать в календаре" onClick={() => setCal(!cal)}>
              <Icon name="calendar" size={15} />
              {date && !known ? <span>{relLabel(date)}</span> : null}
            </button>
            <button className={'qb-pill' + (!date ? ' on' : '')} onClick={() => setDate(null)}>
              Без даты
            </button>
          </div>
          {cal && (
            <div className="qb-cal">
              <MonthCalendar value={date} onPick={setDate} />
            </div>
          )}

          <div className="qb-label">Время</div>
          <div className="qb-pills">
            <button className={'qb-pill' + (!time ? ' on' : '')} onClick={() => setTime(null)}>
              Любое
            </button>
            {TIMES.map((tm) => (
              <button key={tm} className={'qb-pill' + (time === tm ? ' on' : '')} onClick={() => setTime(tm)}>
                {tm}
              </button>
            ))}
            <label className={'qb-pill qb-time' + (time && !TIMES.includes(time) ? ' on' : '')} title="Своё время">
              <Icon name="clock" size={15} />
              <input type="time" step="300" value={time && !TIMES.includes(time) ? time : ''} onChange={(e) => setTime(e.target.value || null)} />
            </label>
          </div>

          <div className="qb-foot">
            <span>
              Можно писать прямо в строке: <i>«созвон завтра в 15 #работа»</i>
            </span>
            <kbd>Enter</kbd>
          </div>
        </div>
      )}
    </div>
  );
}
