// Planovik server: stores the planner document, syncs it with Yandex Calendar (CalDAV)
// and serves the app's API. Configuration comes from environment variables (see server/README.md).
import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { Store } from './store.js';
import { CalDav } from './caldav.js';
import { CalendarSync } from './calsync.js';
import { TelegramBot, speechKit } from './telegram.js';

process.env.TZ ||= 'Europe/Moscow';

const env = process.env;
const PORT = +(env.PORT || 3300);
const HOST = env.HOST || '127.0.0.1';
const TOKEN = env.PLANNER_TOKEN || '';
const ORIGINS = (env.ALLOWED_ORIGINS || 'https://evgensof1990.github.io,https://localhost,capacitor://localhost,http://localhost:5173').split(',').map((s) => s.trim());
const PULL_MINUTES = +(env.PULL_MINUTES || 5);

if (TOKEN.length < 16) {
  console.error('PLANNER_TOKEN не задан или короче 16 символов');
  process.exit(1);
}

const store = new Store(env.DATA_DIR || './data');
const calsync =
  env.YANDEX_LOGIN && env.YANDEX_APP_PASSWORD
    ? new CalendarSync({
        store,
        dav: new CalDav({ url: env.CALDAV_URL || 'https://caldav.yandex.ru', user: env.YANDEX_LOGIN, password: env.YANDEX_APP_PASSWORD }),
        workName: env.CAL_WORK || 'Плановик Работа',
        personalName: env.CAL_PERSONAL || 'Плановик Личное',
      })
    : null;

const stt = env.SPEECHKIT_API_KEY ? speechKit(env.SPEECHKIT_API_KEY) : null;
const RELAY_SECRET = env.TG_RELAY_SECRET || '';
const bot = new TelegramBot({ store, calsync, stt, digestTime: env.DIGEST_TIME || '08:30' });

let pushTimer = null;
const schedulePush = () => {
  if (!calsync) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => calsync.run(), 3000);
};
store.onChange(schedulePush);

const same = (a, b) => {
  const got = Buffer.from(a || '');
  const want = Buffer.from(b);
  return want.length > 0 && got.length === want.length && timingSafeEqual(got, want);
};
const authorized = (req) => same((req.headers.authorization || '').replace(/^Bearer\s+/i, ''), TOKEN);
// the Cloudflare relay authenticates with its own secret
const RELAY_ROUTES = new Set(['/api/telegram/update', '/api/telegram/outbox']);
const relayAuthorized = (req) => RELAY_SECRET.length >= 16 && same(req.headers['x-relay-secret'], RELAY_SECRET);

async function readRaw(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw Object.assign(new Error('Слишком длинная запись: до 30 секунд'), { status: 413 });
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

const send = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
};

async function readJson(req, limit = 20e6) {
  return JSON.parse((await readRaw(req, limit)).toString('utf8') || 'null');
}

const calStatus = () => {
  const st = store.state;
  return {
    enabled: !!calsync,
    error: st.error || null,
    syncedAt: st.syncedAt || null,
    calendars: st.calendars.map(({ href, name, color }) => ({ href, name, color })),
    work: calsync?.ownCal('work')?.name || null,
    personal: calsync?.ownCal('personal')?.name || null,
  };
};

const routes = {
  'GET /api/health': () => [200, { ok: true }],
  'GET /api/data': () => [200, store.data],
  'POST /api/sync': async (req) => {
    const body = await readJson(req);
    if (!body || !Array.isArray(body.tasks)) return [400, { error: 'Ожидается документ плановика' }];
    return [200, store.sync(body)];
  },
  'GET /api/calendar/status': () => [200, calStatus()],
  'POST /api/calendar/sync': async () => {
    if (!calsync) return [409, { error: 'Календарь не настроен на сервере' }];
    await calsync.run();
    return [200, calStatus()];
  },
  'GET /api/events': (req, url) => {
    const from = +url.searchParams.get('from') || Date.now() - 7 * 864e5;
    const to = +url.searchParams.get('to') || Date.now() + 60 * 864e5;
    return [200, { events: calsync ? calsync.events(from, to) : [], pulledAt: store.state.pulledAt || null }];
  },
  'GET /api/telegram/status': () => [200, { ...bot.status(), relay: RELAY_SECRET.length >= 16 }],
  'POST /api/telegram/pair': () => [200, bot.pair()],
  'POST /api/telegram/update': async (req) => {
    const body = await readJson(req, 3e6);
    return [200, { actions: await bot.handle(body.update || {}, body.voice || null) }];
  },
  'GET /api/telegram/outbox': () => [200, { actions: bot.takeOutbox() }],
  'POST /api/voice': async (req, url) => {
    if (!stt) return [409, { error: 'Распознавание голоса не настроено на сервере' }];
    const audio = await readRaw(req, 1e6);
    return [200, { text: await stt(audio, url.searchParams.get('format') || 'lpcm') }];
  },
};

const server = createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (origin && ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }
  const url = new URL(req.url, 'http://x');
  const route = routes[`${req.method} ${url.pathname}`];
  if (!route) return send(res, 404, { error: 'Не найдено' });
  const ok = url.pathname === '/api/health' || (RELAY_ROUTES.has(url.pathname) ? relayAuthorized(req) : authorized(req));
  if (!ok) return send(res, 401, { error: 'Нужен ключ доступа' });
  try {
    const [status, body] = await route(req, url);
    send(res, status, body);
  } catch (e) {
    console.error(e);
    send(res, e.status || 500, { error: e.status ? e.message : 'Ошибка сервера' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Плановик слушает http://${HOST}:${PORT}, календарь ${calsync ? 'подключён' : 'не настроен'}, Telegram ${RELAY_SECRET ? 'через relay' : 'не настроен'}, голос ${stt ? 'включён' : 'выключен'}`);
  if (calsync) {
    calsync.run();
    setInterval(() => calsync.run(), PULL_MINUTES * 6e4);
  }
  setInterval(() => bot.tick(), 6e4);
});
