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
    var drum = { hit: function (voice, time, vel, press) {
      hits.push({ voice: voice, time: time, vel: vel, press: press || 0 });
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
  function soloHit(voice, vel, press) {
    return render(1.0, 1, function (oc) {
      var b = new TRAD.Bodhran(oc, oc.destination);
      b.setRoom(0);
      b.hit(voice, 0.02, vel, press);
    }).then(function (buf) { return buf.getChannelData(0); });
  }
  function peak(d) { var p = 0; for (var i = 0; i < d.length; i++) p = Math.max(p, Math.abs(d[i])); return p; }
  function goertzel(d, f, t0, t1) {
    var s = Math.floor(t0 * SR), e = Math.floor(t1 * SR), k = 2 * Math.cos(2 * Math.PI * f / SR);
    var q1 = 0, q2 = 0;
    for (var i = s; i < e; i++) { var q0 = k * q1 - q2 + d[i]; q2 = q1; q1 = q0; }
    return Math.sqrt(Math.max(0, q1 * q1 + q2 * q2 - k * q1 * q2));
  }
  function pitchOf(d, t0, t1) {
    var best = 0, bf = 0;
    for (var f = 40; f <= 500; f += 2) { var m = goertzel(d, f, t0 || 0.045, t1 || 0.14); if (m > best) { best = m; bf = f; } }
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
  /* The bar counter shows the bar being heard, so after Play it waits for
   * the first one. Resolves with the counter's text once it names a bar. */
  function heard(doc) {
    var until = Date.now() + 4000;
    return new Promise(function (resolve) {
      (function poll() {
        var t = doc.getElementById('bar-count').textContent;
        if (/^bar /.test(t) || Date.now() > until) resolve(t); else setTimeout(poll, 50);
      })();
    });
  }

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

  check('Patterns', 'Each style starts at its usual length',
    'Waltzes usually have 16-bar parts, so AABB is 64 bars; everything else starts at 32 (two 8-bar parts, each twice). Change one on purpose? Update this list too.',
    function () {
      var want = { waltz: 64 };
      var bad = TRAD.tunes.filter(function (t) { return t.tuneBars !== (want[t.id] || 32); })
                          .map(function (t) { return t.id + ': ' + t.tuneBars; });
      expect(bad.length === 0, bad.join(', '));
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

  function pressRun(setup, seconds) {
    var r = fakeRun(function (tr) {
      tr.tune = TRAD.tuneById('reel'); tr.mode = 'simple'; tr.bpm = 120; tr.phraseLength = 4; tr.backHand = 1;
      if (setup) setup(tr);
    });
    r.advance(seconds || 16.5); r.done();
    return r;
  }

  check('Back hand', 'It follows one arc through each phrase',
    'The hand moves slowly while the tipper does the fast work: open at the top of the phrase, in through the middle, letting go across the last bar.',
    function () {
      var r = pressRun(), bar = 2, t0 = r.hits[0].time;
      function at(b, beat) {          // the stroke on this beat of drum bar b (from 0)
        var t = t0 + b * bar + beat * (bar / 4);
        return r.hits.filter(function (h) { return Math.abs(h.time - t) < 1e-6; })[0].press;
      }
      var steps = r.hits.slice(1).map(function (h, i) { return Math.abs(h.press - r.hits[i].press); });
      var most = Math.max.apply(null, r.hits.map(function (h) { return h.press; }));
      expect(at(0, 0) === 0 && at(4, 0) === 0, 'not open at the top of the phrase: ' + round(at(0, 0), 2) + ', ' + round(at(4, 0), 2));
      expect(at(2, 3) > 0.9 && most <= 1, 'bar 3 presses only ' + round(at(2, 3), 2) + ' at its hardest point');
      expect(at(3, 0) > at(3, 2) && at(3, 2) > at(3, 3), 'the last bar does not let go: ' + [0, 2, 3].map(function (b) { return round(at(3, b), 2); }).join(', '));
      expect(Math.max.apply(null, steps) < 0.25, 'the hand jumped by ' + round(Math.max.apply(null, steps), 2) + ' between two strokes');
    });

  check('Back hand', 'Off means off, and never in Pulse or on the last stroke',
    'Pulse is a plain reference; the count-in is not the drum; the last stroke of a Finish rings out open.',
    function () {
      var off = pressRun(function (tr) { tr.backHand = 0; });
      var pulse = pressRun(function (tr) { tr.mode = 'pulse'; });
      var withCount = pressRun(function (tr) { tr.countInBars = 1; });
      var clicksPressed = withCount.hits.filter(function (h) { return h.voice === 'click' && h.press; }).length;
      var fin = fakeRun(function (tr) {
        tr.tune = TRAD.tuneById('reel'); tr.mode = 'simple'; tr.bpm = 120; tr.phraseLength = 4; tr.backHand = 1;
      });
      fin.advance(2.5); fin.tr.finish(); fin.advance(10);
      var last = fin.hits[fin.hits.length - 1];
      expect(off.hits.every(function (h) { return h.press === 0; }), 'the hand pressed with Back hand off');
      expect(pulse.hits.every(function (h) { return h.press === 0; }), 'the hand pressed in Pulse');
      expect(clicksPressed === 0, 'the count-in clicks were pressed');
      expect(withCount.hits.filter(function (h) { return h.voice !== 'click'; })[0].press === 0,
             'the first bar after the count-in is not open at the top of the phrase');
      expect(!fin.tr.running && last.press === 0, 'the last stroke of a Finish was pressed at ' + round(last.press, 2));
    });

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

  /* The same reel, set to end by itself after `times` times through a tune of
   * `bars` bars. */
  function timesRun(bars, times, extra) {
    var ended = 0;
    var r = fakeRun(function (tr) {
      tr.tune = TRAD.tuneById('reel'); tr.mode = 'simple'; tr.bpm = 120;
      tr.countInBars = 1; tr.phraseLength = 4; tr.tuneBars = bars; tr.timesThrough = times;
      tr.onEnd = function () { ended++; };
    });
    if (extra) extra(r);
    r.advance(2 * (bars * 4 + 4));
    return { run: r, last: r.hits[r.hits.length - 1], ended: ended };
  }
  function drumBar(t) { return Math.round((t - 0.08) / 2 - 1) + 1; }   // 1 = the tune's first bar

  check('Finish', 'Played N times, it ends on the last bar of the last time',
    'Start the tune with the drum, say three times through 32 bars, and it should land on the tune’s final note, beat 1 of bar 96, and stop.',
    function () {
      var f = timesRun(32, 3);
      expect(Math.abs(f.last.time - (0.08 + 2 * 96)) < 1e-6,
             'last stroke in drum bar ' + drumBar(f.last.time) + ' (expected the start of bar 96)');
      expect(f.last.voice === 'bass' && f.last.vel === 1, 'the last stroke is a ' + f.last.voice + ' at ' + f.last.vel);
      expect(!f.run.tr.running && f.ended === 1, 'the drum did not stop and say so after the last time through');
      var g = timesRun(16, 1);
      expect(Math.abs(g.last.time - (0.08 + 2 * 16)) < 1e-6,
             'once through 16 bars ended in drum bar ' + drumBar(g.last.time) + ' (expected 16)');
      var h = timesRun(32, 0);
      expect(h.run.tr.running, '“until I stop” stopped by itself');
      h.run.done();
    });

  check('Finish', 'Lowered part-way through, it ends at the end of this time',
    'Change three times to once during the second time through: the end should come at the end of the second, not never.',
    function () {
      var f = timesRun(32, 3, function (r) { r.advance(0.08 + 2 * 40); r.tr.timesThrough = 1; });   // in bar 40
      expect(Math.abs(f.last.time - (0.08 + 2 * 64)) < 1e-6,
             'last stroke in drum bar ' + drumBar(f.last.time) + ' (expected the end of the second time, bar 64)');
      expect(!f.run.tr.running, 'the drum played on');
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

  check('Timing', 'A swing you set waits for the tune change too',
    'Changing tune mid-bar reset the swing at once, so the rest of the old tune’s bar lost the swing you had set.',
    function () {
      var bar = (60 / 100) * 4, beat = bar / 4;
      function offbeats(r, from, to) {
        var t0 = r.hits[0].time;
        return r.hits.filter(function (h) { return h.time >= t0 + from - 1e-6 && h.time < t0 + to - 1e-6; })
          .map(function (h) { var x = (h.time - t0) / beat; return round(x - Math.floor(x + 1e-6), 3); })
          .filter(function (f) { return f > 0.01; });
      }
      function all(list, at) { return list.length && list.every(function (f) { return Math.abs(f - at) < 0.002; }); }

      // A hornpipe you have straightened out, switched to a reel mid-bar.
      var a = fakeRun(function (tr) { tr.tune = TRAD.tuneById('hornpipe'); tr.mode = 'simple'; tr.bpm = 100; tr.swingOverride = 0; });
      a.advance(bar / 2); a.tr.setTune(TRAD.tuneById('reel')); a.advance(bar * 1.5); a.done();
      expect(all(offbeats(a, bar / 2, bar), 0.5), 'the rest of the hornpipe bar lost your straight swing: ' + offbeats(a, bar / 2, bar).join(', '));

      // A hornpipe on its own swing; switched to a reel and the swing moved
      // straight away, before the change has landed.
      var b = fakeRun(function (tr) { tr.tune = TRAD.tuneById('hornpipe'); tr.mode = 'simple'; tr.bpm = 100; });
      b.advance(bar / 2); b.tr.setTune(TRAD.tuneById('reel')); b.tr.setSwing(0.5); b.advance(bar * 1.5); b.done();
      var horn = 0.5 + TRAD.swingShift(0.5, TRAD.tuneById('hornpipe').swing), reel = 0.5 + TRAD.swingShift(0.5, 0.5);
      expect(all(offbeats(b, bar / 2, bar), horn), 'the swing for the reel landed in the hornpipe’s bar: ' + offbeats(b, bar / 2, bar).join(', '));
      expect(all(offbeats(b, bar, bar * 2), reel), 'the reel did not get the swing set for it: ' + offbeats(b, bar, bar * 2).join(', '));
    });

  check('Timing', 'A tab left playing behind another keeps every stroke',
    'Safari slows a hidden tab’s timers to about once a second, even while it plays. Planning a tenth of a second ahead, a tab left playing behind another stumbled.',
    function () {
      function strokes(ahead) {
        // Set before playing, as the page sets it the moment it is hidden.
        var r = fakeRun(function (tr) { tr.tune = TRAD.tuneById('reel'); tr.mode = 'simple'; tr.bpm = 120; tr.ahead = ahead; });
        for (var s = 0; s < 10; s++) r.jump(1);       // the timer, once a second
        r.done();
        return r.hits.filter(function (h) { return h.time < 10; }).length;
      }
      var want = Math.floor((10 - 0.08) / 0.25) + 1;  // a reel quaver every 0.25 s from 0.08 s
      var hidden = strokes(TRAD.HIDDEN_AHEAD), onScreen = strokes(TRAD.SCHEDULE_AHEAD);
      expect(TRAD.HIDDEN_AHEAD >= 3, 'a hidden page plans only ' + TRAD.HIDDEN_AHEAD + ' s ahead');
      expect(hidden === want, 'hidden, with a once-a-second timer, ' + hidden + ' of ' + want + ' strokes played');
      expect(onScreen < want, 'the check proves nothing: even the short plan kept every stroke');
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

  check('Sound', 'The back hand raises the pitch and shortens the ring',
    'Pressing on the skin from inside tightens it: a higher note, rung shorter. At full pressure about a fourth up.',
    function () {
      function ringEnd(d) {           // when the stroke falls 40 dB under its peak
        var p = peak(d), i = d.length - 1;
        while (i > 0 && Math.abs(d[i]) < p / 100) i--;
        return i / SR;
      }
      return Promise.all([soloHit('bass', 1, 0), soloHit('bass', 1, 1), soloHit('treble', 0.46, 1)]).then(function (r) {
        // Measured once the opening swoop has settled: a shorter ring weighs
        // the swoop more, which reads as two semitones too many.
        var open = pitchOf(r[0], 0.09, 0.2), pressed = pitchOf(r[1], 0.09, 0.2), up = pitchOf(r[2], 0.09, 0.2);
        var semis = 12 * Math.log2(pressed / open);
        expect(semis > 4 && semis < 6, 'full pressure moves the pitch ' + round(semis) + ' semitones (' + open + ' → ' + pressed + ' Hz)');
        expect(ringEnd(r[1]) < ringEnd(r[0]) * 0.75, 'pressed rings ' + round(ringEnd(r[1]), 2) + ' s, open ' + round(ringEnd(r[0]), 2) + ' s');
        expect(up / pressed > 0.9 && up / pressed < 1.1, 'the up stroke does not feel the hand: ' + up + ' Hz against ' + pressed + ' Hz');
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

  check('MIDI', 'The count-in goes over MIDI, to a note of its own',
    'Recording in GarageBand, the count-in lines the take up. It must not sound like drum strokes, so it has its own note (37, the side stick).',
    function () {
      var sent = [];
      var run = fakeRun(function (tr) {
        tr.tune = TRAD.tuneById('reel'); tr.mode = 'simple'; tr.bpm = 120; tr.countInBars = 1;
        tr.midi = { send: function (ctx, voice, time, vel) { sent.push({ voice: voice, vel: vel }); }, allNotesOff: function () {} };
      });
      run.advance(3); run.done();
      var clicks = sent.filter(function (x) { return x.voice === 'click'; });
      expect(clicks.length === 4, clicks.length + ' count-in clicks sent over MIDI (expected 4)');
      expect(clicks[0].vel > clicks[1].vel, 'the click on 1 is not the accented one');
      var m = new TRAD.MidiOut(), out = [];
      m.port = { send: function (d) { out.push(d); } };
      m.enabled = true;
      var ctx = { currentTime: 0, getOutputTimestamp: function () { return { contextTime: 0, performanceTime: 0 }; } };
      m.send(ctx, 'click', 0.1, 0.9); m.send(ctx, 'bass', 0.2, 1);
      expect(out[0][1] === 37 && out[2][1] === 41, 'count-in went to note ' + out[0][1] + ', the drum to ' + out[2][1]);
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

  check('The app', 'The release notes cover this version, and the About links to them',
    'The notes are shared with other people, so they must never fall behind the app. Bump the version? Add it to CHANGELOG.md and release-notes/ in the same change.',
    function () {
      return withApp(function (win, doc) {
        var v = win.TRAD.VERSION;
        var link = doc.querySelector('.about-body a[href="release-notes/"]');
        return Promise.all([text('../release-notes/'), text('../CHANGELOG.md')]).then(function (r) {
          expect(!!link, 'the About has no link to the release notes');
          expect(r[0].indexOf('<span class="ver">' + v + '</span>') !== -1, 'the release notes page has no entry for ' + v);
          expect(r[1].indexOf('## ' + v + ' ') !== -1, 'CHANGELOG.md has no entry for ' + v);
          expect(/href="\.\.\/"/.test(r[0]), 'the release notes page has no way back to the app');
        });
      });
    });

  check('The app', 'Hidden behind another tab, the drum plans seconds ahead at once',
    'The moment the tab is hidden, before its timers slow: the next slowed timer could be a second away, and the strokes in between would be lost.',
    function () {
      var fake = 'window.__hidden = false;' +
          'Object.defineProperty(Document.prototype, "hidden", { configurable: true, get: function () { return window.__hidden; } });' +
          'Object.defineProperty(Document.prototype, "visibilityState", { configurable: true, get: function () { return window.__hidden ? "hidden" : "visible"; } });' +
          'window.__lead = 0; var os = OscillatorNode.prototype.start;' +
          'OscillatorNode.prototype.start = function (w) { if (w) window.__lead = Math.max(window.__lead, w - this.context.currentTime); return os.apply(this, arguments); };';
      return withApp(function (win, doc) {
        var cin = doc.getElementById('countin'); cin.value = '0'; cin.dispatchEvent(new win.Event('change'));
        doc.getElementById('play').click();
        var shown = win.__lead;
        win.__hidden = true; doc.dispatchEvent(new win.Event('visibilitychange'));
        var hidden = win.__lead;
        return heard(doc).then(function (counter) {
          doc.getElementById('play').click();
          expect(shown < 1, 'on screen it already planned ' + round(shown, 2) + ' s ahead');
          expect(hidden > 3, 'hidden, it planned only ' + round(hidden, 2) + ' s ahead');
          // Planned seconds ahead, the counter must still name the bar being heard.
          expect(/^bar 1 of/.test(counter), 'with bars planned ahead, the counter says "' + counter + '", not the bar being heard');
        });
      }, null, fake);
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
          return ['complexity', 'phrase', 'swing', 'humanize', 'backhand'].filter(function (id) { return doc.getElementById(id).disabled; }).join(',');
        }
        mode('full');   var full = off();
        mode('simple'); var simple = off();
        mode('pulse');  var pulse = off();
        expect(full === '', 'Full greys out: ' + full);
        expect(simple === 'complexity,phrase', 'Simple greys out: ' + simple);
        expect(pulse === 'complexity,phrase,swing,humanize,backhand', 'Pulse greys out: ' + pulse);
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
        var onWhenPlaying = !$('finish').disabled, pressed, counter, start;
        return heard(doc).then(function () {
        key(win, doc, 'KeyF', 'f');                      // F does what the button does
        pressed = $('finish').getAttribute('aria-pressed') === 'true' &&
                  $('mini-finish').getAttribute('aria-pressed') === 'true';
        counter = $('bar-count').textContent;
        start = Date.now();
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
    });

  check('The app', 'The silent-switch setting is for phones only',
    'An iPhone on silent plays nothing unless the page declares itself playback audio. A Mac has no silent switch, so it is left alone there.',
    function () {
      function sessionAfterPlay(touchPoints) {
        var fake = 'Object.defineProperty(Navigator.prototype, "maxTouchPoints", { configurable: true, get: function () { return ' +
                   touchPoints + '; } });' +
                   'window.__session = { type: "auto" };' +
                   'Object.defineProperty(Navigator.prototype, "audioSession", { configurable: true, get: function () { return window.__session; } });';
        return withApp(function (win, doc) {
          doc.getElementById('play').click();
          return win.__session.type;
        }, null, fake);
      }
      return sessionAfterPlay(5).then(function (phone) {
        return sessionAfterPlay(0).then(function (mac) {
          expect(phone === 'playback', 'on a phone the audio session was left as "' + phone + '", so the silent switch would mute it');
          expect(mac === 'auto', 'on a Mac the audio session was changed to "' + mac + '"');
        });
      });
    });

  check('The app', 'Every Play asks the sound to start, even when it says it is running',
    'After the Mac sleeps, Safari can say its audio is running while keeping the tab silent, through any number of reloads. Asking it to resume on each press wakes it.',
    function () {
      // A browser whose audio always claims to be running, counting resumes.
      var fake = 'window.__resumes = 0;' +
        'Object.defineProperty(BaseAudioContext.prototype, "state", { configurable: true, get: function () { return "running"; } });' +
        'var real = AudioContext.prototype.resume;' +
        'AudioContext.prototype.resume = function () { window.__resumes++; return real.call(this); };';
      return withApp(function (win, doc) {
        var play = doc.getElementById('play');
        play.click(); var first = win.__resumes;
        play.click();                                   // stop
        play.click(); var second = win.__resumes;       // start again
        play.click();
        doc.getElementById('drone-on').click(); var drone = win.__resumes;
        expect(first >= 1, 'the first Play did not ask the sound to start');
        expect(second > first, 'playing again did not ask the sound to start');
        expect(drone > second, 'ticking the drone did not ask the sound to start');
      }, null, fake);
    });

  check('The app', 'Stopped and quiet, it lets go of the speaker',
    'Left running after Stop, a page held the speaker open indefinitely: the Mac’s own log showed Safari holding it for over half an hour after the demo stopped, keeping the Mac from idle sleep. Play takes it back; the drone, while on, keeps it.',
    function () {
      var fake = 'window.__suspends = 0; Object.defineProperty(BaseAudioContext.prototype, "state", { configurable: true, get: function () { return "running"; } });' +
        'AudioContext.prototype.suspend = function () { window.__suspends++; return Promise.resolve(); };';
      function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
      return withApp(function (win, doc) {
        win.TRAD.REST_AFTER = 0.15;
        var play = doc.getElementById('play'), drone = doc.getElementById('drone-on'), n = {};
        play.click(); play.click();                 // play, stop,
        play.click();                               // and play again before it rests
        return wait(400).then(function () {
          n.playing = win.__suspends;
          play.click();                             // stop
          return wait(400);
        }).then(function () {
          n.stopped = win.__suspends;
          drone.click();                            // the drone on,
          play.click(); play.click();               // and the drum played and stopped under it
          return wait(400);
        }).then(function () {
          n.drone = win.__suspends;
          drone.click();                            // and off
          return wait(400);
        }).then(function () {
          n.quiet = win.__suspends;
          expect(n.playing === 0, 'it let go of the speaker while playing');
          expect(n.stopped === 1, 'stopped, it kept hold of the speaker');
          expect(n.drone === 1, 'stopping the drum let go of the speaker under the drone');
          expect(n.quiet === 2, 'with the drone turned off too, it kept hold of the speaker');
        });
      }, null, fake);
    });

  check('The app', 'The Safari wake-up is a second of sound, far below hearing',
    'A plain one-second audio file got a stuck Safari tab sounding again both times it happened; the old nudge, a twentieth of a second of pure silence, did not. It must never be heard.',
    function () {
      var v = new DataView(TRAD.nudgeWav()), sr = v.getUint32(24, true), n = v.getUint32(40, true) / 2;
      var peak = 0, nonzero = 0;
      for (var i = 0; i < n; i++) {
        var x = Math.abs(v.getInt16(44 + i * 2, true));
        peak = Math.max(peak, x); if (x) nonzero++;
      }
      expect(sr === 44100, 'it is at ' + sr + ' Hz, not the 44.1 kHz of the file that woke the tab');
      expect(n / sr >= 1, 'it lasts ' + round(n / sr) + ' s, not a second');
      expect(nonzero > n / 2, 'it is pure silence, like the nudge that did not wake the tab');
      expect(20 * Math.log10(peak / 32768) < -80, 'it peaks at ' + round(20 * Math.log10(peak / 32768)) + ' dB: loud enough to hear');
    });

  check('The app', 'While it plays, it says whether it is making sound',
    'Twice a Safari tab went silent while the Mac played its stream, and nothing could tell whether the page sent silence or Safari lost the sound. The line under Play measures what leaves the page for the speaker.',
    function () {
      function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
      return withApp(function (win, doc) {
        var el = doc.getElementById('sound-check'), play = doc.getElementById('play'), n = {};
        n.before = el.textContent;
        play.click();
        return wait(3500).then(function () {
          n.playing = el.textContent;
          play.click();
          return wait(1500);
        }).then(function () {
          n.stopped = el.textContent;
          expect(n.before === '', 'it shows "' + n.before + '" before anything plays');
          expect(/making sound \(-?\d+ dB\)/.test(n.playing), 'while playing it says "' + n.playing + '"');
          expect(n.stopped === '', 'stopped, it still says "' + n.stopped + '"');
        });
      });
    });

  check('The app', 'In Mac Safari the sound goes out through an audio element, and nowhere else',
    'Three times a Safari tab went silent while the page was making sound. In the stuck tab a direct beep stayed silent and the same beep through an audio element played, and woke the direct one. Chrome and the iPhone never needed it.',
    function () {
      function route(ua, touch) {
        var fake = 'Object.defineProperty(Navigator.prototype, "userAgent", { configurable: true, get: function () { return ' +
          JSON.stringify(ua) + '; } });' +
          'Object.defineProperty(Navigator.prototype, "maxTouchPoints", { configurable: true, get: function () { return ' + touch + '; } });' +
          'window.__streams = 0; var mk = AudioContext.prototype.createMediaStreamDestination;' +
          'AudioContext.prototype.createMediaStreamDestination = function () { window.__streams++; return mk.call(this); };' +
          'window.__routed = 0; HTMLMediaElement.prototype.play = function () { if (this.srcObject) window.__routed++; return Promise.resolve(); };';
        return withApp(function (win, doc) {
          var play = doc.getElementById('play');
          play.click(); var first = { streams: win.__streams, routed: win.__routed };
          play.click(); play.click();                  // stop, and play again
          first.again = win.__routed;
          return first;
        }, null, fake);
      }
      var SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
      var CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
      var IPAD = SAFARI;   // an iPad's Safari says Macintosh too; only touch tells it apart
      return route(SAFARI, 0).then(function (mac) {
        return route(CHROME, 0).then(function (chrome) {
          return route(IPAD, 5).then(function (ipad) {
            expect(mac.streams === 1 && mac.routed === 1, 'Mac Safari’s sound did not go out through an audio element: ' + JSON.stringify(mac));
            expect(mac.again > mac.routed, 'playing again did not start the audio element again: ' + JSON.stringify(mac));
            expect(chrome.streams === 0 && chrome.routed === 0, 'Chrome’s sound went through an audio element too');
            expect(ipad.streams === 0 && ipad.routed === 0, 'an iPad or iPhone’s sound went through an audio element too');
          });
        });
      });
    });

  check('The app', 'The count-in starts at two bars, goes to four, and is counted',
    'One bar was too short to start the drum and then get an instrument and pick ready. Counting the bars on screen says when the drum comes in.',
    function () {
      return withApp(function (win, doc) {
        var sel = doc.getElementById('countin');
        var opts = Array.prototype.map.call(sel.options, function (o) { return o.value; });
        expect(sel.value === '2', 'a first visit counts in ' + sel.value + ' bar(s), not 2');
        expect(opts.indexOf('4') !== -1, 'there is no 4-bar count-in: ' + opts.join(', '));
        doc.getElementById('play').click();
        var seen = [], until = Date.now() + 15000;
        return new Promise(function (resolve) {
          (function poll() {
            var t = doc.getElementById('bar-count').textContent;
            if (seen[seen.length - 1] !== t) seen.push(t);
            if (/^bar /.test(t) || Date.now() > until) resolve(); else setTimeout(poll, 50);
          })();
        }).then(function () {
          var i1 = seen.indexOf('count-in 1 of 2'), i2 = seen.indexOf('count-in 2 of 2');
          var first = seen.filter(function (t) { return /^bar /.test(t); })[0] || '';
          expect(i1 !== -1 && i2 > i1, 'the counter did not count the two bars in: ' + seen.join(' → '));
          expect(/^bar 1 of /.test(first) && seen.indexOf(first) > i2, 'the tune did not start at bar 1 after them: ' + seen.join(' → '));
        });
      });
    });

  check('The app', 'Every drone root plays the note it names, B included',
    'B minor is one of the commonest keys in the music and was missing. And a label that says D must play a D.',
    function () {
      return withApp(function (win, doc) {
        var opts = Array.prototype.map.call(doc.querySelectorAll('#drone-root option'), function (o) {
          return { label: o.textContent.split('/')[0], note: TRAD.noteName(+o.value).replace(/-?\d+$/, '') };
        });
        var wrong = opts.filter(function (o) { return o.label !== o.note; });
        expect(opts.some(function (o) { return o.label === 'B'; }), 'no B among ' + opts.map(function (o) { return o.label; }).join(', '));
        expect(wrong.length === 0, wrong.map(function (o) { return o.label + ' plays ' + o.note; }).join(', '));
      });
    });

  check('The app', 'A tempo outside the range says so',
    'Typing 200 for a reel used to turn it into 160 without a word.',
    function () {
      return withApp(function (win, doc) {
        function $(id) { return doc.getElementById(id); }
        function type(v) { $('bpm-num').value = v; $('bpm-num').dispatchEvent(new win.Event('change')); }
        doc.querySelector('.chip[data-id="reel"]').click();
        type(120);
        var quietInRange = !$('beat-unit').classList.contains('warn');
        type(200);
        var high = { value: +$('bpm-num').value, warn: $('beat-unit').classList.contains('warn'), text: $('beat-unit').textContent };
        doc.querySelector('.chip[data-id="hornpipe"]').click();
        var cleared = !$('beat-unit').classList.contains('warn') && /per/.test($('beat-unit').textContent);
        type(20);
        var low = +$('bpm-num').value, lowText = $('beat-unit').textContent;
        expect(quietInRange, 'a tempo inside the range was flagged');
        expect(high.value === 160, 'typing 200 for a reel gave ' + high.value);
        expect(high.warn && /60/.test(high.text) && /160/.test(high.text), 'nothing said why: "' + high.text + '"');
        expect(+$('bpm-num').max === 130 && +$('bpm-num').min === 60, 'the box allows ' + $('bpm-num').min + '–' + $('bpm-num').max + ' for a hornpipe');
        expect(cleared, 'the note stayed up after changing tune');
        expect(low === 60 && /130/.test(lowText), 'typing 20 for a hornpipe gave ' + low + ', saying "' + lowText + '"');
      });
    });

  check('The app', 'Arrow keys move the choice of tune type and rhythm',
    'Each row is one choice: Tab reaches the chosen one, and the arrows move along, not the tempo.',
    function () {
      return withApp(function (win, doc) {
        function chip(id) { return doc.querySelector('.chip[data-id="' + id + '"]'); }
        function checked(sel) { return doc.querySelector(sel + '[aria-checked="true"]'); }
        chip('reel').click();
        var tabbable = Array.prototype.filter.call(doc.querySelectorAll('.chip'), function (c) { return c.tabIndex === 0; });
        chip('reel').focus();
        key(win, chip('reel'), 'ArrowRight', 'ArrowRight');
        var toJig = checked('.chip').dataset.id, focused = doc.activeElement === chip('jig');
        var jigBpm = +doc.getElementById('bpm-num').value;
        key(win, chip('jig'), 'ArrowLeft', 'ArrowLeft');
        key(win, chip('reel'), 'ArrowLeft', 'ArrowLeft');
        var wrapped = checked('.chip').dataset.id;
        var full = doc.querySelector('.mode[data-mode="full"]');
        full.click(); full.focus();
        key(win, full, 'ArrowRight', 'ArrowRight');
        var mode = checked('.mode').dataset.mode;
        expect(tabbable.length === 1 && tabbable[0] === chip('reel'), 'Tab reaches ' + tabbable.length + ' tune chips, not just the chosen one');
        expect(toJig === 'jig' && focused, '→ from Reel chose ' + toJig);
        expect(jigBpm === TRAD.tuneById('jig').defaultBpm, 'the arrow also nudged the tempo, to ' + jigBpm);
        expect(wrapped === TRAD.tunes[TRAD.tunes.length - 1].id, '← from Reel went to ' + wrapped + ', not round to the end');
        expect(mode === 'simple', '→ from Full chose ' + mode);
      });
    });

  check('The app', 'Length and times through are on show, counted, and kept per tune',
    'They are everyday practice choices, so Basic shows them. Each tune type keeps its own length, as it keeps its own tempo.',
    function () {
      return withApp(function (win, doc) {
        function $(id) { return doc.getElementById(id); }
        function set(id, v) { $(id).value = v; $(id).dispatchEvent(new win.Event('change')); }
        function chip(id) { doc.querySelector('.chip[data-id="' + id + '"]').click(); }
        var inBasic = shown(win, $('tune-len')) && shown(win, $('times'));
        chip('waltz'); var waltzFirst = $('tune-len').value;
        chip('jig'); set('tune-len', 48);
        chip('reel'); var reelLen = $('tune-len').value;
        chip('jig'); var jigLen = $('tune-len').value;
        set('countin', 0); set('times', 2);
        $('play').click();
        return heard(doc).then(function (counter) {
        $('play').click();
        var saved = JSON.parse(win.localStorage.getItem('bodhran.settings') || '{}');
        expect(inBasic, 'Length or Play it is not on show in Basic');
        expect(reelLen === '32' && jigLen === '48', 'reel came back at ' + reelLen + ' bars, jig at ' + jigLen);
        expect(waltzFirst === '64', 'a first visit to waltz gave ' + waltzFirst + ' bars, not 64');
        expect(/bar 1 of 48/.test(counter) && /time 1 of 2/.test(counter), 'the counter says "' + counter + '"');
        expect(saved.times === 2 && saved.len_jig === 48, 'not remembered: ' + JSON.stringify({ times: saved.times, len_jig: saved.len_jig }));
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
   * Basic and Advanced
   * ================================================================ */

  function shown(win, el) { return !!el && el.getClientRects().length > 0 && win.getComputedStyle(el).visibility !== 'hidden'; }
  function viewTo(doc, v) { doc.querySelector('#view [data-view="' + v + '"]').click(); }

  check('Basic and Advanced', 'Basic keeps the advanced controls back, and says so in every panel',
    'A first visit sees the everyday controls. Nothing may be out of sight without the panel saying what, and that it is in Advanced.',
    function () {
      return withApp(function (win, doc) {
        // Everything marked as held back, and everything a panel says it holds back.
        var kept = doc.querySelectorAll('.adv, [data-adv]'), showing = [], unsaid = [];
        Array.prototype.forEach.call(kept, function (el) { if (shown(win, el)) showing.push(el.dataset.adv || el.id); });
        Array.prototype.forEach.call(doc.querySelectorAll('[data-adv]'), function (el) {
          var hint = el.closest('.panel').querySelector('.adv-hint');
          if (!shown(win, hint) || hint.textContent.indexOf(el.dataset.adv) === -1 || !/Advanced/.test(hint.textContent)) unsaid.push(el.dataset.adv);
        });
        var everyday = ['play', 'finish', 'bpm', 'tunes', 'modes', 'grid', 'countin', 'level', 'drone-on', 'drone-root']
          .filter(function (id) { return !shown(win, doc.getElementById(id)); });
        expect(doc.querySelector('#view [aria-checked="true"]').dataset.view === 'basic', 'a first visit does not start in Basic');
        expect(kept.length >= 10, 'only ' + kept.length + ' controls are marked advanced');
        expect(showing.length === 0, 'Basic still shows: ' + showing.join(', '));
        expect(unsaid.length === 0, 'kept back without a word: ' + unsaid.join(', '));
        expect(everyday.length === 0, 'Basic hides everyday controls: ' + everyday.join(', '));
        expect(shown(win, doc.getElementById('view')), 'the Basic / Advanced switch is not on screen');
      });
    });

  check('Basic and Advanced', 'Advanced shows everything, and is remembered',
    'Advanced is every control with nothing held back; a choice made once should not need making every visit.',
    function () {
      return withApp(function (win, doc) {
        viewTo(doc, 'advanced');
        var hidden = Array.prototype.filter.call(doc.querySelectorAll('.adv[data-adv]'), function (el) {
          return el.id !== 'midi-controls' && !shown(win, el);
        }).map(function (el) { return el.dataset.adv; });
        var hints = Array.prototype.filter.call(doc.querySelectorAll('.adv-hint'), function (h) { return shown(win, h); }).length;
        var saved = JSON.parse(win.localStorage.getItem('bodhran.settings') || '{}').view;
        key(win, doc.querySelector('#view [data-view="advanced"]'), 'ArrowLeft', 'ArrowLeft');
        var backByKey = doc.querySelector('#view [aria-checked="true"]').dataset.view;
        expect(hidden.length === 0, 'Advanced still hides: ' + hidden.join(', '));
        expect(hints === 0, hints + ' “More in Advanced” lines still showing in Advanced');
        expect(saved === 'advanced', 'the choice was saved as ' + saved);
        expect(backByKey === 'basic', 'the arrow keys do not move the switch');
      });
    });

  check('Basic and Advanced', 'A changed setting kept back is flagged',
    'Settings kept back still count. One moved from where it started would change the sound out of sight, so Basic says which.',
    function () {
      return withApp(function (win, doc) {
        var drumHint = doc.getElementById('backhand').closest('.panel').querySelector('.adv-hint');
        var feelHint = doc.getElementById('swing').closest('.panel').querySelector('.adv-hint');
        var fresh = drumHint.textContent + feelHint.textContent;
        viewTo(doc, 'advanced');
        var bh = doc.getElementById('backhand'); bh.value = 0.5; bh.dispatchEvent(new win.Event('input'));
        var sw = doc.getElementById('swing'); sw.value = 0.3; sw.dispatchEvent(new win.Event('input'));
        viewTo(doc, 'basic');
        var drum = drumHint.textContent, feel = feelHint.textContent;
        doc.querySelector('.chip[data-id="jig"]').click();          // a new tune goes back to its own swing
        var feelAfter = feelHint.textContent;
        expect(!/changed/.test(fresh), 'a first visit already flags changes: ' + fresh);
        expect(/changed: back hand \(moderate\)/.test(drum), 'the Drum panel says: ' + drum);
        expect(/changed: swing \(30%\)/.test(feel), 'the Feel panel says: ' + feel);
        expect(!/changed/.test(feelAfter), 'still flags swing after a new tune reset it: ' + feelAfter);
      });
    });

  check('Basic and Advanced', 'A panel’s hint opens Advanced right there',
    'Tapping “More in Advanced” should bring the controls in where you are looking, not jump the page.',
    function () {
      return withApp(function (win, doc) {
        var hint = doc.getElementById('tuning').closest('.panel').querySelector('.adv-hint');
        hint.scrollIntoView({ block: 'center' });
        var panel = hint.closest('.panel'), before = box(panel).top;
        hint.click();
        var after = box(panel).top;
        expect(!doc.querySelector('.app').classList.contains('basic'), 'the hint did not open Advanced');
        expect(Math.abs(after - before) <= 2, 'the panel moved ' + Math.round(after - before) + 'px');
        expect(doc.activeElement === doc.getElementById('tuning'), 'the first control it brought in is not ready to use');
      }, PHONE);
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
        var leftOutOfBasic = !shown(win, panel);
        viewTo(doc, 'advanced');
        expect(leftOutOfBasic, 'Basic shows a GarageBand panel on a browser that cannot use it');
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
   * Guitar demo (/guitar/): The Kesh with a guitar backing
   * ================================================================ */

  check('Guitar demo', 'The Kesh: every bar is a full 6/8 bar',
    'The melody is setting 1 from thesession.org. A bar a quaver short or long would put the tune out against the backing.',
    function () {
      var K = window.KESH, bad = [];
      ['A', 'B'].forEach(function (p) {
        expect(K.parts[p].length === 8, 'part ' + p + ' has ' + K.parts[p].length + ' bars');
        K.parts[p].forEach(function (b) {
          var q = b.notes.reduce(function (a, n) { return a + n.len; }, 0);
          if (q !== 6) bad.push(p + (b.index + 1) + ' "' + b.abc + '" is ' + q + ' quavers');
        });
      });
      expect(bad.length === 0, bad.join('\n'));
      expect(K.form().length === 32, 'one time through is ' + K.form().length + ' bars, not 32 (AABB)');
      var names = K.parts.A[7].notes.map(function (n) { return n.midi; });
      expect(names.join() === [71, 69, 66, 67].join(), 'bar A8 “BAF G3” reads as ' + names.join() + ' (the F must be sharp)');
      expect(K.parts.B[4].notes[4].midi === 73, 'the ^c in B5 is not a C sharp');
    });

  check('Guitar demo', 'Every chord has a shape, and the drone rings through',
    'G, Cadd9 and Em7 all hold D and G on the top two strings, the open droning sound of Irish guitar; D lets them go for its F sharp.',
    function () {
      var K = window.KESH, missing = [];
      ['A', 'B'].forEach(function (p) {
        K.chords[p].forEach(function (c, i) {
          c.split(' ').forEach(function (x) { if (!K.shapes[x]) missing.push(p + (i + 1) + ': ' + x); });
        });
      });
      expect(missing.length === 0, 'no shape for ' + missing.join(', '));
      var drone = ['G', 'C', 'Em'].filter(function (c) { var v = K.voicing(c); return v[4] !== 62 || v[5] !== 67; });
      expect(drone.length === 0, 'not holding D and G on top: ' + drone.join(', '));
      expect(K.voicing('D')[5] === 66, 'the D shape has no F sharp on top');
    });

  check('Guitar demo', 'DADGAD: D A D G A D, with the low D and top D open in every shape',
    'In DADGAD the open strings are the point: the low D and top D drone under every chord, the open G rings in three. Started on their own roots, G, C and Em sounded much as in standard tuning.',
    function () {
      var K = window.KESH, t = K.tunings.dadgad;
      expect(t.strings.join() === [38, 45, 50, 55, 57, 62].join(), 'the strings are ' + t.strings.join() + ', not D2 A2 D3 G3 A3 D4');
      var missing = [];
      ['A', 'B'].forEach(function (p) {
        K.chords[p].forEach(function (c, i) {
          c.split(' ').forEach(function (x) { if (!t.shapes[x]) missing.push(p + (i + 1) + ': ' + x); });
        });
      });
      expect(missing.length === 0, 'no DADGAD shape for ' + missing.join(', '));
      var closed = Object.keys(t.shapes).filter(function (c) { return t.shapes[c].frets[5] !== 0; });
      expect(closed.length === 0, 'the top D is not open in: ' + closed.join(', '));
      var low = Object.keys(t.shapes).filter(function (c) { return t.shapes[c].frets[0] !== 0; });
      expect(low.length === 0, 'the low D is not open in: ' + low.join(', '));
      var noG = Object.keys(t.shapes).filter(function (c) { return c !== 'D' && t.shapes[c].frets[3] !== 0; });
      expect(noG.length === 0, 'the G string is not open in: ' + noG.join(', '));
      expect(K.voicing('G', 'dadgad').indexOf(59) === -1 && K.voicing('D', 'dadgad').indexOf(66) === -1,
             'the DADGAD shapes are not the open ones intended');
    });

  check('Guitar demo', 'The guitar is in tune',
    'A plucked-string model sounds a little flat unless its loop is corrected. Strings more than a few cents apart beat against each other in a chord.',
    function () {
      var SRG = 48000, notes = [38, 40, 47, 55, 57, 62, 66], out = [];
      var chain = Promise.resolve();
      notes.forEach(function (m) {
        chain = chain.then(function () {
          var oc = new OfflineAudioContext(1, SRG * 1.4, SRG);
          var g = new window.GTR.Guitar(oc, oc.destination);
          g.prepare([m]);
          var shape = [null, null, null, null, null, null]; shape[3] = m;
          g.strum(shape, 0.01, 'D', 1);
          return oc.startRendering().then(function (buf) {
            var d = buf.getChannelData(0), f0 = window.GTR.hz(m), best = 0, bf = 0;
            for (var f = f0 * 0.98; f <= f0 * 1.02; f += f0 / 4000) {
              var s = Math.floor(0.2 * SRG), e = Math.floor(1.2 * SRG), k = 2 * Math.cos(2 * Math.PI * f / SRG), q1 = 0, q2 = 0;
              for (var i = s; i < e; i++) { var q0 = k * q1 - q2 + d[i]; q2 = q1; q1 = q0; }
              var mag = q1 * q1 + q2 * q2 - k * q1 * q2;
              if (mag > best) { best = mag; bf = f; }
            }
            out.push({ m: m, cents: 1200 * Math.log2(bf / f0) });
          });
        });
      });
      return chain.then(function () {
        var off = out.filter(function (o) { return Math.abs(o.cents) > 3; });
        expect(off.length === 0, off.map(function (o) { return 'MIDI ' + o.m + ' is ' + round(o.cents) + ' cents out'; }).join(', '));
      });
    });

  check('Guitar demo', 'The page builds its chart and shapes',
    'The demo lives at /guitar/, apart from the app. It should load on its own and lay out all 16 bars and the four shapes.',
    function () {
      var frame = document.createElement('iframe');
      frame.src = '../guitar/';
      frame.style.cssText = 'position:absolute;left:-10000px;top:0;border:0;width:375px;height:812px';
      document.body.appendChild(frame);
      return new Promise(function (resolve, reject) {
        var t = setTimeout(function () { reject(new Error('the demo page did not load')); }, 10000);
        frame.onload = function () { clearTimeout(t); setTimeout(resolve, 200); };
      }).then(function () {
        var doc = frame.contentDocument, win = frame.contentWindow;
        var bars = doc.querySelectorAll('#chart .bar').length, shapes = doc.querySelectorAll('#shapes svg').length;
        expect(bars === 16, bars + ' bars in the chart, not 16');
        expect(shapes === 4, shapes + ' chord shapes drawn, not 4');
        expect(win.KESH_DEMO && win.KESH_DEMO.FORM.length === 32, 'the demo does not play the tune AABB');
        expect(doc.documentElement.scrollWidth <= win.innerWidth, 'the demo scrolls sideways on a phone');
      }).finally(function () { frame.remove(); });
    });

  check('Guitar demo', 'Each sound has its own volume, heard straight away and remembered',
    '100% is the measured balance. A slider must change the sound as it plays, not from the next tune, and come back the same next visit.',
    function () {
      var KEY = 'kesh.demo.volume', saved = localStorage.getItem(KEY);
      localStorage.removeItem(KEY);
      var frame = document.createElement('iframe');
      frame.src = '../guitar/';
      frame.style.cssText = 'position:absolute;left:-10000px;top:0;border:0;width:375px;height:812px';
      document.body.appendChild(frame);
      function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
      return new Promise(function (resolve, reject) {
        var t = setTimeout(function () { reject(new Error('the demo page did not load')); }, 10000);
        frame.onload = function () { clearTimeout(t); setTimeout(resolve, 200); };
      }).then(function () {
        var doc = frame.contentDocument, win = frame.contentWindow, D = win.KESH_DEMO;
        function slide(id, v) { var el = doc.getElementById(id); el.value = v; el.dispatchEvent(new win.Event('input')); }
        slide('vol-guitar', 0.5);                       // before playing
        doc.getElementById('play').click();
        return wait(400).then(function () {
          var A = D.audio(), before = A.flute.gain.value;
          slide('vol-tune', 0);                         // while playing
          return wait(400).then(function () {
            var g = A.guitar.level.gain.value, f = A.flute.gain.value;
            var stored = JSON.parse(win.localStorage.getItem(KEY) || '{}');
            var label = doc.getElementById('vol-guitar-out').textContent;
            doc.getElementById('play').click();
            expect(Math.abs(g - D.MIX.guitar * 0.5) < 0.01, 'guitar at 50% plays at ' + round(g, 3) + ', not ' + D.MIX.guitar * 0.5);
            expect(Math.abs(before - D.MIX.tune) < 0.01, 'the flute did not start at its 100% level');
            expect(f < 0.005, 'the flute slider at 0% mid-tune left it at ' + round(f, 3));
            expect(stored.guitar === 0.5 && stored.tune === 0, 'not remembered: ' + JSON.stringify(stored));
            expect(label === '50%', 'the guitar slider says "' + label + '"');
          });
        });
      }).finally(function () {
        frame.remove();
        if (saved == null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, saved);
      });
    });

  check('Guitar demo', 'The tuning switch changes the shapes, and is remembered',
    'DADGAD to begin with. Switching must redraw the shapes for the new tuning and play them, and come back the same next visit.',
    function () {
      var KEY = 'kesh.demo.tuning', saved = localStorage.getItem(KEY);
      localStorage.removeItem(KEY);
      var frame = document.createElement('iframe');
      frame.src = '../guitar/';
      frame.style.cssText = 'position:absolute;left:-10000px;top:0;border:0;width:375px;height:812px';
      document.body.appendChild(frame);
      return new Promise(function (resolve, reject) {
        var t = setTimeout(function () { reject(new Error('the demo page did not load')); }, 10000);
        frame.onload = function () { clearTimeout(t); setTimeout(resolve, 200); };
      }).then(function () {
        var doc = frame.contentDocument, win = frame.contentWindow, D = win.KESH_DEMO;
        function first() { return doc.querySelector('#shapes svg').getAttribute('aria-label'); }
        var start = D.tuning(), startShape = first();
        doc.querySelector('#tunings [data-tuning="standard"]').click();
        var after = D.tuning(), afterShape = first(), stored = win.localStorage.getItem(KEY);
        var label = doc.getElementById('shapes-tuning').textContent;
        expect(start === 'dadgad' && startShape === 'G/D chord shape', 'a first visit starts in ' + start + ' showing ' + startShape);
        expect(after === 'standard' && afterShape === 'G chord shape', 'switching gave ' + after + ' showing ' + afterShape);
        expect(label === 'Standard', 'the shapes are labelled ' + label);
        expect(stored === 'standard', 'the choice was saved as ' + stored);
      }).finally(function () {
        frame.remove();
        if (saved == null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, saved);
      });
    });

  check('Guitar demo', 'The bodhrán is not buried under the guitar',
    'It was: 4 dB under overall, and its stick click, the part the ear picks a drum out by, 34 dB under the guitar in its own band. Now level overall, the click lifted.',
    function () {
      var frame = document.createElement('iframe');
      frame.src = '../guitar/';
      frame.style.cssText = 'position:absolute;left:-10000px;top:0;border:0;width:375px;height:812px';
      document.body.appendChild(frame);
      var SRG = 48000, q = 60 / 100 / 3, BARS = 8, K = window.KESH;
      function level(d, lo, hi) {                 // average level in a band, dB
        var o = new OfflineAudioContext(1, d.length, SRG), b = o.createBuffer(1, d.length, SRG);
        b.getChannelData(0).set(d);
        var s = o.createBufferSource(); s.buffer = b; var node = s;
        [[lo, 'highpass'], [lo, 'highpass'], [hi, 'lowpass'], [hi, 'lowpass']].forEach(function (f) {
          if (!f[0]) return;
          var bq = o.createBiquadFilter(); bq.type = f[1]; bq.frequency.value = f[0]; node.connect(bq); node = bq;
        });
        node.connect(o.destination); s.start();
        return o.startRendering().then(function (r) {
          var x = r.getChannelData(0), e = 0; for (var i = 0; i < x.length; i++) e += x[i] * x[i];
          return 10 * Math.log10(e / x.length);
        });
      }
      return new Promise(function (resolve, reject) {
        var t = setTimeout(function () { reject(new Error('the demo page did not load')); }, 10000);
        frame.onload = function () { clearTimeout(t); setTimeout(resolve, 200); };
      }).then(function () {
        var D = frame.contentWindow.KESH_DEMO, MIX = D.MIX, lift = D.DRUM && D.DRUM.lift;
        var len = Math.ceil(SRG * (BARS * 6 * q + 2));
        var og = new OfflineAudioContext(1, len, SRG), g = new window.GTR.Guitar(og, og.destination);
        g.level.gain.value = MIX.guitar;
        var notes = {};
        ['G', 'D', 'C', 'Em'].forEach(function (c) { K.voicing(c, 'dadgad').forEach(function (m) { if (m != null) notes[m] = 1; }); });
        g.prepare(Object.keys(notes).map(Number));
        var od = new OfflineAudioContext(1, len, SRG), dest = od.destination;
        if (lift) {
          var pk = od.createBiquadFilter(); pk.type = 'peaking';
          pk.frequency.value = lift.f; pk.Q.value = lift.q; pk.gain.value = lift.gain; pk.connect(od.destination); dest = pk;
        }
        var drum = new TRAD.Bodhran(od, dest);
        drum.master.gain.value = MIX.drum; drum.setRoom(0.1);
        var t = 0.05;
        ['G', 'D', 'C', 'D', 'G', 'D', 'C', 'G'].forEach(function (c) {
          var v = K.voicing(c, 'dadgad');
          g.strum(v, t, 'D', 1); g.strum(v, t + 2 * q, 'U', 0.5, 4); g.strum(v, t + 3 * q, 'D', 0.8); g.strum(v, t + 5 * q, 'U', 0.5, 4);
          drum.hit('bass', t, 1); drum.hit('treble', t + 2 * q, 0.46); drum.hit('bass', t + 3 * q, 1); drum.hit('treble', t + 5 * q, 0.46);
          t += 6 * q;
        });
        return Promise.all([og.startRendering(), od.startRendering()]).then(function (r) {
          var gd = r[0].getChannelData(0), dd = r[1].getChannelData(0);
          return Promise.all([level(gd), level(dd), level(gd, 1500, 5000), level(dd, 1500, 5000)]);
        }).then(function (L) {
          var overall = L[1] - L[0], click = L[3] - L[2];
          expect(overall > -2, 'the bodhrán is ' + round(-overall) + ' dB under the guitar overall');
          expect(click > -24, 'its stick click is ' + round(-click) + ' dB under the guitar at 1.5–5 kHz');
        });
      }).finally(function () { frame.remove(); });
    });

  check('Guitar demo', 'It wakes a silent Safari tab the way the app does',
    'The demo only resumed its audio, and went silent in Mac Safari after sleep as the app once did. Both now share js/wake.js: resume on every press, and in Mac Safari the sound goes out through an audio element, started from each press.',
    function () {
      function run(ua, touch) {
        var first = 'Object.defineProperty(Navigator.prototype, "userAgent", { configurable: true, get: function () { return ' +
          JSON.stringify(ua) + '; } });' +
          'Object.defineProperty(Navigator.prototype, "maxTouchPoints", { configurable: true, get: function () { return ' + touch + '; } });' +
          'window.__plays = 0; HTMLMediaElement.prototype.play = function () { window.__plays++; return Promise.resolve(); };' +
          'window.__resumes = 0; Object.defineProperty(BaseAudioContext.prototype, "state", { configurable: true, get: function () { return "running"; } });' +
          'var real = AudioContext.prototype.resume; AudioContext.prototype.resume = function () { window.__resumes++; return real.call(this); };';
        var frame = document.createElement('iframe');
        frame.style.cssText = 'position:absolute;left:-10000px;top:0;border:0;width:375px;height:812px';
        document.body.appendChild(frame);
        return text('../guitar/').then(function (html) {
          return new Promise(function (resolve, reject) {
            var t = setTimeout(function () { reject(new Error('the demo page did not load')); }, 10000);
            frame.onload = function () { clearTimeout(t); setTimeout(resolve, 200); };
            frame.srcdoc = html.replace('<head>', '<head><base href="' + new URL('../guitar/', location.href).href +
              '"><script>' + first + '<\/script>');
          });
        }).then(function () {
          var win = frame.contentWindow, play = frame.contentDocument.getElementById('play');
          play.click();                      // start
          var a = { plays: win.__plays, resumes: win.__resumes };
          play.click(); play.click();        // stop, start again
          a.plays2 = win.__plays; a.resumes2 = win.__resumes;
          play.click();
          return a;
        }).finally(function () { frame.remove(); });
      }
      var SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
      var CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
      return run(SAFARI, 0).then(function (mac) {
        return run(CHROME, 0).then(function (chrome) {
          expect(mac.resumes >= 1 && mac.resumes2 > mac.resumes, 'Play did not ask the sound to start each time: ' + JSON.stringify(mac));
          expect(mac.plays === 1 && mac.plays2 === 2, 'in Mac Safari the audio element was not started on each Play: ' + JSON.stringify(mac));
          expect(chrome.plays === 0, 'Chrome played an audio element too');
        });
      });
    });

  check('Guitar demo', 'While it plays, it says whether it is making sound, or not',
    'The same line as the app, and it must also say so when the page goes quiet inside: that is the case it is there to catch.',
    function () {
      function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
      var frame = document.createElement('iframe');
      frame.src = '../guitar/';
      frame.style.cssText = 'position:absolute;left:-10000px;top:0;border:0;width:375px;height:812px';
      document.body.appendChild(frame);
      return new Promise(function (resolve, reject) {
        var t = setTimeout(function () { reject(new Error('the demo page did not load')); }, 10000);
        frame.onload = function () { clearTimeout(t); setTimeout(resolve, 200); };
      }).then(function () {
        var doc = frame.contentDocument, D = frame.contentWindow.KESH_DEMO, el = doc.getElementById('sound-check');
        var play = doc.getElementById('play'), n = {};
        play.click();
        return wait(3500).then(function () {
          n.playing = el.textContent;
          D.audio().run.disconnect();                  // the page's sound cut off inside it
          return wait(4000);
        }).then(function () {
          n.cut = el.textContent;
          play.click();
          return wait(1500);
        }).then(function () {
          n.stopped = el.textContent;
          expect(/making sound \(-?\d+ dB\)/.test(n.playing), 'while playing it says "' + n.playing + '"');
          expect(/making no sound/.test(n.cut), 'with its sound cut off inside the page, it says "' + n.cut + '"');
          expect(n.stopped === '', 'stopped, it still says "' + n.stopped + '"');
        });
      }).finally(function () { frame.remove(); });
    });

  check('Guitar demo', 'Stopped, it lets go of the speaker',
    'The same as the app: left running after Stop, the demo kept the speaker open, and the Mac awake, for as long as the tab stayed open.',
    function () {
      var first = 'window.__suspends = 0; Object.defineProperty(BaseAudioContext.prototype, "state", { configurable: true, get: function () { return "running"; } });' +
        'AudioContext.prototype.suspend = function () { window.__suspends++; return Promise.resolve(); };';
      function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
      var frame = document.createElement('iframe');
      frame.style.cssText = 'position:absolute;left:-10000px;top:0;border:0;width:375px;height:812px';
      document.body.appendChild(frame);
      return text('../guitar/').then(function (html) {
        return new Promise(function (resolve, reject) {
          var t = setTimeout(function () { reject(new Error('the demo page did not load')); }, 10000);
          frame.onload = function () { clearTimeout(t); setTimeout(resolve, 200); };
          frame.srcdoc = html.replace('<head>', '<head><base href="' + new URL('../guitar/', location.href).href +
            '"><script>' + first + '<\/script>');
        });
      }).then(function () {
        var win = frame.contentWindow, play = frame.contentDocument.getElementById('play'), n = {};
        win.TRAD.REST_AFTER = 0.15;
        play.click(); play.click(); play.click();   // play, stop, and play again before it rests
        return wait(400).then(function () {
          n.playing = win.__suspends;
          play.click();                             // stop
          return wait(400);
        }).then(function () {
          n.stopped = win.__suspends;
          expect(n.playing === 0, 'it let go of the speaker while playing');
          expect(n.stopped === 1, 'stopped, it kept hold of the speaker');
        });
      }).finally(function () { frame.remove(); });
    });

  check('Guitar demo', 'Hidden behind another tab, it plans ahead, and Stop drops the lot',
    'Safari slows a hidden tab’s timers to about once a second, and the demo stumbled. Hidden, it hands notes seconds ahead; Stop must drop them or they come back with the next Play.',
    function () {
      var first = 'window.__hidden = false;' +
          'Object.defineProperty(Document.prototype, "hidden", { configurable: true, get: function () { return window.__hidden; } });' +
          'Object.defineProperty(Document.prototype, "visibilityState", { configurable: true, get: function () { return window.__hidden ? "hidden" : "visible"; } });' +
          'window.__lead = 0; var os = OscillatorNode.prototype.start;' +
          'OscillatorNode.prototype.start = function (w) { if (w) window.__lead = Math.max(window.__lead, w - this.context.currentTime); return os.apply(this, arguments); };';
      var frame = document.createElement('iframe');
      frame.style.cssText = 'position:absolute;left:-10000px;top:0;border:0;width:375px;height:812px';
      document.body.appendChild(frame);
      return text('../guitar/').then(function (html) {
        return new Promise(function (resolve, reject) {
          var t = setTimeout(function () { reject(new Error('the demo page did not load')); }, 10000);
          frame.onload = function () { clearTimeout(t); setTimeout(resolve, 200); };
          frame.srcdoc = html.replace('<head>', '<head><base href="' + new URL('../guitar/', location.href).href +
            '"><script>' + first + '<\/script>');
        });
      }).then(function () {
        var win = frame.contentWindow, doc = frame.contentDocument, D = win.KESH_DEMO;
        doc.getElementById('play').click();
        var shown = win.__lead;
        win.__hidden = true; doc.dispatchEvent(new win.Event('visibilitychange'));
        var hidden = win.__lead, ahead = D.ahead(), A = D.audio();
        var queued = A.guitar.queued.filter(function (q) { return q.t > A.ctx.currentTime + 1; }).length;
        doc.getElementById('play').click();          // Stop
        var left = A.guitar.queued.filter(function (q) { return q.t > A.ctx.currentTime; }).length;
        expect(shown < 1, 'on screen it already handed notes ' + round(shown, 2) + ' s ahead');
        expect(ahead === window.TRAD.HIDDEN_AHEAD && hidden > 3, 'hidden, it handed notes only ' + round(hidden, 2) + ' s ahead');
        expect(queued > 0, 'no guitar notes were queued ahead, so this proves nothing');
        expect(left === 0, left + ' guitar notes were still queued after Stop');
      }).finally(function () { frame.remove(); });
    });

  check('Guitar demo', 'Bass runs walk up into the next chord',
    'Three single notes, a step apart, climbing to a note of the chord they lead into, and playable on the strings of the tuning in use.',
    function () {
      var K = window.KESH, bad = [], found = 0;
      ['standard', 'dadgad'].forEach(function (tn) {
        ['A', 'B'].forEach(function (p) {
          K.parts[p].forEach(function (bar, i) {
            var run = K.runFrom(p, i, tn);
            if (!run) return;
            found++;
            var where = tn + ' ' + p + (i + 1) + ' into ' + run.to + ': ';
            var next = K.parts[p][i + 1].chords[0], shape = K.voicing(next, tn);
            if (run.to !== next) bad.push(where + 'the next bar starts on ' + next);
            if (run.notes.length !== 3) bad.push(where + run.notes.length + ' notes');
            for (var k = 1; k < run.notes.length; k++) {
              var step = run.notes[k] - run.notes[k - 1];
              if (step < 1 || step > 2) bad.push(where + 'a leap of ' + step + ' semitones');
            }
            var last = run.notes[run.notes.length - 1];
            var lands = shape.some(function (m) { return m != null && m - last >= 1 && m - last <= 2; });
            if (!lands) bad.push(where + 'the last note does not step onto the chord');
            if (run.strings.some(function (s) { return s < 0; })) bad.push(where + 'a note no string can play within five frets');
          });
        });
      });
      expect(found === 8, found + ' runs found, not 8 (bars 1 and 4 of each part, in two tunings)');
      expect(bad.length === 0, bad.join('\n'));
    });

  check('Guitar demo', 'A picked bass note settles like a guitar string, not a piano',
    'Picked alone, the strum voice kept its overtones as strong half a second in as at the pick, like a piano; then it read bright and weak for a bass line. A bass run should settle warm, be dark, and sit a little above the strums.',
    function () {
      var SRG = 48000, G = window.GTR, K = window.KESH, q = 60 / 100 / 3;
      function goertzel(d, f, a, b) {
        var s = Math.floor(a * SRG), e = Math.floor(b * SRG), k = 2 * Math.cos(2 * Math.PI * f / SRG), q1 = 0, q2 = 0;
        for (var i = s; i < e; i++) { var q0 = k * q1 - q2 + d[i]; q2 = q1; q1 = q0; }
        return Math.sqrt(Math.max(0, q1 * q1 + q2 * q2 - k * q1 * q2));
      }
      function seg(d, a, b) { var s = 0, n = 0; for (var i = Math.floor(a * SRG); i < Math.floor(b * SRG); i++) { s += d[i] * d[i]; n++; } return 10 * Math.log10(s / n); }
      var one = new OfflineAudioContext(1, SRG * 1.2, SRG), g = new G.Guitar(one, one.destination);
      g.prepare([45]); if (g.preparePicks) g.preparePicks([45]);
      g.pick(1, 45, 0.02, 1);
      var run = new OfflineAudioContext(1, SRG * 3, SRG), g2 = new G.Guitar(run, run.destination);
      var all = {};
      ['G', 'D'].forEach(function (c) { K.voicing(c, 'dadgad').forEach(function (m) { if (m != null) all[m] = 1; }); });
      g2.prepare(Object.keys(all).map(Number)); if (g2.preparePicks) g2.preparePicks(K.runs.dadgad.D);
      var r = K.runFrom('A', 0, 'dadgad'), t0 = 0.05;
      g2.strum(K.voicing('G', 'dadgad'), t0, 'D', 1); g2.strum(K.voicing('G', 'dadgad'), t0 + 2 * q, 'U', 0.5, 4);
      r.notes.forEach(function (m, i) { g2.pick(r.strings[i], m, t0 + (3 + i) * q, 0.9); });
      return Promise.all([one.startRendering(), run.startRendering()]).then(function (b) {
        var d = b[0].getChannelData(0), f0 = G.hz(45);
        function over(a, z, k) { return 20 * Math.log10(goertzel(d, f0 * k, a, z) / goertzel(d, f0, a, z)); }
        var fell6 = over(0.03, 0.13, 6) - over(0.4, 0.5, 6), fell8 = over(0.03, 0.13, 8) - over(0.4, 0.5, 8);
        var best = 0, bf = 0;
        for (var f = f0 * 0.98; f <= f0 * 1.02; f += f0 / 4000) { var v = goertzel(d, f, 0.2, 1.0); if (v > best) { best = v; bf = f; } }
        var cents = 1200 * Math.log2(bf / f0), rd = b[1].getChannelData(0);
        var runVsStrum = seg(rd, t0 + 3 * q, t0 + 6 * q) - seg(rd, t0, t0 + 3 * q);
        // How bright: energy above 800 Hz against below 400, in its first third of a second.
        var hi = 0, lo = 0, s0 = Math.floor(0.02 * SRG), s1 = Math.floor(0.35 * SRG);
        for (var fb = 50; fb <= 6000; fb += 25) {
          var kk = 2 * Math.cos(2 * Math.PI * fb / SRG), a1 = 0, a2 = 0;
          for (var j = s0; j < s1; j++) { var a0 = kk * a1 - a2 + d[j]; a2 = a1; a1 = a0; }
          var mg = Math.max(0, a1 * a1 + a2 * a2 - kk * a1 * a2);
          if (fb >= 800) hi += mg; else if (fb < 400) lo += mg;
        }
        var bright = 10 * Math.log10(hi / lo);
        expect(fell6 > 6 && fell8 > 8, 'half a second in, the 6th and 8th overtones fell only ' + round(fell6) + ' and ' + round(fell8) + ' dB');
        expect(Math.abs(cents) < 3, 'the picked A is ' + round(cents) + ' cents out');
        expect(bright < -14, 'the picked A is bright: its top is only ' + round(-bright) + ' dB under its bottom');
        expect(runVsStrum > 0, 'the run is ' + round(-runVsStrum) + ' dB under the strummed beat before it');
      });
    });

  check('Guitar demo', 'A bass run note starts from a thumb pluck, not a burst of noise',
    'Started from random noise, a lone bass note had jagged overtones that jumped about (the low D’s 2nd louder than its fundamental) and every rendering differed: part of why it sounded synthesised. A pluck’s overtones step down in order, and every pluck of a string sounds alike.',
    function () {
      var SRG = 48000, G = window.GTR, bad = [];
      function goertzel(d, f, a, b) {
        var s = Math.floor(a * SRG), e = Math.floor(b * SRG), k = 2 * Math.cos(2 * Math.PI * f / SRG), q1 = 0, q2 = 0;
        for (var i = s; i < e; i++) { var q0 = k * q1 - q2 + d[i]; q2 = q1; q1 = q0; }
        return Math.sqrt(Math.max(0, q1 * q1 + q2 * q2 - k * q1 * q2));
      }
      var chain = Promise.resolve();
      [38, 45].forEach(function (m) {
        chain = chain.then(function () {
          var o = new OfflineAudioContext(1, SRG, SRG), g = new G.Guitar(o, o.destination);
          g.preparePicks ? g.preparePicks([m]) : g.prepare([m]);
          var list = (g.picks && g.picks[m]) || g.notes[m], f0 = G.hz(m);
          var levels = list.map(function (p) {
            var d = p.buffer.getChannelData(0), out = [];
            for (var k = 1; k <= 6; k++) out.push(20 * Math.log10(goertzel(d, f0 * k, 0.03, 0.23) + 1e-12));
            return out;
          });
          var a = levels[0], b = levels[1] || levels[0];
          if (!(a[0] > a[1] && a[1] > a[2])) bad.push('MIDI ' + m + ': the first three overtones do not step down: ' + a.slice(0, 3).map(function (x) { return round(x - a[0]); }).join(', '));
          var diff = 0;
          for (var k = 0; k < 6; k++) diff += Math.abs((a[k] - a[0]) - (b[k] - b[0]));
          diff /= 6;
          if (diff > 1.5) bad.push('MIDI ' + m + ': its two renderings differ by ' + round(diff) + ' dB an overtone');
        });
      });
      return chain.then(function () { expect(bad.length === 0, bad.join('\n')); });
    });

  check('Guitar demo', 'Open strings ring in sympathy, and DADGAD rings more',
    'On a real guitar the open strings hum along with the notes they share, which is much of DADGAD’s sound. Without it the two tunings differed only in which notes were played. Only open strings may ring; a fretted or muted one cannot.',
    function () {
      var SRG = 48000, K = window.KESH, G = window.GTR, q = 60 / 100 / 3, chords = ['G', 'D', 'C', 'D'];
      function seg(d, a, b) { var s = 0, n = 0; for (var i = Math.floor(a * SRG); i < Math.floor(b * SRG); i++) { s += d[i] * d[i]; n++; } return 10 * Math.log10(s / n + 1e-30); }
      function render(tn, mute) {
        var o = new OfflineAudioContext(1, Math.ceil(SRG * (chords.length * 6 * q + 1)), SRG), g = new G.Guitar(o, o.destination);
        g.sympathy = true;
        if (mute) g._string = function () {};          // the struck strings silent: the hum alone
        var notes = {};
        chords.forEach(function (c) { K.voicing(c, tn).forEach(function (m) { if (m != null) notes[m] = 1; }); });
        g.prepare(Object.keys(notes).map(Number));
        var open = K.tunings[tn].strings, t = 0.05, wrong = [];
        chords.forEach(function (c) {
          var v = K.voicing(c, tn);
          g.strum(v, t, 'D', 1, 4, open); g.strum(v, t + 2 * q, 'U', 0.5, 4, open);
          for (var s = 0; s < 6; s++) if (g.sym[s] && v[s] !== open[s]) wrong.push(c + ' string ' + (s + 1));
          g.strum(v, t + 3 * q, 'D', 0.8, 4, open); g.strum(v, t + 5 * q, 'U', 0.5, 4, open);
          t += 6 * q;
        });
        return o.startRendering().then(function (b) { return { d: b.getChannelData(0), end: t, wrong: wrong }; });
      }
      return Promise.all([render('standard'), render('standard', true), render('dadgad'), render('dadgad', true)]).then(function (r) {
        var std = seg(r[1].d, 0.05, r[1].end) - seg(r[0].d, 0.05, r[0].end);
        var dad = seg(r[3].d, 0.05, r[3].end) - seg(r[2].d, 0.05, r[2].end);
        var wrong = r[0].wrong.concat(r[2].wrong);
        expect(wrong.length === 0, 'a fretted or muted string rang in sympathy: ' + wrong.join(', '));
        expect(dad > -16 && std > -20, 'the hum is too faint to hear: ' + round(-dad) + ' dB under the playing in DADGAD, ' + round(-std) + ' in standard');
        expect(dad < -5, 'the hum is ' + round(-dad) + ' dB under the playing in DADGAD: it would swamp the chords');
        expect(dad - std > 2, 'DADGAD hums only ' + round(dad - std) + ' dB more than standard tuning');
      });
    });

  check('Guitar demo', 'In DADGAD the low D drones under every chord',
    'What DADGAD backing is known for: the open low D sounding under G, C and Em as well as D. The first shapes left it out of G and C, 35 to 44 dB down there, and DADGAD was hard to tell from standard.',
    function () {
      var SRG = 48000, K = window.KESH, G = window.GTR, q = 60 / 100 / 3;
      var chords = ['G', 'D', 'C', 'D', 'G', 'C', 'Em', 'D'];
      function level(d, f, a, b) {
        var s = Math.floor(a * SRG), e = Math.floor(b * SRG), k = 2 * Math.cos(2 * Math.PI * f / SRG), q1 = 0, q2 = 0;
        for (var i = s; i < e; i++) { var q0 = k * q1 - q2 + d[i]; q2 = q1; q1 = q0; }
        return 2 * Math.sqrt(Math.max(0, q1 * q1 + q2 * q2 - k * q1 * q2)) / (e - s);
      }
      function rms(d, a, b) { var s = 0, n = 0; for (var i = Math.floor(a * SRG); i < Math.floor(b * SRG); i++) { s += d[i] * d[i]; n++; } return Math.sqrt(s / n); }
      function render(tn) {
        var o = new OfflineAudioContext(1, Math.ceil(SRG * (chords.length * 6 * q + 1)), SRG), g = new G.Guitar(o, o.destination);
        var notes = {};
        chords.forEach(function (c) { K.voicing(c, tn).forEach(function (m) { if (m != null) notes[m] = 1; }); });
        g.prepare(Object.keys(notes).map(Number));
        var open = K.tunings[tn].strings, t = 0.05, bars = [];
        chords.forEach(function (c) {
          var v = K.voicing(c, tn);
          g.strum(v, t, 'D', 1, 4, open); g.strum(v, t + 2 * q, 'U', 0.5, 4, open);
          g.strum(v, t + 3 * q, 'D', 0.8, 4, open); g.strum(v, t + 5 * q, 'U', 0.5, 4, open);
          bars.push(t); t += 6 * q;
        });
        return o.startRendering().then(function (b) {
          var d = b.getChannelData(0);
          // The low D against the whole guitar, bar by bar, in dB.
          return bars.map(function (s) { return 20 * Math.log10(level(d, G.hz(38), s + 0.05, s + 6 * q) / rms(d, s + 0.05, s + 6 * q)); });
        });
      }
      return Promise.all([render('dadgad'), render('standard')]).then(function (r) {
        var faint = [], loud = [];
        chords.forEach(function (c, i) {
          if (r[0][i] < -15) faint.push(c + ' (bar ' + (i + 1) + '): ' + round(-r[0][i]) + ' dB under');
          if (r[1][i] > -25) loud.push(c + ' (bar ' + (i + 1) + '): ' + round(-r[1][i]) + ' dB under');
        });
        expect(faint.length === 0, 'in DADGAD the low D is too faint under ' + faint.join(', '));
        expect(loud.length === 0, 'standard tuning has a low D droning too, so the tunings sound alike: ' + loud.join(', '));
        var oc = new OfflineAudioContext(1, 128, SRG);
        expect(new G.Guitar(oc, oc.destination).ringOn === undefined, 'the guitar has a ring-through setting again (dropped in 1.9.0)');
        return fetch('../guitar/', { cache: 'no-store' }).then(function (res) { return res.text(); });
      }).then(function (html) {
        expect(html.indexOf('id="ringon"') === -1, 'the page has a ring-through switch again (dropped in 1.9.0)');
      });
    });

  check('Guitar demo', 'A fretted string the next chord leaves out stops',
    'Lifting the finger stops a fretted string. In standard tuning, G to C: the low G, fretted, is not in the C and must not ring on under it.',
    function () {
      var SRG = 48000, K = window.KESH, G = window.GTR, q = 60 / 100 / 3;
      function level(d, f, a, b) {
        var s = Math.floor(a * SRG), e = Math.floor(b * SRG), k = 2 * Math.cos(2 * Math.PI * f / SRG), q1 = 0, q2 = 0;
        for (var i = s; i < e; i++) { var q0 = k * q1 - q2 + d[i]; q2 = q1; q1 = q0; }
        return Math.sqrt(Math.max(0, q1 * q1 + q2 * q2 - k * q1 * q2)) / (e - s);
      }
      var o = new OfflineAudioContext(1, SRG * 3, SRG), g = new G.Guitar(o, o.destination), tn = 'standard';
      var notes = {};
      ['G', 'C'].forEach(function (c) { K.voicing(c, tn).forEach(function (m) { if (m != null) notes[m] = 1; }); });
      g.prepare(Object.keys(notes).map(Number));
      var open = K.tunings[tn].strings, a = K.voicing('G', tn), b = K.voicing('C', tn), t0 = 0.05, t1 = t0 + 6 * q;
      g.strum(a, t0, 'D', 1, 4, open); g.strum(a, t0 + 3 * q, 'D', 0.8, 4, open);
      g.strum(b, t1, 'D', 1, 4, open); g.strum(b, t1 + 3 * q, 'D', 0.8, 4, open);
      return o.startRendering().then(function (r) {
        var d = r.getChannelData(0), f = G.hz(43);
        var fell = 20 * Math.log10(level(d, f, t1 + 0.1, t1 + 0.6) / level(d, f, t1 - 0.5, t1));
        expect(fell < -25, 'the fretted low G rang on under the C (' + round(fell) + ' dB)');
      });
    });

  check('Guitar demo', 'The sympathy switch works, and is remembered',
    'On to begin with. Off must stop the hum, and the choice come back the same next visit.',
    function () {
      var KEY = 'kesh.demo.sympathy', saved = localStorage.getItem(KEY);
      localStorage.removeItem(KEY);
      var frame = document.createElement('iframe');
      frame.src = '../guitar/';
      frame.style.cssText = 'position:absolute;left:-10000px;top:0;border:0;width:375px;height:812px';
      document.body.appendChild(frame);
      return new Promise(function (resolve, reject) {
        var t = setTimeout(function () { reject(new Error('the demo page did not load')); }, 10000);
        frame.onload = function () { clearTimeout(t); setTimeout(resolve, 200); };
      }).then(function () {
        var win = frame.contentWindow, doc = frame.contentDocument, D = win.KESH_DEMO;
        var startOn = D.sympathy();
        doc.getElementById('play').click();
        var guitarOn = D.audio().guitar.sympathy;
        doc.querySelector('#sympathy [data-sympathy="off"]').click();
        var guitarOff = D.audio().guitar.sympathy;
        doc.getElementById('play').click();
        var stored = win.localStorage.getItem(KEY);
        expect(startOn && guitarOn === true, 'a first visit does not start with the strings ringing in sympathy');
        expect(guitarOff === false, 'switching it off did not reach the guitar');
        expect(stored === 'off', 'the choice was saved as ' + stored);
      }).finally(function () {
        frame.remove();
        if (saved == null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, saved);
      });
    });

  check('Guitar demo', 'The page plays no bass runs, for now',
    'Taken off at the user’s request in guitar demo 1.6.0 (the engine and its checks are kept for later). This makes sure they don’t come back by accident.',
    function () {
      // Hidden, so the demo hands several seconds of notes to the audio at once.
      var first = 'window.__hidden = true;' +
          'Object.defineProperty(Document.prototype, "hidden", { configurable: true, get: function () { return window.__hidden; } });' +
          'Object.defineProperty(Document.prototype, "visibilityState", { configurable: true, get: function () { return window.__hidden ? "hidden" : "visible"; } });';
      var frame = document.createElement('iframe');
      frame.style.cssText = 'position:absolute;left:-10000px;top:0;border:0;width:375px;height:812px';
      document.body.appendChild(frame);
      return text('../guitar/').then(function (html) {
        return new Promise(function (resolve, reject) {
          var t = setTimeout(function () { reject(new Error('the demo page did not load')); }, 10000);
          frame.onload = function () { clearTimeout(t); setTimeout(resolve, 200); };
          frame.srcdoc = html.replace('<head>', '<head><base href="' + new URL('../guitar/', location.href).href +
            '"><script>' + first + '<\/script>');
        });
      }).then(function () {
        var win = frame.contentWindow, doc = frame.contentDocument;
        var picks = 0, real = win.GTR.Guitar.prototype.pick;
        win.GTR.Guitar.prototype.pick = function () { picks++; return real.apply(this, arguments); };
        var bpm = doc.getElementById('bpm'); bpm.value = 130; bpm.dispatchEvent(new win.Event('input'));
        doc.getElementById('play').click();
        var played = picks;
        doc.getElementById('play').click();
        expect(played === 0, played + ' bass-run notes were played in the first bars');
        expect(!doc.getElementById('runs') && !doc.querySelector('.run-mark'), 'the page still shows bass runs');
      }).finally(function () { frame.remove(); });
    });

  check('Guitar demo', 'It shows its own version, and the notes cover it',
    'The quickest way to tell whether a phone has the latest demo. Bump the demo’s version? Add it to CHANGELOG.md and the release notes in the same change.',
    function () {
      var frame = document.createElement('iframe');
      frame.src = '../guitar/';
      frame.style.cssText = 'position:absolute;left:-10000px;top:0;border:0;width:375px;height:812px';
      document.body.appendChild(frame);
      return new Promise(function (resolve, reject) {
        var t = setTimeout(function () { reject(new Error('the demo page did not load')); }, 10000);
        frame.onload = function () { clearTimeout(t); setTimeout(resolve, 200); };
      }).then(function () {
        var doc = frame.contentDocument, v = frame.contentWindow.KESH_DEMO && frame.contentWindow.KESH_DEMO.VERSION;
        expect(!!v, 'the demo has no version');
        expect(doc.getElementById('demo-version').textContent === 'v' + v, 'the title shows "' + doc.getElementById('demo-version').textContent + '"');
        expect(doc.getElementById('foot-version').textContent.indexOf(v) !== -1, 'the foot of the page does not show ' + v);
        return Promise.all([text('../CHANGELOG.md'), text('../release-notes/')]).then(function (r) {
          expect(r[0].indexOf('### Guitar demo ' + v + ' ') !== -1, 'CHANGELOG.md has no entry for guitar demo ' + v);
          expect(r[1].indexOf('<span class="ver">Guitar demo ' + v + '</span>') !== -1, 'the release notes have no entry for guitar demo ' + v);
        });
      }).finally(function () { frame.remove(); });
    });

  /* ================================================================
   * Session Players
   * ================================================================ */
  var PL = window.PLAYERS;
  var FIX = '../tests/fixtures/thesession-';
  function json(url) { return text(url).then(function (t) { return JSON.parse(t); }); }
  function layOf(j, i) { return PL.layout(j.settings[i || 0].abc, { key: j.settings[i || 0].key, meter: j.type === 'jig' ? '6/8' : '4/4' }); }
  /* The Session Players page in a frame, its saved state put back after. */
  function withPlayers(fn) {
    var keys = ['players.current', 'players.tuning', 'players.sympathy', 'players.volume'], saved = {};
    keys.forEach(function (k) { saved[k] = localStorage.getItem(k); localStorage.removeItem(k); });
    var frame = document.createElement('iframe');
    frame.src = '../players/';
    frame.style.cssText = 'position:absolute;left:-10000px;top:0;border:0;width:420px;height:900px';
    document.body.appendChild(frame);
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () { reject(new Error('the Session Players page did not load')); }, 10000);
      frame.onload = function () { clearTimeout(t); setTimeout(resolve, 200); };
    }).then(function () {
      return fn(frame.contentWindow, frame.contentDocument);
    }).finally(function () {
      try { var p = frame.contentDocument.getElementById('play'); if (p.classList.contains('playing')) p.click(); } catch (e) {}
      frame.remove();
      keys.forEach(function (k) { if (saved[k] == null) localStorage.removeItem(k); else localStorage.setItem(k, saved[k]); });
    });
  }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  check('Session Players', 'It reads The Kesh from the Session note for note',
    'The Session’s setting 1 of The Kesh, read by Session Players, must be the melody the guitar demo plays: every note, every length, AABB, 32 bars.',
    function () {
      return json(FIX + 'the-kesh.json').then(function (j) {
        var lay = layOf(j, 0), mine = [], demo = [];
        lay.timeline.forEach(function (tb) { tb.notes.forEach(function (n) { mine.push(n.midi + ':' + n.dur / PL.TPQ); }); });
        window.KESH.form().forEach(function (bar) { bar.notes.forEach(function (n) { demo.push(n.midi + ':' + n.len); }); });
        expect(lay.timeline.length === 32, lay.timeline.length + ' bars once through, not 32');
        expect(lay.slots.length === 16 && Math.max.apply(null, lay.slots.map(function (s) { return s.part; })) === 1,
               lay.slots.length + ' different bars in ' + (Math.max.apply(null, lay.slots.map(function (s) { return s.part; })) + 1) + ' parts, not 16 in 2');
        var at = -1;
        for (var i = 0; i < Math.max(mine.length, demo.length); i++) if (mine[i] !== demo[i]) { at = i; break; }
        expect(at === -1, 'note ' + (at + 1) + ' differs: ' + mine[at] + ' read, the demo plays ' + demo[at]);
      });
    });

  check('Session Players', 'Repeats, endings and pickups come out as played',
    'First and second endings take turns; a :| with no |: repeats its own part (the Swallowtail’s B part); a pickup comes before the first downbeat, and every bar after it starts on the beat.',
    function () {
      return Promise.all([json(FIX + 'out-on-the-ocean.json'), json(FIX + 'the-swallowtail.json'), json(FIX + 'cooleys.json')]).then(function (r) {
        var ocean = layOf(r[0]), swallow = layOf(r[1]), cooley = layOf(r[2], 0);
        var o = ocean.timeline;
        expect(o.length === 32, 'Out on the Ocean is ' + o.length + ' bars once through, not 32');
        var w8 = ocean.bars[o[7].written], w16 = ocean.bars[o[15].written];
        expect(w8.ending === 1 && w16.ending === 2, 'Out on the Ocean’s endings: bar 8 is ending ' + w8.ending + ', bar 16 ending ' + w16.ending);
        var s = swallow.timeline;
        expect(s.length === 32, 'the Swallowtail is ' + s.length + ' bars once through, not 32');
        expect(s[16].slot === s[24].slot && s[16].slot !== s[0].slot, 'the Swallowtail’s B part does not repeat itself');
        expect(cooley.pickup.length === 1 && cooley.pickup[0].tick === -2 * PL.TPQ, 'Cooley’s pickup is ' + JSON.stringify(cooley.pickup));
        var off = cooley.timeline.filter(function (tb) { return !/@0$/.test(tb.slot); }).length;
        expect(off === 0 && cooley.timeline.length === 32, 'after Cooley’s pickup ' + off + ' bars are off the beat (' + cooley.timeline.length + ' bars)');
      });
    });

  check('Session Players', 'Keys and accidentals come out right',
    'The Session names keys like “Edorian”: E dorian has F and C sharp, G minor B and E flat, D mixolydian only F sharp. An accidental lasts to the end of its bar.',
    function () {
      function sig(k) { var s = PL.parseKey(k).sig; return Object.keys(s).sort().map(function (l) { return l + (s[l] > 0 ? '#' : 'b'); }).join(' '); }
      expect(sig('Edorian') === 'C# F#', 'E dorian has ' + sig('Edorian'));
      expect(sig('Gminor') === 'Bb Eb', 'G minor has ' + sig('Gminor'));
      expect(sig('Dmixolydian') === 'F#', 'D mixolydian has ' + sig('Dmixolydian'));
      expect(sig('Ador') === 'F#' && sig('Bm') === 'C# F#', 'A dorian has ' + sig('Ador') + ', B minor ' + sig('Bm'));
      var b = PL.readBars('F c =F F|F', { key: 'Edorian', meter: '4/4' });
      var m = b[0].notes.map(function (n) { return n.midi; }).concat(b[1].notes.map(function (n) { return n.midi; }));
      expect(m.join() === '66,73,65,65,66', 'in E dorian "F c =F F|F" plays ' + m.join() + ', not 66,73,65,65,66');
    });

  check('Session Players', 'Triplets, halved notes, dotted pairs and ties keep the bar',
    'A triplet is three in the time of two, A/ is half a quaver, A>B is dotted, and a tie makes one longer note. Get one wrong and the backing slips against the tune.',
    function () {
      var b = PL.readBars('(3ABc d2 e>f g/a/b|A4- A4', { key: 'D', meter: '4/4' }), q = PL.TPQ;
      var lens = b[0].notes.map(function (n) { return n.dur / q; });
      expect(b[0].len === 8 * q, 'the bar is ' + b[0].len / q + ' quavers, not 8');
      expect(lens.join() === [2 / 3, 2 / 3, 2 / 3, 2, 1.5, 0.5, 0.5, 0.5, 1].join(), 'the notes are ' + lens.map(function (x) { return x.toFixed(2); }).join(' '));
      expect(b[1].notes.length === 1 && b[1].notes[0].dur === 8 * q, 'A4- A4 is ' + b[1].notes.length + ' notes, not one of 8 quavers');
    });

  check('Session Players', 'Real settings lay out in whole bars',
    'Six popular tunes as the Session gives them: each comes out a sensible length, every bar starting on the beat, and repeats never run away.',
    function () {
      var names = ['the-kesh', 'cooleys', 'the-swallowtail', 'out-on-the-ocean', 'the-silver-spear', 'banish-misfortune'];
      return Promise.all(names.map(function (n) { return json(FIX + n + '.json'); })).then(function (tunes) {
        var bad = [];
        tunes.forEach(function (j) {
          j.settings.forEach(function (st, i) {
            var lay = layOf(j, i), n = lay.timeline.length;
            var off = lay.timeline.filter(function (tb) { return !/@0$/.test(tb.slot); }).length;
            if (n < 16 || n > 64) bad.push(j.name + ' ' + (i + 1) + ': ' + n + ' bars');
            if (off) bad.push(j.name + ' ' + (i + 1) + ': ' + off + ' bars off the beat');
          });
        });
        expect(bad.length === 0, bad.join('\n'));
      });
    });

  check('Session Players', 'Chords come from the key, start and end at home, and all have shapes',
    'The chords chosen from the melody must be ones a backer uses in that key and mode, open on the home chord, end the tune on it, and have a shape in both tunings.',
    function () {
      var names = ['the-kesh', 'cooleys', 'the-swallowtail', 'out-on-the-ocean', 'the-silver-spear', 'banish-misfortune'];
      return Promise.all(names.map(function (n) { return json(FIX + n + '.json'); })).then(function (tunes) {
        var bad = [];
        tunes.forEach(function (j) {
          var lay = layOf(j, 0), ch = PL.chords(lay), cands = PL.candidates(lay.key).map(function (c) { return c.name; });
          var home = cands[0];
          lay.slots.forEach(function (sl, i) {
            ch[sl.id].forEach(function (c) {
              if (cands.indexOf(c) === -1) bad.push(j.name + ': ' + c + ' is not a chord of ' + lay.key.name);
              ['standard', 'dadgad'].forEach(function (tn) { if (!PL.shape(tn, c)) bad.push(j.name + ': no ' + tn + ' shape for ' + c); });
            });
          });
          var end = ch[lay.slots[lay.slots.length - 1].id];
          if (end[end.length - 1] !== home) bad.push(j.name + ' ends on ' + end.join(' ') + ', not ' + home);
          if (ch[lay.slots[0].id][0] !== home) bad.push(j.name + ' starts on ' + ch[lay.slots[0].id][0] + ', not ' + home);
        });
        expect(bad.length === 0, bad.join('\n'));
      });
    });

  check('Session Players', 'Chords follow the shape of a part',
    'A part is two four-bar phrases: the fourth bar rests on the cadence chord, the dominant in a major key. Hearing only notes, the page put Em and Am under the Kesh’s bar 4s, where a backer plays D.',
    function () {
      return Promise.all([json(FIX + 'the-kesh.json'), json(FIX + 'the-silver-spear.json')]).then(function (r) {
        var kesh = layOf(r[0]), kch = PL.chords(kesh), spear = layOf(r[1]), sch = PL.chords(spear);
        function bar4(lay, ch, part) {
          var sl = lay.slots.filter(function (s) { return s.part === part; })[3];
          return ch[sl.id].join(' ');
        }
        expect(bar4(kesh, kch, 0) === 'D' && bar4(kesh, kch, 1) === 'D',
               'the Kesh’s bar 4s are ' + bar4(kesh, kch, 0) + ' and ' + bar4(kesh, kch, 1) + ', not D and D');
        expect(bar4(spear, sch, 1) === 'A', 'the Silver Spear’s B part rests on ' + bar4(spear, sch, 1) + ' at bar 4, not A');
      });
    });

  check('Session Players', 'Reopening the page keeps your chords and chooses the rest afresh',
    'The last tune comes back with the chords you changed, and the others chosen again, so a better way of choosing reaches it. A saved file comes back exactly as saved.',
    function () {
      return json(FIX + 'the-kesh.json').then(function (j) {
        return withPlayers(function (win, doc) {
          var PP = win.PLAYERS_PAGE;
          PP.loadTune(j, 0);
          var slots = PP.tune().lay.slots, one = slots[0].id, three = slots[2].id;
          PP.setChord(three, ['Am']);
          var d = JSON.parse(PP.saveText());
          d.chords[one] = ['Bm'];                       // as an older way of choosing left it
          var text = JSON.stringify(d);
          PP.openText(text, true);
          var r1 = PP.tune().chords[one].join(' '), r3 = PP.tune().chords[three].join(' ');
          PP.openText(text);
          var f1 = PP.tune().chords[one].join(' '), f3 = PP.tune().chords[three].join(' ');
          expect(r3 === 'Am' && !!PP.tune().mine[three], 'reopened, your Am in bar 3 became ' + r3);
          expect(r1 === 'G', 'reopened, bar 1 kept the old chord ' + r1 + ' instead of choosing again');
          expect(f1 === 'Bm' && f3 === 'Am', 'a saved file came back as ' + f1 + ' and ' + f3 + ', not exactly as saved');
        });
      });
    });

  check('Session Players', 'Every shape plays its chord',
    'Hand-chosen shapes may add a ninth or a seventh, leave out the fifth, and in DADGAD sit on the open D, but the root and third must sound and nothing outside the chord. Any other chord gets a shape found by search.',
    function () {
      var bad = [];
      Object.keys(PL.HAND).forEach(function (tn) {
        Object.keys(PL.HAND[tn]).forEach(function (name) {
          var ch = PL.chord(name), tones = PL.tones(ch), notes = PL.voicing(tn, name).filter(function (m) { return m != null; });
          var pcs = notes.map(function (m) { return m % 12; }), label = PL.HAND[tn][name].name;
          var slash = /\/([A-G])/.exec(label), bassOk = pcs[0] === ch.root || (slash && PL.chord(slash[1]).root === pcs[0]);
          var allowed = tones.concat([(ch.root + 2) % 12, (ch.root + 10) % 12], slash ? [PL.chord(slash[1]).root] : []);
          if (!bassOk) bad.push(tn + ' ' + label + ': the bass is not the root');
          // Root and third must sound (a power chord: root and fifth); a shape may leave out the fifth.
          var need = /5$/.test(label) ? [ch.root, (ch.root + 7) % 12] : tones.slice(0, 2);
          need.forEach(function (t) { if (pcs.indexOf(t) === -1) bad.push(tn + ' ' + label + ': a chord note is missing'); });
          pcs.forEach(function (pc) { if (allowed.indexOf(pc) === -1) bad.push(tn + ' ' + label + ': plays a note outside the chord'); });
        });
        ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'].forEach(function (r) {
          [r, r + 'm'].forEach(function (name) {
            var sh = PL.findShape(tn, name), ch = PL.chord(name);
            if (!sh) { bad.push(tn + ': no shape found for ' + name); return; }
            var notes = PL.TUNINGS[tn].strings.map(function (o, s) { return sh.frets[s] < 0 ? null : o + sh.frets[s]; }).filter(function (m) { return m != null; });
            if (notes[0] % 12 !== ch.root) bad.push(tn + ' found ' + name + ': the bass is not the root');
            PL.tones(ch).forEach(function (t) { if (!notes.some(function (m) { return m % 12 === t; })) bad.push(tn + ' found ' + name + ': a chord note is missing'); });
          });
        });
      });
      expect(bad.length === 0, bad.join('\n'));
    });

  check('Session Players', 'The page builds a tune and plays it',
    'From the Session’s JSON to a chart of the tune’s bars, a shape for each chord, and sound, with a count-in first.',
    function () {
      return json(FIX + 'the-kesh.json').then(function (j) {
        return withPlayers(function (win, doc) {
          var PP = win.PLAYERS_PAGE;
          PP.loadTune(j, 0);
          var bars = doc.querySelectorAll('#chart .bar').length, shapes = doc.querySelectorAll('#shapes svg').length;
          var facts = doc.getElementById('tune-facts').textContent, play = doc.getElementById('play');
          play.click();
          return wait(1500).then(function () {
            var where = doc.getElementById('where').textContent, check = doc.getElementById('sound-check').textContent;
            expect(bars === 16 && shapes >= 3, bars + ' bars in the chart and ' + shapes + ' shapes');
            expect(/The Kesh · Jig · 6\/8 · G major · setting 1/.test(facts), 'the page says "' + facts + '"');
            expect(/^count-in [12] of 2/.test(where), 'it started with "' + where + '", not the two-bar count-in');
            expect(/making sound/.test(check), 'the sound check says "' + check + '"');
          });
        });
      });
    });

  check('Session Players', 'A chord you change holds through every repeat, and through save and open',
    'Tap a bar, pick a chord: it is played every time that bar comes round, marked as yours, and a saved file brings it back exactly, with nothing fetched.',
    function () {
      return Promise.all([json(FIX + 'the-kesh.json'), json(FIX + 'cooleys.json')]).then(function (r) {
        return withPlayers(function (win, doc) {
          var PP = win.PLAYERS_PAGE;
          PP.loadTune(r[0], 0);
          var bar3 = doc.querySelectorAll('#chart .bar')[2], slot = bar3.dataset.slot;
          bar3.click();
          var dlg = doc.getElementById('chooser'), opened = dlg.open;
          var am = Array.prototype.filter.call(doc.querySelectorAll('#choose-a button'), function (b) { return /^Am/.test(b.textContent); })[0];
          am.click();
          var b2 = Array.prototype.filter.call(doc.querySelectorAll('#choose-b button'), function (b) { return /^D/.test(b.textContent); })[0];
          b2.click();
          dlg.close();
          var plays = PP.form().filter(function (tb) { return tb.slot === slot; }).length;
          var now = PP.tune().chords[slot].join(' '), marked = bar3.classList.contains('mine');
          var file = PP.saveText();
          PP.loadTune(r[1], 0);                                // something else in between
          var opened2 = PP.openText(file);
          var back = PP.tune().chords[slot].join(' '), stillMine = !!PP.tune().mine[slot];
          var cell = doc.querySelector('#chart .bar[data-slot="' + slot + '"]');
          expect(opened, 'tapping a bar did not open the chord chooser');
          expect(now === 'Am D' && marked, 'bar 3 is "' + now + '" ' + (marked ? '' : 'and not marked as yours'));
          expect(plays === 2, 'bar 3 comes round ' + plays + ' times once through, not 2');
          expect(opened2 && back === 'Am D' && stillMine, 'after saving and opening, bar 3 is "' + back + '"' + (stillMine ? '' : ', no longer yours'));
          expect(cell && /Am·D/.test(cell.textContent) && cell.classList.contains('mine'), 'the chart shows "' + (cell && cell.textContent) + '"');
          expect(/The Kesh/.test(doc.getElementById('tune-facts').textContent), 'the opened file is not The Kesh');
        });
      });
    });

  check('Session Players', 'Finding a tune asks the Session, offers only what it can play, and folds away',
    'The search goes to thesession.org’s own API, from the page. Jigs and reels can be picked; other types are listed but not yet playable. Once one is picked the list folds under one line, so it no longer pushes the tune far down the page.',
    function () {
      return json(FIX + 'the-kesh.json').then(function (kesh) {
        return withPlayers(function (win, doc) {
          var asked = [];
          win.fetch = function (url) {
            asked.push(String(url));
            var body = /search/.test(url)
              ? { tunes: [{ id: 55, name: 'The Kesh', type: 'jig' }, { id: 1, name: 'Some Hornpipe', type: 'hornpipe' }] }
              : kesh;
            return Promise.resolve({ ok: true, json: function () { return Promise.resolve(body); } });
          };
          doc.getElementById('q').value = 'kesh';
          doc.getElementById('find-go').click();
          return wait(100).then(function () {
            var btns = doc.querySelectorAll('#results button'), box = doc.getElementById('matches');
            var horn = btns[1] && btns[1].disabled;
            var openFirst = box.open && !box.hidden, sumFirst = doc.getElementById('matches-sum').textContent;
            btns[0].click();
            return wait(100).then(function () {
              var sumAfter = doc.getElementById('matches-sum').textContent;
              expect(openFirst && /^2 found for “kesh”/.test(sumFirst), 'the matches were not shown: "' + sumFirst + '"');
              expect(!box.open && /^1 other match for “kesh”/.test(sumAfter), 'after picking one the matches did not fold away: "' + sumAfter + '"');
              expect(/^https:\/\/thesession\.org\/tunes\/search\?q=kesh&format=json/.test(asked[0] || ''), 'it asked ' + asked[0]);
              expect(btns.length === 2 && horn && !btns[0].disabled, 'the results were not two, with only the jig playable');
              expect(/^https:\/\/thesession\.org\/tunes\/55\?format=json/.test(asked[1] || ''), 'picking it fetched ' + asked[1]);
              expect(win.PLAYERS_PAGE.tune() && win.PLAYERS_PAGE.tune().meta.name === 'The Kesh', 'picking it did not load The Kesh');
            });
          });
        });
      });
    });

  check('Session Players', 'It shows its own version, and the notes cover it',
    'Session Players has its own version number. Bump it? Add it to CHANGELOG.md and the release notes in the same change.',
    function () {
      return withPlayers(function (win, doc) {
        var v = win.PLAYERS_PAGE && win.PLAYERS_PAGE.VERSION;
        expect(!!v, 'Session Players has no version');
        expect(doc.getElementById('players-version').textContent === 'v' + v, 'the title shows "' + doc.getElementById('players-version').textContent + '"');
        expect(doc.getElementById('foot-version').textContent.indexOf(v) !== -1, 'the foot of the page does not show ' + v);
        return Promise.all([text('../CHANGELOG.md'), text('../release-notes/')]).then(function (r) {
          expect(r[0].indexOf('### Session Players ' + v + ' ') !== -1, 'CHANGELOG.md has no entry for Session Players ' + v);
          expect(r[1].indexOf('<span class="ver">Session Players ' + v + '</span>') !== -1, 'the release notes have no entry for Session Players ' + v);
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
