// Pomodoro engine: the timer state lives here, outside any screen, so a period ends
// on time whatever view is open. The end is computed from Date.now (endAt), never by
// counting ticks, so a throttled background tab only delays the check, not the clock.
import { useSyncExternalStore } from 'react';

export const SKEY = 'planner-pomo-state';
const hasWindow = typeof window !== 'undefined';

export const initialPomo = (work = 25) => ({
  minutes: work,
  phase: 'work',
  running: false,
  endAt: null,
  left: work * 60,
  cycles: 0,
  doneAt: null,
  sw: { running: false, startAt: null, acc: 0 },
});

export const pomoCfg = (s = {}) => ({
  work: s.pomoMinutes || 25,
  short: s.pomoShort || 5,
  long: s.pomoLong || 15,
  every: s.pomoEvery || 4,
  auto: !!s.pomoAuto,
  sound: s.pomoSound !== false,
  telegram: !!s.pomoTelegram,
});

export const phaseMinutes = (phase, cfg) => (phase === 'work' ? cfg.work : phase === 'long' ? cfg.long : cfg.short);
export const leftSec = (s, now = Date.now()) => (s.running ? Math.max(0, (s.endAt - now) / 1000) : s.left);

// The period that ended and the state that follows it; null while nothing has ended.
export function advance(s, cfg, now = Date.now()) {
  if (!s.running || !s.endAt || s.endAt > now) return null;
  const done = s.phase || 'work';
  let cycles = s.cycles || 0;
  let phase;
  if (done === 'work') {
    cycles += 1;
    phase = cycles % cfg.every === 0 ? 'long' : 'short';
  } else {
    phase = 'work';
    if (cycles >= cfg.every) cycles = 0;
  }
  const mins = phaseMinutes(phase, cfg);
  return {
    done,
    minutes: s.minutes,
    next: { ...s, phase, minutes: mins, running: cfg.auto, endAt: cfg.auto ? now + mins * 6e4 : null, left: mins * 60, cycles, doneAt: now },
  };
}

export const doneText = (done, next) =>
  done === 'work'
    ? { title: 'Помодоро завершено 🍅', body: next === 'long' ? 'Время длинного перерыва' : 'Время отдохнуть' }
    : { title: 'Перерыв закончился', body: 'Пора за работу 💪' };

/* ---------- shared state (one copy per tab, mirrored between tabs) ---------- */
const read = () => {
  try {
    const s = JSON.parse(localStorage.getItem(SKEY));
    return s ? { ...initialPomo(s.minutes), ...s } : null;
  } catch (e) {
    return null;
  }
};

let state = (hasWindow && read()) || initialPomo();
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn());

export const getPomo = () => state;
export const readStoredPomo = read;
export function setPomo(next) {
  state = typeof next === 'function' ? next(state) : next;
  try {
    localStorage.setItem(SKEY, JSON.stringify(state));
  } catch (e) {
    /* ignore */
  }
  emit();
}
export const subscribePomo = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
export const usePomo = () => useSyncExternalStore(subscribePomo, getPomo);

if (hasWindow)
  window.addEventListener('storage', (e) => {
    if (e.key !== SKEY) return;
    state = read() || state;
    emit();
  });

/* ---------- sound ---------- */
// Browsers only let a page play sound after a click. The context is created on the
// click that starts the timer and reused, so the chime also plays from a background tab.
let audio = null;
export function unlockAudio() {
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
  } catch (e) {
    /* ignore */
  }
}

const NOTES = [0, 0.35, 0.7, 1.4, 1.75, 2.1];

// Puts the chime on the audio clock `delay` seconds from now. The audio clock runs in
// its own thread, so a sound scheduled in advance plays on time even in a background
// tab, where the page's own timers can be held back by a minute or more.
function playAt(delay) {
  const ctx = audio;
  const t0 = ctx.currentTime + Math.max(0, delay);
  return NOTES.map((t, i) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = i % 3 === 2 ? 1175 : 880;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.setValueAtTime(0.3, t0 + t);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + t + 0.3);
    o.connect(g).connect(ctx.destination);
    o.start(t0 + t);
    o.stop(t0 + t + 0.3);
    return o;
  });
}

export function chime() {
  try {
    unlockAudio();
    playAt(0);
  } catch (e) {
    /* ignore */
  }
  navigator.vibrate?.([300, 150, 300]);
}

// One chime booked ahead for the end of the running period.
let booked = null; // { endAt, nodes }
let bookSeq = 0;
export function cancelChime() {
  bookSeq++;
  if (!booked) return;
  booked.nodes.forEach((o) => {
    try {
      o.disconnect();
    } catch (e) {
      /* ignore */
    }
    try {
      o.stop();
    } catch (e) {
      /* ignore */
    }
  });
  booked = null;
}

