// Jamal Life service worker: offline shell only.
// It never touches requests to other origins (Supabase, Gemini): those must always hit the network,
// otherwise a cached "session OK" answer hides an expired login and blocks sync.
const CACHE = 'jamal-life-v61-0';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => e.waitUntil(
  caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
));

self.addEventListener('activate', e => e.waitUntil(
  caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())
));

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    // Network first so updates arrive immediately; cached shell when offline.
    e.respondWith(
      fetch(req)
        .then(res => {
          if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put('./index.html', copy)); }
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Static files: cache first, refresh in the background.
  e.respondWith(
    caches.match(req).then(hit => {
      const net = fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});

// Tapping a reminder opens (or focuses) the app.
// Buttons «Готово» / «Через 15 мин» on a task reminder are handed to the open app,
// or the app is opened with the action in the link.
self.addEventListener('notificationclick', e => {
  const act = e.action, task = e.notification.data && e.notification.data.taskId;
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const open = list.find(c => 'focus' in c);
      if (task && (act === 'done' || act === 'snooze')) {
        if (open) { open.postMessage({ type: 'jl-action', a: act, task }); return; }
        return self.clients.openWindow('./index.html?jlact=' + act + '&task=' + encodeURIComponent(task));
      }
      return open ? open.focus() : self.clients.openWindow('./index.html');
    })
  );
});
