// Goals overview, the Friday weekly review and the day/week planning sheet.
import { useState } from 'react';
import Icon from './icons.jsx';
import { TopBar, IconBtn, Checkbox, Sheet, useUi } from './components.jsx';
import { useStore, alive, PRIORITY_COLORS } from './store.jsx';
import { addDays, parseKey, todayKey, relLabel, WD, MONTHS_GEN } from './date.js';
import { planBatch, slotLabel } from './scheduler.js';
import { busyEvents } from './ical.js';
import { durLabel } from './sheets.jsx';

const mondayOf = (k) => addDays(k, -((parseKey(k).getDay() + 6) % 7));
const live = (t) => !t.deleted && !t.parentId;

// Quarter section names used by the goal plan: «Ноя–дек 2026», «Q1 2027», …
function quarterName(k) {
  const d = parseKey(k);
  if (d.getFullYear() === 2026 && d.getMonth() >= 10) return 'Ноя–дек 2026';
  return `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`;
}

export const goalProjects = (data) => data.projects.filter((p) => !p.archived && (p.description || '').trim());

// Steps of a project dated inside a week: {total, done}
function weekSteps(tasks, projectId, monday) {
  const end = addDays(monday, 6);
  // subtasks of a quarter result count as steps too
  const list = tasks.filter((t) => !t.deleted && t.projectId === projectId && t.date && t.date >= monday && t.date <= end);
  return { total: list.length, done: list.filter((t) => t.done).length };
}

function goalStatus(tasks, p, t = todayKey()) {
  const mon = mondayOf(t);
  const now = weekSteps(tasks, p.id, mon);
  const prev = weekSteps(tasks, p.id, addDays(mon, -7));
  const next = weekSteps(tasks, p.id, addDays(mon, 7));
  // two weeks in a row without a step is a red flag
  const flag = now.total ? 'ok' : prev.total ? 'warn' : 'red';
  const qName = quarterName(t);
  const section = p.sections.find((s) => s.name === qName) || p.sections.find((s) => tasks.some((x) => live(x) && x.sectionId === s.id && !x.done));
  const qTasks = section ? tasks.filter((x) => live(x) && x.sectionId === section.id) : [];
  return { now, prev, next, flag, section, qTasks };
}

