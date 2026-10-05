import { useEffect, useRef, useState } from 'react';
import Icon from './icons.jsx';
import { IconBtn, useUi } from './components.jsx';
import { useStore } from './store.jsx';
import { addDays, parseKey, pad, todayKey, fmtDuration, WD } from './date.js';

const PRESETS = [5, 10, 15, 20, 25, 30, 45, 60];
const SKEY = 'planner-pomo-state';

const loadState = () => {
  try {
    return JSON.parse(localStorage.getItem(SKEY)) || null;
  } catch (e) {
    return null;
  }
};

function beep(sound = true) {
  try {
    if (!sound) throw 0;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.35, 0.7].forEach((t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.25, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.3);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.3);
    });
  } catch (e) {
    /* ignore */
  }
  navigator.vibrate?.([300, 150, 300]);
}

export function PomodoroView() {
  const { data, addPomo, setSettings } = useStore();
  const ui = useUi();
  const [tab, setTab] = useState('pomo');
  const [st, setSt] = useState(
    () =>
      loadState() || {
        minutes: data.settings.pomoMinutes || 25,
        running: false,
        endAt: null,
        left: (data.settings.pomoMinutes || 25) * 60,
        cycles: 0,
        sw: { running: false, startAt: null, acc: 0 },
      }
  );
  const [, force] = useState(0);
  const stRef = useRef(st);
  stRef.current = st;
  const ss0 = data.settings;
  const cfg = { work: ss0.pomoMinutes || 25, short: ss0.pomoShort || 5, long: ss0.pomoLong || 15, every: ss0.pomoEvery || 4, auto: !!ss0.pomoAuto, sound: ss0.pomoSound !== false };
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;
  const phase = st.phase || 'work';
  // settings changed while idle: apply new phase length
  useEffect(() => {
    if (st.running) return;
    const mins = phase === 'work' ? cfg.work : phase === 'long' ? cfg.long : cfg.short;
    if (mins !== st.minutes) setSt((x) => ({ ...x, minutes: mins, left: mins * 60 }));
  }, [cfg.work, cfg.short, cfg.long]);

  useEffect(() => {
    localStorage.setItem(SKEY, JSON.stringify(st));
  }, [st]);

  useEffect(() => {
    if (st.running) import('./notify.js').then((m) => m.ensurePermission());
    ui.syncNotify?.();
  }, [st.running, st.endAt]);

  useEffect(() => {
    const iv = setInterval(() => {
      const s = stRef.current;
      if (s.running && s.endAt <= Date.now()) {
        const cfg = cfgRef.current;
        const phase = s.phase || 'work';
        let next;
        let cycles = s.cycles;
        if (phase === 'work') {
          addPomo({ minutes: s.minutes, kind: 'pomo' });
          cycles = s.cycles + 1;
          next = cycles % cfg.every === 0 ? 'long' : 'short';
          ui.toast(next === 'long' ? 'Помодоро завершено! Время длинного перерыва 🍅' : 'Помодоро завершено! Время отдохнуть 🍅');
        } else {
          next = 'work';
          if (cycles >= cfg.every) cycles = 0;
          ui.toast('Перерыв закончился, пора за работу 💪');
        }
        beep(cfg.sound);
        const mins = next === 'work' ? cfg.work : next === 'long' ? cfg.long : cfg.short;
        const auto = cfg.auto;
        setSt({ ...s, phase: next, minutes: mins, running: auto, endAt: auto ? Date.now() + mins * 6e4 : null, left: mins * 60, cycles });
      }
      force((x) => x + 1);
    }, 500);
    return () => clearInterval(iv);
  }, []);

  const left = st.running ? Math.max(0, (st.endAt - Date.now()) / 1000) : st.left;
  const total = st.minutes * 60;
  const progress = 1 - left / total;
  const pick = (m) => {
    if (st.running) return;
    setSettings({ pomoMinutes: m });
    setSt({ ...st, phase: 'work', minutes: m, left: m * 60 });
  };
  const toggle = () => {
    if (st.running) setSt({ ...st, running: false, left, endAt: null });
    else setSt({ ...st, running: true, endAt: Date.now() + left * 1000 });
  };
  const reset = () => {
    const spent = total - left;
    if (phase === 'work' && spent > 60) addPomo({ minutes: Math.round(spent / 60), kind: 'focus' });
    if (phase !== 'work' || spent < 1) setSt({ ...st, phase: 'work', running: false, endAt: null, minutes: cfg.work, left: cfg.work * 60 });
    else setSt({ ...st, running: false, endAt: null, left: total });
  };

  // stopwatch
  const sw = st.sw;
  const swSec = (sw.acc + (sw.running ? Date.now() - sw.startAt : 0)) / 1000;
  const swToggle = () =>
    setSt({ ...st, sw: sw.running ? { running: false, startAt: null, acc: sw.acc + Date.now() - sw.startAt } : { ...sw, running: true, startAt: Date.now() } });
  const swReset = () => {
    if (swSec > 60) addPomo({ minutes: Math.round(swSec / 60), kind: 'focus' });
    setSt({ ...st, sw: { running: false, startAt: null, acc: 0 } });
  };

  const isPomo = tab === 'pomo';
  const sec = isPomo ? left : swSec;
  const mm = Math.floor(sec / 60);
  const ss = Math.floor(sec % 60);
  const TICKS = 120;
  return (
    <div className="view pomo">
      <div className="topbar">
        <IconBtn name="chevL" onClick={() => ui.back()} />
        <div className="ptabs">
          <button className={isPomo ? 'on' : ''} onClick={() => setTab('pomo')}>
            Помодоро
          </button>
          <button className={!isPomo ? 'on' : ''} onClick={() => setTab('sw')}>
            Секундомер
          </button>
        </div>
        <div className="topbar-actions">
          <IconBtn name="chart" onClick={() => ui.go({ view: 'pomoStats' })} title="Статистика" />
        </div>
      </div>
      {isPomo ? (
        <div className="presets">
          {PRESETS.map((m, i) => (
            <button key={m} className={'preset' + (phase === 'work' && st.minutes === m ? ' on' : '')} onClick={() => pick(m)} disabled={st.running}>
              <i style={{ width: 10 + i * 2.2, height: 10 + i * 2.2 }}>{phase === 'work' && st.minutes === m && <Icon name="check" size={10} stroke={3} />}</i>
              <span>{m}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="presets" />
      )}
      <div className="pomo-center">
        <div className="ring">
          <svg viewBox="0 0 300 300">
            {[...Array(TICKS).keys()].map((i) => {
              const a = (i / TICKS) * Math.PI * 2 - Math.PI / 2;
              const elapsed = isPomo ? i / TICKS < progress : (i / TICKS) < (swSec % 60) / 60;
              return (
                <line
                  key={i}
                  x1={150 + Math.cos(a) * 128}
                  y1={150 + Math.sin(a) * 128}
                  x2={150 + Math.cos(a) * 140}
                  y2={150 + Math.sin(a) * 140}
                  stroke={elapsed ? (isPomo ? '#3a2422' : 'var(--red)') : isPomo ? 'var(--red)' : '#3a2422'}
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              );
            })}
          </svg>
          <div className="ring-inner">
            <div className="ring-time">
              {mm >= 60 && !isPomo ? `${Math.floor(mm / 60)}:${pad(mm % 60)}` : pad(mm)}:{pad(ss)}
            </div>
            {isPomo && <div className="ring-phase">{phase === 'work' ? 'Работа' : phase === 'long' ? 'Длинный перерыв' : 'Короткий перерыв'}</div>}
            {isPomo && (
              <div className="ring-dots">
                {[...Array(cfg.every).keys()].map((i) => (
                  <i key={i} className={i < st.cycles ? 'on' : ''} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="pomo-controls">
        <IconBtn name="settings" onClick={() => ui.openSettings()} />
        <button className="play-btn" onClick={isPomo ? toggle : swToggle}>
          <Icon name={(isPomo ? st.running : sw.running) ? 'pause' : 'play'} size={30} stroke={2.4} />
        </button>
        <IconBtn name="reset" onClick={isPomo ? reset : swReset} />
      </div>
    </div>
  );
}

function Bars({ values, labels, unit }) {
  const max = Math.max(...values, 1);
  const hasData = values.some((v) => v > 0);
  return (
    <div className="bars">
      <div className="bars-area">
        {!hasData && <div className="bars-empty">Нет данных</div>}
        {values.map((v, i) => (
          <div key={i} className="bar-col">
            {v > 0 && <span className="bar-v">{unit === 'min' ? fmtDuration(v * 60) : v}</span>}
            <div className="bar" style={{ height: `${(v / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="bars-labels">
        {labels.map((l, i) => (
          <span key={i}>{l}</span>
        ))}
      </div>
    </div>
  );
}

export function PomoStatsView() {
  const { data } = useStore();
  const ui = useUi();
  const [range, setRange] = useState(7);
  const t = todayKey();
  const sessions = data.pomo.sessions;
  const todayPomo = sessions.filter((s) => s.date === t && s.kind === 'pomo').length;
  const todayFocus = sessions.filter((s) => s.date === t).reduce((a, s) => a + s.minutes, 0);
  const totalFocus = sessions.reduce((a, s) => a + s.minutes, 0);
  const days = [...Array(range).keys()].map((i) => addDays(t, i - range + 1));
  const labels = days.map((k, i) => {
    const d = parseKey(k);
    if (range > 7 && i % 5 !== 4 && i !== range - 1) return '';
    return range > 7 ? `${pad(d.getDate())}.${pad(d.getMonth() + 1)}` : `${WD[d.getDay()]}\n${pad(d.getDate())}.${pad(d.getMonth() + 1)}`;
  });
  return (
    <div className="view">
      <div className="topbar">
        <IconBtn name="chevL" onClick={() => ui.back()} />
        <div className="topbar-title">
          <div className="tt">Помодоро и время</div>
        </div>
      </div>
      <div className="scroll pad">
        <div className="pstat-cards">
          <div className="pstat tomato">
            <div>Сегодня помодоро</div>
            <b>{todayPomo}</b>
            <span className="pstat-art">🍅</span>
          </div>
          <div className="pstat wave">
            <div>Сегодня в фокусе</div>
            <b>{fmtDuration(todayFocus * 60)}</b>
            <svg className="pstat-wave" viewBox="0 0 100 40" preserveAspectRatio="none">
              <path d="M0 40 C 30 40, 50 30, 70 15 S 95 0, 100 0 L100 40 Z" fill="#2aa7f0" />
            </svg>
          </div>
        </div>
        <div className="seg">
          <button className={range === 7 ? 'on' : ''} onClick={() => setRange(7)}>
            Неделя
          </button>
          <button className={range === 30 ? 'on' : ''} onClick={() => setRange(30)}>
            Месяц
          </button>
        </div>
        <div className="panel">
          <div className="panel-title">Помодоро</div>
          <Bars values={days.map((k) => sessions.filter((s) => s.date === k && s.kind === 'pomo').length)} labels={labels} />
        </div>
        <div className="panel">
          <div className="panel-title">Время в фокусе</div>
          <Bars values={days.map((k) => sessions.filter((s) => s.date === k).reduce((a, s) => a + s.minutes, 0))} labels={labels} unit="min" />
        </div>
        <div className="panel small">
          Всего в фокусе: <b>{fmtDuration(totalFocus * 60)}</b> · помидоров: <b>{sessions.filter((s) => s.kind === 'pomo').length}</b>
        </div>
        <div className="list-pad" />
      </div>
    </div>
  );
}

export function pomoEndReminder() {
  const s = loadState();
  if (s && s.running && s.endAt > Date.now())
    return [(s.phase || 'work') === 'work' ? { key: 'pomo', at: new Date(s.endAt), title: 'Помодоро завершено 🍅', body: 'Время сделать перерыв' } : { key: 'pomo', at: new Date(s.endAt), title: 'Перерыв закончился', body: 'Пора за работу 💪' }];
  return [];
}
