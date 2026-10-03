/* buddies.js — Session Buddies (called Session Players until 1.8.0): find a
 * tune on thesession.org (a jig, reel, hornpipe, polka, slide, slip jig or waltz),
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
  var VERSION = '1.19.1';

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
    },
    /* Since 1.16.0. Three crotchets, the weight on the first: the guitar
     * plays it as a session guitarist backs a waltz, the bass note alone on
     * the first beat and the chord on the other two (oom-pa-pa; 'B' and 'T'
     * in guitar.js), the chord changing at most on the third beat; the drum
     * the app's plain waltz. One accent, on 1. */
    waltz: {
      name: 'Waltz', plural: 'waltzes', meter: '3/4', slots: 6, half: 4, per: 2, unit: 'per crotchet',
      bpm: { start: 116, min: 60, max: 180 }, grid: grid('waltz', 'Dtdtdt'),
      clicks: [[0, 0.9], [2, 0.55], [4, 0.55]], final: [0], accents: [0],
      strums: {
        lilt: { text: 'The bass note on the first beat and the chord on the second and third: oom-pa-pa. ' +
                      'The waltz’s own lilt.',
                slots: [{ s: 0, d: 'B', v: 1 }, { s: 2, d: 'T', v: 0.6 }, { s: 4, d: 'T', v: 0.55 }] },
        drive: { text: 'The whole chord on every beat, and up after the second and the third, leaning on 1. Fuller, for the dancers.',
                 slots: [{ s: 0, d: 'D', v: 1 }, { s: 2, d: 'D', v: 0.6 }, { s: 3, d: 'U', v: 0.4 },
                         { s: 4, d: 'D', v: 0.6 }, { s: 5, d: 'U', v: 0.4 }] }
      }
    }
  };

  // "Jigs, reels, hornpipes, polkas, slides, slip jigs and waltzes", for the page to say.
  var PLAYABLE = (function () {
    var n = Object.keys(TYPES).map(function (k) { return TYPES[k].plural || TYPES[k].name.toLowerCase() + 's'; });
    n[0] = n[0].charAt(0).toUpperCase() + n[0].slice(1);
    return n.slice(0, -1).join(', ') + ' and ' + n[n.length - 1];
  })();

  /* ---------- how loud each sound is: the demo's measured balance ----------
   * The concertina sits about 1 dB under the flute, each played as the page
   * plays it: a bright reed carries more than its level says. (Recorded
   * since 1.7.0: its notes, levelled to -18 dBFS, measured 2.8 dB under at
   * the synthesised one's 0.16, hence 0.6.)
   *
   * The bodhrán had the demo's lift, 9 dB around 2.5 kHz, so the old drum,
   * nearly all under 120 Hz, could be picked out against the guitar. The
   * 1.10.0 drum has its own middle and slap, and the lift only tipped it
   * toward a snare drum ("a touch too much of a snare", more than in the
   * app, which has none): it put five times the share of its sound above
   * 1.5 kHz while making it only 0.4 dB louder. Since 1.18.1 there is none;
   * its stick still sits 10 dB under the guitar in its own band (the old
   * drum's sat 34 under), and its level is raised 0.5 dB, 0.7 to 0.74, to
   * stand against the guitar where it did. */
  var MIX = { guitar: 0.7, tune: 0.18, concertina: 0.6, drum: 0.74 };
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
  /* saved: { chords, mine, options, number, fromFile } from a file, your
   * tunes or the last visit. Without it (a tune fresh from the Session, or
   * another of its settings), your own copy is used if you have one: the
   * chords you changed and your tempo. Until 1.12.2 a fresh build was stored
   * over that copy, so searching a tune you had worked on wiped its chords. */
  function build(meta, settings, index, saved, keepBpm) {
    if (playing) stop(false);
    var s = settings[index], ty = TYPES[meta.type];
    var yours = !saved && copyOf(meta.id + '/' + (s.id != null ? s.id : index + 1));
    if (yours) saved = { chords: yourChords(yours.data), mine: yours.data.mine || [],
                         options: { bpm: yours.data.options && yours.data.options.bpm } };
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
    // Before it is shown or stored: until 1.12.2 these were set after, so a
    // tune reopened on setting 3 was stored as setting 1, and stayed so.
    tune.savedNumber = saved && saved.number;
    tune.fromFile = !!(saved && saved.fromFile);
    FORM = lay.timeline;
    prepareGuitar();
    var options = (saved && saved.options) || {};
    if (keepBpm && !options.bpm) options = Object.assign({}, options, { bpm: keepBpm });
    showTune(options);
    remember();
    if (yours && Object.keys(mine).length) {
      $('find-status').textContent = 'Your copy from My tunes, with your chord changes. ' +
        '“Back to the chosen chords” starts afresh.';
    }
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
      var have = TYPES[t.type] && yoursOf(t.id);
      b.innerHTML = esc(t.name) + '<small>' + esc(t.type) + (TYPES[t.type] ? '' : ' · not yet') +
        (have ? (have.fav ? ' · ★ in your favourites' : ' · in played lately') : '') + '</small>';
      b.addEventListener('click', function () {
        Array.prototype.forEach.call(host.querySelectorAll('button'), function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        foldMatches(false);
        fetchTune(t.id, have && have.setting);
      });
      li.appendChild(b); host.appendChild(li);
    });
  }

  // A tune from the Session, on the setting you have a copy of, if any.
  function fetchTune(id, settingId) {
    $('find-status').textContent = 'Fetching the tune…';
    fetch(API + '/tunes/' + encodeURIComponent(id) + '?format=json')
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (j) {
        var at = settingId == null ? -1 : (j.settings || []).map(function (st) { return st.id; }).indexOf(settingId);
        $('find-status').textContent = '';
        loadTune(j, Math.max(0, at));
      })
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
    var settings = sessionSettings(j);
    build(meta, settings, Math.min(index || 0, settings.length - 1));
  }
  // The Session's settings as the page keeps them: who posted each, by name.
  function sessionSettings(j) {
    return j.settings.map(function (s) {
      return { id: s.id, key: s.key, abc: s.abc, member: s.member && s.member.name, date: s.date, url: s.url };
    });
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

  /* A saved file's text (a tune, or a list of your tunes), or the last tune
   * left on this page (`restoring`). */
  function openText(text, restoring) {
    var d;
    try { d = JSON.parse(text); } catch (e) { d = null; }
    if (!restoring && d && d.format === LIST_FORMAT) return openList(d);
    return openData(d, restoring ? 'restore' : 'file');
  }
  function playable(d) {
    return !!(d && FORMATS.indexOf(d.format) !== -1 && d.tune && d.setting && d.setting.abc && TYPES[d.tune.type]);
  }
  /* A tune as saved, how: 'file' comes back exactly as saved; 'restore' (the
   * last tune left on the page) and 'list' (one of your tunes) keep only
   * the chords you changed, the rest chosen afresh, so a better way of
   * choosing them reaches it. */
  function openData(d, how) {
    if (!playable(d)) {
      if (how === 'file') $('file-status').textContent = 'That file isn’t a tune saved from Session Buddies.';
      return false;
    }
    var o = d.options || {};
    // A file comes back exactly as saved. One of your tunes brings back what
    // belongs to the tune (its chords, its tempo), not page settings such as
    // the guitar's tuning: until 1.12.2 opening an old favourite switched the
    // tuning, strum and count-in back to what they were when it was starred.
    build(d.tune, [d.setting], 0, {
      chords: how === 'file' ? (d.chords || {}) : yourChords(d), mine: d.mine || [],
      options: how === 'list' ? { bpm: o.bpm } : o,
      number: d.settingNumber, fromFile: how === 'file'   // brought back by the page itself is not "from a file"
    });
    if (how !== 'file') fillSettings();
    if (how === 'file') { $('file-status').textContent = 'Opened “' + d.tune.name + '”, with its chords as saved.'; foldMatches(false); }
    if (how === 'list') { $('find-status').textContent = 'Opened “' + d.tune.name + '” from your tunes.'; foldMatches(false); }
    return true;
  }

  // The tune on the page, kept so a reload brings it back; and its copy in
  // your tunes kept up with it, a chord you change included.
  function remember() { if (tune) { store('players.current', saveText()); syncMine(); } }

  /* ---------- my tunes: favourites, and those played lately ----------
   * Asked for so the tunes you play are a tap away, not a search. Each is
   * kept as it would be saved to a file, so it opens with no search and no
   * network, on the setting you had, with the chords you changed. Kept in
   * this browser's storage, which Safari can clear when a site goes
   * unvisited for a while: Save my tunes writes them to a file, and Open a
   * saved tune brings them back. */
  var FAVS = 'buddies.favourites', RECENT = 'buddies.recent', RECENT_MAX = 12;
  var LIST_FORMAT = 'session-buddies-list';
  function listOf(key) {
    try { var v = JSON.parse(stored(key, '[]')); return Array.isArray(v) ? v.filter(function (x) { return x && playable(x.data); }) : []; }
    catch (e) { return []; }
  }
  function keepList(key, list) { store(key, JSON.stringify(list)); }
  function currentKey() { var s = setting(); return tune.meta.id + '/' + (s.id != null ? s.id : settingNumber()); }
  function entryNow(when) {
    return { key: currentKey(), name: tune.meta.name, type: tune.meta.type, keyName: tune.lay.key.name,
             number: settingNumber(), when: when, data: fileData() };
  }
  function byName(a, b) { return a.name.localeCompare(b.name); }
  // Your copy of a tune's setting: a favourite first, else one played lately.
  function copyOf(k) {
    var hit = null;
    [FAVS, RECENT].forEach(function (key) {
      if (!hit) hit = listOf(key).filter(function (x) { return x.key === k; })[0] || null;
    });
    return hit;
  }
  // Of a saved tune's chords, only the ones you changed: the rest are chosen
  // afresh, so a better way of choosing them reaches it.
  function yourChords(d) {
    var out = {};
    (d.mine || []).forEach(function (id) { if (d.chords && d.chords[id]) out[id] = d.chords[id]; });
    return out;
  }
  // Your copies of a tune, any setting: { fav, recent, settingId } for search results.
  function yoursOf(id) {
    var pre = id + '/', fav = listOf(FAVS).filter(function (x) { return x.key.indexOf(pre) === 0; })[0];
    var rec = listOf(RECENT).filter(function (x) { return x.key.indexOf(pre) === 0; })[0];
    var x = fav || rec;
    return x ? { fav: !!fav, recent: !!rec, setting: x.data.setting && x.data.setting.id } : null;
  }
  function isFav() { var k = currentKey(); return listOf(FAVS).some(function (x) { return x.key === k; }); }
  function toggleFav() {
    if (!tune) return;
    var k = currentKey(), favs = listOf(FAVS), had = favs.some(function (x) { return x.key === k; });
    favs = had ? favs.filter(function (x) { return x.key !== k; }) : favs.concat([entryNow(Date.now())]);
    keepList(FAVS, favs.sort(byName));
    renderMine();
  }
  function removeFav(k) { keepList(FAVS, listOf(FAVS).filter(function (x) { return x.key !== k; })); renderMine(); }
  // Pressing Play puts the tune at the top of those played lately.
  function addRecent() {
    var k = currentKey();
    var list = [entryNow(Date.now())].concat(listOf(RECENT).filter(function (x) { return x.key !== k; }));
    keepList(RECENT, list.slice(0, RECENT_MAX));
    renderMine();
  }
  function syncMine() {
    var k = currentKey(), data = fileData();
    [FAVS, RECENT].forEach(function (key) {
      var list = listOf(key), hit = false;
      list.forEach(function (x) { if (x.key === k) { x.data = data; x.name = tune.meta.name; hit = true; } });
      if (hit) keepList(key, list);
    });
  }
  function ago(when) {
    var day = 864e5, d0 = new Date(); d0.setHours(0, 0, 0, 0);
    var days = Math.ceil((d0 - when) / day);
    if (when >= d0.getTime()) return 'today';
    if (days <= 1) return 'yesterday';
    if (days < 14) return days + ' days ago';
    return new Date(when).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }
  function renderMine() {
    var favs = listOf(FAVS), recent = listOf(RECENT), k = tune ? currentKey() : '';
    function rows(host, list, withWhen, removable) {
      host.innerHTML = '';
      list.forEach(function (x) {
        var li = document.createElement('li'), b = document.createElement('button');
        li.className = 'mine-row';
        b.type = 'button'; b.className = 'open';
        b.setAttribute('aria-pressed', String(x.key === k));
        b.innerHTML = esc(x.name) + '<small>' + esc((TYPES[x.type] ? TYPES[x.type].name : x.type) + ' · ' + x.keyName +
          ' · setting ' + x.number + (withWhen ? ' · ' + ago(x.when) : '')) + '</small>';
        // Read afresh when tapped: a chord changed since the list was drawn is in it.
        b.addEventListener('click', function () { openMine(x.key, list === favs ? FAVS : RECENT); });
        li.appendChild(b);
        if (removable) {
          var r = document.createElement('button');
          r.type = 'button'; r.className = 'remove'; r.textContent = '✕';
          r.setAttribute('aria-label', 'Take ' + x.name + ' out of your favourites');
          r.addEventListener('click', function () { removeFav(x.key); });
          li.appendChild(r);
        }
        host.appendChild(li);
      });
    }
    rows($('favs'), favs, false, true);
    rows($('recent'), recent, true, false);
    $('favs-empty').hidden = !!favs.length;
    $('recent-empty').hidden = !!recent.length;
    $('mine-sum').textContent = 'My tunes' + (favs.length || recent.length
      ? ': ' + favs.length + ' favourite' + (favs.length === 1 ? '' : 's') + ', ' + recent.length + ' played lately' : '');
    var fav = tune && isFav();
    $('fav').setAttribute('aria-pressed', String(!!fav));
    $('fav').textContent = (fav ? '★' : '☆') + ' Favourite';
    $('fav').setAttribute('aria-label', fav ? 'Take this tune out of your favourites' : 'Add this tune to your favourites');
  }
  function openMine(k, key) {
    var x = listOf(key).filter(function (y) { return y.key === k; })[0];
    if (!x) return renderMine();
    $('mine').open = false;
    openData(x.data, 'list');
  }
  function listText() {
    return JSON.stringify({ format: LIST_FORMAT, version: 1, app: VERSION, saved: new Date().toISOString(),
                            favourites: listOf(FAVS), recent: listOf(RECENT) }, null, 1);
  }
  function saveList() {
    var name = 'My tunes - Session Buddies.json';
    var url = URL.createObjectURL(new Blob([listText()], { type: 'application/json' }));
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    $('file-status').textContent = 'Saved your tunes as “' + name + '”, in your Downloads (on a phone, in Files).';
  }
  // A saved list: each tune added to yours, or brought up to date as saved.
  function openList(d) {
    var n = 0;
    function merge(key, from, sort) {
      var list = listOf(key);
      (Array.isArray(from) ? from : []).forEach(function (x) {
        if (!x || !x.key || !playable(x.data)) return;
        list = list.filter(function (y) { return y.key !== x.key; }).concat([x]);
        if (key === FAVS) n++;
      });
      keepList(key, sort(list));
    }
    merge(FAVS, d.favourites, function (l) { return l.sort(byName); });
    merge(RECENT, d.recent, function (l) { return l.sort(function (a, b) { return b.when - a.when; }).slice(0, RECENT_MAX); });
    renderMine();
    $('mine').open = true;
    $('file-status').textContent = 'Opened your tunes: ' + n + ' favourite' + (n === 1 ? '' : 's') + '.';
    return true;
  }

  /* The Setting menu, and in the Find panel the tune's name, large, and
   * which setting of it is playing. */
  function drawSettings() {
    var ty = type(), s = setting(), number = settingNumber(), sel = $('setting');
    sel.innerHTML = '';
    tune.settings.forEach(function (st, i) {
      var o = document.createElement('option');
      o.value = i;
      o.textContent = 'Setting ' + (tune.settings.length > 1 ? i + 1 : number) + ' · ' + P.parseKey(st.key).name +
        (st.member ? ' · ' + st.member : '') + (hasChords(st.abc) ? ' · has chords' : '');
      sel.appendChild(o);
    });
    sel.value = String(tune.index);
    sel.disabled = tune.settings.length < 2;
    $('chosen').hidden = false;
    $('chosen-name').textContent = tune.meta.name;
    $('chosen-facts').textContent = ty.name + ' · ' + ty.meter + ' · ' + tune.lay.key.name + ' · Setting ' + number +
      (tune.settings.length > 1 ? ' of ' + tune.settings.length : tune.fromFile ? ', from a saved file' : '') +
      (s.member ? ' by ' + s.member : '');
  }

  /* A tune brought back from this browser's storage (the one left on the
   * page, one of your tunes, or the starter) holds only its own setting, so
   * until 1.18.3 the Setting menu had nothing else to offer until you
   * searched for the tune again. Its other settings are now fetched from the
   * Session after it opens and added to the menu; the setting on the page,
   * with your chords, stays exactly as it is. Offline, the menu stays as it
   * was. (A tune opened from a file keeps to the file.) */
  function fillSettings() {
    var t = tune;
    if (!t || t.settings.length > 1 || t.fromFile || t.meta.id == null) return;
    var s = t.settings[t.index];
    fetch(API + '/tunes/' + encodeURIComponent(t.meta.id) + '?format=json')
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (j) {
        if (tune !== t || !j || !Array.isArray(j.settings) || j.settings.length < 2) return;
        var at = j.settings.map(function (st) { return st.id; }).indexOf(s.id);
        if (at < 0) return;
        // Tidied as a search's are (until 1.19.1 they went in raw, and the
        // menu named each setting's poster "[object Object]").
        var list = sessionSettings(j);
        list[at] = s;
        t.settings = list; t.index = at;
        drawSettings();
      })
      .catch(function () {});
  }

  /* ---------- showing the tune ---------- */
  // A setting with chord symbols of its own (whole chord names, not "Ending").
  function hasChords(abc) {
    return (String(abc).match(/"[^"]*"/g) || []).filter(function (q) { return P.isChordName(q.slice(1, -1)); }).length >= 4;
  }

  function showTune(options) {
    var ty = type(), s = setting(), lay = tune.lay;
    options = options || {};
    var number = settingNumber();
    $('tune-facts').textContent = tune.meta.name + ' · ' + ty.name + ' · ' + ty.meter + ' · ' + lay.key.name +
      ' · setting ' + number + (s.member ? ' by ' + s.member : '');
    document.title = tune.meta.name + ' — Session Buddies';
    drawSettings();
    $('q').value = tune.meta.name;
    renderMine();                         // its star, and where it is in your tunes
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
    drawOrnaments();
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
    showReset();
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
    undoChords = null;                    // a new change: the undo of a reset is gone
    prepareGuitar();
    paintSlot(id);
    drawShapes();
    renderChooser();
    showReset();
    remember();
    // A chord changed is work to keep: the tune goes into those played
    // lately, played or not. Until 1.12.3 only Play put it there, and the
    // page keeps only its last tune, so changes followed by a search were lost.
    if (!back && !listOf(RECENT).some(function (x) { return x.key === currentKey(); })) addRecent();
  }

  /* "Back to the chosen chords" puts every chord you changed back to the
   * chosen one; pressed by mistake, it wiped them all at a tap. Now the
   * button then offers to undo it, until you change a chord or the tune. */
  var undoChords = null;
  function showReset() {
    var b = $('reset-chords'), undo = !!undoChords && undoChords.tune === tune;
    b.hidden = !undo && !Object.keys(tune.mine).length;
    b.textContent = undo ? 'Undo: put my chord changes back' : 'Back to the chosen chords';
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
    // The sound check (js/wake.js) still measures, but its line is shown only
    // when asked for, with ?soundcheck in the address: since 1.18.4, as it was
    // there to find why Safari once went silent, not for every day.
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
    drum = new T.Bodhran(ctx, run);
    drum.setRoom(0.1);
    clicker = new T.Bodhran(ctx, run);
    clicker.setLevel(0.42); clicker.setRoom(0.1);
    fluteBus = ctx.createGain(); fluteBus.gain.value = MIX.tune * vol.tune;
    fluteBus.connect(run);
    flutePlayer = new P.Flute(ctx, fluteBus);
    concBus = ctx.createGain(); concBus.gain.value = MIX.concertina * vol.concertina;
    concBus.connect(run);
    concertina = new P.Concertina(ctx, concBus);
    concertina.onstatus = showConcertina;
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
  /* The tune ends on the last bar of a time through: the last time "Play it"
   * asks for, or the one Finish was pressed in. Until 1.13.0 only the exact
   * bar times x length counted, so "Play it" lowered below the time already
   * reached (to "once through" in time 2) left nothing to end on: the music
   * stopped dead, no closing chord, and the page stayed "playing" for good.
   * Now it ends at the end of the time through it is in. */
  var finishAt = null;                    // Finish: the time through (from 1) that ends the tune
  function endTime() {
    var t = times() > 0 ? times() : Infinity;
    return finishAt != null ? Math.min(t, finishAt) : t;
  }
  function isLast(n) {
    var L = FORM.length;
    return n >= 0 && n % L === L - 1 && Math.floor(n / L) + 1 >= endTime();
  }
  /* Finish: end at the end of this time through, with the closing strokes.
   * Its last bar may already be handed to the audio (a moment ahead, or
   * seconds ahead with the page hidden); then it goes round once more.
   * Pressed again, it is taken back, until the last bar is laid. */
  function finish() {
    if (!playing || endAt != null) return;
    finishAt = finishAt != null ? null : (barN < 0 ? 1 : Math.floor(barN / FORM.length) + 1);
    showState();
    if (heard >= 0) showBar(heard);       // "finishing" in the Now panel at once
  }

  /* "Your turn": the flute and concertina leave the melody to you at set
   * points while the guitar and bodhrán carry on. Taking turns: they play a
   * time through, you the next; or they play one part and you the other
   * (A: they play the A part only; B: the B part only). The lead-in at the
   * end of a bar goes with that bar, so they bring you in. During your turn
   * the melody is silent, or there quietly as a guide. */
  var MELODY = {
    every: 'The flute and concertina play the tune every time.',
    turns: 'They play the tune once, you play it the next time, and so on: the backing carries on.',
    a: 'They play the A part, you play the B part (and any others), every time.',
    b: 'They play the B part, you play the A part (and any others), every time.'
  };
  var melodyMode = MELODY[stored('players.melody', '')] ? stored('players.melody') : 'every';
  var yourTurnLevel = stored('players.yourturn', '') === 'quiet' ? 'quiet' : 'silent';
  var QUIET = 0.3;                        // the melody's weight during your turn, quietly: about 10 dB down
  function yourTurn(n) {
    if (melodyMode === 'every' || !FORM.length) return false;
    if (n < 0) n = 0;                     // the count-in's lead-in belongs to bar 1
    if (melodyMode === 'turns') return Math.floor(n / FORM.length) % 2 === 1;
    var info = slotInfo[FORM[n % FORM.length].slot], part = info ? info.part : 0;
    return melodyMode === 'a' ? part !== 0 : part !== 1;
  }
  function drawMelody() {
    Array.prototype.forEach.call($('melody-mode').children, function (b) {
      b.setAttribute('aria-checked', String(b.dataset.melody === melodyMode));
    });
    Array.prototype.forEach.call($('your-turn-level').children, function (b) {
      b.setAttribute('aria-checked', String(b.dataset.level === yourTurnLevel));
    });
    $('your-turn-box').hidden = melodyMode === 'every';
    $('melody-desc').textContent = MELODY[melodyMode] + (melodyMode === 'every' ? '' :
      yourTurnLevel === 'quiet' ? ' On your turn they play along quietly, as a guide.' : ' On your turn they are silent.');
  }

  /* The tune, on whichever of the flute and the concertina are ticked: one
   * note, its written length in quavers. A flute holds its notes nearly
   * full. The concertina carries each note a touch past the next one's
   * start, the bellows keeping the air up, and re-strikes a repeated note
   * with a little gap ("edd": two Ds, not one long one). */
  // How long each holds a note of len seconds (lenQ quavers), before the next.
  // (A quaver, lilted, is 0.92 to 1.16 of one.) Since 1.17.0 the flute
  // slurs into most notes (articulate()): it holds such a note into the next,
  // just past its start (flute.js), and lets go of one before a tongued note
  // a moment early, the tongue's stop, at most 35 ms. Until then it let go of
  // every quaver at 82%: about 50 ms of silence between every two notes in a
  // reel, as a keyboard player lifts each key.
  function fluteLength(len, lenQ, into) {
    return into ? len + P.Flute.prototype.OVERLAP : len - Math.min(0.035, len * 0.15);
  }
  // Since 1.7.1 the concertina's note ends as the next begins, and
  // its recorded reed stops quickly when let go (concertina.js): with 30 ms
  // and a slow fade, carried over for the synthesised one, its old note sat
  // against the flute's new one for about 130 ms at most changes in The
  // Sunny Banks, seconds and thirds apart: a clash.
  function concertinaLength(len, lenQ, nextSame) { return nextSame ? Math.max(len * 0.5, len - 0.06) : len; }
  /* One note of the tune, `tick` into the bar starting at tBar, `dur` ticks
   * long, weight w: placed by each instrument's own lilt. */
  function melody(tBar, tick, dur, midi, w, finalNote, nextSame, written, yours, art, orn) {
    if (yours) {
      if (yourTurnLevel !== 'quiet') return;
      w *= QUIET;
    }
    var q = quaver(), ring = type().slots * q;
    // Playing together they play as one: the flute takes the concertina's
    // lilt, or their notes between the beats would start up to 12 ms apart.
    var both = $('on-tune').checked && $('on-concertina').checked, fw = both ? 'concertina' : 'flute';
    if ($('on-tune').checked) {
      var fa = warp(tick, fw, written), fq = warp(tick + dur, fw, written) - fa, fl = fq * q;
      var fart = { slur: !!(art && art.slur), into: !!(art && art.into) && !finalNote };
      var fd = finalNote ? fl + ring : fluteLength(fl, fq, fart.into);
      // No vibrato with the concertina: against its steady reed it beat (flute.js).
      var parts = ornaments === 'written' && orn ? ornament(orn, tick, dur, midi, w, fd, fart, fw, written) : null;
      if (parts) parts.forEach(function (x, i) {
        pending.push({ t: tBar + x.at * q + x.off, note: { who: 'flute', midi: x.midi, dur: x.dur, final: !!finalNote && i === parts.length - 1,
                                                          w: x.w, slur: x.art.slur, grace: !!x.grace, of: midi },
                       fn: function (t) { flutePlayer.note(t, x.dur, x.midi, x.w, both ? 0 : 1, x.art); } });
      });
      else pending.push({ t: tBar + fa * q, note: { who: 'flute', midi: midi, dur: fd, final: !!finalNote, w: w, slur: fart.slur },
                          fn: function (t) { flutePlayer.note(t, fd, midi, w, both ? 0 : 1, fart); } });
    }
    if ($('on-concertina').checked) {
      var ca = warp(tick, 'concertina', written), cq = warp(tick + dur, 'concertina', written) - ca, cl = cq * q;
      var cd = finalNote ? cl + ring : concertinaLength(cl, cq, nextSame);
      var cw = Math.max(0.3, Math.min(1, 0.8 + (w - 0.8) * 1.4));   // the bellows lean harder
      pending.push({ t: tBar + ca * q, note: { who: 'concertina', midi: midi, dur: cd, final: !!finalNote, w: cw },
                     fn: function (t) { concertina.note(t, cd, midi, cw); } });
    }
  }

  /* ---------- ornaments, on the flute ----------
   * Where a setting writes them: a roll (~) and grace notes ({g}, a cut),
   * played the way an Irish flute player plays them, all under one breath
   * (slurred, flute.js) and in the tune's lilt. Since 1.19.0; until then
   * they were read past and the plain note played. Ornaments: As written
   * (the start) or Off, kept. The concertina plays the plain notes, as two
   * players seldom ornament alike.
   *   A grace note is a flick of GRACE seconds on the note's time, taking
   *     its time from the start of the note (a cut is on the beat).
   *   A roll on a dotted crotchet (a long roll, mostly jigs): the note, then
   *     on each of its second and third quavers a cut (a flick to the note
   *     two steps above in the key) and a tap (a dip to the step below,
   *     softer), each followed by the note again. On a crotchet (a short
   *     roll, mostly reels): the cut on its first quaver and the tap on its
   *     second. On a quaver: a cut.
   * Too short to fit (a fast tune, a short note), it is left plain. */
  var ORNAMENTS = {
    written: 'Rolls and cuts where the setting writes them, played on the flute; the concertina keeps to the plain notes.',
    off: 'The plain tune, no ornaments.'
  };
  var ornaments = ORNAMENTS[stored('players.ornaments', '')] ? stored('players.ornaments') : 'written';
  var GRACE = 0.026, TAP = 0.032;
  function drawOrnaments() {
    Array.prototype.forEach.call($('ornaments').children, function (b) {
      b.setAttribute('aria-checked', String(b.dataset.orn === ornaments));
    });
    var rolls = 0, cuts = 0;
    if (tune) tune.lay.slots.forEach(function (sl) {
      (tune.lay.timeline.filter(function (tb) { return tb.slot === sl.id; })[0] || { notes: [] }).notes.forEach(function (nt) {
        if (nt.orn === 'roll') rolls++;
        if (nt.grace) cuts++;
      });
    });
    function n(k, one) { return k + ' ' + one + (k === 1 ? '' : 's'); }
    var has = rolls || cuts ? 'This setting writes ' + [rolls ? n(rolls, 'roll') : '', cuts ? n(cuts, 'grace note') : ''].filter(Boolean).join(' and ') + '.'
                            : 'This setting writes none.';
    $('ornaments-desc').textContent = ORNAMENTS[ornaments] + ' ' + has;
  }
  // The note n steps up (or down) the scale of the tune's key.
  function stepFrom(midi, n) {
    var pcs = tune.lay.key.scale.map(function (x) { return x.pc; }), m = midi, d = n > 0 ? 1 : -1;
    for (var k = 0; k < Math.abs(n); k++) {
      do { m += d; } while (pcs.indexOf(((m % 12) + 12) % 12) === -1 && Math.abs(m - midi) < 24);
    }
    return m;
  }
  /* The flute's parts for one ornamented note: [{ at (lilted quavers into
   * the bar), off (seconds after that), dur (seconds), midi, w, art, grace }],
   * or null to play it plain. fd: how long the plain note would be held. */
  function ornament(orn, tick, dur, midi, w, fd, fart, who, written) {
    var q = quaver(), at0 = warp(tick, who, written), out = [];
    // flicks at a point: the first takes the note's own tongue or slur
    function flick(at, off, m, len, wk) { out.push({ at: at, off: off, dur: len + P.Flute.prototype.OVERLAP, midi: m, w: w * wk, art: { slur: out.length ? true : fart.slur, into: true }, grace: true }); }
    function main(at, off) { out.push({ at: at, off: off, midi: midi, w: w, art: { slur: out.length ? true : fart.slur, into: true } }); }
    if (orn.grace) {
      orn.grace.forEach(function (m, i) { flick(at0, i * GRACE, m, GRACE, 0.85); });
      main(at0, orn.grace.length * GRACE);
    } else if (orn.orn === 'roll') {
      var pulses = Math.round(dur / TPQ), up = stepFrom(midi, 2), down = stepFrom(midi, -1);
      var p1 = warp(tick + TPQ, who, written), p2 = warp(tick + 2 * TPQ, who, written);
      if (pulses >= 3) { main(at0, 0); flick(p1, 0, up, GRACE, 0.85); main(p1, GRACE); flick(p2, 0, down, TAP, 0.6); main(p2, TAP); }
      else if (pulses === 2) { flick(at0, 0, up, GRACE, 0.85); main(at0, GRACE); flick(p1, 0, down, TAP, 0.6); main(p1, TAP); }
      else { flick(at0, 0, up, GRACE, 0.85); main(at0, GRACE); }
    } else return null;
    // Each part held to the next one's start (just past it, under one breath); the last as the plain note would be.
    var end = at0 * q + fd;
    for (var i = 0; i < out.length; i++) {
      var x = out[i], start = x.at * q + x.off;
      if (i < out.length - 1) { var nx = out[i + 1]; if (x.dur == null) x.dur = nx.at * q + nx.off - start + P.Flute.prototype.OVERLAP; }
      else { x.dur = end - start; x.art = { slur: x.art.slur, into: fart.into }; }
      if (!(x.dur > (x.grace ? 0.015 : 0.05))) return null;            // too short to fit
    }
    return out;
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
                  polka: [[0, 0], [1, 1.06], [1.5, 1.5], [2, 2]], waltz: [[0, 0], [1, 1.06], [2, 2]] },
    concertina: { jig: JIG_C, reel: [[0, 0], [1, 1.14], [2, 2]], 'slip jig': JIG_C,
                  slide: [[0, 0], [1, 1.18], [2, 2.09], [3, 3]],
                  polka: [[0, 0], [1, 1.1], [1.5, 1.5], [2, 2]], waltz: [[0, 0], [1, 1.08], [2, 2]] }
  };
  /* The beats of a bar the warp leaves as written: { beat: true }. In a
   * swung tune, any beat not in plain quavers and longer (a triplet, a dotted
   * pair, semiquavers). In the others, a beat with a triplet in it (since
   * 1.14.0: the lilt bent them, The Silver Spear's "(3AAA" coming out 0.73,
   * 0.67 and 0.60 of a quaver, the last note rushed; players keep them even).
   * Semiquavers and dotted pairs there still lilt. `at(n)`: a note's tick. */
  function asWritten(notes, at) {
    var ty = type(), out = {}, B = ty.per * TPQ, grid = ty.swing ? TPQ : TPQ / 2;
    notes.forEach(function (n) {
      var t = at ? at(n) : n.tick;
      if (t % grid || n.dur % grid) out[Math.floor(t / B)] = true;
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
    'slip jig': [0.95, 0.62, 0.7, 0.84, 0.62, 0.7, 0.86, 0.62, 0.72],
    waltz: [0.95, 0.62, 0.78, 0.62, 0.76, 0.64]                                   // leaning on 1
  };
  function weight(tick, k) {
    var ty = type(), w = WEIGHT[tune.meta.type], L = ty.slots * TPQ;
    var slot = Math.floor(tick / TPQ), base = w ? w[Math.max(0, Math.min(w.length - 1, slot))] : 0.8;
    if (tick % TPQ) base *= 0.9;              // a note off the quaver grid: a passing one
    var swell = 0.93 + 0.07 * Math.sin(Math.PI * ((k % 2) * L + tick) / (2 * L));
    return Math.min(1, base * swell * (0.94 + Math.random() * 0.12));
  }

  /* The tune's pickup notes, coming in over the end of the bar before. */
  function pickupInto(tNext, q, yours) {
    var pk = tune.lay.pickup, first = FORM[0] && FORM[0].notes[0];
    var L = type().slots * TPQ, tBar = tNext - type().slots * q;
    var written = asWritten(pk, function (p) { return L + p.tick; });
    var art = articulate(pk.map(function (p) { return { tick: L + p.tick, dur: p.dur, midi: p.midi }; }));
    pk.forEach(function (p, i) {
      var nx = pk[i + 1] || first, at = L + p.tick;
      melody(tBar, at, p.dur, p.midi, weight(at, 1) * 0.9, false, nx && nx.midi === p.midi, written, yours, art[i], { orn: p.orn, grace: p.grace, tick: at });
    });
  }

  /* How the flute takes each of a run of notes (one bar's, or the pickup):
   * as an Irish flute player mostly does, tongued on the beat and slurred
   * between, one breath carrying the notes of a beat (a jig's DUM-da-da,
   * a reel's pairs), the first note of the run tongued too; a repeated
   * note, or one after a rest, tongued as it must be. [{ slur, into }]. */
  function articulate(notes) {
    var beat = type().per * TPQ;
    var slur = notes.map(function (n, i) {
      var p = notes[i - 1];
      return !!p && p.tick + p.dur === n.tick && p.midi !== n.midi && n.tick % beat !== 0;
    });
    return notes.map(function (n, i) { return { slur: slur[i], into: !!slur[i + 1] }; });
  }

  // The last bar's notes on the last time, its written lead-in left off (see layBar).
  function endWithout(notes, cutAt, asPickup) {
    var kept = asPickup ? notes.filter(function (nt) { return nt.tick < cutAt; }) : notes.slice();
    if (!asPickup) {
      while (kept.length > 1 && kept[kept.length - 1].tick >= cutAt && kept[kept.length - 1].dur <= TPQ) kept.pop();
    }
    if (!kept.length) return notes;
    var tones = P.tones(P.chord(P.candidates(tune.lay.key)[0].name));
    function score(m) { return m % 12 === tune.lay.key.tonic ? 2 : tones.indexOf(m % 12) >= 0 ? 1 : 0; }
    return score(notes[notes.length - 1].midi) > score(kept[kept.length - 1].midi) ? notes : kept;
  }

  /* Where the guitar and bodhrán play quaver s of the bar, in quavers: by
   * the Backing feel. Until 1.14.0 the melody lilted over a backing of even
   * quavers (a hornpipe's swung by its Swing control), so in a reel at 100
   * the melody's off-beats landed 30-42 ms after the guitar's up-strum and
   * the drum's tak, a flam the ear catches. With the tune: they ride the
   * melody's own lilt (the concertina's if it is ticked, else the flute's;
   * still so with both off, for you to play to). A little: half way. */
  var BACKING = {
    straight: 'The guitar and bodhrán play even quavers under the tune’s lilt (a hornpipe’s swung by its Swing control), as before 1.14.0.',
    little: 'The guitar and bodhrán lilt half as much as the tune: a touch steadier than the melody.',
    tune: 'The guitar and bodhrán lilt with the tune, so their off-beats land with the melody’s, as a backer rides the tune.'
  };
  var backingFeel = BACKING[stored('players.backing', '')] ? stored('players.backing') : 'tune';
  function backingAt(s) {
    var plain = swung(s);
    if (backingFeel === 'straight') return plain;
    var lilted = warp(s * TPQ, $('on-concertina').checked ? 'concertina' : 'flute');
    return backingFeel === 'little' ? (plain + lilted) / 2 : lilted;
  }
  function drawBacking() {
    Array.prototype.forEach.call($('backing-feel').children, function (b) {
      b.setAttribute('aria-checked', String(b.dataset.backing === backingFeel));
    });
    $('backing-desc').textContent = BACKING[backingFeel];
  }

  /* The bodhrán: the app's three ways of playing (since 1.18.0; until then
   * always Simple, the one plain bar). Full phrases like a player, as the
   * app's Full does: the pattern changes bar to bar, weighted by Busyness
   * (sparse, steady, busy: TRAD.pickGrid), with a fill most likely at the end
   * of each of the tune's phrases and sometimes half way (Session Buddies
   * knows where the phrases fall, which the app does not), and a player's
   * small scatter in timing and weight. The choice and the busyness are kept. */
  var DRUM_STYLE = {
    full: 'Patterns change bar to bar, as a player’s do, with a fill most likely at the end of each phrase of the tune, sometimes half way.',
    simple: 'One steady figure for the tune type, the same every bar, no fills.',
    pulse: 'The low drum only, one stroke per beat, weighted where the dance falls. Nothing to follow but the pulse.'
  };
  var drumStyle = DRUM_STYLE[stored('players.drumstyle', '')] ? stored('players.drumstyle') : 'full';
  var drumBusy = Math.max(0, Math.min(1, +stored('players.drumbusy', '0.5') || 0));
  var lastDrumGrid = null, drumPlayed = null;   // the last Full pattern (for the picker); the last played (for the checks)
  function appTune() {        // the app's own patterns for this type
    var id = tune.meta.type.replace(' ', ''), t = T.tuneById && T.tuneById(id);
    return t && t.id === id ? t : null;
  }
  // The bar's pattern; k: the bar's place in the time through.
  function drumGrid(k) {
    var ty = type(), app = appTune();
    if (!app || drumStyle === 'simple') return (drumPlayed = ty.grid);
    if (drumStyle === 'pulse') return (drumPlayed = T.pulseGrid(app));
    var PH = tune.lay.meter.phrase || 8, pos = k % PH, g = app.grids, rng = Math.random;
    var chance = pos === PH - 1 ? 0.2 + 0.55 * drumBusy : PH >= 8 && pos === PH / 2 - 1 ? 0.1 + 0.25 * drumBusy : 0;
    var grid = chance && g.fills.length && rng() < chance ? g.fills[(rng() * g.fills.length) | 0]
             : T.pickGrid(app, drumBusy, false, lastDrumGrid, rng);
    lastDrumGrid = grid;
    return (drumPlayed = grid);
  }
  function drawDrum() {
    $('drum-box').hidden = !$('on-drum').checked;
    Array.prototype.forEach.call($('drum-style').children, function (b) {
      b.setAttribute('aria-checked', String(b.dataset.drum === drumStyle));
    });
    $('drum-desc').textContent = DRUM_STYLE[drumStyle];
    $('drum-busy-box').hidden = drumStyle !== 'full';
    $('drum-busy').value = drumBusy;
    $('drum-busy-out').textContent = Math.round(drumBusy * 100) + '%';
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
      if (n === -1) pickupInto(t0 + L * q, q, yourTurn(0));
      return L * q;
    }
    var k = n % FORM.length, tb = FORM[k], last = isLast(n), chords = tune.chords[tb.slot];
    shown.push({ t: t0, n: n });

    /* The last bar of a time through, in a tune with a pickup. With another
     * time to come, the pickup comes in over its end, so the bar's own notes
     * stop where it starts. Many settings write a lead-in there themselves
     * ("B2 AG|" back to the top): if it is the pickup, it is played once; if
     * written otherwise, the bar is played as written and the pickup left out
     * (1.12.2 played both, "B2 A A"). And on the last time, the written
     * lead-in is left off and the tune ends on the note before it: until
     * 1.12.3 the lead-in became the final note, held for a bar over the home
     * chord (The Silver Spear ended on a G over D; 1 in 12 settings did so).
     * Left off: the pickup itself, or the short notes (a quaver or less) at
     * the very end, in the pickup's place; never a held note (Cooley's #7
     * ends on E2 there), and not if the tune ends better with them, on the
     * keynote or the home chord (Foxhunter's #3 ends on a quaver D). Over the
     * popular settings this ends 85 of 100 such tunes on the home chord,
     * against 32, and none worse. */
    var pk = tune.lay.pickup, atEnd = k === FORM.length - 1 && pk.length;
    var cutAt = atEnd ? L * TPQ + pk[0].tick : Infinity;
    var tail = tb.notes.filter(function (nt) { return nt.tick >= cutAt; });
    var asPickup = tail.length === pk.length && tail.every(function (nt, i) {
      return nt.midi === pk[i].midi && nt.dur === pk[i].dur && nt.tick - cutAt === pk[i].tick - pk[0].tick;
    });
    var again = atEnd && !last && (!tail.length || asPickup);
    var kept = again ? tb.notes.filter(function (nt) { return nt.tick < cutAt; }) : tb.notes;
    if (atEnd && last && tail.length) kept = endWithout(tb.notes, cutAt, asPickup);
    var written = asWritten(tb.notes), mine = yourTurn(n), art = articulate(kept);
    kept.forEach(function (note, i) {
      var dur = again ? Math.min(note.dur, cutAt - note.tick) : note.dur;
      var nx = kept[i + 1] || (again ? pk[0] : FORM[(k + 1) % FORM.length].notes[0]);
      melody(t0, note.tick, dur, note.midi, weight(note.tick, k),
             last && i === kept.length - 1, nx && nx.midi === note.midi, written, mine, art[i], note);
    });
    if (again) pickupInto(t0 + L * q, q, mine);

    var slots = last ? ty.final.map(function (s, i) { return { s: s, d: 'D', v: i ? 1 : 0.85 }; })
                     : ty.strums[strum].slots;
    if ($('on-guitar').checked) {
      var open = P.TUNINGS[tuning].strings;
      slots.forEach(function (x) {
        var chord = chords.length > 1 && x.s >= ty.half ? chords[1] : chords[0];
        (function (at, notes, dir, v) {
          pending.push({ t: at, note: { who: 'guitar', slot: x.s },
                         fn: function (t) { guitar.strum(notes, t, dir, v, 4, open); } });
        })(t0 + backingAt(x.s) * q, P.voicing(tuning, chord), x.d, x.v);
      });
    }
    if ($('on-drum').checked) {
      if (last) {
        ty.final.forEach(function (s) {
          (function (at) { pending.push({ t: at, fn: function (t) { drum.hit('bass', t, 1); } }); })(t0 + s * q);
        });
      } else {
        var g = drumGrid(k), step = L / g.length, full = drumStyle === 'full';
        // Triplets in a duple beat (a reel's fills) stay even, as the tune's do.
        var even = ty.per === 2 && (g.length * ty.per / L) % 3 === 0;
        for (var i = 0; i < g.length; i++) {
          var voice = T.VOICE[g[i]];
          if (!voice) continue;
          var at = t0 + (even ? i * step : backingAt(i * step)) * q, v = T.VELOCITY[g[i]];
          if (full) {                              // a player's scatter, as the app's Humanise
            at += (Math.random() * 2 - 1) * 0.0036;
            v *= 1 + (Math.random() * 2 - 1) * 0.072;
          }
          (function (at, vc, v) {
            pending.push({ t: at, note: { who: 'drum', slot: i * step },
                           fn: function (t) { drum.hit(vc, t, v); } });
          })(at, voice, v);
        }
      }
    }
    slots.forEach(function (x) { shown.push({ t: t0 + backingAt(x.s) * q, strum: x.s }); });
    if (last) { endAt = t0 + ty.final[ty.final.length - 1] * q + 3.2; showState(); }
    return L * q;
  }

  function tick() {
    var now = ctx.currentTime;
    if (endAt == null) {
      while (nextBar < now + ahead + 0.18 && endAt == null) {
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
    addRecent();
    ensureAudio();
    if ($('on-concertina').checked) concertina.retry();   // any recordings that did not arrive
    run.gain.cancelScheduledValues(ctx.currentTime);
    run.gain.setTargetAtTime(1, ctx.currentTime, 0.01);
    playing = true;
    barN = -(+$('countin').value || 1);
    nextBar = ctx.currentTime + 0.12;
    ahead = T.lookahead(AHEAD);
    pending = []; shown = []; endAt = null; finishAt = null; lastDrumGrid = null;
    tick();
    timer = setInterval(tick, 25);
    T.keepAwake(true, ctx);               // the screen held on while it plays (js/wake.js)
    showState();
  }

  function stop(ended) {
    playing = false;
    clearInterval(timer); timer = null;
    pending = []; shown = []; endAt = null; finishAt = null;
    T.keepAwake(false);
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
      var x = slots[s], accent = (ty.accents || [0, ty.half]).indexOf(s) !== -1;
      // A waltz's pa-pa ('T') is a down strum, on the top strings.
      html += '<span id="dot-' + s + '" class="' + (x ? (accent ? 'accent' : '') : 'rest') + '">' + (x ? (x.d === 'T' ? 'D' : x.d) : '·') + '</span>';
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
    var end = endTime(), of = end < Infinity ? ' of ' + Math.max(end, t) : '';
    $('where').textContent = (info ? partName(info) : 'bar ' + (k + 1)) + ' · time ' + t + of +
      (finishAt != null ? ' · finishing' : '') + (yourTurn(n) ? ' · your turn' : '');
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
    var f = $('finish');
    f.disabled = !playing || endAt != null;
    f.setAttribute('aria-pressed', String(playing && finishAt != null));
    f.textContent = playing && (finishAt != null || endAt != null) ? 'Finishing' : 'Finish';
    showConcertina();
    if (!playing) {
      Array.prototype.forEach.call(document.querySelectorAll('.bar.on'), function (el) { el.classList.remove('on'); });
      $('where').textContent = '—';
      idleNow();
    }
  }

  /* A word when the concertina heard is not all recordings (concertina.js):
   * while they load (only said while playing: on a good connection they are
   * in before the count-in is), or when some or all did not arrive. */
  var CONCERTINA_SAYS = {
    loading: 'The concertina’s recordings are still loading. Until they arrive, a stand-in plays.',
    partial: 'A few of the concertina’s recordings didn’t arrive, so those notes are borrowed from their neighbours or played by a stand-in. They’ll be tried again when you next press Play.',
    failed: 'The concertina’s recordings didn’t arrive, so a stand-in is playing. They’ll be tried again when you next press Play.'
  };
  function showConcertina() {
    var st = concertina && $('on-concertina').checked ? concertina.status : 'ready';
    if (st === 'loading' && !playing) st = 'ready';
    var el = $('concertina-note');
    el.hidden = !CONCERTINA_SAYS[st];
    el.textContent = CONCERTINA_SAYS[st] || '';
  }

  /* ---------- Reset settings ----------
   * Every choice back to how it starts: all that is kept under 'players.'
   * (the instruments and their volumes, melody, strum, backing feel, the
   * bodhrán, swing, tuning, sympathy) and the tempo, "Play it" and count-in
   * kept with the tune on the page; then the page starts afresh, as on a
   * first visit but on the same tune. Your tunes (favourites, played lately)
   * and the tune's chords are not touched. Undo, until the next reload,
   * puts it all back. */
  var UNDO_RESET = 'buddies.undoReset', resetting = false;
  function settingKeys() {
    var out = [];
    try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (/^players\./.test(k)) out.push(k); } } catch (e) {}
    return out;
  }
  function resetSettings() {
    if (playing) stop(false);
    var before = {};
    settingKeys().forEach(function (k) { before[k] = stored(k, null); });
    resetting = true;                 // so the reload keeps this Undo
    try { sessionStorage.setItem(UNDO_RESET, JSON.stringify(before)); } catch (e) {}
    settingKeys().forEach(function (k) { if (k !== 'players.current') { try { localStorage.removeItem(k); } catch (e) {} } });
    var cur = stored('players.current', '');
    if (cur) {
      try { var d = JSON.parse(cur); d.options = {}; store('players.current', JSON.stringify(d, null, 1)); }
      catch (e) { try { localStorage.removeItem('players.current'); } catch (e2) {} }
    }
    location.reload();
  }
  function undoReset() {
    var before = null;
    try { before = JSON.parse(sessionStorage.getItem(UNDO_RESET) || 'null'); sessionStorage.removeItem(UNDO_RESET); } catch (e) {}
    if (!before) return;
    settingKeys().forEach(function (k) { try { localStorage.removeItem(k); } catch (e) {} });
    Object.keys(before).forEach(function (k) { if (before[k] != null) store(k, before[k]); });
    location.reload();
  }
  // After a reset: say so, with Undo, this once.
  function showResetDone() {
    var have = false;
    try { have = !!sessionStorage.getItem(UNDO_RESET); } catch (e) {}
    $('reset-done').hidden = !have;
    if (have) window.addEventListener('pagehide', function () { if (!resetting) try { sessionStorage.removeItem(UNDO_RESET); } catch (e) {} });
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
    // Another setting of the same tune keeps your tempo (until 1.18.2 it went
    // back to the type's), unless your copy of that setting has its own.
    $('setting').addEventListener('change', function () { build(tune.meta, tune.settings, +this.value, null, +$('bpm').value); });
    $('save').addEventListener('click', save);
    $('fav').addEventListener('click', toggleFav);
    $('save-list').addEventListener('click', saveList);
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
      if (undoChords && undoChords.tune === tune) {              // put them back
        tune.chords = undoChords.chords; tune.mine = undoChords.mine;
        undoChords = null;
      } else {
        undoChords = { tune: tune, chords: JSON.parse(JSON.stringify(tune.chords)), mine: Object.assign({}, tune.mine) };
        Object.keys(tune.mine).forEach(function (id) { tune.chords[id] = (tune.auto[id] || tune.chords[id]).slice(); });
        tune.mine = {};
      }
      prepareGuitar(); buildChart(); drawShapes(); idleNow(); remember(); showReset();
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
    // Which of them are ticked is kept too (since 1.18.2; a reload put them
    // back to guitar, flute and bodhrán).
    var ticked = {};
    try { ticked = JSON.parse(stored('players.voices', '{}')) || {}; } catch (e) {}
    ['guitar', 'tune', 'concertina', 'drum'].forEach(function (k) {
      var el = $('vol-' + k), box = $('on-' + k);
      if (typeof ticked[k] === 'boolean') box.checked = ticked[k];
      box.addEventListener('change', function () { ticked[k] = box.checked; store('players.voices', JSON.stringify(ticked)); });
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
      if (k === 'concertina') box.addEventListener('change', function () { if (box.checked) ensureAudio(); showConcertina(); });
    });
    // Ticked from last time, the concertina's recordings start loading at
    // your first tap anywhere, as ticking it would (sound can only start at one).
    if ($('on-concertina').checked) {
      var early = function () { document.removeEventListener('click', early, true); ensureAudio(); showConcertina(); };
      document.addEventListener('click', early, true);
    }
    $('reset-settings').addEventListener('click', resetSettings);
    $('reset-undo').addEventListener('click', undoReset);
    showResetDone();
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
    $('finish').addEventListener('click', finish);
    Array.prototype.forEach.call($('melody-mode').children, function (b) {
      b.addEventListener('click', function () {               // heard from the next bar
        melodyMode = b.dataset.melody; store('players.melody', melodyMode); drawMelody();
      });
    });
    Array.prototype.forEach.call($('your-turn-level').children, function (b) {
      b.addEventListener('click', function () {
        yourTurnLevel = b.dataset.level; store('players.yourturn', yourTurnLevel); drawMelody();
      });
    });
    drawMelody();
    Array.prototype.forEach.call($('backing-feel').children, function (b) {
      b.addEventListener('click', function () {               // heard from the next bar
        backingFeel = b.dataset.backing; store('players.backing', backingFeel); drawBacking();
      });
    });
    drawBacking();
    Array.prototype.forEach.call($('ornaments').children, function (b) {
      b.addEventListener('click', function () {               // heard from the next bar
        ornaments = b.dataset.orn; store('players.ornaments', ornaments); drawOrnaments();
      });
    });
    drawOrnaments();
    Array.prototype.forEach.call($('drum-style').children, function (b) {
      b.addEventListener('click', function () {               // heard from the next bar
        drumStyle = b.dataset.drum; store('players.drumstyle', drumStyle); drawDrum();
      });
    });
    $('drum-busy').addEventListener('input', function () {
      drumBusy = +this.value; store('players.drumbusy', String(drumBusy)); drawDrum();
    });
    $('on-drum').addEventListener('change', drawDrum);
    drawDrum();
    document.addEventListener('keydown', function (e) {
      var typing = /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(e.target.tagName) && !(e.target.type === 'range');
      if (typing || $('chooser').open || !tune || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code === 'Space') { e.preventDefault(); toggle(); }
      else if (e.key === 'f' || e.key === 'F') finish();     // as in the app
    });
    drawShapes();
    drawStrum();
    $('sound-check').hidden = !/soundcheck/i.test(location.search + location.hash);
    // The tune left on the page last time; on a first visit, the starter.
    var last = stored('players.current', '');
    if (!(last && openText(last, true))) {
      loadTune(STARTER, 0);
      fillSettings();
      $('find-status').textContent = 'The Kesh is ready to play, to start you off. Search above for any other tune.';
    }
    renderMine();
    // Open or closed as you left it (until 1.18.3 it opened at every load
    // if you had any tunes); closed to begin with.
    $('mine').open = stored('players.mineopen', '') === 'open';
    $('mine').addEventListener('toggle', function () { store('players.mineopen', $('mine').open ? 'open' : 'closed'); });
  }

  // For the checks page.
  window.BUDDIES_PAGE = {
    VERSION: VERSION, TYPES: TYPES, PLAYABLE: PLAYABLE, finishing: function () { return finishAt; },
    laid: function () { return barN; },     // the next bar to be handed to the audio
    swingNow: function () { return tune ? swingNow() : 0.5; }, MIX: MIX, fluteLength: fluteLength, concertinaLength: concertinaLength,
    tune: function () { return tune; },
    form: function () { return FORM; },
    STARTER: STARTER, loadTune: loadTune, openText: openText, listText: listText,
    // The tune's notes bar n would hand over (count-in bars below 0), laid
    // from time 0, without playing anything.
    plan: function (n) {
      var keep = { p: pending, s: shown, e: endAt };
      pending = []; shown = [];
      try {
        layBar(n, 0);
        return pending.filter(function (x) { return x.note; }).map(function (x) {
          return { t: x.t, who: x.note.who, midi: x.note.midi, dur: x.note.dur, final: x.note.final, w: x.note.w, slot: x.note.slot, slur: x.note.slur, grace: x.note.grace };
        }).sort(function (a, b) { return a.t - b.t; });
      } finally { pending = keep.p; shown = keep.s; endAt = keep.e; }
    }, saveText: saveText, setChord: setChord,
    playing: function () { return playing; },
    drumGrid: function () { return drumPlayed; },     // the pattern the last bar laid used
    audio: function () { return { ctx: ctx, run: run, guitar: guitar, flute: fluteBus, concertina: concertina, concBus: concBus, drum: drum }; }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
