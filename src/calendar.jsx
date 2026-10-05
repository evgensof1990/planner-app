import { useEffect, useRef, useState } from 'react';
import { TopBar, IconBtn, useUi } from './components.jsx';
import { useStore, alive, PRIORITY_COLORS } from './store.jsx';
import { calendarItems, onCalendarsChange, refreshStale } from './ical.js';
import { MONTHS, WD, WD_MON, addDays, monthGrid, parseKey, todayKey, pad, weekStart } from './date.js';

const HOUR = 54;
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
  const tasks = [...data.tasks.filter((x) => alive(x) && x.date), ...calendarItems(data.settings.calendars)];
  const open = (x) => (x.ext ? ui.toast(`${x.calName}: ${x.title}${x.time ? ', ' + x.time : ''}`) : ui.openTask(x.id));
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
      <TopBar title={`${MONTHS[d.getMonth()]} ${d.getFullYear()}`} left={<IconBtn name="menu" className="menu-btn" onClick={ui.openDrawer} />}>
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
                  <span key={x.id} className={'cm-ev' + (x.done ? ' done' : '')} style={x.ext ? { background: x.color + '33' } : undefined}>
                    {x.title}
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
                    <button key={x.id} className={'cal-ev allday' + (x.done ? ' done' : '')} style={x.ext ? { background: x.color + '33' } : undefined} onClick={() => open(x)}>
                      {x.title}
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
                    if (e.target !== e.currentTarget) return;
                    const y = e.nativeEvent.offsetY;
                    const h = Math.min(23, Math.floor(y / HOUR));
                    ui.quickAdd({ date: k, time: pad(h) + ':00' });
                  }}
                >
                  {[...Array(24).keys()].map((h) => (
                    <i key={h} className="cal-line" style={{ top: h * HOUR }} />
                  ))}
                  {k === t && <div className="cal-now" style={{ top: ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR }} />}
                  {tasks
                    .filter((x) => x.date === k && x.time)
                    .map((x) => {
                      const [hh, mm] = x.time.split(':').map(Number);
                      return (
                        <button
                          key={x.id}
                          className={'cal-ev' + (x.done ? ' done' : '')}
                          style={{
                            top: ((hh * 60 + mm) / 60) * HOUR + 1,
                            height: x.ext ? Math.max(HOUR / 2, (x.dur / 60) * HOUR) - 3 : HOUR - 3,
                            borderLeftColor: x.ext ? x.color : PRIORITY_COLORS[x.priority] || 'var(--accent)',
                            ...(x.ext ? { background: x.color + '30' } : {}),
                          }}
                          onClick={() => open(x)}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            if (!x.ext) toggleTask(x.id);
                          }}
                        >
                          <b>{x.time}</b> {x.title}
                        </button>
                      );
                    })}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
