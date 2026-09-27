/* tests.js — automated checks for the rules the app has settled on.
 *
 * Open tests/ in a browser (from serve.py or the live site) and press Run.
 * Each check names the rule it protects and why it matters, so a failure says
 * what broke. Most of these rules were broken at some point this far and only
 * noticed because somebody happened to measure; this page measures every time.
 *
 * Some checks pin a deliberate choice — how loud a ghost note is, which MIDI
 * note the drum uses. Change that choice on purpose and the check will fail:
 * update the number here as part of the same change.
 */
(function (TRAD) {
  'use strict';

  var SR = 44100;
  var tests = [];

  function check(group, name, why, fn) {
    tests.push({ group: group, name: name, why: why, fn: fn });
  }
  function expect(ok, detail) { if (!ok) throw new Error(detail); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /* Let the page redraw between checks. Not setTimeout: browsers slow timers
   * right down in a background tab, which made a 10-second run take minutes. */
  var channel = new MessageChannel(), waiting = [];
  channel.port1.onmessage = function () { var r = waiting.shift(); if (r) r(); };
  function yieldToPage() {
    return new Promise(function (r) { waiting.push(r); channel.port2.postMessage(0); });
  }
  function db(a, b) { return 20 * Math.log10(a / b); }
  function round(x, n) { var k = Math.pow(10, n || 1); return Math.round(x * k) / k; }

  function eachGrid(fn) {
    TRAD.tunes.forEach(function (t) {
      Object.keys(t.grids).forEach(function (bank) {
        t.grids[bank].forEach(function (g) { fn(t, bank, g); });
      });
    });
  }

  /* Patterns that appear only in one bank (a few appear in two). */
  function only(tune, bank) {
    return tune.grids[bank].filter(function (g) {
      return Object.keys(tune.grids).every(function (b) {
        return b === bank || tune.grids[b].indexOf(g) === -1;
      });
    });
  }

  /* ---------- a transport on a clock we move by hand ----------
   * Exact and fast: no real audio, no waiting. Every stroke it would play is
   * recorded with the time it was scheduled for. */
  function fakeRun(setup) {
    var ctx = { currentTime: 0, state: 'running',
                resume: function () { return Promise.resolve(); } };
    var hits = [], bars = [];
    var drum = { hit: function (voice, time, vel) {
      hits.push({ voice: voice, time: time, vel: vel });
    } };
    var tr = new TRAD.Transport(ctx, drum, null);
    tr.humanize = 0;
    tr.countInBars = 0;
    tr.onBar = function (g, bar, countIn) { bars.push({ grid: g, bar: bar, countIn: countIn }); };
    setup(tr);
    tr.start();
    clearInterval(tr._timer);
    tr._timer = null;
    return {
      tr: tr, ctx: ctx, hits: hits, bars: bars,
      advance: function (sec) {
        var end = ctx.currentTime + sec;
        while (ctx.currentTime < end - 1e-9) {
          ctx.currentTime = Math.min(end, ctx.currentTime + 0.01);
          tr._tick();
        }
      },
      jump: function (sec) { ctx.currentTime += sec; tr._tick(); },
      done: function () { tr.stop(); }
    };
  }

  /* Timing checks play a fixed pattern of their own, so that changing a
   * style's patterns on purpose never trips a check that is about timing. */
  function withGrid(grid, fn) {
    var real = TRAD.pickGrid;
    TRAD.pickGrid = function () { return grid; };
    try { return fn(); } finally { TRAD.pickGrid = real; }
  }

  /* ---------- offline audio ---------- */
  function render(seconds, channels, fn) {
    var oc = new OfflineAudioContext(channels, Math.ceil(SR * seconds), SR);
    fn(oc);
    return oc.startRendering();
  }
  function soloHit(voice, vel) {
    return render(1.0, 1, function (oc) {
      var b = new TRAD.Bodhran(oc, oc.destination);
      b.setRoom(0);
      b.hit(voice, 0.02, vel);
    }).then(function (buf) { return buf.getChannelData(0); });
  }
  function peak(d) { var p = 0; for (var i = 0; i < d.length; i++) p = Math.max(p, Math.abs(d[i])); return p; }
  function goertzel(d, f, t0, t1) {
    var s = Math.floor(t0 * SR), e = Math.floor(t1 * SR), k = 2 * Math.cos(2 * Math.PI * f / SR);
    var q1 = 0, q2 = 0;
    for (var i = s; i < e; i++) { var q0 = k * q1 - q2 + d[i]; q2 = q1; q1 = q0; }
    return Math.sqrt(Math.max(0, q1 * q1 + q2 * q2 - k * q1 * q2));
  }
  function pitchOf(d) {
    var best = 0, bf = 0;
    for (var f = 40; f <= 500; f += 2) { var m = goertzel(d, f, 0.045, 0.14); if (m > best) { best = m; bf = f; } }
    return bf;
  }
  function rms(d, a, z) {
    var s = 0, n = 0;
    for (var i = Math.floor(a * SR); i < Math.floor(z * SR); i++) { s += d[i] * d[i]; n++; }
    return Math.sqrt(s / n);
  }

  /* ---------- the real app, in a hidden frame ----------
   * Each check gets a fresh copy of the app. Settings are saved first and put
   * back afterwards, so running the checks never changes your own tempos. */
  function withApp(fn, size, first) {
    size = size || { w: 800, h: 900 };
    var saved = localStorage.getItem('bodhran.settings');
    localStorage.removeItem('bodhran.settings');
    var frame = document.createElement('iframe');
    frame.style.cssText = 'position:absolute;left:-10000px;top:0;border:0;width:' +
                          size.w + 'px;height:' + size.h + 'px';
    // `first` is a script run in the app's page before any of the app's own —
    // how a check pretends to be a browser without something, such as Safari
    // without Web MIDI. It needs the page's text rather than its address.
    var page = first
      ? text('../index.html').then(function (html) {
          frame.srcdoc = html.replace('<head>', '<head><base href="' +
            new URL('../', location.href).href + '"><script>' + first + '<\/script>');
        })
      : Promise.resolve().then(function () { frame.src = '../index.html'; });
    document.body.appendChild(frame);
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () { reject(new Error('the app did not load')); }, 10000);
      frame.onload = function () { clearTimeout(t); setTimeout(resolve, 300); };
      page.catch(reject);
    }).then(function () {
      return fn(frame.contentWindow, frame.contentDocument);
    }).finally(function () {
      try {
        var p = frame.contentDocument.getElementById('play');
        if (p.classList.contains('playing')) p.click();
      } catch (e) { /* frame already gone */ }
      frame.remove();
      if (saved == null) localStorage.removeItem('bodhran.settings');
      else localStorage.setItem('bodhran.settings', saved);
    });
  }
  function key(win, target, code, k) {
    target.dispatchEvent(new win.KeyboardEvent('keydown', { code: code, key: k, bubbles: true }));
  }
  function isPlaying(doc) { return doc.getElementById('play').classList.contains('playing'); }

  /* ================================================================
   * Patterns
   * ================================================================ */

  check('Patterns', 'Every pattern fits its meter',
    'A pattern that does not divide evenly into beats would play out of time.',
    function () {
      var problems = TRAD.validatePatterns();
      expect(problems.length === 0, problems.join('\n'));
    });

  check('Patterns', 'No tak on a main beat',
    'The tak on beats 2 and 4 is a rock backbeat. On a bodhrán the up stroke falls between the beats.',
    function () {
      var bad = [];
      eachGrid(function (t, bank, g) {
        var spb = g.length / t.beatsPerBar;
        for (var i = 0; i < g.length; i += spb) {
          if (g[i] === 'T' || g[i] === 't') { bad.push(t.id + ' ' + bank + ' ' + g + ' (beat ' + (1 + i / spb) + ')'); break; }
        }
      });
      expect(bad.length === 0, bad.join('\n'));
    });

  check('Patterns', 'Pulse is the low drum only, one hit per beat',
    'Pulse is meant as a plain reference: no tak, nothing but down strokes on the beats.',
    function () {
      var bad = [];
      TRAD.tunes.forEach(function (t) {
        var g = t.grids.pulse[0];
        if (g.length !== t.beatsPerBar || !/^[Dd]+$/.test(g) || g.indexOf('D') === -1) bad.push(t.id + ': ' + g);
      });
      expect(bad.length === 0, bad.join('\n'));
    });

  check('Patterns', 'Each style has one simple and one pulse pattern',
    'Simple and Pulse modes play exactly one fixed figure per style.',
    function () {
      var bad = TRAD.tunes.filter(function (t) {
        return !t.grids.simple || t.grids.simple.length !== 1 || !t.grids.pulse || t.grids.pulse.length !== 1;
      }).map(function (t) { return t.id; });
      expect(bad.length === 0, 'wrong count in: ' + bad.join(', '));
    });

  check('Patterns', 'Every style goes down to 60 bpm',
    'Slow practice should be possible in every style, and each default tempo should sit inside its range.',
    function () {
      var bad = TRAD.tunes.filter(function (t) {
        return t.bpmRange[0] !== 60 || t.defaultBpm < t.bpmRange[0] || t.defaultBpm > t.bpmRange[1];
      }).map(function (t) { return t.id + ' ' + t.bpmRange.join('-') + ' default ' + t.defaultBpm; });
      expect(bad.length === 0, bad.join('\n'));
    });

  check('Patterns', 'Accents fall on the quavers',
    'A hard stroke halfway between two quavers puts a duple feel into jig time. The slide’s only fill used to do that: a whole bar squashed into two beats.',
    function () {
      var bad = [];
      eachGrid(function (t, bank, g) {
        var perBeat = t.beatUnit === 'dotted crotchet' ? 3 : 2;   // quavers in a beat
        var spb = g.length / t.beatsPerBar;
        if (spb % perBeat) return;                                // triplet grids have their own check
        for (var i = 0; i < g.length; i++) {
          if ((g[i] === 'D' || g[i] === 'T') && i % (spb / perBeat)) {
            bad.push(t.id + ' ' + bank + ' ' + g + ' (slot ' + (i + 1) + ')'); break;
          }
        }
      });
      expect(bad.length === 0, bad.join('\n'));
    });

  check('Patterns', 'Every style has more than one fill',
    'With a single fill, every phrase in that style ended the same way. The slide and barndance did.',
    function () {
      var bad = TRAD.tunes.filter(function (t) { return only(t, 'fills').length < 2; })
                          .map(function (t) { return t.id + ': ' + only(t, 'fills').length; });
      expect(bad.length === 0, bad.join(', '));
    });

  check('Patterns', 'Reel triplet fills are well formed',
    'Each beat of a triplet fill must be either two quavers (D--t--) or a triplet (D-t-d-).',
    function () {
      var fills = TRAD.tuneById('reel').grids.fills.filter(function (g) { return g.length === 24; });
      expect(fills.length > 0, 'no triplet fills found');
      var bad = [];
      fills.forEach(function (g) {
        for (var b = 0; b < 4; b++) {
          var cell = g.slice(b * 6, b * 6 + 6);
          if (!/^[Dd]--[tT]--$/.test(cell) && !/^[Dd]-[tT]-[Dd]-$/.test(cell)) bad.push(g + ' beat ' + (b + 1) + ': ' + cell);
        }
      });
      expect(bad.length === 0, bad.join('\n'));
    });

  /* ================================================================
   * Choosing patterns
   * ================================================================ */

  check('Choosing patterns', 'Fills only on the last bar of a phrase',
    'A fill carried into bar 1 of the next phrase is where the drum should settle. A third of phrases used to open that way.',
    function () {
      var bad = [];
      TRAD.tunes.forEach(function (t) {
        var fillOnly = only(t, 'fills');
        [0.2, 0.5, 1.0].forEach(function (c) {
          var last = null, stray = 0;
          for (var bar = 0; bar < 8000; bar++) {
            var end = bar % 4 === 3;
            var g = TRAD.pickGrid(t, c, end, last, Math.random);
            last = g;
            if (!end && fillOnly.indexOf(g) !== -1) stray++;
          }
          if (stray) bad.push(t.id + ' busyness ' + c + ': ' + stray + ' fills away from the phrase end');
        });
      });
      expect(bad.length === 0, bad.join('\n'));
    });

  check('Choosing patterns', 'Fills do come at phrase ends',
    'Makes sure the rule above is not passing only because fills stopped being chosen at all.',
    function () {
      var bad = [];
      TRAD.tunes.forEach(function (t) {
        var n = 0, fills = 0, last = null;
        for (var i = 0; i < 4000; i++) {
          var g = TRAD.pickGrid(t, 0.5, true, last, Math.random);
          last = g; n++;
          if (t.grids.fills.indexOf(g) !== -1) fills++;
        }
        if (fills / n < 0.3) bad.push(t.id + ': fills on ' + round(100 * fills / n) + '% of phrase ends');
      });
      expect(bad.length === 0, bad.join('\n'));
    });

  check('Choosing patterns', 'Busyness does what it says',
    'At no busyness the drum never plays its busiest patterns; at full it never plays its sparsest.',
    function () {
      var bad = [];
      TRAD.tunes.forEach(function (t) {
        var busy = only(t, 'busy'), sparse = only(t, 'sparse');
        for (var i = 0; i < 3000; i++) {
          if (busy.indexOf(TRAD.pickGrid(t, 0, false, null, Math.random)) !== -1) { bad.push(t.id + ': busy pattern at busyness 0'); break; }
        }
        for (var j = 0; j < 3000; j++) {
          if (sparse.indexOf(TRAD.pickGrid(t, 1, false, null, Math.random)) !== -1) { bad.push(t.id + ': sparse pattern at full busyness'); break; }
        }
      });
      expect(bad.length === 0, bad.join('\n'));
    });

  /* ================================================================
   * Swing
   * ================================================================ */

  check('Swing', 'Swing moves only the offbeats',
    'No swing means no movement; the beat itself never moves; full swing puts the offbeat exactly on the triplet.',
    function () {
      for (var f = 0; f < 1; f += 0.125) expect(TRAD.swingShift(f, 0) === 0, 'moved with no swing at ' + f);
      for (var s = 0; s <= 1; s += 0.1) expect(TRAD.swingShift(0, s) === 0, 'beat moved at swing ' + s);
      var full = 0.5 + TRAD.swingShift(0.5, 1);
      expect(Math.abs(full - 2 / 3) < 1e-9, 'full swing puts the offbeat at ' + full + ', not 2/3');
    });

  check('Swing', 'Swing keeps a triplet in order',
    'If swing is ever applied to a triplet, its three strokes must stay in order inside their beat.',
    function () {
      for (var s = 0; s <= 1.0001; s += 0.1) {
        var p = [0, 1 / 3, 2 / 3].map(function (f) { return f + TRAD.swingShift(f, s); });
        expect(p[0] < p[1] && p[1] < p[2] && p[2] < 1, 'out of order at swing ' + round(s) + ': ' + p.map(function (x) { return round(x, 3); }).join(', '));
      }
    });

  /* ================================================================
   * Timing
   * ================================================================ */

  check('Timing', 'Quavers land on exact half beats',
    'The scheduler works from the audio clock; any drift here would be heard within a few bars.',
    function () {
      var run = withGrid('DtdtDtdt', function () {
        var r = fakeRun(function (tr) { tr.tune = TRAD.tuneById('reel'); tr.mode = 'full'; tr.bpm = 112; });
        r.advance(6); r.done(); return r;
      });
      var half = 60 / 112 / 2, t0 = run.hits[0].time, worst = 0;
      run.hits.forEach(function (h) {
        var n = (h.time - t0) / half;
        worst = Math.max(worst, Math.abs(n - Math.round(n)) * half);
      });
      expect(run.hits.length >= 20, 'only ' + run.hits.length + ' strokes played');
      expect(worst < 1e-6, 'worst stroke off the grid by ' + round(worst * 1000, 3) + ' ms');
    });

  check('Timing', 'Triplets land on exact thirds of a beat',
    'A triplet is three strokes in the time of one beat; uneven ones sound like a stumble.',
    function () {
      var run = withGrid('D--t--d-t-d-D--t--d-t-d-', function () {
        var r = fakeRun(function (tr) { tr.tune = TRAD.tuneById('reel'); tr.mode = 'full'; tr.bpm = 112; });
        r.advance(2.5); r.done(); return r;
      });
      var beat = 60 / 112, t0 = run.hits[0].time;
      var got = run.hits.slice(0, 10).map(function (h) { return round((h.time - t0) / beat, 4); });
      var want = [0, 0.5, 1, 1.3333, 1.6667, 2, 2.5, 3, 3.3333, 3.6667];
      expect(JSON.stringify(got) === JSON.stringify(want), 'strokes at beats ' + got.join(', '));
    });

  check('Timing', 'Tempo changes land on the next bar',
    'Changing tempo mid-bar should finish the bar at the old tempo, as a musician would.',
    function () {
      var run = withGrid('DtdtDtdt', function () {
        var r = fakeRun(function (tr) { tr.tune = TRAD.tuneById('reel'); tr.mode = 'full'; tr.bpm = 100; });
        r.advance(1.0);                 // part-way through bar 1
        r.tr.bpm = 150;
        r.advance(4); r.done(); return r;
      });
      var gaps = run.hits.slice(1, 16).map(function (h, i) { return h.time - run.hits[i].time; });
      var oldHalf = 60 / 100 / 2, newHalf = 60 / 150 / 2;
      var bar1 = gaps.slice(0, 8), bar2 = gaps.slice(8, 15);
      expect(bar1.every(function (g) { return Math.abs(g - oldHalf) < 1e-6; }), 'bar 1 did not keep the old tempo');
      expect(bar2.every(function (g) { return Math.abs(g - newHalf) < 1e-6; }), 'bar 2 is not at the new tempo');
    });

  check('Timing', 'Tune changes land on the next bar',
    'Switching tune part-way through a bar played the rest of it with the new tune’s swing, and could repeat the old tune’s pattern under the new one.',
    function () {
      // A swung hornpipe, switched to a straight reel half-way through bar 1.
      var run = fakeRun(function (tr) { tr.tune = TRAD.tuneById('hornpipe'); tr.mode = 'simple'; tr.bpm = 100; });
      var bar = (60 / 100) * 4, beat = bar / 4, t0 = run.hits[0].time;
      run.advance(bar / 2);
      run.tr.setTune(TRAD.tuneById('reel'));
      run.advance(bar * 1.5); run.done();
      var swungAt = 0.5 + TRAD.swingShift(0.5, TRAD.tuneById('hornpipe').swing);
      function offbeats(from, to) {
        return run.hits.filter(function (h) { return h.time >= t0 + from - 1e-6 && h.time < t0 + to - 1e-6; })
          .map(function (h) { var x = (h.time - t0) / beat; return round(x - Math.floor(x + 1e-6), 3); })
          .filter(function (f) { return f > 0.01; });
      }
      var bar1 = offbeats(bar / 2, bar), bar2 = offbeats(bar, bar * 2);
      expect(bar1.length && bar1.every(function (f) { return Math.abs(f - swungAt) < 0.002; }),
             'the rest of bar 1 lost the hornpipe swing: offbeats at ' + bar1.join(', '));
      expect(bar2.length && bar2.every(function (f) { return Math.abs(f - 0.5) < 0.002; }),
             'bar 2 is not a straight reel: offbeats at ' + bar2.join(', '));

      // In Full mode, no bar after the switch may be one of the old tune's.
      var jig = TRAD.tuneById('jig'), jigGrids = [];
      Object.keys(jig.grids).forEach(function (b) { jigGrids = jigGrids.concat(jig.grids[b]); });
      var strays = 0;
      for (var n = 0; n < 30; n++) {
        var r = fakeRun(function (tr) { tr.tune = TRAD.tuneById('reel'); tr.mode = 'full'; tr.bpm = 120; });
        r.advance(3);                                // into bar 2 of the reel
        var before = r.bars.length;
        r.tr.setTune(jig);
        r.advance(4); r.done();
        r.bars.slice(before).forEach(function (b) { if (jigGrids.indexOf(b.grid) === -1) strays++; });
      }
      expect(strays === 0, strays + ' bars after the switch played a reel pattern under the jig');
    });

  check('Timing', 'Phrases count from the first bar the drum plays',
    'The tune starts when the drum comes in. Count-in bars used to count as bars of the first phrase, which put every fill a bar early (bars 3 and 7).',
    function () {
      var real = TRAD.pickGrid, bad = [];
      try {
        [0, 1, 2].forEach(function (countIn) {
          var ends = [];
          TRAD.pickGrid = function (t, c, phraseEnd) { ends.push(phraseEnd); return 'DtdtDtdt'; };
          var r = fakeRun(function (tr) {
            tr.tune = TRAD.tuneById('reel'); tr.mode = 'full'; tr.bpm = 120; tr.countInBars = countIn; tr.phraseLength = 4;
          });
          r.advance(2 * (countIn + 8) + 0.5); r.done();
          var at = [];
          ends.slice(0, 8).forEach(function (e, i) { if (e) at.push(i + 1); });
          if (at.join() !== '4,8') bad.push(countIn + '-bar count-in: fills on drum bars ' + at.join(', '));
        });
      } finally { TRAD.pickGrid = real; }
      expect(bad.length === 0, bad.join('\n'));
    });

  /* A reel at 120 bpm: 2 s a bar. With a one-bar count-in from 0.08 s, the
   * drum's bar k (from 0) starts at 0.08 + 2 (k + 1). */
  function finishRun(phrase, pressAt, extra) {
    var ended = 0;
    var r = fakeRun(function (tr) {
      tr.tune = TRAD.tuneById('reel'); tr.mode = 'simple'; tr.bpm = 120;
      tr.countInBars = 1; tr.phraseLength = phrase;
      tr.onEnd = function () { ended++; };
    });
    r.advance(pressAt);
    r.tr.finish();
    if (extra) extra(r);
    r.advance(30);
    var last = r.hits[r.hits.length - 1];
    return { run: r, last: last, ended: ended, barOf: function (t) { return Math.round((t - 0.08) / 2 - 1); } };
  }

  check('Finish', 'The last stroke lands on beat 1 of the phrase’s last bar',
    'A tune’s final note comes at the start of its last bar, so the drum hits it with you and lets it ring, then stops.',
    function () {
      var f = finishRun(4, 0.08 + 2 * 2 + 1);           // pressed half-way through bar 2 of 4
      expect(Math.abs(f.last.time - (0.08 + 2 * 4)) < 1e-6,
             'last stroke at ' + round(f.last.time, 3) + ' s, in drum bar ' + (f.barOf(f.last.time) + 1) + ' (expected the start of bar 4)');
      expect(f.last.voice === 'bass' && f.last.vel === 1, 'the last stroke is a ' + f.last.voice + ' at ' + f.last.vel + ', not a full down stroke');
      expect(!f.run.tr.running, 'the drum did not stop after the last stroke');
      expect(f.ended === 1, 'the app was told it ended ' + f.ended + ' times');
      var beforeLast = f.run.hits[f.run.hits.length - 2];
      expect(beforeLast.time < 0.08 + 2 * 4 - 0.2, 'bar 3 did not play through to the ending');
    });

  check('Finish', 'Pressed in the last bar, it waits for the next phrase',
    'Once the last bar has begun, its first beat has gone. The end then comes at the next phrase’s last bar, which the counter shows.',
    function () {
      var f = finishRun(4, 0.08 + 2 * 4 + 0.5);         // part-way into bar 4 of 4
      expect(Math.abs(f.last.time - (0.08 + 2 * 8)) < 1e-6,
             'last stroke in drum bar ' + (f.barOf(f.last.time) + 1) + ' (expected bar 8)');
      var g = finishRun(0, 0.08 + 2 * 2 + 0.5);         // Fills every: never
      expect(Math.abs(g.last.time - (0.08 + 2 * 3)) < 1e-6,
             'with no phrases, last stroke in drum bar ' + (g.barOf(g.last.time) + 1) + ' (expected the next bar, 3)');
    });

  check('Finish', 'It can be taken back, and a stall cannot lose it',
    'Pressing Finish again means go round again. And a page that freezes through the last stroke must still stop, not play on.',
    function () {
      var kept = finishRun(4, 0.08 + 2 * 2 + 1, function (r) { r.tr.keepGoing(); });
      expect(kept.run.tr.running, 'the drum stopped even though Finish was taken back');
      kept.run.done();
      var stalled = finishRun(4, 0.08 + 2 * 3 + 1.4, function (r) { r.jump(1.5); });   // frozen through the last stroke
      expect(!stalled.run.tr.running, 'after a freeze through the ending the drum played on');
      var late = stalled.run.hits.filter(function (h) { return h.time > 0.08 + 2 * 4 - 1e-6; });
      expect(late.length <= 1, late.length + ' strokes after the ending');
    });

  check('Timing', 'A stall never stacks strokes on one instant',
    'If the page freezes, missed strokes must be skipped. Firing them all at once was a loud crash (a 3 s freeze stacked 10).',
    function () {
      var before;
      var run = withGrid('DtdtDtdt', function () {
        var r = fakeRun(function (tr) { tr.tune = TRAD.tuneById('reel'); tr.mode = 'full'; tr.bpm = 112; });
        r.advance(1);
        before = r.hits.length;
        r.jump(3);                       // the page freezes for 3 seconds
        r.advance(2); r.done(); return r;
      });
      var times = {}, most = 0;
      run.hits.forEach(function (h) { var k = h.time.toFixed(4); times[k] = (times[k] || 0) + 1; most = Math.max(most, times[k]); });
      expect(most === 1, most + ' strokes stacked on one instant');
      expect(run.hits.length > before + 2, 'the drum did not carry on after the freeze');
      var half = 60 / 112 / 2, t0 = run.hits[0].time;
      var off = run.hits.slice(before).some(function (h) {
        var n = (h.time - t0) / half; return Math.abs(n - Math.round(n)) * half > 1e-6;
      });
      expect(!off, 'after the freeze the drum came back out of time');
    });

  check('Timing', 'Pulse: one identical stroke per beat',
    'Pulse is a dead-straight reference, so humanising must not touch it even when it is turned up.',
    function () {
      var run = fakeRun(function (tr) {
        tr.tune = TRAD.tuneById('reel'); tr.mode = 'pulse'; tr.bpm = 112; tr.humanize = 0.8;
      });
      run.advance(6); run.done();
      var beat = 60 / 112;
      var gaps = run.hits.slice(1).map(function (h, i) { return h.time - run.hits[i].time; });
      expect(run.hits.every(function (h) { return h.voice === 'bass'; }), 'a stroke other than the low drum');
      expect(gaps.every(function (g) { return Math.abs(g - beat) < 1e-9; }), 'strokes not exactly one beat apart');
      var vel = run.hits.slice(0, 8).map(function (h) { return h.vel; });
      expect(JSON.stringify(vel) === JSON.stringify([1, 0.58, 1, 0.58, 1, 0.58, 1, 0.58]),
             'reel pulse weights are ' + vel.join(', ') + ' (expected strong on 1 and 3)');
    });

  check('Timing', 'Simple: the same bar every bar',
    'Simple mode is for learning a tune: the drum must not wander.',
    function () {
      var run = fakeRun(function (tr) { tr.tune = TRAD.tuneById('jig'); tr.mode = 'simple'; tr.bpm = 120; });
      run.advance(14); run.done();
      var grids = run.bars.map(function (b) { return b.grid; });
      var distinct = grids.filter(function (g, i) { return grids.indexOf(g) === i; });
      expect(grids.length >= 10, 'only ' + grids.length + ' bars played');
      expect(distinct.length === 1 && distinct[0] === TRAD.tuneById('jig').grids.simple[0],
             'played: ' + distinct.join(', '));
    });

  check('Timing', 'Count-in: one bar of clicks, then the drum',
    'A one-bar count-in gives the player the tempo before the drum starts.',
    function () {
      var run = fakeRun(function (tr) {
        tr.tune = TRAD.tuneById('reel'); tr.mode = 'simple'; tr.bpm = 112; tr.countInBars = 1;
      });
      run.advance(4); run.done();
      var first = run.hits.slice(0, 5).map(function (h) { return h.voice; });
      expect(first.slice(0, 4).every(function (v) { return v === 'click'; }) && first[4] !== 'click',
             'first strokes were ' + first.join(', '));
    });

  /* ================================================================
   * Sound
   * ================================================================ */

  check('Sound', 'The up stroke is the same skin',
    'Down and up strokes land on one goatskin. The tak used to be a separate drum 1.66 octaves higher, which sounded like a kick and snare.',
    function () {
      return Promise.all([soloHit('bass', TRAD.VELOCITY.D), soloHit('treble', TRAD.VELOCITY.t)]).then(function (r) {
        var down = pitchOf(r[0]), up = pitchOf(r[1]);
        expect(up / down > 0.9 && up / down < 1.1, 'down ' + down + ' Hz, up ' + up + ' Hz');
      });
    });

  check('Sound', 'Ghost notes are the same skin',
    'A ghost is the tipper barely touching the skin, not a separate hiss.',
    function () {
      return Promise.all([soloHit('bass', TRAD.VELOCITY.D), soloHit('ghost', TRAD.VELOCITY.g)]).then(function (r) {
        var down = pitchOf(r[0]), ghost = pitchOf(r[1]);
        expect(ghost / down > 0.9 && ghost / down < 1.1, 'down ' + down + ' Hz, ghost ' + ghost + ' Hz');
      });
    });

  check('Sound', 'Stroke levels stay where they were set',
    'Tak about 12 dB and ghost about 22 dB under an accented dum. Change these on purpose? Update the numbers here too.',
    function () {
      return Promise.all([soloHit('bass', TRAD.VELOCITY.D), soloHit('treble', TRAD.VELOCITY.t),
                          soloHit('ghost', TRAD.VELOCITY.g)]).then(function (r) {
        var tak = db(peak(r[1]), peak(r[0])), ghost = db(peak(r[2]), peak(r[0]));
        expect(tak > -15 && tak < -9, 'tak is ' + round(tak) + ' dB (expected about -12)');
        expect(ghost > -25.5 && ghost < -18.5, 'ghost is ' + round(ghost) + ' dB (expected about -22)');
      });
    });

  check('Sound', 'No clipping, even with volume and room turned right up',
    'Every pattern in every style, through the real output limiter, at maximum volume and room.',
    function () {
      var worst = [], chain = Promise.resolve();
      TRAD.tunes.forEach(function (t) {
        chain = chain.then(function () {
          var bar = (60 / t.defaultBpm) * t.beatsPerBar;
          var all = Object.keys(t.grids).reduce(function (a, b) { return a.concat(t.grids[b]); }, []);
          return render(bar * all.length + 1.5, 2, function (oc) {
            var b = new TRAD.Bodhran(oc, TRAD.makeOutput(oc));
            b.setLevel(1.4); b.setRoom(0.6);
            all.forEach(function (g, n) {
              var spb = g.length / t.beatsPerBar, beat = bar / t.beatsPerBar;
              for (var i = 0; i < g.length; i++) {
                var c = g[i]; if (c === '-') continue;
                var at = 0.05 + n * bar + (i / g.length) * bar + TRAD.swingShift((i % spb) / spb, t.swing) * beat;
                b.hit(TRAD.VOICE[c], at, TRAD.VELOCITY[c] * 1.18);   // 1.18: humanising's loudest
              }
            });
          }).then(function (buf) {
            var clipped = 0;
            for (var ch = 0; ch < 2; ch++) {
              var d = buf.getChannelData(ch);
              for (var i = 0; i < d.length; i++) if (Math.abs(d[i]) >= 0.999) clipped++;
            }
            if (clipped) worst.push(t.id + ': ' + clipped + ' clipped samples');
          });
        });
      });
      return chain.then(function () { expect(worst.length === 0, worst.join('\n')); });
    });

  check('Sound', 'Every tak is heard arriving, even at the fastest tempos',
    'The tak now shares the dum’s register, so it must not get buried under the dum still ringing.',
    function () {
      function rises(id, grid, bpm) {
        var t = TRAD.tuneById(id), bar = (60 / bpm) * t.beatsPerBar, ups = [];
        return render(bar * 2 + 1, 1, function (oc) {
          var b = new TRAD.Bodhran(oc, oc.destination); b.setRoom(0.16);
          for (var n = 0; n < 2; n++) for (var i = 0; i < grid.length; i++) {
            var c = grid[i]; if (c === '-') continue;
            var at = 0.05 + n * bar + (i / grid.length) * bar;
            b.hit(TRAD.VOICE[c], at, TRAD.VELOCITY[c]);
            if (c === 't' || c === 'T') ups.push(at);
          }
        }).then(function (buf) {
          var d = buf.getChannelData(0);
          return Math.min.apply(null, ups.map(function (u) { return db(rms(d, u, u + 0.015), rms(d, u - 0.010, u)); }));
        });
      }
      return Promise.all([rises('reel', 'DtdtDtdt', 160), rises('polka', 'Dtdt', 190)]).then(function (r) {
        expect(r[0] > 5, 'reel at 160: weakest tak rises only ' + round(r[0]) + ' dB');
        expect(r[1] > 5, 'polka at 190: weakest tak rises only ' + round(r[1]) + ' dB');
      });
    });

  check('Sound', 'Nothing sounds after Stop',
    'Strokes are queued a tenth of a second ahead, so one used to sound after Stop. A stroke already ringing is left to ring.',
    function () {
      // The transport tells the drum to drop what it has queued...
      var dropped = null;
      var run = fakeRun(function (tr) { tr.tune = TRAD.tuneById('reel'); tr.mode = 'simple'; tr.bpm = 112; });
      run.tr.bodhran.cancelFrom = function (t) { dropped = t; };
      run.advance(1.03);
      run.done();
      expect(dropped !== null && Math.abs(dropped - run.ctx.currentTime) < 1e-9,
             'Stop did not ask the drum to drop its queued strokes');
      // ...and the drum really does go quiet, while the stroke under way rings on.
      var oc = new OfflineAudioContext(1, SR * 2, SR);
      var b = new TRAD.Bodhran(oc, oc.destination);
      b.setRoom(0);
      // One stroke sounding, three queued for after its ring has died away.
      b.hit('bass', 0.10, 1); b.hit('treble', 0.90, 1); b.hit('bass', 1.10, 1); b.hit('click', 1.30, 1);
      oc.suspend(0.2).then(function () { b.cancelFrom(oc.currentTime); oc.resume(); });
      return oc.startRendering().then(function (buf) {
        var d = buf.getChannelData(0);
        var ringing = rms(d, 0.10, 0.2), after = peak(d.subarray(Math.floor(0.85 * SR)));
        expect(ringing > 0.01, 'the stroke already sounding was cut off');
        expect(after < 1e-4, 'a queued stroke still sounded after Stop (peak ' + round(db(after, 1)) + ' dBFS)');
      });
    });

  check('Sound', 'Changing the drone’s root leaves no old drone behind',
    'The old drone used to keep sounding under the new one for 1.5 s, then click off.',
    function () {
      var oc = new OfflineAudioContext(1, SR * 4, SR);
      var dr = new TRAD.Drone(oc, oc.destination);
      dr.setLevel(0.3);
      dr.start(50);                                             // D
      oc.suspend(2.0).then(function () { dr.start(43); oc.resume(); });   // to G
      return oc.startRendering().then(function (buf) {
        var d = buf.getChannelData(0), A3 = TRAD.midiToHz(57);  // in a D drone, not in a G one
        var left = db(goertzel(d, A3, 2.5, 3.0), goertzel(d, A3, 1.0, 1.5));
        expect(left < -20, 'old drone still at ' + round(left) + ' dB half a second after the change');
      });
    });

  /* ================================================================
   * MIDI
   * ================================================================ */

  function midiNotes() {
    var m = new TRAD.MidiOut(), sent = [];
    m.port = { send: function (d) { sent.push(d); } };
    m.enabled = true;
    var ctx = { currentTime: 0, getOutputTimestamp: function () { return { contextTime: 0, performanceTime: 0 }; } };
    var out = {};
    ['D', 'T', 'd', 't', 'g'].forEach(function (c) {
      sent.length = 0;
      m.send(ctx, TRAD.VOICE[c], 0.1, TRAD.VELOCITY[c]);
      out[c] = { note: sent[0][1], velocity: sent[0][2], off: sent[1] && sent[1][2] === 0 };
    });
    return out;
  }

  check('MIDI', 'Every stroke goes to one drum',
    'All strokes land on one skin, so in GarageBand they should all play one drum (note 41, a low floor tom, unless changed).',
    function () {
      var n = midiNotes();
      var notes = Object.keys(n).map(function (c) { return n[c].note; });
      expect(notes.every(function (x) { return x === 41; }), 'notes sent: ' + notes.join(', '));
      expect(Object.keys(n).every(function (c) { return n[c].off; }), 'a note was left hanging with no note-off');
    });

  check('MIDI', 'Harder strokes send higher velocity',
    'With one drum, velocity is the only thing telling the strokes apart.',
    function () {
      var n = midiNotes();
      var v = ['D', 'T', 'd', 't', 'g'].map(function (c) { return n[c].velocity; });
      expect(v[0] > v[1] && v[1] > v[2] && v[2] > v[3] && v[3] > v[4], 'velocities D,T,d,t,g: ' + v.join(', '));
    });

  /* ================================================================
   * The app
   * ================================================================ */

  check('The app', 'The version shows in the header and the About',
    'The quickest way to tell whether a phone has the latest copy.',
    function () {
      return withApp(function (win, doc) {
        var v = win.TRAD.VERSION;
        expect(!!v, 'no version defined');
        expect(doc.getElementById('version').textContent === 'v' + v, 'header shows "' + doc.getElementById('version').textContent + '"');
        expect(doc.getElementById('about-version').textContent === 'Version ' + v, 'About shows "' + doc.getElementById('about-version').textContent + '"');
      });
    });

  check('The app', 'Each tune type keeps its own tempo',
    'Switching tune type used to throw away the tempo you had set.',
    function () {
      return withApp(function (win, doc) {
        function chip(id) { doc.querySelector('.chip[data-id="' + id + '"]').click(); }
        function bpm() { return +doc.getElementById('bpm-num').value; }
        function set(v) { var s = doc.getElementById('bpm'); s.value = v; s.dispatchEvent(new win.Event('input')); }
        chip('jig');  var jigFirst = bpm(); set(90);
        chip('reel'); set(100);
        chip('jig');  var jigBack = bpm();
        chip('reel'); var reelBack = bpm();
        expect(jigFirst === TRAD.tuneById('jig').defaultBpm, 'first visit to jig gave ' + jigFirst + ', not the default');
        expect(jigBack === 90, 'jig came back at ' + jigBack + ' instead of 90');
        expect(reelBack === 100, 'reel came back at ' + reelBack + ' instead of 100');
      });
    });

  check('The app', 'Space works after touching a slider',
    'Set the tempo, press Space: it used to do nothing until you clicked elsewhere. Checkboxes keep Space for themselves.',
    function () {
      return withApp(function (win, doc) {
        var slider = doc.getElementById('bpm');
        slider.focus();
        key(win, slider, 'Space', ' ');
        var started = isPlaying(doc);
        key(win, slider, 'Space', ' ');
        var stopped = !isPlaying(doc);
        var box = doc.getElementById('drone-on');
        box.focus();
        key(win, box, 'Space', ' ');
        var boxLeftAlone = !isPlaying(doc);
        expect(started, 'Space on the tempo slider did not start the drum');
        expect(stopped, 'Space on the tempo slider did not stop it again');
        expect(boxLeftAlone, 'Space on a checkbox started the drum');
      });
    });

  check('The app', 'Modes grey out only what they override',
    'A control on screen that silently does nothing is confusing.',
    function () {
      return withApp(function (win, doc) {
        function mode(m) { doc.querySelector('.mode[data-mode="' + m + '"]').click(); }
        function off() {
          return ['complexity', 'phrase', 'swing', 'humanize'].filter(function (id) { return doc.getElementById(id).disabled; }).join(',');
        }
        mode('full');   var full = off();
        mode('simple'); var simple = off();
        mode('pulse');  var pulse = off();
        expect(full === '', 'Full greys out: ' + full);
        expect(simple === 'complexity,phrase', 'Simple greys out: ' + simple);
        expect(pulse === 'complexity,phrase,swing,humanize', 'Pulse greys out: ' + pulse);
      });
    });

  check('The app', 'The About names the panels as they are',
    'After the phone layout moved Full, Simple and Pulse into their own Rhythm panel, the About still sent people to Feel.',
    function () {
      return withApp(function (win, doc) {
        function heading(el) { return el.closest('.panel').querySelector('h2').firstChild.textContent.trim(); }
        var panels = Array.prototype.map.call(doc.querySelectorAll('.panel h2'), function (h) {
          return h.firstChild.textContent.trim().toLowerCase();
        });
        var about = doc.querySelector('.about-body').innerHTML, named = [], m;
        var re = /<b>([^<]+)<\/b> panel/g;
        while ((m = re.exec(about))) named.push(m[1]);
        var missing = named.filter(function (n) { return panels.indexOf(n.toLowerCase()) === -1; });
        expect(named.length > 0, 'the About names no panels at all');
        expect(missing.length === 0, 'the About names panels that do not exist: ' + missing.join(', '));
        var rhythms = about.match(/Three rhythms<\/h3>\s*<p>The <b>([^<]+)<\/b> panel/);
        var where = heading(doc.getElementById('modes'));
        expect(rhythms && rhythms[1].toLowerCase() === where.toLowerCase(),
               'the About says the rhythms are in ' + (rhythms ? rhythms[1] : '?') + '; they are in ' + where);
      });
    });

  check('The app', 'Finish ends the tune and puts Play back',
    'Finish only means something while the drum plays. After the last stroke the page should be back where it started.',
    function () {
      return withApp(function (win, doc) {
        function $(id) { return doc.getElementById(id); }
        var cin = $('countin'); cin.value = '0'; cin.dispatchEvent(new win.Event('change'));
        var ph = $('phrase'); ph.value = 2; ph.dispatchEvent(new win.Event('input'));
        var bpm = $('bpm'); bpm.value = 160; bpm.dispatchEvent(new win.Event('input'));   // 1.5 s a bar
        var offWhenStopped = $('finish').disabled && $('mini-finish').disabled;
        $('play').click();
        var onWhenPlaying = !$('finish').disabled;
        key(win, doc, 'KeyF', 'f');                      // F does what the button does
        var pressed = $('finish').getAttribute('aria-pressed') === 'true' &&
                      $('mini-finish').getAttribute('aria-pressed') === 'true';
        var counter = $('bar-count').textContent;
        var start = Date.now();
        return new Promise(function (resolve) {
          (function wait() {
            if (!isPlaying(doc) || Date.now() - start > 8000) resolve(); else setTimeout(wait, 100);
          })();
        }).then(function () {
          expect(offWhenStopped, 'Finish can be pressed with nothing playing');
          expect(onWhenPlaying, 'Finish is greyed out while playing');
          expect(pressed, 'pressing F did not show Finish as on its way');
          expect(/finishing/.test(counter), 'the bar counter says "' + counter + '", not that it is finishing');
          expect(!isPlaying(doc), 'still playing 8 s after Finish, at 1.5 s a bar in 2-bar phrases');
          expect($('play').textContent.trim() === 'Play', 'the button says "' + $('play').textContent.trim() + '"');
          expect($('finish').disabled && $('finish').textContent === 'Finish', 'Finish did not go back to how it started');
          expect($('bar-count').textContent === '—', 'the bar counter still says "' + $('bar-count').textContent + '"');
        });
      });
    });

  check('The app', 'Space does nothing while the About is open',
    'Reading the About should not start the drum behind it.',
    function () {
      return withApp(function (win, doc) {
        doc.getElementById('about-open').click();
        key(win, doc, 'Space', ' ');
        var playing = isPlaying(doc);
        doc.getElementById('about').close();
        expect(!playing, 'the drum started behind the About');
      });
    });

  /* ================================================================
   * Phone layout — checked in a phone-sized copy of the app (375 x 812)
   * ================================================================ */

  var PHONE = { w: 375, h: 812 };
  function box(el) { return el.getBoundingClientRect(); }

  check('Phone layout', 'The rhythm choice is on the first screen',
    'Full, Simple or Pulse is one of the three choices made before playing, so it should not need scrolling to on a phone.',
    function () {
      return withApp(function (win, doc) {
        var b = box(doc.getElementById('modes'));
        expect(b.bottom <= win.innerHeight, 'rhythm choice ends at ' + Math.round(b.bottom) +
               'px, below the first screen (' + win.innerHeight + 'px)');
        expect(doc.documentElement.scrollWidth <= win.innerWidth, 'page scrolls sideways on a phone');
      }, PHONE);
    });

  check('Phone layout', 'Play sits beside the tempo',
    'Play alone on its own row wasted space and pushed everything down the page.',
    function () {
      return withApp(function (win, doc) {
        var play = box(doc.getElementById('play')), tempo = box(doc.querySelector('.tempo'));
        expect(play.right <= tempo.left, 'Play is not to the left of the tempo');
        expect(play.top < tempo.bottom && play.bottom > tempo.top, 'Play and the tempo are not on the same row');
      }, PHONE);
    });

  check('Phone layout', 'Play/Stop stays reachable when scrolled down',
    'Scrolled down to the Drum or Drone settings, stopping used to mean scrolling back up.',
    function () {
      return withApp(function (win, doc) {
        var mini = doc.getElementById('mini');
        // Read where the bar ends up, not where its slide-in animation starts:
        // at the first instant it is still officially hidden and off-screen,
        // and in a background tab the animation never advances at all.
        mini.style.transition = 'none';
        function shown() { return mini.classList.contains('show') && win.getComputedStyle(mini).visibility === 'visible'; }
        function scrollTo(y) { win.scrollTo(0, y); win.dispatchEvent(new win.Event('scroll')); }

        scrollTo(0);
        var atTop = shown();
        scrollTo(doc.documentElement.scrollHeight);
        var atBottom = shown();
        var bar = box(mini), foot = box(doc.querySelector('.foot'));

        doc.getElementById('mini-play').click();
        var started = isPlaying(doc) && doc.getElementById('mini-play').classList.contains('playing');
        var before = +doc.getElementById('bpm-num').value;
        doc.getElementById('mini-up').click();
        var after = +doc.getElementById('bpm-num').value;
        var readout = +doc.getElementById('mini-bpm').textContent;
        doc.getElementById('mini-play').click();
        var stopped = !isPlaying(doc);
        scrollTo(0);
        var hiddenAgain = !shown();

        expect(!atTop, 'the pinned bar shows even though Play is on screen');
        expect(atBottom, 'the pinned bar does not appear when Play scrolls away');
        expect(bar.bottom <= win.innerHeight + 1, 'the pinned bar is off the bottom of the screen');
        expect(foot.bottom <= bar.top + 1, 'the pinned bar covers the bottom of the page');
        expect(started, 'its Play did not start the drum');
        expect(after === before + 5 && readout === after, 'its +5 went ' + before + ' → ' + after + ', showing ' + readout);
        expect(stopped, 'its Stop did not stop the drum');
        expect(hiddenAgain, 'the pinned bar stays after scrolling back up');
      }, PHONE);
    });

  check('Phone layout', 'Without MIDI, the GarageBand panel is one line',
    'An iPhone has no Web MIDI, so nothing in that panel can work there. It used to take three lines to say so.',
    function () {
      return withApp(function (win, doc) {
        var panel = doc.getElementById('midi-panel'), status = doc.getElementById('midi-status');
        var line = parseFloat(win.getComputedStyle(status).lineHeight) ||
                   1.5 * parseFloat(win.getComputedStyle(status).fontSize);
        expect(!win.navigator.requestMIDIAccess, 'the page still has Web MIDI, so this check proves nothing');
        expect(box(status).height < line * 1.5, 'the message takes ' + Math.round(box(status).height / line) + ' lines');
        expect(doc.getElementById('midi-controls').classList.contains('hidden'), 'the MIDI controls are showing');
        expect(box(panel).height < 80, 'the panel is ' + Math.round(box(panel).height) + 'px tall');
      }, PHONE, 'delete Navigator.prototype.requestMIDIAccess;');
    });

  /* ================================================================
   * Offline copy
   * ================================================================ */

  function text(url) {
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error(url + ' returned ' + r.status);
      return r.text();
    });
  }
  function swList(src, name) {
    var m = src.match(new RegExp(name + ' = \\[([\\s\\S]*?)\\]'));
    if (!m) throw new Error(name + ' not found in sw.js');
    return (m[1].match(/'[^']+'/g) || []).map(function (s) { return s.slice(1, -1).replace(/^\.\//, ''); });
  }

  check('Offline copy', 'It includes every file the page loads',
    'A file missing from the offline list would be missing in the pub, and the app might not start.',
    function () {
      return Promise.all([text('../index.html'), text('../sw.js')]).then(function (r) {
        var html = r[0], files = swList(r[1], 'APP_FILES');
        var used = [];
        html.replace(/<script src="([^"]+)"/g, function (_, s) { used.push(s); });
        html.replace(/<link rel="stylesheet" href="([^"]+)"/g, function (_, s) { used.push(s); });
        var missing = used.filter(function (u) { return files.indexOf(u) === -1; });
        expect(used.length >= 7, 'only found ' + used.length + ' files in index.html');
        expect(missing.length === 0, 'not in the offline list: ' + missing.join(', '));
        expect(files.indexOf('index.html') !== -1, 'index.html itself is not in the offline list');
      });
    });

  check('Offline copy', 'Every file on the offline list exists',
    'The offline copy only updates if every listed file downloads. One wrong name and it would quietly never update again.',
    function () {
      return text('../sw.js').then(function (src) {
        var files = swList(src, 'APP_FILES').concat(swList(src, 'EXTRAS')).filter(function (f) { return f; });
        return Promise.all(files.map(function (f) {
          return fetch('../' + f, { cache: 'no-store' }).then(function (r) { return r.ok ? null : f + ' (' + r.status + ')'; });
        })).then(function (r) {
          var bad = r.filter(Boolean);
          expect(bad.length === 0, 'missing: ' + bad.join(', '));
        });
      });
    });

  /* ================================================================
   * Runner
   * ================================================================ */

  var host = document.getElementById('results');
  var summary = document.getElementById('summary');
  var button = document.getElementById('run');

  function row(t) {
    var el = document.createElement('div');
    el.className = 'check';
    el.innerHTML = '<span class="icon">·</span><span class="name"></span>' +
                   '<span class="why"></span><span class="detail"></span>';
    el.querySelector('.name').textContent = t.name;
    el.querySelector('.why').textContent = t.why;
    return el;
  }

  function layout() {
    host.innerHTML = '';
    var group = null;
    tests.forEach(function (t) {
      if (t.group !== group) {
        group = t.group;
        var h = document.createElement('h2');
        h.textContent = group;
        host.appendChild(h);
      }
      t.el = row(t);
      host.appendChild(t.el);
    });
  }

  function mark(t, state, detail) {
    t.el.className = 'check ' + state;
    t.el.querySelector('.icon').textContent = state === 'pass' ? '✓' : state === 'fail' ? '✗' : '…';
    t.el.querySelector('.detail').textContent = detail || '';
  }

  window.TEST_RESULTS = { done: false, passed: 0, failed: 0, failures: [] };

  function runAll() {
    button.disabled = true;
    layout();
    var passed = 0, failed = 0, failures = [];
    window.TEST_RESULTS = { done: false, passed: 0, failed: 0, failures: failures };
    var chain = Promise.resolve();
    tests.forEach(function (t, i) {
      chain = chain.then(function () {
        mark(t, 'run');
        summary.className = '';
        summary.textContent = 'Running ' + (i + 1) + ' of ' + tests.length + '…';
        return yieldToPage().then(function () { return t.fn(); }).then(function () {
          passed++; mark(t, 'pass');
        }, function (err) {
          failed++; mark(t, 'fail', err && err.message ? err.message : String(err));
          failures.push({ group: t.group, name: t.name, detail: err && err.message });
        });
      });
    });
    return chain.then(function () {
      summary.className = failed ? 'fail' : 'pass';
      summary.textContent = failed
        ? failed + ' of ' + tests.length + ' checks failed'
        : 'All ' + tests.length + ' checks passed';
      window.TEST_RESULTS = { done: true, passed: passed, failed: failed, failures: failures, total: tests.length };
      button.disabled = false;
    });
  }

  button.addEventListener('click', runAll);
  layout();
  window.runChecks = runAll;
})(window.TRAD);
