/* buddies.js — Session Buddies (called Session Players until 1.8.0): find a
 * tune on thesession.org (a jig, reel, hornpipe, polka, slide or slip jig),
 * give it a guitar and bodhrán backing with the tune on flute and
 * concertina, and play along.
 *
 * The Session lets a page read its tunes straight from the browser (its API
 * answers any site), so there is no server of our own. The tune is read
 * from its ABC (abc.js), given chords (harmony.js) and shapes (shapes.js),
 * and played by the guitar demo's engine: the same guitar, flute and drum,
 * the same clock. A tune can be saved to a file and opened again with its
 * chords as they were left, with no need to fetch it again.
 */
(function () {
  'use strict';

  /* Session Buddies' own version, apart from the app's and the demo's: shown
   * next to the title and at the foot. Bump it with every change pushed (the
   * last number for a fix, the middle for something new) and add it to the
   * "Session Buddies" sections of CHANGELOG.md and the release notes. */
  var VERSION = '1.11.0';

  var $ = function (id) { return document.getElementById(id); };
  var P = window.BUDDIES, G = window.GTR, T = window.TRAD, TPQ = P.TPQ;
  var API = 'https://thesession.org';
  var FILE_FORMAT = 'session-buddies';
  // Files saved before the rename say 'session-players'; they open just the same.
  var FORMATS = [FILE_FORMAT, 'session-players'];

  /* ---------- tune types ----------
   * Keyed by the Session's own names for them. per: quavers to the beat the
   * tempo counts; half: the quaver a bar's second chord comes in on (as
   * abc.js's meter has it); clicks: the count-in; final: where the last
   * bar's closing strokes fall. The strums are the demo's for a jig; a
   * reel's run on eight quavers, leaning on 1 and 3. The drum plays the
   * app's plain pattern for the type (since 1.10.0, with the hornpipe,
   * polka, slide and slip jig).
   *
   * A hornpipe swings, backing and all, by the Swing control (since 1.11.0;
   * swingNow()). 1.10.0 swung it 60:40 and The Boys of Bluehill sounded
   * "devoid of the swing a hornpipe normally has"; 1.10.1's 2:1 "almost
   * slightly too much". So it starts at the app's hornpipe swing, 64:36,
   * and you set it by ear. */
  function grid(id, fallback) {
    var t = T.tuneById && T.tuneById(id);
    return t && t.id === id && t.grids && t.grids.simple ? t.grids.simple[0] : fallback;
  }
  function appSwing(id, fallback) {
    var t = T.tuneById && T.tuneById(id);
    return t && t.id === id && t.swing ? t.swing : fallback;
  }
  var TYPES = {
    jig: {
      name: 'Jig', meter: '6/8', slots: 6, half: 3, per: 3, unit: 'per dotted crotchet',
      bpm: { start: 100, min: 60, max: 130 }, grid: grid('jig', 'D-tD-t'),
      clicks: [[0, 0.9], [3, 0.55]], final: [0, 3],
      strums: {
        lilt: { text: 'Down on the beat and up on the third quaver of each group: DUM-da, DUM-da. ' +
                      'The jig’s own lilt.',
                slots: [{ s: 0, d: 'D', v: 1 }, { s: 2, d: 'U', v: 0.5 }, { s: 3, d: 'D', v: 0.8 }, { s: 5, d: 'U', v: 0.5 }] },
        drive: { text: 'All six quavers, down-up-down, up-down-up, leaning on 1 and 4. More push.',
                 slots: [{ s: 0, d: 'D', v: 1 }, { s: 1, d: 'U', v: 0.4 }, { s: 2, d: 'D', v: 0.55 },
                         { s: 3, d: 'U', v: 0.85 }, { s: 4, d: 'D', v: 0.55 }, { s: 5, d: 'U', v: 0.4 }] }
      }
    },
    reel: {
      name: 'Reel', meter: '4/4', slots: 8, half: 4, per: 2, unit: 'per crotchet',
      bpm: { start: 100, min: 60, max: 160 }, grid: grid('reel', 'DtdtDtdt'),
      clicks: [[0, 0.9], [2, 0.55], [4, 0.7], [6, 0.55]], final: [0, 4],
      strums: {
        lilt: { text: 'Down on every beat, and up after the second and the fourth, leaning on 1 and 3: ' +
                      'the reel’s swing without crowding the tune.',
                slots: [{ s: 0, d: 'D', v: 1 }, { s: 2, d: 'D', v: 0.65 }, { s: 3, d: 'U', v: 0.45 },
                        { s: 4, d: 'D', v: 0.85 }, { s: 6, d: 'D', v: 0.65 }, { s: 7, d: 'U', v: 0.45 }] },
        drive: { text: 'Every quaver, down-up all the way, leaning on 1 and 3. More push.',
                 slots: [{ s: 0, d: 'D', v: 1 }, { s: 1, d: 'U', v: 0.4 }, { s: 2, d: 'D', v: 0.6 },
                         { s: 3, d: 'U', v: 0.45 }, { s: 4, d: 'D', v: 0.85 }, { s: 5, d: 'U', v: 0.4 },
                         { s: 6, d: 'D', v: 0.6 }, { s: 7, d: 'U', v: 0.45 }] }
      }
    },
    hornpipe: {
      name: 'Hornpipe', meter: '4/4', slots: 8, half: 4, per: 2, unit: 'per crotchet',
      bpm: { start: 80, min: 50, max: 120 }, grid: grid('hornpipe', 'DtdtDtdt'), swing: appSwing('hornpipe', 0.84),
      clicks: [[0, 0.9], [2, 0.55], [4, 0.7], [6, 0.55]], final: [0, 2, 4],
      strums: {
        lilt: { text: 'Down on every beat, and up after the second and the fourth, swung long-short: ' +
                      'the hornpipe’s dotted walk.',
                slots: [{ s: 0, d: 'D', v: 1 }, { s: 2, d: 'D', v: 0.65 }, { s: 3, d: 'U', v: 0.45 },
                        { s: 4, d: 'D', v: 0.85 }, { s: 6, d: 'D', v: 0.65 }, { s: 7, d: 'U', v: 0.45 }] },
        drive: { text: 'Every quaver, down-up, swung long-short, leaning on 1 and 3. More push.',
                 slots: [{ s: 0, d: 'D', v: 1 }, { s: 1, d: 'U', v: 0.4 }, { s: 2, d: 'D', v: 0.6 },
                         { s: 3, d: 'U', v: 0.45 }, { s: 4, d: 'D', v: 0.85 }, { s: 5, d: 'U', v: 0.4 },
                         { s: 6, d: 'D', v: 0.6 }, { s: 7, d: 'U', v: 0.45 }] }
      }
    },
    polka: {
      name: 'Polka', meter: '2/4', slots: 4, half: 2, per: 2, unit: 'per crotchet',
      bpm: { start: 120, min: 60, max: 170 }, grid: grid('polka', 'Dtdt'),
      clicks: [[0, 0.9], [2, 0.6]], final: [0, 2],
      strums: {
        lilt: { text: 'Down on each beat and up between, the beats leant on: oom-pa, oom-pa.',
                slots: [{ s: 0, d: 'D', v: 1 }, { s: 1, d: 'U', v: 0.45 }, { s: 2, d: 'D', v: 0.8 }, { s: 3, d: 'U', v: 0.5 }] },
        drive: { text: 'The same strokes with the ups between the beats pushed: the polka’s bounce.',
                 slots: [{ s: 0, d: 'D', v: 0.95 }, { s: 1, d: 'U', v: 0.7 }, { s: 2, d: 'D', v: 0.8 }, { s: 3, d: 'U', v: 0.75 }] }
      }
    },
    slide: {
      name: 'Slide', meter: '12/8', slots: 12, half: 6, per: 3, unit: 'per dotted crotchet',
      bpm: { start: 115, min: 60, max: 160 }, grid: grid('slide', 'D-tD-tD-tD-t'),
      clicks: [[0, 0.9], [3, 0.5], [6, 0.7], [9, 0.5]], final: [0, 6],
      strums: {
        lilt: { text: 'Down on each of the four beats and up on the third quaver of each, leaning on 1 and 3: ' +
                      'the slide’s long swing.',
                slots: [{ s: 0, d: 'D', v: 1 }, { s: 2, d: 'U', v: 0.45 }, { s: 3, d: 'D', v: 0.65 }, { s: 5, d: 'U', v: 0.45 },
                        { s: 6, d: 'D', v: 0.85 }, { s: 8, d: 'U', v: 0.45 }, { s: 9, d: 'D', v: 0.65 }, { s: 11, d: 'U', v: 0.45 }] },
        drive: { text: 'All twelve quavers, down-up-down, up-down-up, leaning on 1 and 3. More push.',
                 slots: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(function (q) {
                   return { s: q, d: q % 2 ? 'U' : 'D', v: q === 0 ? 1 : q === 6 ? 0.85 : q % 3 === 0 ? 0.65 : 0.4 };
                 }) }
      }
    },
    'slip jig': {
      name: 'Slip jig', meter: '9/8', slots: 9, half: 6, per: 3, unit: 'per dotted crotchet',
      bpm: { start: 105, min: 60, max: 140 }, grid: grid('slipjig', 'D-tD-tD-t'),
      clicks: [[0, 0.9], [3, 0.55], [6, 0.55]], final: [0, 6],
      strums: {
        lilt: { text: 'Down on each of the three beats and up on the third quaver of each: DUM-da, DUM-da, DUM-da. ' +
                      'The slip jig’s lilt.',
                slots: [{ s: 0, d: 'D', v: 1 }, { s: 2, d: 'U', v: 0.5 }, { s: 3, d: 'D', v: 0.75 }, { s: 5, d: 'U', v: 0.5 },
                        { s: 6, d: 'D', v: 0.8 }, { s: 8, d: 'U', v: 0.5 }] },
        drive: { text: 'All nine quavers, down-up-down, up-down-up, down-up-down, leaning on the first. More push.',
                 slots: [0, 1, 2, 3, 4, 5, 6, 7, 8].map(function (q) {
                   return { s: q, d: q % 2 ? 'U' : 'D', v: q === 0 ? 1 : q % 3 === 0 ? 0.75 : 0.4 };
                 }) }
      }
    }
  };

  // "Jigs, reels, hornpipes, polkas, slides and slip jigs", for the page to say.
  var PLAYABLE = (function () {
    var n = Object.keys(TYPES).map(function (k) { return TYPES[k].name.toLowerCase() + 's'; });
    n[0] = n[0].charAt(0).toUpperCase() + n[0].slice(1);
    return n.slice(0, -1).join(', ') + ' and ' + n[n.length - 1];
  })();

  /* ---------- how loud each sound is: the demo's measured balance ----------
   * The concertina sits about 1 dB under the flute, each played as the page
   * plays it: a bright reed carries more than its level says. (Recorded
   * since 1.7.0: its notes, levelled to -18 dBFS, measured 2.8 dB under at
   * the synthesised one's 0.16, hence 0.6.) */
  var MIX = { guitar: 0.7, tune: 0.18, concertina: 0.6, drum: 0.7 };
  var DRUM = { lift: { f: 2500, q: 0.7, gain: 9 } };
  // Saved settings keep their 'players.' names from before the rename, so
  // the last tune, volumes and tuning carry over to the new address.
  function stored(key, fallback) {
    try { var v = localStorage.getItem(key); return v == null ? fallback : v; } catch (e) { return fallback; }
  }
  function store(key, value) { try { localStorage.setItem(key, value); } catch (e) {} }
  var vol = { guitar: 1, tune: 1, concertina: 1, drum: 1 };
  try {
    var savedVol = JSON.parse(stored('players.volume', '{}'));
    Object.keys(vol).forEach(function (k) {
      if (typeof savedVol[k] === 'number' && savedVol[k] >= 0 && savedVol[k] <= 2) vol[k] = savedVol[k];
    });
  } catch (e) {}
  var tuning = P.TUNINGS[stored('players.tuning', '')] ? stored('players.tuning') : 'dadgad';
  var sympathy = stored('players.sympathy', 'on') !== 'off';
  var strum = 'lilt';
  /* The swing you have set for a type that swings, as the long quaver's
   * share of the beat (0.5 straight to 0.7), kept for next time. */
  function swingKey() { return 'players.swing.' + tune.meta.type; }
  function swingNow() {
    var ty = type();
    if (!ty.swing) return 0.5;
    var v = +stored(swingKey(), '');
    return v >= 50 && v <= 70 ? v / 100 : T.swingShare(ty.swing);
  }

  /* ---------- the tune ----------
   * tune: { meta: { id, name, type, url }, settings, index, lay, auto,
   *         chords: { slot: ['G'] | ['C', 'D'] }, mine: { slot: true }, source } */
  var tune = null, FORM = [], slotEls = {}, slotInfo = {};

  function type() { return TYPES[tune.meta.type]; }
  function setting() { return tune.settings[tune.index]; }
  // Which setting this is on the Session. A tune opened from a file holds
  // only its one setting, so the number comes from the file.
  function settingNumber() { return tune.settings.length > 1 ? tune.index + 1 : (tune.savedNumber || tune.index + 1); }

  /* Build a tune: from the Session's JSON (meta, all settings) or a saved
   * file (meta, the one setting, its chords). */
  function build(meta, settings, index, saved) {
    if (playing) stop(false);
    var s = settings[index], ty = TYPES[meta.type];
    var lay = P.layout(s.abc, { key: s.key, meter: ty.meter });
    var auto = P.chords(lay), chords = {}, mine = {};
    var home = P.candidates(lay.key)[0].name;
    lay.slots.forEach(function (sl) {
      var keep = saved && saved.chords && saved.chords[sl.id];
      chords[sl.id] = keep ? saved.chords[sl.id].slice(0, 2) : (auto[sl.id] || [home]);
      if (keep && saved.mine && saved.mine.indexOf(sl.id) !== -1) mine[sl.id] = true;
    });
    tune = { meta: meta, settings: settings, index: index, lay: lay, auto: auto,
             chords: chords, mine: mine, source: P.chordSource(lay) };
    FORM = lay.timeline;
    prepareGuitar();
    showTune(saved && saved.options);
    remember();
  }

  /* Every note any chord of this tune could need, in both tunings. */
  function prepareGuitar() {
    if (!guitar || !tune) return;
    var all = {};
    Object.keys(P.TUNINGS).forEach(function (tn) {
      usedChords().forEach(function (c) { P.voicing(tn, c).forEach(function (m) { if (m != null) all[m] = 1; }); });
    });
    guitar.prepare(Object.keys(all).map(Number));
  }
  function usedChords() {
    var seen = {}, out = [];
    tune.lay.slots.forEach(function (sl) {
      tune.chords[sl.id].forEach(function (c) { if (!seen[c]) { seen[c] = 1; out.push(c); } });
    });
    return out;
  }

  /* ---------- finding a tune on the Session ---------- */
  function find(q) {
    q = q.trim();
    if (!q) return;
    $('find-status').textContent = 'Looking on thesession.org…';
    $('results').innerHTML = '';
    fetch(API + '/tunes/search?q=' + encodeURIComponent(q) + '&format=json&perpage=20')
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (d) { showResults(d.tunes || [], q); })
      .catch(function () {
        $('find-status').textContent = 'Couldn’t reach thesession.org. Check the connection and try again.';
      });
  }

  /* The list of matches: open while choosing, folded under one line once a
   * tune is picked (or opened from a file). */
  var lastQuery = '', matchCount = 0;
  function foldMatches(open) {
    var box = $('matches');
    box.hidden = !matchCount;
    box.open = !!matchCount && open;
    summarise();
  }
  // Open: how many were found. Folded: how many others there are to go back to.
  function summarise() {
    var more = matchCount === 20 ? '+' : '', others = matchCount - 1;
    $('matches-sum').textContent = $('matches').open
      ? matchCount + more + ' found for “' + lastQuery + '”'
      : (others ? others + more + ' other match' + (others === 1 && !more ? '' : 'es') : 'The match') +
        ' for “' + lastQuery + '”';
  }

  function showResults(list, q) {
    var host = $('results');
    host.innerHTML = '';
    lastQuery = q; matchCount = list.length;
    if (!list.length) { $('find-status').textContent = 'Nothing on thesession.org called “' + q + '”.'; foldMatches(false); return; }
    $('find-status').textContent = PLAYABLE + ' can be played for now.';
    foldMatches(true);
    list.forEach(function (t) {
      var li = document.createElement('li'), b = document.createElement('button');
      b.type = 'button';
      b.disabled = !TYPES[t.type];
      b.innerHTML = esc(t.name) + '<small>' + esc(t.type) + (TYPES[t.type] ? '' : ' · not yet') + '</small>';
      b.addEventListener('click', function () {
        Array.prototype.forEach.call(host.querySelectorAll('button'), function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        foldMatches(false);
        fetchTune(t.id);
      });
      li.appendChild(b); host.appendChild(li);
    });
  }

  function fetchTune(id) {
    $('find-status').textContent = 'Fetching the tune…';
    fetch(API + '/tunes/' + encodeURIComponent(id) + '?format=json')
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (j) { loadTune(j, 0); $('find-status').textContent = ''; })
      .catch(function () {
        $('find-status').textContent = 'Couldn’t fetch that tune from thesession.org. Try again.';
        foldMatches(true);
      });
  }

  /* A tune on the page from the first visit, so that Play plays: someone
   * pressed it with no tune found yet and heard nothing. The Kesh, the
   * Session's setting 1 (the tune the guitar demo plays), kept here so it is
   * ready with no search and no network. */
  var STARTER = {
    id: 55, name: 'The Kesh', type: 'jig', url: 'https://thesession.org/tunes/55',
    settings: [{ id: 55, url: 'https://thesession.org/tunes/55#setting55', key: 'Gmajor', date: '2001-05-25 02:54:11',
      member: { name: 'Jeremy' },
      abc: "|:G3 GAB|A3 ABd|edd gdd|edB dBA|! GAG GAB|ABA ABd|edd gdd|BAF G3:|! |:B2B d2d|ege dBA|B2B dBG|ABA AGA|! BAB d^cd|ege dBd|gfg aga|bgg g3:|" }]
  };

  /* A tune as the Session's API gives it. */
  function loadTune(j, index) {
    if (!TYPES[j.type] || !j.settings || !j.settings.length) {
      $('find-status').textContent = 'Only ' + PLAYABLE.toLowerCase() + ' can be played for now.';
      return;
    }
    var meta = { id: j.id, name: j.name, type: j.type, url: j.url || API + '/tunes/' + j.id };
    var settings = j.settings.map(function (s) {
      return { id: s.id, key: s.key, abc: s.abc, member: s.member && s.member.name, date: s.date, url: s.url };
    });
    build(meta, settings, Math.min(index || 0, settings.length - 1));
  }

  /* ---------- saving and opening ---------- */
  function fileData() {
    var mine = Object.keys(tune.mine);
    return {
      format: FILE_FORMAT, version: 1, app: VERSION, saved: new Date().toISOString(),
      tune: tune.meta, setting: setting(), settingNumber: settingNumber(),
      chords: tune.chords, mine: mine,
      options: { bpm: +$('bpm').value, times: +$('times').value, countin: +$('countin').value,
                 tuning: tuning, strum: strum }
    };
  }
  function saveText() { return JSON.stringify(fileData(), null, 1); }
  function fileName() {
    return (tune.meta.name + ' - setting ' + settingNumber()).replace(/[\\/:*?"<>|]+/g, '') + '.json';
  }
  function save() {
    if (!tune) return;
    var url = URL.createObjectURL(new Blob([saveText()], { type: 'application/json' }));
    var a = document.createElement('a');
    a.href = url; a.download = fileName();
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    $('file-status').textContent = 'Saved as “' + fileName() + '”, in your Downloads (on a phone, in Files).';
  }

  /* A saved file's text, or the last tune left on this page (`restoring`).
   * A file comes back exactly as saved. The last tune keeps only the chords
   * you changed: the rest are chosen afresh, so a better way of choosing
   * them reaches it. */
  function openText(text, restoring) {
    var quiet = restoring;
    var d;
    try { d = JSON.parse(text); } catch (e) { d = null; }
    if (!d || FORMATS.indexOf(d.format) === -1 || !d.tune || !d.setting || !d.setting.abc || !TYPES[d.tune.type]) {
      if (!quiet) $('file-status').textContent = 'That file isn’t a tune saved from Session Buddies.';
      return false;
    }
    var s = d.setting, chords = d.chords || {}, mine = d.mine || [];
    if (restoring) {
      chords = {};
      mine.forEach(function (id) { if (d.chords && d.chords[id]) chords[id] = d.chords[id]; });
    }
    build(d.tune, [s], 0, { chords: chords, mine: mine, options: d.options || {} });
    tune.savedNumber = d.settingNumber;
    tune.fromFile = !restoring;           // brought back by the page itself is not "from a file"
    showTune(d.options || {});
    if (!quiet) { $('file-status').textContent = 'Opened “' + d.tune.name + '”, with its chords as saved.'; foldMatches(false); }
    return true;
  }

  // The tune on the page, kept so a reload brings it back.
  function remember() { if (tune) store('players.current', saveText()); }

  /* ---------- showing the tune ---------- */
  function showTune(options) {
    var ty = type(), s = setting(), lay = tune.lay;
    options = options || {};
    var number = settingNumber();
    $('tune-facts').textContent = tune.meta.name + ' · ' + ty.name + ' · ' + ty.meter + ' · ' + lay.key.name +
      ' · setting ' + number + (s.member ? ' by ' + s.member : '');
    document.title = tune.meta.name + ' — Session Buddies';
    // settings
    var sel = $('setting');
    sel.innerHTML = '';
    tune.settings.forEach(function (st, i) {
      var o = document.createElement('option');
      o.value = i;
      o.textContent = 'Setting ' + (tune.settings.length > 1 ? i + 1 : number) + ' · ' + P.parseKey(st.key).name +
        (st.member ? ' · ' + st.member : '') + (/"[A-G]/.test(st.abc) ? ' · has chords' : '');
      sel.appendChild(o);
    });
    sel.value = String(tune.index);
    sel.disabled = tune.settings.length < 2;
    // In the Find panel: the tune's name, in the search box and large under
    // it, and which setting of it is playing.
    $('chosen').hidden = false;
    $('chosen-name').textContent = tune.meta.name;
    $('chosen-facts').textContent = ty.name + ' · ' + ty.meter + ' · ' + lay.key.name + ' · Setting ' + number +
      (tune.settings.length > 1 ? ' of ' + tune.settings.length : tune.fromFile ? ', from a saved file' : '') +
      (s.member ? ' by ' + s.member : '');
    $('q').value = tune.meta.name;
    var link = $('setting-link');
    link.href = (s.url || tune.meta.url) || API;
    link.textContent = 'on thesession.org';
    var uneven = lay.timeline.some(function (tb) { return !/@0$/.test(tb.slot) && !/^end@/.test(tb.slot); });
    $('setting-warn').hidden = !uneven;
    $('setting-warn').textContent = uneven ?
      'Some bars of this setting don’t add up to a full bar, so the backing may sit oddly against it. ' +
      (tune.settings.length > 1 ? 'Another setting may be cleaner.' : '') : '';
    $('credit').innerHTML = esc(tune.meta.name) + ': <a href="' + esc(link.href) + '" target="_blank" rel="noopener">setting ' +
      number + '</a> on thesession.org' + (s.member ? ', by ' + esc(s.member) : '') + '. Chords ' +
      (tune.source === 'setting' ? 'from the setting' : 'chosen for this page from the melody') + '.';
    // swing, for a type that swings
    $('swing-box').hidden = !ty.swing;
    if (ty.swing) { $('swing').value = Math.round(swingNow() * 100); $('swing-out').textContent = T.swingLabel(swingNow()); }
    // tempo for the type
    ['bpm', 'bpm-num'].forEach(function (id) { $(id).min = ty.bpm.min; $(id).max = ty.bpm.max; });
    setBpm(options.bpm || ty.bpm.start);
    $('bpm-unit').textContent = ty.unit;
    if (options.times != null) $('times').value = String(options.times);
    if (options.countin) $('countin').value = String(options.countin);
    if (options.strum && ty.strums[options.strum]) strum = options.strum;
    if (options.tuning && P.TUNINGS[options.tuning]) tuning = options.tuning;
    $('chord-source').textContent = tune.source === 'setting' ? 'from the setting' : 'chosen from the melody';
    $('save').disabled = false;
    $('play').disabled = false;
    buildChart();
    drawStrum();
    drawShapes();
    idleNow();
  }

  function buildChart() {
    var host = $('chart'), parts = [];
    host.innerHTML = ''; slotEls = {}; slotInfo = {};
    tune.lay.slots.forEach(function (sl) { (parts[sl.part] = parts[sl.part] || []).push(sl); });
    parts.forEach(function (list, p) {
      if (!list) return;
      var row = document.createElement('div');
      row.className = 'part';
      row.innerHTML = '<div class="part-name">' + 'ABCDEFGH'.charAt(p) + '</div>';
      var bars = document.createElement('div');
      bars.className = 'bars';
      list.forEach(function (sl, j) {
        slotInfo[sl.id] = { part: p, index: j, slot: sl };
        var el = document.createElement('button');
        el.type = 'button';
        el.className = 'bar';
        el.dataset.slot = sl.id;
        el.addEventListener('click', function () { openChooser(sl); });
        slotEls[sl.id] = el;
        paintSlot(sl.id);
        bars.appendChild(el);
      });
      row.appendChild(bars);
      host.appendChild(row);
    });
    $('reset-chords').hidden = !Object.keys(tune.mine).length;
  }

  function paintSlot(id) {
    var el = slotEls[id], info = slotInfo[id];
    if (!el) return;
    var sl = info.slot;
    el.classList.toggle('mine', !!tune.mine[id]);
    el.setAttribute('aria-label', partName(info) + ', ' + tune.chords[id].join(' then '));
    el.innerHTML = '<span class="ch">' + (sl.ending ? '<span class="end-mark">' + sl.ending + '.</span>' : '') +
      tune.chords[id].map(esc).join('<i>·</i>') + '</span><span class="abc">' + esc(sl.text) + '</span>';
  }
  function partName(info) {
    return 'ABCDEFGH'.charAt(info.part) + ' part, bar ' + (info.index + 1) +
      (info.slot.ending ? ' (ending ' + info.slot.ending + ')' : '');
  }

  /* ---------- changing a chord ---------- */
  var choosing = null;
  function chordOptions() {
    var key = tune.lay.key, seen = {}, out = [];
    function add(name, hint) { if (name && !seen[name]) { seen[name] = 1; out.push({ name: name, hint: hint }); } }
    P.candidates(key).forEach(function (c) { add(c.name, numeral(c.name)); });
    usedChords().forEach(function (c) { add(c, numeral(c)); });
    tune.lay.symbols.forEach(function (s) { var c = P.chord(s.name); if (c) add(c.name, numeral(c.name)); });
    return out;
  }
  // Where a chord sits in the key, as a backer would say it: I, V, ♭VII, vi.
  function numeral(name) {
    var c = P.chord(name), t = tune.lay.key.tonic;
    if (!c) return '';
    var i = (c.root - t + 12) % 12;
    var r = { 0: 'I', 1: '♭II', 2: 'II', 3: '♭III', 4: 'III', 5: 'IV', 6: '♯IV', 7: 'V', 8: '♭VI', 9: 'VI', 10: '♭VII', 11: 'VII' }[i];
    return c.minor ? r.replace(/[IV]+/, function (m) { return m.toLowerCase(); }) : r;
  }

  function openChooser(sl) {
    choosing = sl;
    $('chooser-title').textContent = partName(slotInfo[sl.id]);
    $('chooser-abc').textContent = sl.text;
    renderChooser();
    var d = $('chooser');
    if (d.showModal) d.showModal(); else d.setAttribute('open', '');
  }
  function renderChooser() {
    if (!choosing) return;
    var id = choosing.id, ch = tune.chords[id], opts = chordOptions();
    function buttons(host, list, pressed, pick) {
      host.innerHTML = '';
      list.forEach(function (o) {
        var b = document.createElement('button');
        b.type = 'button';
        b.innerHTML = esc(o.name) + (o.hint ? '<small>' + esc(o.hint) + '</small>' : '');
        b.setAttribute('aria-pressed', String(pressed(o)));
        b.addEventListener('click', function () { pick(o); });
        host.appendChild(b);
      });
    }
    buttons($('choose-a'), opts, function (o) { return o.name === ch[0]; }, function (o) {
      var b = ch[1] && ch[1] !== o.name ? [o.name, ch[1]] : [o.name];
      setChord(id, b);
    });
    buttons($('choose-b'), [{ name: 'Same', hint: 'all bar' }].concat(opts),
      function (o) { return o.name === 'Same' ? ch.length === 1 : o.name === ch[1]; },
      function (o) { setChord(id, o.name === 'Same' || o.name === ch[0] ? [ch[0]] : [ch[0], o.name]); });
    $('choose-auto').disabled = !tune.mine[id];
  }
  function setChord(id, chords, back) {
    tune.chords[id] = chords;
    if (back) delete tune.mine[id]; else tune.mine[id] = true;
    prepareGuitar();
    paintSlot(id);
    drawShapes();
    renderChooser();
    $('reset-chords').hidden = !Object.keys(tune.mine).length;
    remember();
  }

  /* ---------- audio, built on the first press of Play ---------- */
  var ctx = null, run = null, guitar = null, drum = null, clicker = null, fluteBus = null;
  var concBus = null, concertina = null, flutePlayer = null;   // the instruments: flute.js, concertina.js

  function roomImpulse(seconds, decay) {
    var len = Math.floor(ctx.sampleRate * seconds), buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (var ch = 0; ch < 2; ch++) {
      var d = buf.getChannelData(ch);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }
  function applyLevels() {
    if (!ctx) return;
    guitar.setLevel(MIX.guitar * vol.guitar);
    fluteBus.gain.setTargetAtTime(MIX.tune * vol.tune, ctx.currentTime, 0.03);
    concBus.gain.setTargetAtTime(MIX.concertina * vol.concertina, ctx.currentTime, 0.03);
    drum.setLevel(MIX.drum * vol.drum);
  }

  function ensureAudio() {
    if (ctx) { T.startSound(ctx); return; }
    T.prepareAudio();
    var AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC({ latencyHint: 'interactive' });
    var out = T.makeOutput(ctx);
    T.startSound(ctx);                    // after: on a Mac, its audio element (js/wake.js)
    T.soundCheck(ctx, out.last, $('sound-check'), function () { return playing; });
    run = ctx.createGain();
    run.connect(out);
    var room = ctx.createConvolver();
    room.buffer = roomImpulse(1.6, 3);
    var wet = ctx.createGain(); wet.gain.value = 0.2;
    run.connect(room); room.connect(wet); wet.connect(out);
    guitar = new G.Guitar(ctx, run);
    guitar.sympathy = sympathy;
    prepareGuitar();
    var lift = ctx.createBiquadFilter();
    lift.type = 'peaking';
    lift.frequency.value = DRUM.lift.f; lift.Q.value = DRUM.lift.q; lift.gain.value = DRUM.lift.gain;
    lift.connect(run);
    drum = new T.Bodhran(ctx, lift);
    drum.setRoom(0.1);
    clicker = new T.Bodhran(ctx, run);
    clicker.setLevel(0.42); clicker.setRoom(0.1);
    fluteBus = ctx.createGain(); fluteBus.gain.value = MIX.tune * vol.tune;
    fluteBus.connect(run);
    flutePlayer = new P.Flute(ctx, fluteBus);
    concBus = ctx.createGain(); concBus.gain.value = MIX.concertina * vol.concertina;
    concBus.connect(run);
    concertina = new P.Concertina(ctx, concBus);
    applyLevels();
    requestAnimationFrame(frame);
  }

  /* ---------- the clock: the demo's ---------- */
  var playing = false, timer = null;
  var barN = 0, nextBar = 0, pending = [], shown = [], endAt = null;
  var heard = -1;
  var AHEAD = 0.12, ahead = AHEAD;

  function quaver() { return 60 / +$('bpm').value / type().per; }
  function times() { return +$('times').value; }
  function isLast(n) { return times() > 0 && n === times() * FORM.length - 1; }

  /* The tune, on whichever of the flute and the concertina are ticked: one
   * note, its written length in quavers. A flute holds its notes nearly
   * full. The concertina carries each note a touch past the next one's
   * start, the bellows keeping the air up, and re-strikes a repeated note
   * with a little gap ("edd": two Ds, not one long one). */
  // How long each holds a note of len seconds (lenQ quavers), before the next.
  // (A quaver, lilted, is 0.92 to 1.16 of one.)
  function fluteLength(len, lenQ) { return len * (Math.abs(lenQ - 1) < 0.15 ? 0.82 : lenQ < 1 ? 0.9 : 0.94); }
  // Since 1.7.1 the concertina's note ends as the next begins, and
  // its recorded reed stops quickly when let go (concertina.js): with 30 ms
  // and a slow fade, carried over for the synthesised one, its old note sat
  // against the flute's new one for about 130 ms at most changes in The
  // Sunny Banks, seconds and thirds apart: a clash.
  function concertinaLength(len, lenQ, nextSame) { return nextSame ? Math.max(len * 0.5, len - 0.06) : len; }
  /* One note of the tune, `tick` into the bar starting at tBar, `dur` ticks
   * long, weight w: placed by each instrument's own lilt. */
  function melody(tBar, tick, dur, midi, w, finalNote, nextSame, written) {
    var q = quaver(), ring = type().slots * q;
    // Playing together they play as one: the flute takes the concertina's
    // lilt, or their notes between the beats would start up to 12 ms apart.
    var both = $('on-tune').checked && $('on-concertina').checked, fw = both ? 'concertina' : 'flute';
    if ($('on-tune').checked) {
      var fa = warp(tick, fw, written), fq = warp(tick + dur, fw, written) - fa, fl = fq * q;
      var fd = finalNote ? fl + ring : fluteLength(fl, fq);
      // No vibrato with the concertina: against its steady reed it beat (flute.js).
      pending.push({ t: tBar + fa * q, fn: function (t) { flutePlayer.note(t, fd, midi, w, both ? 0 : 1); } });
    }
    if ($('on-concertina').checked) {
      var ca = warp(tick, 'concertina', written), cq = warp(tick + dur, 'concertina', written) - ca, cl = cq * q;
      var cd = finalNote ? cl + ring : concertinaLength(cl, cq, nextSame);
      var cw = Math.max(0.3, Math.min(1, 0.8 + (w - 0.8) * 1.4));   // the bellows lean harder
      pending.push({ t: tBar + ca * q, fn: function (t) { concertina.note(t, cd, midi, cw); } });
    }
  }

  /* ---------- the lilt: how a player phrases the tune ----------
   * Played dead even, the melody ticked rather than danced (the guitar and
   * drum stay steady under it, as backing does). A player leans on the
   * beat and lilts within it.
   *
   * Timing: each beat is stretched and squeezed. In a jig the first quaver
   * of a group of three is held long, the other two sharing the difference:
   * 12% on the flute, 16% on the concertina, whose bellows give it more
   * bounce; in a reel each pair of quavers goes long-short, 55:45 on the
   * flute, 57:43 on the concertina. (1.6.0 had 8% and 53:47 for both, and
   * it still sounded a bit even.) The beat itself still lands on time, so
   * playing together their beats meet, and the notes between sit a few
   * thousandths of a second apart, as two players' would. Triplets and
   * halved notes bend with it (a piecewise-straight warp of the beat).
   *
   * Since 1.10.0: a slide and a slip jig lilt as a jig does, beat by beat
   * (a slide's a touch more). A polka lilts a little; the warp passes
   * through a dotted note's place unchanged, so a written "d>e" is not
   * dotted twice.
   *
   * A hornpipe swings its quavers as the guitar and drum do, by the Swing
   * control (the concertina a shade harder). A beat it writes otherwise is played as written
   * (see asWritten): a triplet stays even, as players keep it (swung, its
   * notes went 0.8, 0.6 and 0.6 of a quaver), a dotted pair ("A>B", 3:1)
   * is not dotted twice, and semiquavers are not squashed. The swung
   * quaver falls where a triplet's third note does, so the two agree. */
  var JIG_F = [[0, 0], [1, 1.12], [2, 2.06], [3, 3]], JIG_C = [[0, 0], [1, 1.16], [2, 2.08], [3, 3]];
  var LILT = {
    flute:      { jig: JIG_F, reel: [[0, 0], [1, 1.10], [2, 2]], 'slip jig': JIG_F,
                  slide: [[0, 0], [1, 1.14], [2, 2.07], [3, 3]],
                  polka: [[0, 0], [1, 1.06], [1.5, 1.5], [2, 2]] },
    concertina: { jig: JIG_C, reel: [[0, 0], [1, 1.14], [2, 2]], 'slip jig': JIG_C,
                  slide: [[0, 0], [1, 1.18], [2, 2.09], [3, 3]],
                  polka: [[0, 0], [1, 1.1], [1.5, 1.5], [2, 2]] }
  };
  /* In a swung tune, the beats of a bar's notes that are not plain quavers
   * and longer (a triplet, a dotted pair, semiquavers): { beat: true }, for
   * the warp to leave as written. `at(n)` is a note's tick in the bar. */
  function asWritten(notes, at) {
    var ty = type(), out = {}, B = ty.per * TPQ;
    if (!ty.swing) return out;
    notes.forEach(function (n) {
      var t = at ? at(n) : n.tick;
      if (t % TPQ || n.dur % TPQ) out[Math.floor(t / B)] = true;
    });
    return out;
  }
  function warp(tick, who, written) {         // ticks into the bar -> quavers, lilted for `who`
    var ty = type(), per = ty.per, pts = (LILT[who] || LILT.flute)[tune.meta.type] || [[0, 0], [per, per]];
    if (ty.swing) {                           // the Swing control's, the concertina's 2% harder
      var share = Math.min(0.75, swingNow() + (who === 'concertina' ? 0.02 : 0));
      pts = [[0, 0], [per / 2, per * share], [per, per]];
    }
    var q = tick / TPQ, beat = Math.floor(q / per), p = q - beat * per;
    if (written && written[beat]) return q;
    for (var i = 1; i < pts.length; i++) {
      if (p <= pts[i][0]) {
        var a = pts[i - 1], b = pts[i];
        return beat * per + a[1] + (p - a[0]) / (b[0] - a[0]) * (b[1] - a[1]);
      }
    }
    return q;
  }
  /* Weight: the first beat of the bar leant on most, the other beats less,
   * the notes between them lighter, the last of a jig's three lifting into
   * the next beat; a gentle swell over each two-bar phrase; and a little of
   * the unevenness of a real player, so no two times through are the same.
   * The concertina leans harder still: its weights spread 1.4 times as far
   * from the middle (see melody()). */
  var WEIGHT = {
    jig:  [0.95, 0.62, 0.7, 0.86, 0.62, 0.72],
    reel: [0.95, 0.62, 0.8, 0.64, 0.88, 0.62, 0.8, 0.66],
    hornpipe: [0.95, 0.6, 0.8, 0.62, 0.88, 0.6, 0.8, 0.64],
    polka: [0.95, 0.66, 0.86, 0.7],
    slide: [0.95, 0.62, 0.7, 0.8, 0.62, 0.7, 0.9, 0.62, 0.7, 0.8, 0.62, 0.72],     // leaning on 1 and 3
    'slip jig': [0.95, 0.62, 0.7, 0.84, 0.62, 0.7, 0.86, 0.62, 0.72]
  };
  function weight(tick, k) {
    var ty = type(), w = WEIGHT[tune.meta.type], L = ty.slots * TPQ;
    var slot = Math.floor(tick / TPQ), base = w ? w[Math.max(0, Math.min(w.length - 1, slot))] : 0.8;
    if (tick % TPQ) base *= 0.9;              // a note off the quaver grid: a passing one
    var swell = 0.93 + 0.07 * Math.sin(Math.PI * ((k % 2) * L + tick) / (2 * L));
    return Math.min(1, base * swell * (0.94 + Math.random() * 0.12));
  }

  /* The tune's pickup notes, coming in over the end of the bar before. */
  function pickupInto(tNext, q) {
    var pk = tune.lay.pickup, first = FORM[0] && FORM[0].notes[0];
    var L = type().slots * TPQ, tBar = tNext - type().slots * q;
    var written = asWritten(pk, function (p) { return L + p.tick; });
    pk.forEach(function (p, i) {
      var nx = pk[i + 1] || first, at = L + p.tick;
      melody(tBar, at, p.dur, p.midi, weight(at, 1) * 0.9, false, nx && nx.midi === p.midi, written);
    });
  }

  /* Where quaver s of the bar falls, in quavers: straight, or swung (a
   * hornpipe), the quaver between the beats coming late. */
  function swung(s) {
    var ty = type(), per = ty.per;
    if (!ty.swing) return s;
    var beat = Math.floor(s / per);
    return s + T.swingShift((s - beat * per) / per, T.swingFromShare(swingNow())) * per;
  }

  function layBar(n, t0) {
    var ty = type(), q = quaver(), L = ty.slots;
    if (n < 0) {
      ty.clicks.forEach(function (c) {
        (function (at, v) { pending.push({ t: at, fn: function (t) { clicker.hit('click', t, v); } }); })(t0 + c[0] * q, c[1]);
      });
      shown.push({ t: t0, n: n });
      if (n === -1) pickupInto(t0 + L * q, q);
      return L * q;
    }
    var k = n % FORM.length, tb = FORM[k], last = isLast(n), chords = tune.chords[tb.slot];
    shown.push({ t: t0, n: n });

    // The last bar of a time through, with another to come: the pickup comes
    // in over its end, so the tune's own notes stop where the pickup starts.
    var again = k === FORM.length - 1 && !last && tune.lay.pickup.length;
    var cutAt = again ? L * TPQ + tune.lay.pickup[0].tick : Infinity;
    var written = asWritten(tb.notes);
    tb.notes.forEach(function (note, i) {
      if (note.tick >= cutAt) return;
      var dur = Math.min(note.dur, cutAt - note.tick);
      var nx = tb.notes[i + 1] || (FORM[(k + 1) % FORM.length].notes[0]);
      melody(t0, note.tick, dur, note.midi, weight(note.tick, k),
             last && i === tb.notes.length - 1, nx && nx.midi === note.midi, written);
    });
    if (again) pickupInto(t0 + L * q, q);

    var slots = last ? ty.final.map(function (s, i) { return { s: s, d: 'D', v: i ? 1 : 0.85 }; })
                     : ty.strums[strum].slots;
    if ($('on-guitar').checked) {
      var open = P.TUNINGS[tuning].strings;
      slots.forEach(function (x) {
        var chord = chords.length > 1 && x.s >= ty.half ? chords[1] : chords[0];
        (function (at, notes, dir, v) {
          pending.push({ t: at, fn: function (t) { guitar.strum(notes, t, dir, v, 4, open); } });
        })(t0 + swung(x.s) * q, P.voicing(tuning, chord), x.d, x.v);
      });
    }
    if ($('on-drum').checked) {
      if (last) {
        ty.final.forEach(function (s) {
          (function (at) { pending.push({ t: at, fn: function (t) { drum.hit('bass', t, 1); } }); })(t0 + s * q);
        });
      } else {
        var g = ty.grid, step = L / g.length;
        for (var i = 0; i < g.length; i++) {
          var voice = T.VOICE[g[i]];
          if (!voice) continue;
          (function (at, vc, v) {
            pending.push({ t: at, fn: function (t) { drum.hit(vc, t, v); } });
          })(t0 + swung(i * step) * q, voice, T.VELOCITY[g[i]]);
        }
      }
    }
    slots.forEach(function (x) { shown.push({ t: t0 + swung(x.s) * q, strum: x.s }); });
    if (last) endAt = t0 + ty.final[ty.final.length - 1] * q + 3.2;
    return L * q;
  }

  function tick() {
    var now = ctx.currentTime;
    if (endAt == null) {
      var limit = times() > 0 ? times() * FORM.length : Infinity;
      while (nextBar < now + ahead + 0.18 && barN < limit) {
        nextBar += layBar(barN, nextBar);
        barN++;
      }
    }
    pending.sort(function (a, b) { return a.t - b.t; });
    while (pending.length && pending[0].t < now + ahead) {
      var e = pending.shift();
      if (e.t > now - 0.05) e.fn(Math.max(e.t, now));
    }
    draw();
    if (endAt != null && now >= endAt) stop(true);
  }

  function start() {
    if (!tune) return;
    ensureAudio();
    run.gain.cancelScheduledValues(ctx.currentTime);
    run.gain.setTargetAtTime(1, ctx.currentTime, 0.01);
    playing = true;
    barN = -(+$('countin').value || 1);
    nextBar = ctx.currentTime + 0.12;
    ahead = T.lookahead(AHEAD);
    pending = []; shown = []; endAt = null;
    tick();
    timer = setInterval(tick, 25);
    showState();
  }

  function stop(ended) {
    playing = false;
    clearInterval(timer); timer = null;
    pending = []; shown = []; endAt = null;
    if (ctx) {
      var now = ctx.currentTime;
      if (!ended) run.gain.setTargetAtTime(0, now, 0.04);
      guitar.cancelFrom(now); flutePlayer.cancelFrom(now); concertina.cancelFrom(now);
      drum.cancelFrom(now); clicker.cancelFrom(now);
      guitar.silence(now + (ended ? 0 : 0.05));
      T.restAudio(ctx, function () { return playing; });
    }
    showState();
  }
  function toggle() { if (playing) stop(false); else start(); }

  function fitLookahead() {
    ahead = T.lookahead(AHEAD);
    if (document.hidden && playing) tick();
  }
  document.addEventListener('visibilitychange', fitLookahead);

  /* ---------- drawing ---------- */
  function diagram(chord, big) {
    var tn = P.TUNINGS[tuning], sh = P.shape(tuning, chord), w = big ? 132 : 96, h = big ? 174 : 130;
    if (!sh) return '<div class="blurb">No shape for ' + esc(chord) + '</div>';
    var left = big ? 26 : 20, top = big ? 30 : 24, gapX = (w - 2 * left) / 5, gapY = big ? 24 : 17;
    var svg = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" role="img" aria-label="' +
              esc(sh.name) + ' chord shape">';
    var fretted = sh.frets.filter(function (f) { return f > 0; });
    var base = fretted.length && Math.max.apply(null, fretted) > 4 ? Math.min.apply(null, fretted) : 1;
    for (var f = 0; f <= 4; f++) {
      var y = top + f * gapY, nut = f === 0 && base === 1;
      svg += '<line class="' + (nut ? 'nut' : 'fret') + '" x1="' + left + '" x2="' + (w - left) + '" y1="' + y + '" y2="' + y +
             '" stroke-width="' + (nut ? 3 : 1) + '"/>';
    }
    if (base > 1) svg += '<text class="num" x="' + (left - 4) + '" y="' + (top + 0.5 * gapY + 3.5) + '" text-anchor="end">' + base + 'fr</text>';
    for (var s = 0; s < 6; s++) {
      var x = left + s * gapX;
      svg += '<line class="str" x1="' + x + '" x2="' + x + '" y1="' + top + '" y2="' + (top + 4 * gapY) + '" stroke-width="' +
             (1.6 - s * 0.15) + '"/>';
      var fr = sh.frets[s], my = top - 10, drone = sh.drone.indexOf(s) !== -1 ? ' drone' : '';
      if (fr < 0) {
        svg += '<path class="x" d="M' + (x - 4) + ' ' + (my - 4) + 'l8 8M' + (x + 4) + ' ' + (my - 4) + 'l-8 8" stroke-width="1.5"/>';
      } else if (fr === 0) {
        svg += '<circle class="mark' + drone + '" cx="' + x + '" cy="' + my + '" r="4" stroke-width="1.5"/>';
      } else {
        svg += '<circle class="dot" cx="' + x + '" cy="' + (top + (fr - base + 0.5) * gapY) + '" r="' + (big ? 7.5 : 5.5) + '"/>';
      }
      svg += '<text class="num" x="' + x + '" y="' + (top + 4 * gapY + 13) + '" text-anchor="middle">' +
             tn.letters.split(' ')[s] + '</text>';
    }
    return svg + '<text class="nm" x="' + (w / 2) + '" y="' + (h - 6) + '" text-anchor="middle">' + esc(sh.name) + '</text></svg>';
  }

  function drawShapes() {
    if (!tune) return;
    $('shapes').innerHTML = usedChords().map(function (c) { return '<div class="diagram">' + diagram(c) + '</div>'; }).join('');
    $('shapes-tuning').textContent = P.TUNINGS[tuning].name;
    Array.prototype.forEach.call($('tunings').children, function (b) {
      b.setAttribute('aria-checked', String(b.dataset.tuning === tuning));
    });
  }

  function drawStrum() {
    var ty = tune ? type() : TYPES.jig, slots = {};
    ty.strums[strum].slots.forEach(function (x) { slots[x.s] = x; });
    var html = '';
    for (var s = 0; s < ty.slots; s++) {
      var x = slots[s], accent = s === 0 || s === ty.half;
      html += '<span id="dot-' + s + '" class="' + (x ? (accent ? 'accent' : '') : 'rest') + '">' + (x ? x.d : '·') + '</span>';
    }
    $('strum-dots').innerHTML = html;
    $('strum-desc').textContent = ty.strums[strum].text;
    Array.prototype.forEach.call($('strums').children, function (b) {
      b.setAttribute('aria-checked', String(b.dataset.strum === strum));
    });
  }

  function nowChord(chord, next) {
    $('now-chord').textContent = chord || '—';
    $('now-diagram').innerHTML = chord ? diagram(chord, true) : '';
    $('next-chord').textContent = next || '—';
  }
  function idleNow() {
    if (!tune || !FORM.length) return nowChord(null, null);
    var c = tune.chords[FORM[0].slot];
    nowChord(c[0], c[1] || (FORM[1] ? tune.chords[FORM[1].slot][0] : ''));
  }

  function showBar(n) {
    heard = n;
    Array.prototype.forEach.call(document.querySelectorAll('.bar.on'), function (el) { el.classList.remove('on'); });
    if (n < 0) {
      var lead = +$('countin').value || 1;
      $('where').textContent = 'count-in' + (lead > 1 ? ' ' + (lead + n + 1) + ' of ' + lead : '');
      return;
    }
    var k = n % FORM.length, tb = FORM[k], nb = FORM[(k + 1) % FORM.length];
    var el = slotEls[tb.slot];
    if (el) el.classList.add('on');
    var c = tune.chords[tb.slot];
    nowChord(c[0], c[1] || tune.chords[nb.slot][0]);
    var info = slotInfo[tb.slot], t = Math.floor(n / FORM.length) + 1;
    $('where').textContent = (info ? partName(info) : 'bar ' + (k + 1)) + ' · time ' + t + (times() > 0 ? ' of ' + times() : '');
  }

  function frame() { requestAnimationFrame(frame); draw(); }
  function draw() {
    if (!playing || !ctx) return;
    var now = ctx.currentTime, half = type().half;
    shown.sort(function (a, b) { return a.t - b.t; });
    while (shown.length && shown[0].t <= now) {
      var e = shown.shift();
      if (e.strum != null) {
        var dot = $('dot-' + e.strum);
        if (dot) {
          dot.classList.add('on');
          (function (d) { setTimeout(function () { d.classList.remove('on'); }, 120); })(dot);
        }
        var cur = heard >= 0 ? FORM[heard % FORM.length] : null;
        if (e.strum === half && cur && tune.chords[cur.slot].length > 1) {
          nowChord(tune.chords[cur.slot][1], tune.chords[FORM[(heard + 1) % FORM.length].slot][0]);
        }
      } else {
        showBar(e.n);
      }
    }
  }

  function showState() {
    var b = $('play');
    b.classList.toggle('playing', playing);
    b.setAttribute('aria-pressed', String(playing));
    b.querySelector('.play-label').textContent = playing ? 'Stop' : 'Play';
    if (!playing) {
      Array.prototype.forEach.call(document.querySelectorAll('.bar.on'), function (el) { el.classList.remove('on'); });
      $('where').textContent = '—';
      idleNow();
    }
  }

  /* ---------- wiring ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function setBpm(v) {
    var ty = tune ? type() : TYPES.jig;
    v = Math.max(ty.bpm.min, Math.min(ty.bpm.max, Math.round(+v) || ty.bpm.start));
    $('bpm').value = v; $('bpm-num').value = v;
  }

  function init() {
    $('buddies-version').textContent = 'v' + VERSION;
    $('foot-version').textContent = 'Session Buddies version ' + VERSION + '.';
    $('find').addEventListener('submit', function (e) { e.preventDefault(); find($('q').value); });
    // The box shows the tune on the page; a click selects it, so typing starts a new search.
    $('q').addEventListener('focus', function () { var q = this; setTimeout(function () { q.select(); }, 0); });
    $('matches').addEventListener('toggle', summarise);
    $('setting').addEventListener('change', function () { build(tune.meta, tune.settings, +this.value); });
    $('save').addEventListener('click', save);
    $('open').addEventListener('click', function () { $('file').click(); });
    $('file').addEventListener('change', function () {
      var f = this.files && this.files[0];
      if (!f) return;
      var r = new FileReader();
      r.onload = function () { openText(String(r.result)); };
      r.readAsText(f);
      this.value = '';
    });
    $('reset-chords').addEventListener('click', function () {
      Object.keys(tune.mine).forEach(function (id) { tune.chords[id] = (tune.auto[id] || tune.chords[id]).slice(); });
      tune.mine = {};
      prepareGuitar(); buildChart(); drawShapes(); idleNow(); remember();
    });
    $('choose-auto').addEventListener('click', function () {
      if (choosing) setChord(choosing.id, (tune.auto[choosing.id] || tune.chords[choosing.id]).slice(), true);
    });
    $('play').addEventListener('click', toggle);
    $('bpm').addEventListener('input', function () { setBpm(this.value); });
    $('swing').addEventListener('input', function () {
      if (!tune) return;
      store(swingKey(), String(+this.value));
      $('swing-out').textContent = T.swingLabel(+this.value / 100);   // heard from the next bar
    });
    $('bpm-num').addEventListener('change', function () { setBpm(this.value); remember(); });
    $('bpm').addEventListener('change', remember);
    ['times', 'countin'].forEach(function (id) { $(id).addEventListener('change', remember); });
    ['guitar', 'tune', 'concertina', 'drum'].forEach(function (k) {
      var el = $('vol-' + k), box = $('on-' + k);
      function show() {
        $('vol-' + k + '-out').textContent = Math.round(vol[k] * 100) + '%';
        el.closest('.voice').classList.toggle('is-off', !box.checked);
      }
      el.value = vol[k];
      show();
      el.addEventListener('input', function () {
        vol[k] = +el.value; show(); applyLevels();
        store('players.volume', JSON.stringify(vol));
      });
      box.addEventListener('change', show);
      // Ticking the concertina builds the audio at once, so its recordings
      // load while you get ready rather than after the first notes.
      if (k === 'concertina') box.addEventListener('change', function () { if (box.checked) ensureAudio(); });
    });
    Array.prototype.forEach.call($('sympathy').children, function (b) {
      b.setAttribute('aria-checked', String((b.dataset.sympathy === 'on') === sympathy));
      b.addEventListener('click', function () {
        sympathy = b.dataset.sympathy === 'on';
        if (guitar) guitar.sympathy = sympathy;
        store('players.sympathy', sympathy ? 'on' : 'off');
        Array.prototype.forEach.call($('sympathy').children, function (x) {
          x.setAttribute('aria-checked', String((x.dataset.sympathy === 'on') === sympathy));
        });
      });
    });
    Array.prototype.forEach.call($('tunings').children, function (b) {
      b.addEventListener('click', function () {
        tuning = b.dataset.tuning;
        store('players.tuning', tuning);
        drawShapes();
        if (!playing) idleNow();
        remember();
      });
    });
    Array.prototype.forEach.call($('strums').children, function (b) {
      b.addEventListener('click', function () { strum = b.dataset.strum; drawStrum(); remember(); });
    });
    document.addEventListener('keydown', function (e) {
      if (e.code !== 'Space' || /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(e.target.tagName) &&
          !(e.target.type === 'range')) return;
      if ($('chooser').open || !tune) return;
      e.preventDefault();
      toggle();
    });
    drawShapes();
    drawStrum();
    // The tune left on the page last time; on a first visit, the starter.
    var last = stored('players.current', '');
    if (!(last && openText(last, true))) {
      loadTune(STARTER, 0);
      $('find-status').textContent = 'The Kesh is ready to play, to start you off. Search above for any other tune.';
    }
  }

  // For the checks page.
  window.BUDDIES_PAGE = {
    VERSION: VERSION, TYPES: TYPES, PLAYABLE: PLAYABLE, swingNow: function () { return tune ? swingNow() : 0.5; }, MIX: MIX, fluteLength: fluteLength, concertinaLength: concertinaLength,
    tune: function () { return tune; },
    form: function () { return FORM; },
    STARTER: STARTER, loadTune: loadTune, openText: openText, saveText: saveText, setChord: setChord,
    playing: function () { return playing; },
    audio: function () { return { ctx: ctx, run: run, guitar: guitar, flute: fluteBus, concertina: concertina, concBus: concBus, drum: drum }; }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
