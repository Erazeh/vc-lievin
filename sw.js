// Hors connexion : l'interface est servie depuis le cache, les données restent « réseau d'abord ».
// Notifications : affiche ce qu'envoie le service push et ouvre l'app au bon endroit.
const CACHE = 'vcl-v3';
const SHELL = ['./', 'index.html', 'assets/styles.css', 'assets/app.js', 'assets/lib.js', 'assets/qr.js', 'assets/icon.svg',
  'assets/icon-180.png', 'assets/icon-512.png', 'assets/badge-96.png', 'manifest.webmanifest', 'data/data.json'];

self.addEventListener('install', e => {
  // Un fichier manquant ne doit jamais empêcher l'activation (et donc les notifications).
  e.waitUntil(caches.open(CACHE).then(c => Promise.allSettled(SHELL.map(u => c.add(u)))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // Réseau d'abord pour tout ce qui vient du site, cache en secours.
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
  );
});

self.addEventListener('push', e => {
  let n = {};
  try { n = e.data ? e.data.json() : {}; } catch { n = { body: e.data?.text() }; }
  const tasks = [self.registration.showNotification(n.title || 'VC Liévin', {
    body: n.body || '',
    tag: n.tag,
    renotify: Boolean(n.tag),
    icon: 'assets/icon-512.png',
    badge: 'assets/badge-96.png',
    lang: 'fr',
    data: { url: n.url || '#accueil' }
  })];
  // Pastille sur l'icône de l'app tant que le résultat n'a pas été vu.
  if (n.badge && self.navigator.setAppBadge) tasks.push(self.navigator.setAppBadge(n.badge).catch(() => {}));
  e.waitUntil(Promise.all(tasks));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = new URL(e.notification.data?.url || '#accueil', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const open = list.find(c => c.url.startsWith(self.registration.scope));
    if (open) return open.navigate(target).then(c => (c || open).focus()).catch(() => open.focus());
    return self.clients.openWindow(target);
  }));
});

// Le navigateur a renouvelé l'abonnement : on prévient l'app à sa prochaine ouverture.
self.addEventListener('pushsubscriptionchange', e => {
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(list => list.forEach(c => c.postMessage({ type: 'resubscribe' }))));
});
