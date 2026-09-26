/* sw.js — offline support.
 *
 * A session happens in a pub basement with no signal, so the app has to work
 * with no network at all.
 *
 * The rule that matters most: a page must never run a mix of old and new
 * files. A newer app.js with an older drum file can fail during start-up,
 * which means silence. Patchy wi-fi used to cause exactly that: each file
 * raced its own 2.5s timeout, so a slow file came from the old offline copy
 * while the rest arrived new.
 *
 * So the choice between network and offline copy is made once per page load,
 * on the page itself, and every file that page asks for follows it:
 *   - The page is fetched from the network with a 2.5s timeout. If it arrives,
 *     every file comes from the network too, however slowly.
 *   - If it does not arrive, the page and every file come from the offline copy.
 * And the offline copy only ever changes as a complete set: at install, and
 * again whenever a page has started up properly online, the whole set is
 * downloaded fresh in one go, and it only replaces the old copy if every file
 * arrived.
 */
var PREFIX = 'bodhran-offline-';   // + timestamp: newest complete one is live
var MARK = './__complete__';       // written last, so a half-filled copy is never used
var TIMEOUT = 2500;

// Everything the page needs to start. These must always match each other.
var APP_FILES = [
  './', './index.html', './css/app.css',
  './js/patterns.js', './js/bodhran.js', './js/drone.js',
  './js/midiout.js', './js/transport.js', './js/app.js'
];
// Kept for offline too, but a version apart they cannot break anything.
var EXTRAS = [
  './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'
];

/* ---------- the offline copy ---------- */

var liveName = null;

function findLive() {
  if (liveName) return Promise.resolve(liveName);
  return caches.keys().then(function (keys) {
    var names = keys.filter(function (k) { return k.indexOf(PREFIX) === 0; })
                    .sort().reverse();
    return names.reduce(function (found, name) {
      return found.then(function (hit) {
        if (hit) return hit;
        return caches.open(name)
          .then(function (c) { return c.match(MARK); })
          .then(function (m) { return m ? name : null; });
      });
    }, Promise.resolve(null));
  }).then(function (name) { liveName = name; return name; });
}

function fromOffline(req) {
  return findLive().then(function (name) {
    if (!name) return undefined;
    return caches.open(name).then(function (c) { return c.match(req); });
  });
}

/* Download the complete set fresh — bypassing the browser's own HTTP cache,
 * which is how stale files got mixed in before — into a new copy. Only once
 * every file is in does it become the live copy and the old ones go. */
function refreshOfflineCopy() {
  var name = PREFIX + Date.now();
  return caches.open(name).then(function (c) {
    return c.addAll(APP_FILES.concat(EXTRAS).map(function (u) {
      return new Request(u, { cache: 'reload' });
    })).then(function () { return c.put(MARK, new Response('ok')); });
  }).then(function () {
    liveName = name;
    return caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) {
        return k !== name && k.indexOf('bodhran-') === 0;   // incl. old 'bodhran-v1'
      }).map(function (k) { return caches.delete(k); }));
    });
  }, function () {
    // Something did not arrive: throw the partial copy away, keep the old one.
    return caches.delete(name);
  });
}

/* ---------- which source each page load uses ---------- */

// Keyed by the page (client) where the browser tells us; the last page load's
// choice is the fallback when it does not.
var pageMode = {};
var lastMode = 'network';

function modeFor(clientId) {
  return (clientId && pageMode[clientId]) || lastMode;
}

function withTimeout(promise, ms) {
  return new Promise(function (resolve, reject) {
    var t = setTimeout(function () { reject(new Error('timeout')); }, ms);
    promise.then(function (v) { clearTimeout(t); resolve(v); },
                 function (e) { clearTimeout(t); reject(e); });
  });
}

/* ---------- lifecycle ---------- */

self.addEventListener('install', function (e) {
  e.waitUntil(refreshOfflineCopy().then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(self.clients.claim());
});

// A page tells us it started up properly. If it came from the network, this
// version is known to start, so take a complete fresh copy for offline use.
self.addEventListener('message', function (e) {
  if (!e.data || e.data.type !== 'started') return;
  var id = e.source && e.source.id;
  if (modeFor(id) === 'network') e.waitUntil(refreshOfflineCopy());
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      withTimeout(fetch(req), TIMEOUT).then(function (res) {
        lastMode = 'network';
        if (event.resultingClientId) pageMode[event.resultingClientId] = 'network';
        return res;
      }).catch(function () {
        lastMode = 'offline';
        if (event.resultingClientId) pageMode[event.resultingClientId] = 'offline';
        return fromOffline('./index.html').then(function (hit) {
          return hit || fetch(req);
        });
      })
    );
    return;
  }

  if (modeFor(event.clientId) === 'network') {
    // The page came from the network, so its files do too — no timeout, or a
    // slow file would come from the offline copy and not match. Only if the
    // network actually fails does the offline copy stand in.
    event.respondWith(fetch(req).catch(function (err) {
      return fromOffline(req).then(function (hit) { if (hit) return hit; throw err; });
    }));
  } else {
    event.respondWith(fromOffline(req).then(function (hit) {
      return hit || fetch(req);
    }));
  }
});
