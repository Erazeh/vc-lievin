// Service de notifications du site VC Liévin.
// - POST /subscribe, /unsubscribe, /test : appelés par l'application installée.
// - Toutes les 15 min : lit data/data.json du site, repère rappels, résultats et changements, puis notifie.

import { sendPush, b64u } from './webpush.js';
import { computeEvents, TOPICS } from './events.js';

// Seuls les vrais services de push des navigateurs sont acceptés (Apple, Google, Mozilla, Microsoft).
const PUSH_HOSTS = /(^|\.)(web\.push\.apple\.com|fcm\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com)$/;
const BATCH = 40; // sous la limite de sous-requêtes d'une exécution gratuite

const json = (body, status, origin) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', ...cors(origin) }
});

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}

async function hash(text) {
  return b64u.encode(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))).slice(0, 32);
}

function validSubscription(s) {
  try {
    const u = new URL(s.endpoint);
    return u.protocol === 'https:' && PUSH_HOSTS.test(u.hostname) && typeof s.keys?.p256dh === 'string' && typeof s.keys?.auth === 'string'
      && s.keys.p256dh.length < 200 && s.keys.auth.length < 60;
  } catch { return false; }
}

async function listSubs(env) {
  const subs = [];
  let cursor;
  do {
    const page = await env.KV.list({ prefix: 'sub:', cursor });
    for (const k of page.keys) {
      const v = await env.KV.get(k.name, 'json');
      if (v) subs.push({ key: k.name, ...v });
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  return subs;
}

/** Envoie au plus BATCH notifications, met le reste de côté et se relance pour la suite. */
async function flush(env, ctx, jobs) {
  const now = jobs.slice(0, BATCH), later = jobs.slice(BATCH);
  const dead = new Set();
  await Promise.all(now.map(async j => {
    try {
      const status = await sendPush(j.sub, j.payload, env, { urgency: j.payload.urgency || 'normal' });
      if (status === 404 || status === 410) dead.add(j.sub.key);
      else if (status >= 400) console.warn('push refusé', status, new URL(j.sub.endpoint).hostname);
    } catch (e) { console.warn('push en échec', e.message); }
  }));
  for (const k of dead) await env.KV.delete(k);
  if (later.length) {
    await env.KV.put('outbox', JSON.stringify(later));
    ctx.waitUntil(env.SELF.fetch('https://self/flush', { method: 'POST', headers: { 'x-flush': await hash(env.VAPID_PRIVATE_KEY) } }));
  }
  return { sent: now.length - dead.size, removed: dead.size, pending: later.length };
}

async function run(env, ctx) {
  const res = await fetch(new URL('data/data.json', env.SITE_URL), { cf: { cacheTtl: 60 } });
  if (!res.ok) throw new Error(`data.json : HTTP ${res.status}`);
  const data = await res.json();
  const prev = await env.KV.get('state', 'json');
  const { notifications, state } = computeEvents(data, prev);
  const next = JSON.stringify(state);
  if (next !== JSON.stringify(prev)) await env.KV.put('state', next);
  if (!notifications.length) return { notifications: 0 };
  const subs = await listSubs(env);
  const jobs = [];
  for (const n of notifications) for (const sub of subs) if (sub.topics?.includes(n.topic)) jobs.push({ sub, payload: n });
  console.log(`${notifications.length} notification(s), ${jobs.length} envoi(s)`);
  return flush(env, ctx, jobs);
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const origin = req.headers.get('Origin');
    const allowed = [env.ALLOWED_ORIGIN, 'http://localhost:8080'].includes(origin) ? origin : env.ALLOWED_ORIGIN;
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(allowed) });
    if (req.method === 'GET' && url.pathname === '/') return json({ ok: true, service: 'vc-lievin-push', topics: TOPICS }, 200, allowed);
    if (req.method !== 'POST') return json({ error: 'Méthode non prise en charge' }, 405, allowed);

    if (url.pathname === '/flush') {
      if (req.headers.get('x-flush') !== await hash(env.VAPID_PRIVATE_KEY)) return json({ error: 'Refusé' }, 403, allowed);
      const jobs = (await env.KV.get('outbox', 'json')) || [];
      await env.KV.delete('outbox');
      return json(await flush(env, ctx, jobs), 200, allowed);
    }

    let body;
    try { body = await req.json(); } catch { return json({ error: 'Corps JSON attendu' }, 400, allowed); }

    if (url.pathname === '/subscribe') {
      const s = body.subscription;
      if (!s || !validSubscription(s)) return json({ error: 'Abonnement invalide' }, 400, allowed);
      const topics = (Array.isArray(body.topics) ? body.topics : TOPICS).filter(t => TOPICS.includes(t));
      await env.KV.put(`sub:${await hash(s.endpoint)}`, JSON.stringify({ endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth }, topics, since: new Date().toISOString() }));
      return json({ ok: true, topics }, 200, allowed);
    }

    if (url.pathname === '/unsubscribe') {
      if (typeof body.endpoint !== 'string') return json({ error: 'Adresse manquante' }, 400, allowed);
      await env.KV.delete(`sub:${await hash(body.endpoint)}`);
      return json({ ok: true }, 200, allowed);
    }

    if (url.pathname === '/log') {
      // Erreurs remontées par l'app (aucune donnée personnelle) : visibles avec « wrangler tail ».
      console.warn('app', JSON.stringify(body).slice(0, 600));
      return json({ ok: true }, 200, allowed);
    }

    if (url.pathname === '/test') {
      if (typeof body.endpoint !== 'string') return json({ error: 'Adresse manquante' }, 400, allowed);
      const key = `sub:${await hash(body.endpoint)}`;
      const sub = await env.KV.get(key, 'json');
      if (!sub) return json({ error: 'Abonnement inconnu' }, 404, allowed);
      const limit = `test:${key}`;
      if (await env.KV.get(limit)) return json({ error: 'Un test vient d\'être envoyé, réessayez dans une minute.' }, 429, allowed);
      await env.KV.put(limit, '1', { expirationTtl: 60 });
      const status = await sendPush(sub, {
        title: 'Notifications activées', body: 'Vous serez prévenu ici des matchs, des résultats et des changements d\'horaire.', url: '#app', tag: 'test'
      }, env, { ttl: 600, urgency: 'high' });
      if (status === 404 || status === 410) await env.KV.delete(key);
      return json({ ok: status < 300, status }, status < 300 ? 200 : 502, allowed);
    }

    return json({ error: 'Adresse inconnue' }, 404, allowed);
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(run(env, ctx).then(r => console.log('passage', JSON.stringify(r)), e => console.error('passage en échec', e.message)));
  }
};
