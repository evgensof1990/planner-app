// Cloudflare Worker: a relay between Telegram and the Planovik server, which cannot reach Telegram itself.
// Settings → Variables and Secrets of the worker:
//   BOT_TOKEN     — token from @BotFather (secret)
//   RELAY_SECRET  — the same value as TG_RELAY_SECRET in /etc/planovik.env (secret)
//   SERVER_URL    — https://plan.myrenthub.ru
// Settings → Triggers → Cron: "* * * * *" (every minute: morning plan and reminders).
// After deploying open https://<worker>.workers.dev/setup?secret=<RELAY_SECRET> once.
const tg = (env, method, params) =>
  fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params) }).then((r) => r.json());

const server = (env, path, init = {}) => fetch(env.SERVER_URL.replace(/\/$/, '') + path, { ...init, headers: { 'X-Relay-Secret': env.RELAY_SECRET, 'Content-Type': 'application/json', ...(init.headers || {}) } });

async function run(env, actions = []) {
  for (const a of actions) {
    const r = await tg(env, a.method, a.params);
    if (!r.ok) console.log('telegram', a.method, r.description);
  }
}

// Voice messages are downloaded here and passed on as base64 (SpeechKit takes up to 1 MB)
async function voiceOf(env, msg) {
  const v = msg?.voice || msg?.audio;
  if (!v || v.file_size > 1e6) return null;
  const f = await tg(env, 'getFile', { file_id: v.file_id });
  if (!f.ok) return null;
  const buf = new Uint8Array(await (await fetch(`https://api.telegram.org/file/bot${env.BOT_TOKEN}/${f.result.file_path}`)).arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'POST' && url.pathname === `/hook/${env.RELAY_SECRET}`) {
      const update = await req.json();
      const voice = await voiceOf(env, update.message).catch(() => null);
      const r = await server(env, '/api/telegram/update', { method: 'POST', body: JSON.stringify({ update, voice }) });
      if (!r.ok) {
        const chat = update.message?.chat.id;
        if (chat) await tg(env, 'sendMessage', { chat_id: chat, text: `Сервер планнера не ответил (${r.status}). Попробуйте позже.` });
        return new Response('ok');
      }
      await run(env, (await r.json()).actions);
      return new Response('ok');
    }
    if (url.pathname === '/setup') {
      if (url.searchParams.get('secret') !== env.RELAY_SECRET) return new Response('forbidden', { status: 403 });
      const hook = await tg(env, 'setWebhook', { url: `${url.origin}/hook/${env.RELAY_SECRET}`, allowed_updates: ['message', 'callback_query'], drop_pending_updates: true });
      const cmds = await tg(env, 'setMyCommands', {
        commands: [
          { command: 'today', description: 'План на сегодня' },
          { command: 'week', description: 'Неделя' },
          { command: 'plan', description: 'Разложить задачи без времени' },
          { command: 'help', description: 'Как пользоваться' },
        ],
      });
      const health = await server(env, '/api/telegram/update', { method: 'POST', body: '{"update":{}}' }).then((r) => r.status).catch((e) => e.message);
      return Response.json({ webhook: hook, commands: cmds.ok, server: health === 200 ? 'ok' : health });
    }
    return new Response('Planovik relay', { status: 404 });
  },

  async scheduled(event, env) {
    const r = await server(env, '/api/telegram/outbox');
    if (r.ok) await run(env, (await r.json()).actions);
  },
};
