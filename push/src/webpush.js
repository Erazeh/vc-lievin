// Web Push sans dépendance (WebCrypto) : signature VAPID (RFC 8292) et chiffrement aes128gcm (RFC 8291 / 8188).

const enc = new TextEncoder();

export const b64u = {
  encode(buf) {
    let s = '';
    for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  decode(str) {
    const s = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (str.length % 4)) % 4));
    return Uint8Array.from(s, c => c.charCodeAt(0));
  }
};

function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) { out.set(p, i); i += p.length; }
  return out;
}

async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
}

/** Chiffre `payload` pour un abonnement (clés p256dh et auth du navigateur). */
export async function encrypt(payload, p256dh, auth) {
  const uaPublic = b64u.decode(p256dh);
  const authSecret = b64u.decode(auth);
  const local = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256));

  const ikm = await hkdf(authSecret, shared, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  // Un seul enregistrement : le délimiteur 0x02 marque le dernier.
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(enc.encode(payload), new Uint8Array([2]))));

  const header = new Uint8Array(21 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, cipher);
}

let signingKey;
async function vapidKey(env) {
  if (signingKey) return signingKey;
  const pub = b64u.decode(env.VAPID_PUBLIC_KEY);
  signingKey = await crypto.subtle.importKey('jwk', {
    kty: 'EC', crv: 'P-256', d: env.VAPID_PRIVATE_KEY, x: b64u.encode(pub.slice(1, 33)), y: b64u.encode(pub.slice(33, 65))
  }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  return signingKey;
}

/** En-tête Authorization VAPID pour le service de push qui héberge `endpoint`. */
export async function vapidAuth(endpoint, env, now = Date.now()) {
  const part = obj => b64u.encode(enc.encode(JSON.stringify(obj)));
  const unsigned = `${part({ typ: 'JWT', alg: 'ES256' })}.${part({
    aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT
  })}`;
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await vapidKey(env), enc.encode(unsigned));
  return `vapid t=${unsigned}.${b64u.encode(sig)}, k=${env.VAPID_PUBLIC_KEY}`;
}

/** Envoie une notification. Renvoie le code HTTP du service de push (201 = acceptée, 404/410 = abonnement mort). */
export async function sendPush(sub, payload, env, { ttl = 86400, urgency = 'normal' } = {}) {
  const body = await encrypt(JSON.stringify(payload), sub.keys.p256dh, sub.keys.auth);
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuth(sub.endpoint, env),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(ttl),
      Urgency: urgency
    },
    body
  });
  return res.status;
}