/* ---------------- Goals ---------------- */
export function GoalsView() {
  const { data, toggleTask } = useStore();
  const ui = useUi();
  const t = todayKey();
  const goals = goalProjects(data);
  const lastReview = Object.entries(data.settings.reviews || {}).sort((a, b) => b[0].localeCompare(a[0]))[0];
  return (
    <div className="view">
      <TopBar title="Цели" left={<IconBtn name="menu" className="menu-btn" onClick={ui.openDrawer} />}>
        <IconBtn name="review" title="Обзор недели" onClick={() => ui.go({ view: 'review' })} />
      </TopBar>
      <div className="scroll goals">
        <div className="goals-head">
          <span>
            Неделя с {parseKey(mondayOf(t)).getDate()} {MONTHS_GEN[parseKey(mondayOf(t)).getMonth()]} · {quarterName(t)}
          </span>
          <button className="chip ghost" onClick={() => ui.go({ view: 'review' })}>
            <Icon name="review" size={14} /> Обзор недели
            {lastReview && <small> · прошлый {relLabel(lastReview[0]).toLowerCase()}</small>}
          </button>
        </div>
        {!goals.length && (
          <div className="hint pad">
            Цель — это проект с описанием. Добавьте описание проекту или импортируйте план в «Настройки → Данные».
          </div>
        )}
        {goals.map((p) => {
          const g = goalStatus(data.tasks, p, t);
          const done = g.qTasks.filter((x) => x.done).length;
          return (
            <div key={p.id} className={'goal-card g-' + g.flag}>
              <div className="goal-top" onClick={() => ui.go({ view: 'project', id: p.id })}>
                <span className="emoji big">{p.emoji}</span>
                <div className="goal-name">
                  <b>{p.name}</b>
                  <span>{p.description}</span>
                </div>
              </div>
              <div className="goal-week">
                <span className={'goal-flag g-' + g.flag}>
                  {g.flag === 'ok' ? `Шагов на неделе: ${g.now.done}/${g.now.total}` : g.flag === 'warn' ? 'На этой неделе шагов нет' : 'Две недели без шагов'}
                </span>
                <button className="chip ghost" onClick={() => ui.quickAdd({ projectId: p.id, date: t })}>
                  <Icon name="plus" size={14} /> Шаг
                </button>
              </div>
              {g.section && (
                <div className="goal-q">
                  <div className="goal-q-title">
                    {g.section.name}
                    <span>
                      {done}/{g.qTasks.length}
                    </span>
                  </div>
                  <div className="goal-bar">
                    <i style={{ width: g.qTasks.length ? (done / g.qTasks.length) * 100 + '%' : 0 }} />
                  </div>
                  {g.qTasks.map((x) => (
                    <div key={x.id} className={'goal-item' + (x.done ? ' done' : '')}>
                      <Checkbox checked={x.done} priority={x.priority} onChange={() => toggleTask(x.id)} />
                      <span onClick={() => ui.openTask(x.id)}>{x.title}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <div className="list-pad" />
      </div>
    </div>
  );
}

/* ---------------- Plan sheet: spread untimed tasks over free windows ---------------- */
export function PlanSheet({ days, onClose }) {
  const { data, updateTask } = useStore();
  const ui = useUi();
  const t = todayKey();
  const [plan] = useState(() => {
    const events = busyEvents(data.settings.calendars);
    const tasks = data.tasks.filter(alive);
    const placed = [];
    const out = [];
    for (const day of days) {
      const loose = tasks.filter((x) => live(x) && !x.done && !x.time && x.date && (x.date === day || (day === t && x.date < t)));
      const r = planBatch(loose, { day, tasks: [...tasks, ...placed], projects: data.projects, events, rules: data.settings.planRules });
      r.forEach((x) => x.slot && placed.push({ id: x.task.id + ':p', ...x.slot }));
      out.push(...r);
    }
    return out;
  });
  const [off, setOff] = useState({});
  const ok = plan.filter((x) => x.slot && !off[x.task.id]);
  const accept = () => {
    ok.forEach(({ task, slot }) => updateTask(task.id, { date: slot.date, time: slot.time, duration: slot.duration }));
    ui.toast(`Запланировано задач: ${ok.length}`);
    onClose();
  };
  return (
    <Sheet onClose={onClose}>
      <div className="sheet-title center">{days.length === 1 ? 'План на ' + relLabel(days[0]).toLowerCase() : 'План на неделю'}</div>
      <div className="rows plan-list">
        {!plan.length && <div className="row-btn muted">Задач без времени нет</div>}
        {plan.map(({ task, slot }) => (
          <button key={task.id} className={'row-btn boxed' + (!slot || off[task.id] ? ' disabled' : '')} onClick={() => slot && setOff({ ...off, [task.id]: !off[task.id] })}>
            <span>
              <b style={{ color: PRIORITY_COLORS[task.priority] || undefined }}>{task.title}</b>
              <small>{slot ? slotLabel(slot) : 'свободного окна нет'}</small>
            </span>
            {slot && <Icon name={off[task.id] ? 'close' : 'check'} size={18} />}
          </button>
        ))}
      </div>
      <div className="sheet-actions">
        <button className="btn" onClick={onClose}>
          Отменить
        </button>
        <button className="btn primary" disabled={!ok.length} onClick={accept}>
          Принять ({ok.length})
        </button>
      </div>
    </Sheet>
  );
}

/* ---------------- Weekly review ---------------- */
const STEPS = ['Итоги', 'Хвосты', 'Финансы', 'Цели', 'План'];
const LIGHTS = [
  ['green', '🟢', 'Всё по плану'],
  ['yellow', '🟡', 'Есть отставание'],
  ['red', '🔴', 'Нужны меры'],
];

export function ReviewView() {
  const { data, updateTask, deleteTask, restoreTask, setSettings } = useStore();
  const ui = useUi();
  const t = todayKey();
  const mon = mondayOf(t);
  const nextMon = addDays(mon, 7);
  const [step, setStep] = useState(0);
  const prevReview = data.settings.reviews?.[mon] || {};
  const [light, setLight] = useState(prevReview.light || null);
  const [note, setNote] = useState(prevReview.note || '');
  const tasks = data.tasks.filter((x) => !x.deleted);
  const projectOf = (x) => data.projects.find((p) => p.id === x.projectId);
  const doneWeek = tasks.filter((x) => x.done && x.doneAt && x.doneAt >= parseKey(mon).getTime());
  const tails = tasks.filter((x) => live(x) && !x.done && ((x.date && x.date < t) || (x.deadline && x.deadline < t)));
  const goals = goalProjects(data);
  const nextWeek = [...Array(7).keys()].map((i) => addDays(nextMon, i));
  const finish = () => {
    setSettings({ reviews: { ...(data.settings.reviews || {}), [mon]: { at: Date.now(), done: doneWeek.length, light, note } } });
    ui.toast('Обзор недели сохранён');
    ui.go({ view: 'today' });
  };

  let body;
  if (step === 0) {
    const byProject = {};
    doneWeek.forEach((x) => (byProject[projectOf(x)?.name || 'Без проекта'] ||= []).push(x));
    body = (
      <>
        <div className="rv-big">
          {doneWeek.length}
          <small>сделано за неделю</small>
        </div>
        {Object.entries(byProject).map(([name, list]) => (
          <div key={name} className="rv-group">
            <div className="lbl">
              {name} · {list.length}
            </div>
            {list.map((x) => (
              <div key={x.id} className="rv-line done">
                {x.title}
              </div>
            ))}
          </div>
        ))}
      </>
    );
  } else if (step === 1) {
    body = (
      <>
        <div className="hint">Просроченные задачи и задачи с прошедшим дедлайном. Решите судьбу каждой.</div>
        {!tails.length && <div className="rv-ok">Хвостов нет 👌</div>}
        {tails.map((x) => (
          <div key={x.id} className="rv-tail">
            <div onClick={() => ui.openTask(x.id)}>
              <b>{x.title}</b>
              <small>
                {x.date && x.date < t ? `было на ${relLabel(x.date).toLowerCase()}` : ''}
                {x.deadline && x.deadline < t ? ` · дедлайн ${relLabel(x.deadline).toLowerCase()}` : ''}
              </small>
            </div>
            <div className="rv-actions">
              <button className="chip ghost" onClick={() => ui.suggestTime({ ...x, date: null })}>
                <Icon name="clock" size={14} /> Время
              </button>
              <button className="chip ghost" onClick={() => updateTask(x.id, { date: nextMon, time: null })}>
                След. неделя
              </button>
              <button className="chip ghost" onClick={() => updateTask(x.id, { date: null, time: null, deadline: null })}>
                Без даты
              </button>
              <button
                className="chip ghost"
                onClick={() => {
                  deleteTask(x.id);
                  ui.toast('Удалено', { label: 'Отменить', fn: () => restoreTask(x.id) });
                }}
              >
                <Icon name="trash" size={14} />
              </button>
            </div>
          </div>
        ))}
      </>
    );
  } else if (step === 2) {
    const fin = data.projects.find((p) => p.id === 'goal-fin');
    const money = fin ? tasks.filter((x) => live(x) && x.projectId === fin.id && !x.done && x.date && x.date <= addDays(nextMon, 6)) : [];
    body = (
      <>
        <div className="hint">Светофор финансов: как идут накопления и платежи по плану.</div>
        <div className="rv-lights">
          {LIGHTS.map(([k, e, l]) => (
            <button key={k} className={light === k ? 'on' : ''} onClick={() => setLight(k)}>
              <span>{e}</span>
              {l}
            </button>
          ))}
        </div>
        <textarea className="field rv-note" rows={3} placeholder="Заметка: что пошло не так, что поменять" value={note} onChange={(e) => setNote(e.target.value)} />
        {money.length > 0 && (
          <>
            <div className="lbl">Денежные задачи до конца следующей недели</div>
            {money.map((x) => (
              <div key={x.id} className="rv-line" onClick={() => ui.openTask(x.id)}>
                {relLabel(x.date)} · {x.title}
              </div>
            ))}
          </>
        )}
      </>
    );
  } else if (step === 3) {
    body = (
      <>
        <div className="hint">В каждой цели нужен хотя бы один шаг на следующую неделю. Особенно в бизнесе: это главная цель квартала.</div>
        {goals.map((p) => {
          const g = goalStatus(data.tasks, p, t);
          const open = g.qTasks.filter((x) => !x.done);
          return (
            <div key={p.id} className={'goal-card ' + (g.next.total ? 'g-ok' : 'g-red')}>
              <div className="goal-week">
                <b>
                  {p.emoji} {p.name}
                </b>
                <span className={'goal-flag ' + (g.next.total ? 'g-ok' : 'g-red')}>{g.next.total ? `шагов: ${g.next.total}` : 'нет шагов'}</span>
              </div>
              {open.slice(0, 3).map((x) => (
                <div key={x.id} className="rv-line" onClick={() => ui.openTask(x.id)}>
                  🎯 {x.title}
                </div>
              ))}
              <button className="chip ghost" onClick={() => ui.quickAdd({ projectId: p.id, date: nextMon })}>
                <Icon name="plus" size={14} /> Шаг на следующую неделю
              </button>
            </div>
          );
        })}
      </>
    );
  } else {
    const loose = tasks.filter((x) => live(x) && !x.done && !x.time && x.date && x.date >= nextMon && x.date <= nextWeek[6]);
    body = (
      <>
        <div className="hint">Следующая неделя. Задачи без времени можно разложить по свободным окнам.</div>
        {nextWeek.map((d) => {
          const list = tasks.filter((x) => live(x) && !x.done && x.date === d).sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
          return (
            <div key={d} className="rv-day">
              <div className="lbl">
                {WD[parseKey(d).getDay()]}, {relLabel(d)}
              </div>
              {!list.length && <div className="rv-line muted">—</div>}
              {list.map((x) => (
                <div key={x.id} className="rv-line" onClick={() => ui.openTask(x.id)}>
                  {x.time ? <b>{x.time}</b> : <span className="muted">без времени</span>} {x.title}
                  {x.duration ? <small> · {durLabel(x.duration)}</small> : null}
                </div>
              ))}
            </div>
          );
        })}
        <button className="btn wide" disabled={!loose.length} onClick={() => ui.planDays(nextWeek)}>
          <Icon name="clock" size={18} /> Разложить без времени ({loose.length})
        </button>
      </>
    );
  }

  return (
    <div className="view">
      <TopBar title="Обзор недели" sub={`${STEPS[step]} · шаг ${step + 1} из ${STEPS.length}`} left={<IconBtn name="menu" className="menu-btn" onClick={ui.openDrawer} />} />
      <div className="rv-steps">
        {STEPS.map((s, i) => (
          <button key={s} className={i === step ? 'on' : i < step ? 'past' : ''} onClick={() => setStep(i)}>
            {s}
          </button>
        ))}
      </div>
      <div className="scroll review">
        {body}
        <div className="rv-nav">
          {step > 0 && (
            <button className="btn" onClick={() => setStep(step - 1)}>
              Назад
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button className="btn primary" onClick={() => setStep(step + 1)}>
              Дальше
            </button>
          ) : (
            <button className="btn primary" onClick={finish}>
              Завершить обзор
            </button>
          )}
        </div>
        <div className="list-pad" />
      </div>
    </div>
  );
}
