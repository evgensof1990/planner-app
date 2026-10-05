// Sync through a private GitHub Gist: each device keeps its own copy and
// merges with the gist (last write wins per record, deletions as tombstones).

export const COLS = ['tasks', 'projects', 'tags', 'habits'];
const CFG_KEY = 'planner-sync';
const API = 'https://api.github.com';
const FILE = 'planner-data.json';
const TOMBSTONE_TTL = 90 * 864e5;

export const getCfg = () => {
  try {
    return JSON.parse(localStorage.getItem(CFG_KEY)) || null;
  } catch (e) {
    return null;
  }
};
export const setCfg = (cfg) => {
  try {
    if (cfg) localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
    else localStorage.removeItem(CFG_KEY);
  } catch (e) {
    /* ignore */
  }
};

const strip = (o) => JSON.stringify({ ...o, updatedAt: 0 });

// Stamp updatedAt on records that changed between prev and next, tombstone removed ones.
export function stamp(prev, next) {
  const now = Date.now();
  next.deletedIds = { ...(next.deletedIds || {}) };
  for (const c of COLS) {
    const pm = new Map((prev[c] || []).map((x) => [x.id, x]));
    const ids = new Set();
    for (const it of next[c] || []) {
      ids.add(it.id);
      const p = pm.get(it.id);
      if (!p || strip(p) !== strip(it)) it.updatedAt = now;
      delete next.deletedIds[it.id];
    }
    for (const id of pm.keys()) if (!ids.has(id)) next.deletedIds[id] = now;
  }
  if (strip(prev.settings || {}) !== strip(next.settings || {})) next.settings.updatedAt = now;
  return next;
}

export function merge(a, b) {
  if (!b) return a;
  const out = { ...a };
  const del = { ...(a.deletedIds || {}) };
  for (const [k, v] of Object.entries(b.deletedIds || {})) del[k] = Math.max(del[k] || 0, v);
  for (const c of COLS) {
    const m = new Map();
    for (const it of [...(a[c] || []), ...(b[c] || [])]) {
      const e = m.get(it.id);
      if (!e || (it.updatedAt || 0) > (e.updatedAt || 0)) m.set(it.id, it);
    }
    out[c] = [...m.values()].filter((it) => !(del[it.id] && del[it.id] >= (it.updatedAt || 0)));
  }
  const sessions = new Map();
  for (const s of [...(a.pomo?.sessions || []), ...(b.pomo?.sessions || [])]) sessions.set(`${s.ts}-${s.minutes}-${s.kind}`, s);
  out.pomo = { ...(a.pomo || {}), sessions: [...sessions.values()].sort((x, y) => x.ts - y.ts) };
  out.settings = (b.settings?.updatedAt || 0) > (a.settings?.updatedAt || 0) ? b.settings : a.settings;
  const cutoff = Date.now() - TOMBSTONE_TTL;
  out.deletedIds = Object.fromEntries(Object.entries(del).filter(([, v]) => v > cutoff));
  return out;
}

export function canon(d) {
  if (!d) return '';
  const byId = (arr) => [...(arr || [])].sort((x, y) => (x.id < y.id ? -1 : 1));
  return JSON.stringify({
    tasks: byId(d.tasks),
    projects: byId(d.projects),
    tags: byId(d.tags),
    habits: byId(d.habits),
    pomo: (d.pomo?.sessions || []).map((x) => x.ts).sort(),
    settings: d.settings,
    deletedIds: Object.keys(d.deletedIds || {}).sort(),
  });
}

async function gh(path, token, opts = {}) {
  let r;
  try {
    r = await fetch(API + path, {
      ...opts,
      cache: 'no-store',
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
    });
  } catch (e) {
    throw new Error('Нет связи с GitHub');
  }
  if (r.status === 401) throw new Error('Токен недействителен или отозван');
  if (r.status === 403) throw new Error('GitHub отклонил запрос: проверьте, что у токена есть доступ gist');
  if (r.status === 404) throw new Error('Хранилище не найдено');
  if (!r.ok) throw new Error('Ошибка GitHub ' + r.status);
  return r.json();
}

export async function findGist(token) {
  for (let page = 1; page <= 5; page++) {
    const list = await gh(`/gists?per_page=100&page=${page}`, token);
    const g = list.find((x) => x.files && x.files[FILE]);
    if (g) return g.id;
    if (list.length < 100) break;
  }
  return null;
}

export async function readGist(token, id) {
  const g = await gh('/gists/' + id, token);
  const f = g.files[FILE];
  if (!f) throw new Error('Хранилище не найдено');
  let content = f.content;
  if (f.truncated) content = await (await fetch(f.raw_url, { cache: 'no-store' })).text();
  return JSON.parse(content);
}

export const writeGist = (token, id, data) =>
  gh('/gists/' + id, token, { method: 'PATCH', body: JSON.stringify({ files: { [FILE]: { content: JSON.stringify(data) } } }) });

export async function createGist(token, data) {
  const g = await gh('/gists', token, {
    method: 'POST',
    body: JSON.stringify({ description: 'Плановик: данные для синхронизации', public: false, files: { [FILE]: { content: JSON.stringify(data) } } }),
  });
  return g.id;
}
