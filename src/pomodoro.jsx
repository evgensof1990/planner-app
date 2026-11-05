import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './icons.jsx';
import { IconBtn, useUi } from './components.jsx';
import { useStore } from './store.jsx';
import { addDays, parseKey, pad, todayKey, fmtDuration, WD } from './date.js';
import {
  advance,
  chime,
  closeMini,
  doneText,
  getPomo,
  leftSec,
  miniFloats,
  notifyState,
  openMini,
  phaseMinutes,
  pomoCfg,
  readStoredPomo,
  setPomo,
  systemNotify,
  unlockAudio,
  useMini,
  usePomo,
} from './pomoengine.js';
import { isNative } from './notify.js';
import { api, getCfg, isServer } from './sync.js';

const PRESETS = [5, 10, 15, 20, 25, 30, 45, 60];
const PHASE_NAME = { work: 'Работа', short: 'Короткий перерыв', long: 'Длинный перерыв' };
const APP_TITLE = 'Планнер';
const clock = (sec) => `${pad(Math.floor(sec / 60))}:${pad(Math.floor(sec % 60))}`;

function startPause() {
  unlockAudio();
  import('./notify.js').then((m) => m.ensurePermission());
  setPomo((s) => {
    const left = leftSec(s);
    return s.running ? { ...s, running: false, left, endAt: null } : { ...s, running: true, endAt: Date.now() + left * 1000, doneAt: null };
  });
}

// Runs for the whole app (not only on the Pomodoro screen): ends periods on time,
// rings, shows the system notification, keeps the tab title and the mini window.
export function PomoRunner() {
  const { data, addPomo } = useStore();
  const ui = useUi();
  const st = usePomo();
  const win = useMini();
  const cfg = pomoCfg(data.settings);
  const ref = useRef();
  ref.current = { cfg, ui, addPomo };

  const finish = useCallback(() => {
    const s = getPomo();
    if (!s.running || s.endAt > Date.now()) return;
    // another tab of the app may have ended this period already
    const stored = readStoredPomo();
    if (stored && stored.endAt !== s.endAt) return setPomo(stored);
    const { cfg, ui, addPomo } = ref.current;
    const r = advance(s, cfg);
    if (!r) return;
    setPomo(r.next);
    if (r.done === 'work') addPomo({ minutes: r.minutes, kind: 'pomo' });
    const { title, body } = doneText(r.done, r.next.phase);
    ui.toast(`${title}. ${body}`);
    if (cfg.sound) chime();
    if (!isNative) systemNotify(title, body);
  }, []);

  // a one-off timer exactly at the end: browsers throttle repeating timers in a
  // background tab (up to once a minute), a single timer only slightly
  useEffect(() => {
    if (!st.running) return;
    const id = setTimeout(finish, Math.max(0, st.endAt - Date.now()) + 30);
    return () => clearTimeout(id);
  }, [st.running, st.endAt]);

  // safety net: regular check, plus whenever the tab or the window comes back
  useEffect(() => {
    const tick = () => {
      finish();
      const s = getPomo();
      document.title = s.running ? `${s.phase === 'work' ? '🍅' : '☕'} ${clock(leftSec(s))} · ${APP_TITLE}` : APP_TITLE;
    };
    tick();
    const iv = setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    return () => {
      clearInterval(iv);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('focus', tick);
    };
  }, []);

  useEffect(() => {
    if (isNative) ui.syncNotify?.();
  }, [st.running, st.endAt]);

  // duplicate the end to Telegram through the own server (if switched on)
  useEffect(() => {
    const sc = getCfg();
    if (isNative || !isServer(sc) || (!cfg.telegram && !st.running)) return;
    const s = getPomo();
    const body = cfg.telegram && s.running ? { endAt: s.endAt, ...doneText(s.phase || 'work', advance(s, cfg, s.endAt)?.next.phase) } : { endAt: null };
    api(sc, '/api/pomo', { method: 'POST', body: JSON.stringify(body) }).catch(() => {});
  }, [st.running, st.endAt, cfg.telegram]);

  return win ? createPortal(<PomoMini win={win} onTick={finish} />, win.document.body) : null;
}

function PomoMini({ win, onTick }) {
  const st = usePomo();
  const [, force] = useState(0);
  useEffect(() => {
    // the mini window's own timer is not throttled: it is visible even when the tab is not
    const iv = win.setInterval(() => {
      onTick();
      force((x) => x + 1);
    }, 500);
    return () => win.clearInterval(iv);
  }, [win]);
  const phase = st.phase || 'work';
  const alert = !st.running && st.doneAt && Date.now() - st.doneAt < 15 * 6e4;
  const sec = leftSec(st);
  const progress = 1 - sec / (st.minutes * 60);
  return (
    <div className={'pomo-mini' + (alert ? ' alert' : '') + (phase !== 'work' ? ' rest' : '')}>
      <div className="pm-phase">{alert ? (phase === 'work' ? 'Перерыв закончился' : 'Помодоро завершено 🍅') : PHASE_NAME[phase]}</div>
      <div className="pm-time">{clock(sec)}</div>
      <div className="pm-bar">
        <i style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }} />
      </div>
      <div className="pm-btns">
        <button className="pm-play" onClick={startPause} title={st.running ? 'Пауза' : 'Старт'}>
          <Icon name={st.running ? 'pause' : 'play'} size={22} stroke={2.4} />
        </button>
        <button onClick={() => window.focus()} title="Открыть планнер">
          <Icon name="open" size={18} />
        </button>
        <button onClick={closeMini} title="Закрыть мини-окно">
          <Icon name="close" size={18} />
        </button>
      </div>
    </div>
  );
}

