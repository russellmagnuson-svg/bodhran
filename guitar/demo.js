/* demo.js — plays The Kesh with a guitar backing, and draws what it plays.
 *
 * The clock works like the bodhrán app's: a timer wakes every 25 ms, lays
 * out each bar as it comes near, and hands the audio only what falls in the
 * next fraction of a second, timed against the audio clock. So Stop only has
 * a moment's worth to drop, and a tempo change lands on the next bar.
 */
(function () {
  'use strict';

  /* The demo's own version, apart from the app's: shown next to the title
   * and at the foot, so you can tell whether a phone has the latest. Bump it
   * with every change to the demo that gets pushed: the last number for a
   * fix, the middle one for something new. Add it to CHANGELOG.md and the
   * release notes in the same change (a check makes sure). */
  var VERSION = '1.3.3';

  var $ = function (id) { return document.getElementById(id); };
  var K = window.KESH, G = window.GTR, T = window.TRAD;

  /* ---------- the strums ----------
   * Six quavers to a 6/8 bar, in two groups of three. */
  var STRUMS = {
    lilt: {
      text: 'Down on the beat and up on the third quaver of each group: DUM-da, DUM-da. ' +
            'The jig’s own lilt, and the backbone of most jig backing.',
      slots: [{ s: 0, d: 'D', v: 1 }, { s: 2, d: 'U', v: 0.5 },
              { s: 3, d: 'D', v: 0.8 }, { s: 5, d: 'U', v: 0.5 }]
    },
    drive: {
      text: 'All six quavers, the hand never stopping: down-up-down, up-down-up, ' +
            'leaning on 1 and 4, so the second beat lands on an up stroke. More push, ' +
            'for when the tune gets going.',
      slots: [{ s: 0, d: 'D', v: 1 }, { s: 1, d: 'U', v: 0.4 }, { s: 2, d: 'D', v: 0.55 },
              { s: 3, d: 'U', v: 0.85 }, { s: 4, d: 'D', v: 0.55 }, { s: 5, d: 'U', v: 0.4 }]
    }
  };
  var strum = 'lilt';

  /* ---------- how loud each sound is ----------
   * MIX is the balance set by measurement: guitar and flute about -21 dB on
   * average, the bodhrán level with them. The sliders scale it, 0 to 200%,
   * and the page remembers them.
   *
   * The bodhrán used to be buried: 4 dB under the guitar overall, level with
   * it only in the bass, where the big-bodied guitar covers it, and its stick
   * click, the part the ear picks a drum out by, 34 dB under the guitar in its
   * band. So besides more level, its channel lifts the click around 2.5 kHz
   * (DRUM.lift): the stick came up to 20 dB under the guitar, which for a
   * sound that short is plainly heard. The app's own drum is unchanged. */
  var MIX = { guitar: 0.7, tune: 0.18, drum: 0.7 };
  var DRUM = { lift: { f: 2500, q: 0.7, gain: 9 } };
  var vol = { guitar: 1, tune: 1, drum: 1 };
  try {
    var saved = JSON.parse(localStorage.getItem('kesh.demo.volume') || '{}');
    Object.keys(vol).forEach(function (k) {
      if (typeof saved[k] === 'number' && saved[k] >= 0 && saved[k] <= 2) vol[k] = saved[k];
    });
  } catch (e) { /* private window or storage blocked: start at 100% */ }

  function applyLevels() {
    if (!ctx) return;
    guitar.setLevel(MIX.guitar * vol.guitar);
    fluteBus.gain.setTargetAtTime(MIX.tune * vol.tune, ctx.currentTime, 0.03);
    drum.setLevel(MIX.drum * vol.drum);
  }

  var FORM = K.form();                     // one time through: AABB, 32 bars
  /* The tuning, standard or DADGAD. DADGAD to begin with; the page remembers
   * a choice. Each tuning's shapes as notes: VOICE[tuning][chord]. */
  var tuning = 'dadgad';
  try {
    var t = localStorage.getItem('kesh.demo.tuning');
    if (K.tunings[t]) tuning = t;
  } catch (e) {}
  var VOICE = {};
  Object.keys(K.tunings).forEach(function (tn) {
    VOICE[tn] = {};
    Object.keys(K.tunings[tn].shapes).forEach(function (c) { VOICE[tn][c] = K.voicing(c, tn); });
  });

  /* ---------- audio, built on the first press of Play ---------- */
  var ctx = null, run = null, guitar = null, drum = null, clicker = null, fluteBus = null, noise = null;

  function roomImpulse(seconds, decay) {
    var len = Math.floor(ctx.sampleRate * seconds), buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (var ch = 0; ch < 2; ch++) {
      var d = buf.getChannelData(ch);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  /* Called from the press of Play. Waking the sound is shared with the app
   * (js/wake.js): this page used to only resume the audio, and went silent in
   * Safari after the Mac slept, as the app once did. */
  function ensureAudio() {
    if (ctx) { T.startSound(ctx); return; }
    T.prepareAudio();
    var AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC({ latencyHint: 'interactive' });
    T.startSound(ctx);
    var out = T.makeOutput(ctx);          // the app's limiter: nothing clips

    run = ctx.createGain();               // Stop fades this; Play brings it back
    run.connect(out);
    var room = ctx.createConvolver();
    room.buffer = roomImpulse(1.6, 3);
    var wet = ctx.createGain(); wet.gain.value = 0.2;
    run.connect(room); room.connect(wet); wet.connect(out);

    guitar = new G.Guitar(ctx, run);
    var all = {};
    Object.keys(VOICE).forEach(function (tn) {
      Object.keys(VOICE[tn]).forEach(function (c) {
        VOICE[tn][c].forEach(function (m) { if (m != null) all[m] = 1; });
      });
    });
    guitar.prepare(Object.keys(all).map(Number));

    var lift = ctx.createBiquadFilter();
    lift.type = 'peaking';
    lift.frequency.value = DRUM.lift.f; lift.Q.value = DRUM.lift.q; lift.gain.value = DRUM.lift.gain;
    lift.connect(run);
    drum = new T.Bodhran(ctx, lift);
    drum.setRoom(0.1);
    // The count-in has a clicker of its own, at the level the clicks always
    // had, outside the drum's louder, lifted channel. (Its click takes the
    // higher, accented pitch from how hard it is struck, so it cannot simply
    // be struck more softly.)
    clicker = new T.Bodhran(ctx, run);
    clicker.setLevel(0.42); clicker.setRoom(0.1);

    fluteBus = ctx.createGain(); fluteBus.gain.value = MIX.tune * vol.tune;
    var soft = ctx.createBiquadFilter(); soft.type = 'lowpass'; soft.frequency.value = 5200;
    fluteBus.connect(soft); soft.connect(run);

    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    var nd = noise.getChannelData(0);
    for (var i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    applyLevels();
    requestAnimationFrame(frame);
  }

  /* ---------- the tune: a simple flute ---------- */
  // Flute notes handed to the audio but not yet sounding, so Stop can drop them.
  var queuedFlute = [];
  function cancelFlute(t) {
    queuedFlute = queuedFlute.filter(function (n) {
      if (n.t < t) return false;           // sounding or gone: Stop's fade deals with it
      n.nodes.forEach(function (x) { x.disconnect(); });
      return false;
    });
  }
  function flute(t, dur, midi, vel) {
    var f = G.hz(midi), end = t + dur;
    queuedFlute = queuedFlute.filter(function (n) { return n.t > ctx.currentTime - 1; });
    var amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(vel, t + 0.03);
    amp.gain.setValueAtTime(vel, Math.max(t + 0.031, end - 0.05));
    amp.gain.exponentialRampToValueAtTime(0.0001, end);
    amp.connect(fluteBus);
    queuedFlute.push({ t: t, nodes: [amp] });
    [[1, 1], [2, 0.16], [3, 0.05]].forEach(function (h) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = f * h[0]; g.gain.value = h[1];
      if (dur > 0.4) {                     // a little vibrato on held notes
        var lfo = ctx.createOscillator(), depth = ctx.createGain();
        lfo.frequency.value = 5.2;
        depth.gain.setValueAtTime(0, t);
        depth.gain.linearRampToValueAtTime(9, t + 0.35);
        lfo.connect(depth); depth.connect(o.detune);
        lfo.start(t); lfo.stop(end + 0.02);
      }
      o.connect(g); g.connect(amp);
      o.start(t); o.stop(end + 0.02);
    });
    // Breath: a puff of air at the start of each note, and a trace under it.
    var b = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), bg = ctx.createGain();
    b.buffer = noise; bp.type = 'bandpass'; bp.frequency.value = f * 4; bp.Q.value = 1.2;
    bg.gain.setValueAtTime(0.0001, t);
    bg.gain.exponentialRampToValueAtTime(vel * 0.1, t + 0.012);
    bg.gain.exponentialRampToValueAtTime(vel * 0.018, t + 0.08);
    bg.gain.exponentialRampToValueAtTime(0.0001, end);
    b.connect(bp); bp.connect(bg); bg.connect(fluteBus);
    queuedFlute[queuedFlute.length - 1].nodes.push(bg);
    b.start(t, Math.random() * 0.5, dur + 0.05);
  }

  /* ---------- the clock ---------- */
  var playing = false, timer = null;
  var barN = 0, nextBar = 0, pending = [], shown = [], endAt = null;
  var heard = -1;                          // the bar you are hearing now
  var AHEAD = 0.12;                        // how far ahead the audio is handed notes, on screen
  var ahead = AHEAD;                       // longer while hidden: see js/wake.js

  function quaver() { return 60 / +$('bpm').value / 3; }
  function times() { return +$('times').value; }
  function isLast(n) { return times() > 0 && n === times() * FORM.length - 1; }

  /* Lay out one bar of the performance as events. n < 0 is the count-in. */
  function layBar(n, t0) {
    var q = quaver();
    if (n < 0) {
      pending.push({ t: t0, fn: function (t) { clicker.hit('click', t, 0.9); } });
      pending.push({ t: t0 + 3 * q, fn: function (t) { clicker.hit('click', t, 0.55); } });
      shown.push({ t: t0, n: n });
      return 6 * q;
    }
    var bar = FORM[n % FORM.length], last = isLast(n);
    shown.push({ t: t0, n: n });

    if ($('on-tune').checked) {
      var pos = 0;
      bar.notes.forEach(function (note, i) {
        var len = note.len * q, finalNote = last && i === bar.notes.length - 1;
        // Quavers a touch detached, so repeated notes (edd, gdd) speak.
        var dur = finalNote ? len + 6 * q : len * (note.len === 1 ? 0.82 : 0.94);
        var vel = (pos === 0 || pos === 3 ? 0.9 : 0.7);
        (function (at, d, m, v) {
          pending.push({ t: at, fn: function (t) { flute(t, d, m, v); } });
        })(t0 + pos * q, dur, note.midi, vel);
        pos += note.len;
      });
    }

    var slots = last ? [{ s: 0, d: 'D', v: 0.85 }, { s: 3, d: 'D', v: 1, final: true }]
                     : STRUMS[strum].slots;
    if ($('on-guitar').checked) {
      slots.forEach(function (x) {
        var chord = bar.chords.length > 1 && x.s >= 3 ? bar.chords[1] : bar.chords[0];
        (function (at, notes, dir, v, s) {
          pending.push({ t: at, fn: function (t) { guitar.strum(notes, t, dir, v, 4); }, strum: s });
        })(t0 + x.s * q, VOICE[tuning][chord], x.d, x.v, x.s);
      });
    }

    if ($('on-drum').checked) {
      var beats = last ? [[0, 'bass', 1], [3, 'bass', 1]]
                       : [[0, 'bass', 1], [2, 'treble', 0.46], [3, 'bass', 1], [5, 'treble', 0.46]];
      beats.forEach(function (b) {
        (function (at, voice, v) {
          pending.push({ t: at, fn: function (t) { drum.hit(voice, t, v); } });
        })(t0 + b[0] * q, b[1], b[2]);
      });
    }

    // Strum boxes light in time, whether or not the guitar is on.
    slots.forEach(function (x) { shown.push({ t: t0 + x.s * q, strum: x.s }); });
    if (last) endAt = t0 + 3 * q + 3.2;   // let the last chord ring out
    return 6 * q;
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
      if (e.t > now - 0.05) e.fn(Math.max(e.t, now));   // too late: skip, never pile up
    }
    draw();
    if (endAt != null && now >= endAt) stop(true);
  }

  function start() {
    ensureAudio();
    run.gain.cancelScheduledValues(ctx.currentTime);
    run.gain.setTargetAtTime(1, ctx.currentTime, 0.01);
    playing = true;
    barN = -1;                              // one bar of count-in clicks first
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
      if (!ended) run.gain.setTargetAtTime(0, now, 0.04);   // a press of Stop: quickly quiet
      // Drop everything handed to the audio ahead of time — seconds of it, if
      // the tab was hidden — or it would come back with the next Play.
      guitar.cancelFrom(now); cancelFlute(now);
      drum.cancelFrom(now); clicker.cancelFrom(now);
      guitar.silence(now + (ended ? 0 : 0.05));
    }
    showState();
  }

  function toggle() { if (playing) stop(false); else start(); }

  /* Hidden behind another tab, Safari slows this page's timers to about once
   * a second, and the demo stumbled: notes came due between them and were
   * skipped. So hidden, hand the audio notes several seconds ahead, at once;
   * back on screen, just ahead again (js/wake.js). */
  function fitLookahead() {
    ahead = T.lookahead(AHEAD);
    if (document.hidden && playing) tick();
  }
  document.addEventListener('visibilitychange', fitLookahead);

  /* ---------- drawing ---------- */
  function diagram(chord, big) {
    var tn = K.tunings[tuning], sh = tn.shapes[chord], w = big ? 132 : 96, h = big ? 174 : 130;
    var left = big ? 26 : 20, top = big ? 30 : 24, gapX = (w - 2 * left) / 5, gapY = big ? 24 : 17;
    var svg = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" role="img" aria-label="' +
              sh.name + ' chord shape">';
    // Four frets shown. A shape reaching past the fourth (DADGAD's G, up to
    // the fifth) is drawn from its lowest fret, marked "2fr", as chord books do.
    var fretted = sh.frets.filter(function (f) { return f > 0; });
    var base = Math.max.apply(null, fretted) > 4 ? Math.min.apply(null, fretted) : 1;
    for (var f = 0; f <= 4; f++) {
      var y = top + f * gapY, nut = f === 0 && base === 1;
      svg += '<line class="' + (nut ? 'nut' : 'fret') + '" x1="' + left + '" x2="' + (w - left) + '" y1="' + y + '" y2="' + y +
             '" stroke-width="' + (nut ? 3 : 1) + '"/>';
    }
    if (base > 1) {
      svg += '<text class="num" x="' + (left - 4) + '" y="' + (top + 0.5 * gapY + 3.5) + '" text-anchor="end">' + base + 'fr</text>';
    }
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
        svg += '<circle class="dot' + drone + '" cx="' + x + '" cy="' + (top + (fr - base + 0.5) * gapY) +
               '" r="' + (big ? 7.5 : 5.5) + '"/>';
      }
      svg += '<text class="num" x="' + x + '" y="' + (top + 4 * gapY + 13) + '" text-anchor="middle">' +
             tn.letters.split(' ')[s] + '</text>';
    }
    svg += '<text class="nm" x="' + (w / 2) + '" y="' + (h - 6) + '" text-anchor="middle">' + sh.name + '</text></svg>';
    return svg;
  }

  function buildChart() {
    var host = $('chart');
    ['A', 'B'].forEach(function (p) {
      var row = document.createElement('div');
      row.className = 'part';
      row.innerHTML = '<div class="part-name">' + p + '</div>';
      var bars = document.createElement('div');
      bars.className = 'bars';
      K.parts[p].forEach(function (bar, i) {
        var el = document.createElement('div');
        el.className = 'bar';
        el.id = 'bar-' + p + i;
        el.innerHTML = '<div class="ch">' + bar.chords.join('<i>·</i>') + '</div>' +
                       '<div class="abc">' + bar.abc + '</div>';
        bars.appendChild(el);
      });
      row.appendChild(bars);
      host.appendChild(row);
    });
    drawShapes();
  }

  function drawShapes() {
    $('shapes').innerHTML = ['G', 'C', 'D', 'Em'].map(function (c) {
      return '<div class="diagram">' + diagram(c) + '</div>';
    }).join('');
    $('shapes-tuning').textContent = K.tunings[tuning].name;
    $('shapes-note').textContent = K.tunings[tuning].note;
    Array.prototype.forEach.call($('tunings').children, function (b) {
      b.setAttribute('aria-checked', String(b.dataset.tuning === tuning));
    });
  }

  function drawStrum() {
    var slots = {};
    STRUMS[strum].slots.forEach(function (x) { slots[x.s] = x; });
    var html = '';
    for (var s = 0; s < 6; s++) {
      var x = slots[s];
      html += '<span id="dot-' + s + '" class="' + (x ? (x.s === 0 || x.s === 3 ? 'accent' : '') : 'rest') + '">' +
              (x ? x.d : '·') + '</span>';
    }
    $('strum-dots').innerHTML = html;
    $('strum-desc').textContent = STRUMS[strum].text;
  }

  function nowChord(chord, next) {
    $('now-chord').textContent = chord;
    $('now-diagram').innerHTML = diagram(chord, true);
    $('next-chord').textContent = next;
  }

  function showBar(n) {
    heard = n;
    Array.prototype.forEach.call(document.querySelectorAll('.bar.on'), function (el) { el.classList.remove('on'); });
    if (n < 0) { $('where').textContent = 'count-in'; return; }
    var bar = FORM[n % FORM.length], k = n % FORM.length;
    var el = $('bar-' + bar.part + bar.index);
    if (el) el.classList.add('on');
    var nextBar = FORM[(n + 1) % FORM.length];
    nowChord(bar.chords[0], bar.chords[1] || nextBar.chords[0]);
    var round = k < 8 || (k >= 16 && k < 24) ? 'first' : 'second';
    var t = Math.floor(n / FORM.length) + 1;
    $('where').textContent = bar.part + ' part, ' + round + ' time · bar ' + (bar.index + 1) +
      ' · time ' + t + (times() > 0 ? ' of ' + times() : '');
  }

  // Drawn on each screen refresh, and from the clock's own timer as well: a
  // browser stops screen refreshes in a hidden tab, and the page should
  // still be showing the right bar the moment it is looked at again.
  function frame() {
    requestAnimationFrame(frame);
    draw();
  }
  function draw() {
    if (!playing || !ctx) return;
    var now = ctx.currentTime;
    shown.sort(function (a, b) { return a.t - b.t; });
    while (shown.length && shown[0].t <= now) {
      var e = shown.shift();
      if (e.strum != null) {
        var dot = $('dot-' + e.strum);
        if (dot) {
          dot.classList.add('on');
          (function (d) { setTimeout(function () { d.classList.remove('on'); }, 120); })(dot);
        }
        // The second chord of a split bar shows as it arrives.
        var cur = heard >= 0 ? FORM[heard % FORM.length] : null;
        if (e.strum === 3 && cur && cur.chords.length > 1) {
          nowChord(cur.chords[1], FORM[(heard + 1) % FORM.length].chords[0]);
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
      nowChord('G', 'D');
    }
  }

  /* ---------- wiring ---------- */
  function setBpm(v) {
    v = Math.max(60, Math.min(130, Math.round(+v) || 100));
    $('bpm').value = v; $('bpm-num').value = v;
  }

  function init() {
    $('demo-version').textContent = 'v' + VERSION;
    $('foot-version').textContent = 'Guitar demo version ' + VERSION + '.';
    buildChart();
    drawStrum();
    nowChord('G', 'D');
    $('play').addEventListener('click', toggle);
    $('bpm').addEventListener('input', function () { setBpm(this.value); });
    ['guitar', 'tune', 'drum'].forEach(function (k) {
      var el = $('vol-' + k), box = $('on-' + k);
      function show() {
        $('vol-' + k + '-out').textContent = Math.round(vol[k] * 100) + '%';
        el.closest('.voice').classList.toggle('is-off', !box.checked);
      }
      el.value = vol[k];
      show();
      el.addEventListener('input', function () {
        vol[k] = +el.value;
        show();
        applyLevels();   // straight away, while it plays
        try { localStorage.setItem('kesh.demo.volume', JSON.stringify(vol)); } catch (e) {}
      });
      box.addEventListener('change', show);
    });
    $('bpm-num').addEventListener('change', function () { setBpm(this.value); });
    Array.prototype.forEach.call($('tunings').children, function (b) {
      b.addEventListener('click', function () {
        tuning = b.dataset.tuning;
        try { localStorage.setItem('kesh.demo.tuning', tuning); } catch (e) {}
        drawShapes();
        if (!playing) nowChord('G', 'D');
      });
    });
    Array.prototype.forEach.call($('strums').children, function (b) {
      b.addEventListener('click', function () {
        strum = b.dataset.strum;
        Array.prototype.forEach.call($('strums').children, function (x) {
          x.setAttribute('aria-checked', String(x === b));
        });
        drawStrum();
      });
    });
    document.addEventListener('keydown', function (e) {
      if (e.code !== 'Space' || /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(e.target.tagName) &&
          !(e.target.type === 'range')) return;
      e.preventDefault();
      toggle();
    });
  }

  // For the checks page: what the demo plays, without playing it.
  window.KESH_DEMO = {
    VERSION: VERSION, STRUMS: STRUMS, FORM: FORM, VOICE: VOICE, MIX: MIX, DRUM: DRUM,
    tuning: function () { return tuning; },
    ahead: function () { return ahead; },
    audio: function () { return { ctx: ctx, run: run, guitar: guitar, flute: fluteBus, drum: drum }; },
    playing: function () { return playing; }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
