/* pdf.js — a tune from a PDF (or an ABC text file) you open, for Session
 * Buddies to play as if it came from the Session (since 1.22.0).
 *
 * What can be read depends on what the PDF holds:
 *   - the tune as ABC text (printed from thesession.org's ABC, a tune book
 *     typed in ABC, an .abc file): every tune in it is read, its title,
 *     rhythm, meter, note length and key from its header, the notes from its
 *     body, and played as a setting from the Session would be;
 *   - the tune as notes drawn on staves (exported from notation software, or
 *     a printed page): the notes are shapes, not text, and cannot be read
 *     reliably in a browser. Its title nearly always is text, so the title
 *     is found (the largest words on the first page) and looked up on the
 *     Session instead;
 *   - a scan or photo: no text at all, so nothing can be read from it.
 *
 * The PDF is read with Mozilla's pdf.js, fetched from cdnjs the first time a
 * PDF is opened (a megabyte; the page does not need it otherwise). Nothing
 * leaves the browser: the file is read where it is.
 *
 * P.readFile(file) -> Promise of { kind: 'abc', tunes: [...] }
 *                                | { kind: 'title', title }
 *                                | { kind: 'nothing', text: bool }
 * Each tune: { title, type, key, abc, number, meterText, rhythm, notes: [...] }
 */