function NotifyHint() {
  const [perm, setPerm] = useState(notifyState);
  if (isNative || perm === 'unsupported') return null;
  const test = () => {
    unlockAudio();
    chime();
    systemNotify('Проверка уведомления 🍅', 'Так придёт сигнал об окончании помодоро');
  };
  if (perm === 'granted')
    return (
      <div className="pomo-hint">
        <button className="link" onClick={test} title="Если уведомление не появилось, на Mac включите его для браузера: Системные настройки → Уведомления">
          Проверить звук и уведомление
        </button>
      </div>
    );
  return (
    <div className="pomo-hint warn">
      {perm === 'denied' ? (
        <>Уведомления для сайта запрещены: разрешите их в настройках сайта (значок слева от адреса), иначе об окончании будет слышен только звук. На Mac также проверьте Системные настройки → Уведомления → ваш браузер.</>
      ) : (
        <>
          Включите уведомления, чтобы узнать об окончании, даже если вкладка в фоне.{' '}
          <button className="link" onClick={() => Notification.requestPermission().then(setPerm)}>
            Включить
          </button>
        </>
      )}
    </div>
  );
}

export function PomodoroView() {
  const { data, setSettings, addPomo } = useStore();
  const ui = useUi();
  const [tab, setTab] = useState('pomo');
  const st = usePomo();
  const win = useMini();
  const [, force] = useState(0);
  const cfg = pomoCfg(data.settings);
  const phase = st.phase || 'work';
  // settings changed while idle: apply new phase length
  useEffect(() => {
    if (st.running) return;
    const mins = phaseMinutes(phase, cfg);
    if (mins !== st.minutes) setPomo((x) => ({ ...x, minutes: mins, left: mins * 60 }));
  }, [cfg.work, cfg.short, cfg.long]);

  useEffect(() => {
    const iv = setInterval(() => force((x) => x + 1), 500);
    return () => clearInterval(iv);
  }, []);

  const left = leftSec(st);
  const total = st.minutes * 60;
  const progress = 1 - left / total;
  const pick = (m) => {
    if (st.running) return;
    setSettings({ pomoMinutes: m });
    setPomo({ ...st, phase: 'work', minutes: m, left: m * 60, doneAt: null });
  };
  const addFocus = (minutes) => addPomo({ minutes, kind: 'focus' });
  const reset = () => {
    const spent = total - left;
    if (phase === 'work' && spent > 60) addFocus(Math.round(spent / 60));
    if (phase !== 'work' || spent < 1) setPomo({ ...st, phase: 'work', running: false, endAt: null, minutes: cfg.work, left: cfg.work * 60, doneAt: null });
    else setPomo({ ...st, running: false, endAt: null, left: total, doneAt: null });
  };
  const mini = async () => {
    if (win) return closeMini();
    if (!(await openMini())) ui.toast('Браузер не дал открыть мини-окно: разрешите всплывающие окна для сайта');
  };

  // stopwatch
  const sw = st.sw;
  const swSec = (sw.acc + (sw.running ? Date.now() - sw.startAt : 0)) / 1000;
  const swToggle = () =>
    setPomo({ ...st, sw: sw.running ? { running: false, startAt: null, acc: sw.acc + Date.now() - sw.startAt } : { ...sw, running: true, startAt: Date.now() } });
  const swReset = () => {
    if (swSec > 60) addFocus(Math.round(swSec / 60));
    setPomo({ ...st, sw: { running: false, startAt: null, acc: 0 } });
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
          {!isNative && <IconBtn name="pip" onClick={mini} title={win ? 'Закрыть мини-окно' : miniFloats() ? 'Мини-окно поверх всех окон' : 'Мини-окно'} />}
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
      {isPomo && <NotifyHint />}
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
        <button className="play-btn" onClick={isPomo ? startPause : swToggle}>
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
  const s = getPomo();
  if (s && s.running && s.endAt > Date.now())
    return [(s.phase || 'work') === 'work' ? { key: 'pomo', at: new Date(s.endAt), title: 'Помодоро завершено 🍅', body: 'Время сделать перерыв' } : { key: 'pomo', at: new Date(s.endAt), title: 'Перерыв закончился', body: 'Пора за работу 💪' }];
  return [];
}
