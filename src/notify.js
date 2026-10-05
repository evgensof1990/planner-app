import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

export const isNative = Capacitor.isNativePlatform();
const webTimers = new Map();

const hashId = (s) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 2000000000;
};

export async function ensurePermission() {
  try {
    if (isNative) {
      const p = await LocalNotifications.checkPermissions();
      if (p.display !== 'granted') await LocalNotifications.requestPermissions();
    } else if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  } catch (e) {
    /* ignore */
  }
}

function webShow(title, body) {
  try {
    if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body, icon: './icon.png' });
  } catch (e) {
    /* ignore */
  }
}

// key -> {at: Date, title, body}
export async function syncNotifications(items) {
  const now = Date.now();
  const future = items.filter((i) => i.at.getTime() > now).sort((a, b) => a.at - b.at).slice(0, 60);
  if (isNative) {
    try {
      const pending = await LocalNotifications.getPending();
      if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
      if (future.length)
        await LocalNotifications.schedule({
          notifications: future.map((i) => ({ id: hashId(i.key), title: i.title, body: i.body, schedule: { at: i.at, allowWhileIdle: true } })),
        });
    } catch (e) {
      console.warn(e);
    }
  } else {
    webTimers.forEach((t) => clearTimeout(t));
    webTimers.clear();
    future.forEach((i) => {
      const ms = i.at.getTime() - now;
      if (ms < 2 ** 31 - 1) webTimers.set(i.key, setTimeout(() => webShow(i.title, i.body), ms));
    });
  }
}

export function taskReminders(tasks) {
  return tasks
    .filter((t) => !t.deleted && !t.archived && !t.done && t.date && t.time && t.remind !== null && t.remind !== undefined)
    .map((t) => {
      const [y, m, d] = t.date.split('-').map(Number);
      const [hh, mm] = t.time.split(':').map(Number);
      const at = new Date(y, m - 1, d, hh, mm - t.remind);
      return { key: 'task-' + t.id, at, title: t.title || 'Задача', body: t.remind ? `Начало в ${t.time}` : 'Пора приступать' };
    });
}
