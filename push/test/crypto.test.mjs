// Vérifie le chiffrement Web Push avec l'implémentation de référence (http_ece), la signature VAPID,
// et la détection des notifications sur un faux scénario.
import assert from 'node:assert/strict';
import { createECDH, createPublicKey, verify, randomBytes, generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import ece from 'http_ece';
import { encrypt, vapidAuth, b64u } from '../src/webpush.js';
import { computeEvents } from '../src/events.js';
import { updateDue } from '../src/updates.js';

// 1. Chiffrement : un « navigateur » fictif doit relire le message.
const ua = createECDH('prime256v1');
ua.generateKeys();
const auth = randomBytes(16);
const message = JSON.stringify({ title: 'Victoire 3-1 contre Arras 1', body: 'Accents, émojis 🏐 et « guillemets »' });
const body = await encrypt(message, ua.getPublicKey().toString('base64url'), auth.toString('base64url'));
const clear = ece.decrypt(Buffer.from(body), { version: 'aes128gcm', privateKey: ua, authSecret: auth.toString('base64url') });
assert.equal(clear.toString('utf8'), message);
console.log('✓ chiffrement aes128gcm relu par http_ece');

// 2. VAPID : le jeton doit être signé par la clé privée et destiné au bon service.
const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const jwk = privateKey.export({ format: 'jwk' });
const env = {
  VAPID_PRIVATE_KEY: jwk.d,
  VAPID_PUBLIC_KEY: Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]).toString('base64url'),
  VAPID_SUBJECT: 'https://erazeh.github.io/vc-lievin/'
};
const header = await vapidAuth('https://web.push.apple.com/QGtV-abc', env);
const [, token, k] = header.match(/^vapid t=([^,]+), k=(.+)$/);
const [h, p, s] = token.split('.');
const claims = JSON.parse(Buffer.from(p, 'base64url'));
assert.equal(claims.aud, 'https://web.push.apple.com');
assert.equal(claims.sub, env.VAPID_SUBJECT);
assert.ok(claims.exp > Date.now() / 1000 && claims.exp < Date.now() / 1000 + 24 * 3600);
assert.equal(k, env.VAPID_PUBLIC_KEY);
const pub = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y }, format: 'jwk' });
assert.ok(verify('sha256', Buffer.from(`${h}.${p}`), { key: pub, dsaEncoding: 'ieee-p1363' }, b64u.decode(s)));
console.log('✓ jeton VAPID ES256 valide');

// 3. Scénario : premier passage silencieux, puis résultat, changement d'horaire et rappels.
const live = JSON.parse(readFileSync(new URL('../../data/data.json', import.meta.url)));
// Données figées au 22 octobre : ces matchs n'étaient pas encore joués (le test ne dépend pas de la date du jour).
const data = structuredClone(live);
for (const code of ['1MA012', '1MA019', '1MA020']) {
  const m = data.matches.find(x => x.code === code);
  Object.assign(m, { played: false, venueName: m.venueName || data.venues[m.venue]?.name || null });
  delete m.sets; delete m.setScores; delete m.points;
}
// Avant le match, la FFVB indiquait le club désigné pour l'arbitrage.
data.matches.find(x => x.code === '1MA020').referee = 'LIEVIN';
const at = iso => new Date(iso).getTime();
const first = computeEvents(data, null, at('2026-10-22T08:00:00Z'));
assert.equal(first.notifications.length, 0, 'premier passage silencieux');

const eve = computeEvents(data, first.state, at('2026-10-23T16:05:00Z')); // vendredi 18h05 à Paris
const eveTitles = eve.notifications.map(n => n.title);
assert.ok(eveTitles.includes('Demain 21h00 : Liévin 2 – Arras 1'), eveTitles.join(' | '));
assert.equal(computeEvents(data, eve.state, at('2026-10-23T16:20:00Z')).notifications.filter(n => n.topic === 'reminders').length, 0, 'pas de doublon');
const day = computeEvents(data, eve.state, at('2026-10-24T16:10:00Z')); // samedi 18h10
assert.ok(day.notifications.some(n => n.title === 'Ce soir 21h00 : Liévin 2 – Arras 1'), day.notifications.map(n => n.title).join(' | '));

const played = structuredClone(data);
Object.assign(played.matches.find(m => m.code === '1MA012'), {
  played: true, sets: [3, 1], setScores: [[25, 20], [23, 25], [25, 18], [25, 22]], points: [98, 85]
});
const moved = played.matches.find(m => m.code === '1MA019');
moved.time = '20:00';
const after = computeEvents(played, day.state, at('2026-10-24T21:40:00Z'));
const res = after.notifications.find(n => n.topic === 'results');
assert.equal(res.title, 'Victoire 3-1 contre Arras 1');
assert.match(res.body, /^25-20 · 23-25 · 25-18 · 25-22 · \+3 pts/);
const chg = after.notifications.find(n => n.topic === 'changes');
assert.match(chg.body, /jeudi 5 novembre à 20h00 \(au lieu de jeudi 5 novembre à 20h30\)/);
console.log('✓ rappels, résultat et changement d\'horaire détectés');
console.log('  ', eveTitles[0], '—', eve.notifications[0].body);
console.log('  ', res.title, '—', res.body);
console.log('  ', chg.title, '—', chg.body);

const refs = computeEvents(data, first.state, at('2026-10-30T17:10:00Z')).notifications.filter(n => n.topic === 'referee');
assert.equal(refs[0]?.title, 'Arbitrage demain : Arras 1 – Cœur de Flandre 2');
console.log('✓ rappel d\'arbitrage :', refs[0].title, '—', refs[0].body);

// 4. Planification des mises à jour : matin, soirs de match, filet de sécurité, pas de doublon.
{
  const T = data.config.team;
  const m = data.matches.find(x => x.code === '1MA012'); // Liévin – Arras, samedi 24/10 à 21h
  const unplayed = structuredClone(data);
  Object.assign(unplayed.matches.find(x => x.code === '1MA012'), { played: false });
  unplayed.matches.forEach(x => { if (x.code !== '1MA012') x.played = true; });
  const recent = at('2026-10-24T20:00:00Z');
  assert.equal(updateDue(unplayed, at('2026-10-24T04:35:00Z'), { at: recent - 864e5 }), 'full', '6h35 à Paris : mise à jour complète');
  assert.equal(updateDue(unplayed, at('2026-10-24T20:00:00Z'), { at: recent - 3600e3 }), null, '22h : trop tôt après le coup d\'envoi');
  assert.equal(updateDue(unplayed, at('2026-10-24T20:35:00Z'), { at: recent - 3600e3 }), 'quick', '22h35 : on guette le résultat');
  assert.equal(updateDue(unplayed, at('2026-10-24T20:50:00Z'), { at: at('2026-10-24T20:35:00Z') }), null, 'pas deux fois en 25 min');
  assert.equal(updateDue(unplayed, at('2026-10-25T05:15:00Z'), { at: at('2026-10-25T04:00:00Z') }), null, 'fenêtre de 10 h passée, avant 6h30');
  assert.equal(updateDue(data, at('2026-10-25T15:00:00Z'), { at: at('2026-10-25T04:30:00Z') }), 'quick', 'filet : plus de 8 h sans mise à jour');
  console.log('✓ planification : matin, soir de match, anti-doublon, filet de sécurité');
}
