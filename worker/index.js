/* worker/index.js — what the site does that a plain folder of files cannot:
 * on Session Buddies' own addresses, Session Buddies is the site's root.
 *
 *   /           Session Buddies' page (the file at /buddies/), the address
 *               left as it is (since 1.27.0; 1.26.x forwarded to /buddies/).
 *   /buddies/   forwarded to /, so there is one address for the page; a
 *               bookmark from 1.26.x still works. Same site, so your tunes
 *               and choices are the same at either.
 *   /sw.js      a stand-in that retires the Bodhrán's offline copy. A browser
 *               that opened one of these addresses while it still showed the
 *               Bodhrán has the Bodhrán's sw.js, which answers a slow page
 *               load with its saved copy of the Bodhrán. Browsers check sw.js
 *               for a newer one as a page opens; this one deletes that copy
 *               and unregisters itself.
 *
 * wrangler.jsonc runs this only for those three paths; every other request,
 * and every request on any other address (the Bodhrán's own,
 * bodhran.russellmagnuson.workers.dev), goes straight to the files.
 * Session Buddies' page names its files from the root (/buddies/abc.js), so
 * it works at / as it does at /buddies/.
 */
var BUDDIES_HOSTS = ['sessionbuddies.shedworks.app', 'sessionbuddies.ceardlann.dev'];

var RETIRE_SW = [
  '/* Session Buddies\' address (worker/index.js): no offline copy of the Bodhrán here. */',
  "self.addEventListener('install', function () { self.skipWaiting(); });",
  "self.addEventListener('activate', function (e) {",
  '  e.waitUntil(caches.keys().then(function (keys) {',
  "    return Promise.all(keys.filter(function (k) { return k.indexOf('bodhran-') === 0; })",
  '                           .map(function (k) { return caches.delete(k); }));',
  '  }).then(function () { return self.registration.unregister(); }));',
  '});',
  ''
].join('\n');

export default {
  fetch: function (request, env) {
    var url = new URL(request.url);
    if (BUDDIES_HOSTS.indexOf(url.hostname) === -1) return env.ASSETS.fetch(request);

    if (url.pathname === '/') {
      var page = new URL(url);
      page.pathname = '/buddies/';
      return env.ASSETS.fetch(new Request(page.toString(), request)).then(function (res) {
        var out = new Response(res.body, res);
        // As _headers has it for /buddies/*: always check for a newer copy.
        out.headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
        return out;
      });
    }
    if (url.pathname === '/buddies/') {
      url.pathname = '/';
      return Response.redirect(url.toString(), 302);
    }
    if (url.pathname === '/sw.js') {
      return new Response(RETIRE_SW, {
        headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' }
      });
    }
    return env.ASSETS.fetch(request);
  }
};
