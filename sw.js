/* sw.js — offline support.
 *
 * A session happens in a pub basement with no signal, so the app has to work
 * with no network at all.
 *
 * Strategy: network-first with a short timeout, falling back to cache. Online
 * you always get the current deploy, so pushing an update is never invisible.
 * On wi-fi that is absent OR merely terrible — the worse case, because a hung
 * request beats no request to a spinner — the timeout drops you straight to
 * the cached copy.
 */
var CACHE = 'bodhran-v1';
var TIMEOUT = 2500;

var ASSETS = [
  './', './index.html', './css/app.css',
  './js/patterns.js', './js/bodhran.js', './js/drone.js',
  './js/midiout.js', './js/transport.js', './js/app.js',
  './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(ASSETS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (k) {
          return k === CACHE ? null : caches.delete(k);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE).then(function (cache) {
      var timed = new Promise(function (_, reject) {
        setTimeout(function () { reject(new Error('timeout')); }, TIMEOUT);
      });

      return Promise.race([fetch(req), timed])
        .then(function (res) {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(function (err) {
          return cache.match(req).then(function (hit) {
            if (hit) return hit;
            // A deep link offline still gets the app shell.
            if (req.mode === 'navigate') return cache.match('./index.html');
            throw err;
          });
        });
    })
  );
});