export function scheduleChime(endAt) {
  if (booked && booked.endAt === endAt) return;
  cancelChime();
  // only a context unlocked by a click can play without one; right after the click
  // it may still be resuming, so book once it runs
  if (!audio || audio.state === 'closed') return;
  const seq = bookSeq;
  const book = () => {
    if (seq !== bookSeq || audio.state !== 'running' || endAt <= Date.now()) return;
    try {
      booked = { endAt, nodes: playAt((endAt - Date.now()) / 1000) };
    } catch (e) {
      booked = null;
    }
  };
  if (audio.state === 'running') book();
  else audio.resume().then(book, () => {});
}

// true when the chime for this end was booked ahead and has played (or is playing)
export const chimeBooked = (endAt) => !!booked && booked.endAt === endAt && audio?.state === 'running';

/* ---------- end timer in a worker ---------- */
// Chrome holds back timers of a hidden tab (to once a minute after a few minutes),
// timers inside a worker are not held back that way. The worker only says "time";
// the page then ends the period, so a missing worker just falls back to setTimeout.
let worker = null;
let workerCb = null;
function getWorker() {
  if (worker !== null) return worker;
  try {
    const src = 'let t;onmessage=(e)=>{clearTimeout(t);if(e.data>=0)t=setTimeout(()=>postMessage(1),e.data)}';
    worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    worker.onmessage = () => workerCb?.();
  } catch (e) {
    worker = false;
  }
  return worker;
}

// Calls fn once after ms; returns a cancel function.
export function endTimer(ms, fn) {
  const w = hasWindow && typeof Worker !== 'undefined' ? getWorker() : false;
  const id = setTimeout(fn, ms);
  if (w) {
    workerCb = fn;
    w.postMessage(ms);
  }
  return () => {
    clearTimeout(id);
    if (w) {
      if (workerCb === fn) workerCb = null;
      w.postMessage(-1);
    }
  };
}

/* ---------- system notification ---------- */
export const notifyState = () => (hasWindow && 'Notification' in window ? Notification.permission : 'unsupported');

export function systemNotify(title, body) {
  try {
    if (notifyState() !== 'granted') return false;
    // requireInteraction keeps it on screen (macOS hides plain banners in seconds)
    const n = new Notification(title, { body, icon: './icon.png', tag: 'planner-pomo', renotify: true, requireInteraction: true });
    n.onclick = () => {
      window.focus();
      n.close();
    };
    return true;
  } catch (e) {
    return false;
  }
}

/* ---------- mini window (always on top where the browser can) ---------- */
let mini = null;
const miniListeners = new Set();
const emitMini = () => miniListeners.forEach((fn) => fn());
export const getMini = () => mini;
export const useMini = () =>
  useSyncExternalStore((fn) => {
    miniListeners.add(fn);
    return () => miniListeners.delete(fn);
  }, getMini);

// Document Picture-in-Picture (Chrome, Yandex Browser, Edge on Mac) floats above every
// window. Elsewhere (Safari, Firefox) a small popup window is the closest we can get.
export const miniFloats = () => hasWindow && 'documentPictureInPicture' in window;

function copyLook(win) {
  const doc = win.document;
  doc.title = 'Помодоро';
  for (const sheet of document.styleSheets) {
    try {
      const style = doc.createElement('style');
      style.textContent = [...sheet.cssRules].map((r) => r.cssText).join('\n');
      doc.head.appendChild(style);
    } catch (e) {
      if (sheet.href) {
        const link = doc.createElement('link');
        link.rel = 'stylesheet';
        link.href = sheet.href;
        doc.head.appendChild(link);
      }
    }
  }
  const root = document.documentElement;
  doc.documentElement.dataset.theme = root.dataset.theme || '';
  doc.documentElement.setAttribute('style', root.getAttribute('style') || '');
  doc.body.className = 'pomo-mini-body';
}

export async function openMini() {
  if (mini && !mini.closed) {
    mini.focus?.();
    return mini;
  }
  let win = null;
  try {
    if (miniFloats()) win = await window.documentPictureInPicture.requestWindow({ width: 260, height: 210 });
  } catch (e) {
    win = null;
  }
  if (!win) {
    win = window.open('', 'planner-pomo', 'popup,width=280,height=240');
    if (!win) return null;
    win.document.body.innerHTML = '';
  }
  copyLook(win);
  win.addEventListener('pagehide', () => {
    if (mini === win) {
      mini = null;
      emitMini();
    }
  });
  mini = win;
  emitMini();
  return win;
}

export function closeMini() {
  if (mini && !mini.closed) mini.close();
  mini = null;
  emitMini();
}
