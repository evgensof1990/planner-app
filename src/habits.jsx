import { useEffect, useState } from 'react';
import Icon from './icons.jsx';
import { TopBar, IconBtn, Empty, useUi } from './components.jsx';
import { useStore } from './store.jsx';
import { MONTHS, WD, addDays, diffDays, parseKey, todayKey } from './date.js';

function useCols() {
  const calc = () => (window.innerWidth >= 1100 ? 10 : window.innerWidth >= 700 ? 7 : 4);
  const [n, setN] = useState(calc);
  useEffect(() => {
    const f = () => setN(calc());
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, []);
  return n;
}

function streak(h) {
  let best = 0;
  let cur = 0;
  const days = Object.keys(h.log).sort();
  let prev = null;
  for (const d of days) {
    cur = prev && diffDays(prev, d) === 1 ? cur + 1 : 1;
    best = Math.max(best, cur);
    prev = d;
  }
  return best;
}

export function HabitsView() {
  const { data, toggleHabit } = useStore();
  const ui = useUi();
  const n = useCols();
  const [end, setEnd] = useState(todayKey());
  const t = todayKey();
  const days = [...Array(n).keys()].map((i) => addDays(end, i - n + 1));
  const first = parseKey(days[0]);

  // stats over last 30 days
  let possible = 0;
  let doneCount = 0;
  let popular = null;
  data.habits.forEach((h) => {
    let c = 0;
    for (let i = 0; i < 30; i++) {
      const k = addDays(t, -i);
      if (k < (h.createdAt || k)) break;
      possible++;
      if (h.log[k]) {
        doneCount++;
        c++;
      }
    }
    if (!popular || c > popular.c) popular = { h, c };
  });
  const avg = possible ? Math.round((doneCount / possible) * 100) : 0;
  const totalChecks = data.habits.reduce((s, h) => s + Object.keys(h.log).length, 0);

  return (
    <div className="view">
      <TopBar title="Привычки" left={<IconBtn name="menu" className="menu-btn" onClick={ui.openDrawer} />}>
        <IconBtn name="plus" onClick={() => ui.editHabit(null)} title="Новая привычка" />
      </TopBar>
      <div className="scroll">
        {data.habits.length === 0 ? (
          <Empty text="Добавьте первую привычку — нажмите «+» сверху" icon="habit" />
        ) : (
          <div className="habit-card">
            <div className="habit-head">
              <div className="habit-month">
                <button className="icon-btn sm" onClick={() => setEnd(addDays(end, -n))}>
                  <Icon name="chevL" size={16} />
                </button>
                <div>
                  <div className="hy">{first.getFullYear()}</div>
                  <div className="hm">{MONTHS[first.getMonth()]}</div>
                </div>
                <button className="icon-btn sm" disabled={end >= t} onClick={() => setEnd(addDays(end, n) > t ? t : addDays(end, n))}>
                  <Icon name="chevR" size={16} />
                </button>
              </div>
              {days.map((k) => (
                <div key={k} className={'habit-day' + (k === t ? ' today' : '')}>
                  <span>{WD[parseKey(k).getDay()]}</span>
                  <b>{parseKey(k).getDate()}</b>
                </div>
              ))}
            </div>
            {data.habits.map((h) => (
              <div key={h.id} className="habit-row">
                <button className="habit-name" onClick={() => ui.editHabit(h)}>
                  <i style={{ background: h.color }} />
                  <span className="emoji">{h.emoji}</span>
                  <span className="hn">{h.name}</span>
                </button>
                {days.map((k) => (
                  <button
                    key={k}
                    className={'habit-cell' + (h.log[k] ? ' on' : '') + (k === t ? ' today' : '')}
                    style={h.log[k] ? { background: h.color, borderColor: h.color } : undefined}
                    onClick={() => {
                      navigator.vibrate?.(10);
                      toggleHabit(h.id, k);
                    }}
                  >
                    {h.log[k] && <Icon name="check" size={16} stroke={2.6} />}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
        {data.habits.length > 0 && (
          <div className="stat-cards">
            <div className="stat-card">
              <div className="sc-label">В среднем выполнено</div>
              <div className="sc-value">{avg}%</div>
              <div className="sc-text">{avg >= 60 ? 'Отличная регулярность! 🔥' : 'Привычки любят регулярность 😉'}</div>
              <div className="sc-sub">Отметок за всё время: {totalChecks}</div>
            </div>
            <div className="stat-card">
              <div className="sc-label">Популярная привычка</div>
              <div className="sc-value">{popular ? Math.round((popular.c / 30) * 100) : 0}%</div>
              {popular && (
                <div className="sc-pill" style={{ background: popular.h.color + '33', color: popular.h.color }}>
                  {popular.h.emoji} {popular.h.name}
                </div>
              )}
              <div className="sc-sub">Самая длинная серия: {popular ? streak(popular.h) : 0} дн.</div>
            </div>
          </div>
        )}
        <div className="list-pad" />
      </div>
    </div>
  );
}
