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
 *
 * Fixed in app 1.9.2, from the audit:
 *   - A slow page that is not in the offline copy (Session Buddies, the guitar
 *     demo) was still marked "offline", so it got its own files new and the
 *     shared ones (patterns.js, wake.js...) old from the copy: the very mix
 *     above, and a page that played nothing. Now a page counts as offline only
 *     if it actually came from the offline copy.
 *   - That slow page was then fetched a second time from scratch; now the
 *     first request is simply waited for.
 *   - Two refreshes at once could delete each other's copy, leaving none.
 *     Now they take turns, and each deletes only copies older than its own.
 *   - index.html is a redirect on the host, and a redirect cannot answer a
 *     page load, so it is no longer saved: the app's page is saved as './'
 *     (and found with or without a ?query).
 *   - A new sw.js no longer refreshes the copy as it installs if a complete
 *     one exists (that moment is mid-deploy, when old and new files can be
 *     served side by side); the app asks for a refresh a while after it has
 *     started up properly instead (js/app.js).
 */
var PREFIX = 'bodhran-offline-';   // + timestamp: newest complete one is live
var MARK = './__complete__';       // written last, so a half-filled copy is never used
var TIMEOUT = 2500;

// Everything the page needs to start. These must always match each other.
var APP_FILES = [
  './', './css/app.css',
  './js/patterns.js', './js/bodhran.js', './js/drone.js',
  './js/midiout.js', './js/transport.js', './js/wake.js', './js/app.js'
];
// Kept for offline too, but a version apart they cannot break anything.
var EXTRAS = [
  './manifest.webmanifest', './release-notes/', './CHANGELOG.md',
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

function fromOffline(req, opts) {
  return findLive().then(function (name) {
    if (!name) return undefined;
    return caches.open(name).then(function (c) { return c.match(req, opts); });
  });
}

/* A redirected response cannot answer a page load: give its body afresh. */
function plain(res) {
  if (!res || !res.redirected) return res;
  return res.blob().then(function (body) {
    return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
  });
}

/* A page from the offline copy, its ?query ignored; the app itself, however
 * it is addressed (the site root or index.html), from its saved root. Any
 * other page only as itself: they used to come up as the app, with every file
 * they load missing, because those are named relative to the app. */
function offlinePage(req) {
  return fromOffline(req, { ignoreSearch: true }).then(function (hit) {
    if (hit || !isAppPage(req.url)) return hit;
    return fromOffline('./');
  }).then(plain);
}

/* Download the complete set fresh — bypassing the browser's own HTTP cache,
 * which is how stale files got mixed in before — into a new copy. Only once
 * every file is in does it become the live copy and the older ones go.
 * One refresh at a time; and each deletes only copies older than its own,
 * so it never deletes one still being filled (by another sw.js, say). */
var refreshing = Promise.resolve();
function refreshOfflineCopy() {
  var run = refreshing.then(refreshOnce, refreshOnce);
  refreshing = run.catch(function () {});
  return run;
}
function refreshOnce() {
  var name = PREFIX + Date.now();
  return caches.open(name).then(function (c) {
    return c.addAll(APP_FILES.concat(EXTRAS).map(function (u) {
      return new Request(u, { cache: 'reload' });
    })).then(function () { return c.put(MARK, new Response('ok')); });
  }).then(function () {
    liveName = null;                      // findLive() takes the newest complete copy
    return caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) {
        return k.indexOf(PREFIX) === 0 ? k < name : k.indexOf('bodhran-') === 0;   // incl. old 'bodhran-v1'
      }).map(function (k) { return caches.delete(k); }));
    });
  }, function () {
    // Something did not arrive: throw the partial copy away, keep the old one.
    return caches.delete(name);
  });
}

/* The app's own page, however it is addressed: the site root or index.html. */
function isAppPage(url) {
  var path = new URL(url).pathname, root = new URL('./', self.location.href).pathname;
  return path === root || path === root + 'index.html';
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

// A first install takes a copy at once. A new sw.js with a complete copy
// already there keeps it: the app refreshes it once it has started properly.
self.addEventListener('install', function (e) {
  e.waitUntil(findLive().then(function (name) {
    return name ? null : refreshOfflineCopy();
  }).then(function () { return self.skipWaiting(); }));
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
    var net = fetch(req);                 // one request, waited for even if slow
    var mode = function (m) {
      lastMode = m;
      if (event.resultingClientId) pageMode[event.resultingClientId] = m;
    };
    event.respondWith(
      withTimeout(net, TIMEOUT).then(function (res) {
        mode('network');
        return res;
      }).catch(function () {
        return offlinePage(req).then(function (hit) {
          if (hit) { mode('offline'); return hit; }
          // Not in the offline copy: the page comes from the network after
          // all, so every file it asks for must too.
          mode('network');
          return net;
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
