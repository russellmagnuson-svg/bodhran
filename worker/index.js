/* worker/index.js — the one thing the site does that a plain folder of files
 * cannot: on Session Buddies' own address, the bare domain opens Session
 * Buddies rather than the Bodhrán (since Session Buddies 1.26.0).
 *
 * Every other request goes straight to the files. wrangler.jsonc runs this
 * only for "/", so a page's own files never pass through it. Any other
 * address (bodhran.russellmagnuson.workers.dev) still opens the Bodhrán at
 * "/". The forward is a 302 (temporary), so a browser never remembers it
 * and it can be changed later; it keeps any ?query, such as ?soundcheck.
 */
var BUDDIES_HOSTS = ['sessionbuddies.shedworks.app'];

export default {
  fetch: function (request, env) {
    var url = new URL(request.url);
    if (url.pathname === '/' && BUDDIES_HOSTS.indexOf(url.hostname) !== -1) {
      url.pathname = '/buddies/';
      return Response.redirect(url.toString(), 302);
    }
    return env.ASSETS.fetch(request);
  }
};
