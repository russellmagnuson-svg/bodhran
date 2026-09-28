/* demo.js — plays The Kesh with a guitar backing, and draws what it plays.
 *
 * The clock works like the bodhrán app's: a timer wakes every 25 ms, lays
 * out each bar as it comes near, and hands the audio only what falls in the
 * next fraction of a second, timed against the audio clock. So Stop only has
 * a moment's worth to drop, and a tempo change lands on the next bar.
 */
(function () {
  'use strict';

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

  var FORM = K.form();                     // one time through: AABB, 32 bars
  var VOICE = {};                          // chord -> the notes of its shape
  Object.keys(K.shapes).forEach(function (c) { VOICE[c] = K.voicing(c); });

  /* ---------- audio, built on the first press of Play ---------- */
  var ctx = null, run = null, guitar = null, drum = null, fluteBus = null, noise = null;

  function roomImpulse(seconds, decay) {
    var len = Math.floor(ctx.sampleRate * seconds), buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (var ch = 0; ch < 2; ch++) {
      var d = buf.getChannelData(ch);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  function ensureAudio() {
    if (ctx) { ctx.resume().catch(function () {}); return; }
    if (navigator.audioSession && navigator.maxTouchPoints > 0) {
      try { navigator.audioSession.type = 'playback'; } catch (e) {}
    }
    var AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC({ latencyHint: 'interactive' });
    ctx.resume().catch(function () {});
    var out = T.makeOutput(ctx);          // the app's limiter: nothing clips

    run = ctx.createGain();               // Stop fades this; Play brings it back
    run.connect(out);
    var room = ctx.createConvolver();
    room.buffer = roomImpulse(1.6, 3);
    var wet = ctx.createGain(); wet.gain.value = 0.2;
    run.connect(room); room.connect(wet); wet.connect(out);

    // Levels set by measurement, so the guitar leads: alone it averaged
    // -21 dB, the flute -16.5 and the drum -22, and all three together went
    // over full scale. Now the flute sits level with the guitar and the drum
    // a few dB under, with room to spare.
    guitar = new G.Guitar(ctx, run);
    guitar.setLevel(0.7);
    var all = {};
    Object.keys(VOICE).forEach(function (c) { VOICE[c].forEach(function (m) { if (m != null) all[m] = 1; }); });
    guitar.prepare(Object.keys(all).map(Number));

    drum = new T.Bodhran(ctx, run);
    drum.setLevel(0.42); drum.setRoom(0.1);

    fluteBus = ctx.createGain(); fluteBus.gain.value = 0.18;
    var soft = ctx.createBiquadFilter(); soft.type = 'lowpass'; soft.frequency.value = 5200;
    fluteBus.connect(soft); soft.connect(run);

    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    var nd = noise.getChannelData(0);
    for (var i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    requestAnimationFrame(frame);
  }

  /* ---------- the tune: a simple flute ---------- */
  function flute(t, dur, midi, vel) {
    var f = G.hz(midi), end = t + dur;
    var amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(vel, t + 0.03);
    amp.gain.setValueAtTime(vel, Math.max(t + 0.031, end - 0.05));
    amp.gain.exponentialRampToValueAtTime(0.0001, end);
    amp.connect(fluteBus);
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
    b.start(t, Math.random() * 0.5, dur + 0.05);
  }

  /* ---------- the clock ---------- */
  var playing = false, timer = null;
  var barN = 0, nextBar = 0, pending = [], shown = [], endAt = null;
  var heard = -1;                          // the bar you are hearing now

  function quaver() { return 60 / +$('bpm').value / 3; }
  function times() { return +$('times').value; }
  function isLast(n) { return times() > 0 && n === times() * FORM.length - 1; }

  /* Lay out one bar of the performance as events. n < 0 is the count-in. */
  function layBar(n, t0) {
    var q = quaver();
    if (n < 0) {
      pending.push({ t: t0, fn: function (t) { drum.hit('click', t, 0.9); } });
      pending.push({ t: t0 + 3 * q, fn: function (t) { drum.hit('click', t, 0.55); } });
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
        (function (at, c, dir, v, s) {
          pending.push({ t: at, fn: function (t) { guitar.strum(VOICE[c], t, dir, v, 4); }, strum: s });
        })(t0 + x.s * q, chord, x.d, x.v, x.s);
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
      while (nextBar < now + 0.3 && barN < limit) {
        nextBar += layBar(barN, nextBar);
        barN++;
      }
    }
    pending.sort(function (a, b) { return a.t - b.t; });
    while (pending.length && pending[0].t < now + 0.12) {
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
      guitar.silence(now + (ended ? 0 : 0.05));
    }
    showState();
  }

  function toggle() { if (playing) stop(false); else start(); }

  /* ---------- drawing ---------- */
  function diagram(chord, big) {
    var sh = K.shapes[chord], w = big ? 132 : 96, h = big ? 160 : 118;
    var left = big ? 22 : 16, top = big ? 30 : 24, gapX = (w - 2 * left) / 5, gapY = big ? 24 : 17;
    var svg = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" role="img" aria-label="' +
              sh.name + ' chord shape">';
    for (var f = 0; f <= 4; f++) {
      var y = top + f * gapY;
      svg += '<line class="' + (f ? 'fret' : 'nut') + '" x1="' + left + '" x2="' + (w - left) + '" y1="' + y + '" y2="' + y +
             '" stroke-width="' + (f ? 1 : 3) + '"/>';
    }
    for (var s = 0; s < 6; s++) {
      var x = left + s * gapX;
      svg += '<line class="str" x1="' + x + '" x2="' + x + '" y1="' + top + '" y2="' + (top + 4 * gapY) + '" stroke-width="' +
             (1.6 - s * 0.15) + '"/>';
      var fr = sh.frets[s], my = top - 10;
      if (fr < 0) {
        svg += '<path class="x" d="M' + (x - 4) + ' ' + (my - 4) + 'l8 8M' + (x + 4) + ' ' + (my - 4) + 'l-8 8" stroke-width="1.5"/>';
      } else if (fr === 0) {
        svg += '<circle class="mark" cx="' + x + '" cy="' + my + '" r="4" stroke-width="1.5"/>';
      } else {
        var drone = s >= 4 && fr === 3 && chord !== 'D';
        svg += '<circle class="dot' + (drone ? ' drone' : '') + '" cx="' + x + '" cy="' + (top + (fr - 0.5) * gapY) +
               '" r="' + (big ? 7.5 : 5.5) + '"/>';
      }
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
    $('shapes').innerHTML = ['G', 'C', 'D', 'Em'].map(function (c) {
      return '<div class="diagram">' + diagram(c) + '</div>';
    }).join('');
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
    buildChart();
    drawStrum();
    nowChord('G', 'D');
    $('play').addEventListener('click', toggle);
    $('bpm').addEventListener('input', function () { setBpm(this.value); });
    $('bpm-num').addEventListener('change', function () { setBpm(this.value); });
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
    STRUMS: STRUMS, FORM: FORM, VOICE: VOICE,
    audio: function () { return { ctx: ctx, run: run, guitar: guitar, flute: fluteBus, drum: drum }; },
    playing: function () { return playing; }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