(function (P) {
  'use strict';

  var LIB = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  var loading = null;
  /* pdf.js, loaded once. Its worker is fetched and started from a blob, as a
   * worker cannot be started from another site's address. */
  function lib() {
    if (window.pdfjsLib && window.pdfjsLib.GlobalWorkerOptions.workerSrc) return Promise.resolve(window.pdfjsLib);
    if (!loading) {
      loading = new Promise(function (ok, bad) {
        if (window.pdfjsLib) return ok();
        var s = document.createElement('script');
        s.src = LIB + 'pdf.min.js';
        s.onload = function () { ok(); };
        s.onerror = function () { bad(new Error('pdf.js did not load')); };
        document.head.appendChild(s);
      }).then(function () {
        return fetch(LIB + 'pdf.worker.min.js').then(function (r) {
          if (!r.ok) throw new Error('pdf.js worker: ' + r.status);
          return r.text();
        });
      }).then(function (code) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
        return window.pdfjsLib;
      });
      loading.catch(function () { loading = null; });   // a failed load can be tried again
    }
    return loading;
  }

  /* The text of a PDF as lines, page by page: each { text, size } with the
   * size of its largest letters. pdf.js hands back runs of text where they
   * sit; runs at the same height are one line, joined with a space only where
   * there is a gap between them (so "^c" or "|:" written as two runs is not
   * pulled apart). */
  var MAX_PAGES = 200;
  P.pdfLines = function (data) {
    return lib().then(function (pdfjs) {
      return pdfjs.getDocument({ data: data, isEvalSupported: false }).promise;
    }).then(function (doc) {
      var pages = [], n = Math.min(doc.numPages, MAX_PAGES), chain = Promise.resolve();
      for (var p = 1; p <= n; p++) {
        (function (p) {
          chain = chain.then(function () { return doc.getPage(p); })
            .then(function (page) { return page.getTextContent(); })
            .then(function (tc) { pages.push(linesOf(tc.items)); });
        })(p);
      }
      return chain.then(function () { return pages; });
    });
  };
  function linesOf(items) {
    var runs = items.filter(function (it) { return it.str && it.str.trim(); }).map(function (it) {
      var m = it.transform, size = Math.hypot(m[2], m[3]) || it.height || 10;
      return { x: m[4], y: m[5], size: size, w: it.width || 0, str: it.str };
    });
    runs.sort(function (a, b) { return b.y - a.y || a.x - b.x; });
    var lines = [];
    runs.forEach(function (r) {
      var line = lines[lines.length - 1];
      if (!line || Math.abs(line.y - r.y) > Math.min(line.size, r.size) * 0.45) {
        lines.push(line = { y: r.y, size: r.size, runs: [] });
      }
      line.runs.push(r);
      line.size = Math.max(line.size, r.size);
    });
    return lines.map(function (line) {
      line.runs.sort(function (a, b) { return a.x - b.x; });
      var text = '', end = null;
      line.runs.forEach(function (r) {
        if (end != null && r.x - end > r.size * 0.2 && !/\s$/.test(text) && !/^\s/.test(r.str)) text += ' ';
        text += r.str;
        end = r.x + r.w;
      });
      return { text: text.replace(/\s+$/, ''), size: line.size };
    });
  }

  /* ---------- tunes written in ABC ---------- */
  var RHYTHMS = {
    'reel': 'reel', 'jig': 'jig', 'double jig': 'jig', 'single jig': 'jig', 'slip jig': 'slip jig',
    'hop jig': 'slip jig', 'hornpipe': 'hornpipe', 'polka': 'polka', 'slide': 'slide', 'waltz': 'waltz'
  };
  var BY_METER = { '6/8': 'jig', '9/8': 'slip jig', '12/8': 'slide', '2/4': 'polka', '3/4': 'waltz',
                   '4/4': 'reel', 'C': 'reel', 'C|': 'reel', '2/2': 'reel' };
  var METERS = { reel: ['4/4', 'C', 'C|', '2/2'], hornpipe: ['4/4', 'C', 'C|', '2/2'], jig: ['6/8'],
                 'slip jig': ['9/8'], slide: ['12/8'], polka: ['2/4'], waltz: ['3/4'] };

  /* Every tune written in ABC in these lines (one page after another). A tune
   * starts at an X: or T: line, has its header fields, and its body after the
   * K: line; a field in the body (a change of key or note length) is kept as
   * an inline field; lyrics, parts and comments are left out. */
  P.abcTunes = function (lines) {
    var tunes = [], cur = null;
    function done() {
      if (cur && cur.body.length && /[A-Ga-g]/.test(cur.body.join(''))) tunes.push(cur);
      cur = null;
    }
    lines.forEach(function (raw) {
      var line = raw.replace(/^\s+/, '');
      var f = /^([A-Za-z]):\s*(.*)$/.exec(line);
      // A new tune: at X:, or at T: where no header is open (a file without X: lines).
      if (f && (f[1] === 'X' || (f[1] === 'T' && (!cur || cur.inBody)))) { done(); cur = { fields: {}, body: [], inBody: false }; }
      if (!cur) return;
      if (f && !cur.inBody) {
        var k = f[1].toUpperCase();
        if (!(k in cur.fields)) cur.fields[k] = f[2].trim();
        if (k === 'K') cur.inBody = true;
        return;
      }
      if (!cur.inBody) return;
      if (f) {                                                   // a field in the body
        if (/^[KL]$/.test(f[1])) cur.body.push('[' + f[1] + ':' + f[2].trim() + ']');
        else if (f[1] === 'M') cur.warn = 'it changes meter part way through';
        return;                                                  // w:, W:, P:, N: and the like: not notes
      }
      if (!line || /^%/.test(line)) return;
      if (!/[A-Ga-gz|]/.test(line)) return;                      // not a line of notes (a page number, a footer)
      cur.body.push(line.replace(/[\u201c\u201d]/g, '"'));     // a PDF's curly quotes round a chord name
    });
    done();
    return tunes.map(function (t, i) { return shape(t, i); });
  };

  function shape(t, i) {
    var F = t.fields, meterText = (F.M || '').replace(/\s+/g, '') || '4/4';
    var rhythm = (F.R || '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
    var type = RHYTHMS[rhythm], notes = [];
    if (type && METERS[type].indexOf(meterText) === -1 && BY_METER[meterText]) type = null;   // the meter decides
    if (!type) {
      type = BY_METER[meterText] || null;
      if (type && rhythm) notes.push('marked ' + (F.R || '').trim() + ', played as a ' + type);
    }
    var unit = (F.L || '1/8').replace(/\s+/g, ''), body = t.body.join(' ');
    if (unit !== '1/8') body = '[L:' + unit + '] ' + body;      // the page's reading counts in quavers otherwise
    var key = P.parseKey(F.K || 'C');
    if (t.warn) notes.push(t.warn);
    return {
      number: i + 1, title: (F.T || 'Tune ' + (i + 1)).trim(), rhythm: F.R || '', meterText: meterText,
      type: type, key: key.tonicName + key.mode, abc: body, notes: notes
    };
  }

  /* ---------- a title, when there is no ABC ----------
   * The largest words on the first page, as a title is printed; not a line
   * of ABC, a page number, or a lone word such as "Jig" or "Reel". */
  var NOT_TITLES = /^(reel|jig|double jig|slip jig|hornpipe|polka|slide|waltz|march|air|trad(itional)?\.?|arr\.?.*)$/i;
  P.titleOf = function (pages) {
    var first = (pages[0] || []).filter(function (l) {
      var t = l.text.trim();
      return t.length >= 3 && t.length <= 60 && /[A-Za-z]{3}/.test(t) && !/^[A-Za-z]:/.test(t) &&
             !/\|/.test(t) && !NOT_TITLES.test(t);
    });
    if (!first.length) return null;
    var top = first.reduce(function (a, b) { return b.size > a.size ? b : a; });
    return top.text.replace(/\s*[-–—]\s*(reel|jig|hornpipe|polka|slide|waltz|slip jig)\s*$/i, '').trim();
  };

  /* A file you open: a PDF, or text (an .abc file). */
  P.readFile = function (file) {
    var isPdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
    return (file.arrayBuffer ? file.arrayBuffer() : new Response(file).arrayBuffer()).then(function (buf) {
      if (!isPdf) {
        var text = new TextDecoder().decode(buf);
        return [text.split(/\r?\n/).map(function (t) { return { text: t, size: 10 }; })];
      }
      return P.pdfLines(new Uint8Array(buf));
    }).then(function (pages) {
      var all = [];
      pages.forEach(function (p) { p.forEach(function (l) { all.push(l.text); }); });
      var tunes = P.abcTunes(all);
      if (tunes.length) return { kind: 'abc', tunes: tunes };
      var title = isPdf ? P.titleOf(pages) : null;
      if (title) return { kind: 'title', title: title };
      return { kind: 'nothing', text: all.some(function (t) { return /\S/.test(t); }) };
    });
  };
})(window.BUDDIES = window.BUDDIES || {});
