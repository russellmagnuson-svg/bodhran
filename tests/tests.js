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
    'Tak about 11 dB and ghost about 22 dB under an accented dum, each the loudest moment of three strokes. Measured once the drum’s compressor has settled: in its first third of a second it is still coming up to strength, which until 1.10.0 this check measured through (it read the tak at 12). Change these on purpose? Update the numbers here too.',
    function () {
      function settled(voice, vel) {
        return render(1.0, 1, function (oc) {
          var b = new TRAD.Bodhran(oc, oc.destination);
          b.setRoom(0);
          b.hit(voice, 0.4, vel);
        }).then(function (buf) { return 20 * Math.log10(peak(buf.getChannelData(0))); });
      }
      function three(voice, vel) {
        return Promise.all([0, 1, 2].map(function () { return settled(voice, vel); }))
          .then(function (r) { return (r[0] + r[1] + r[2]) / 3; });
      }
      return Promise.all([three('bass', TRAD.VELOCITY.D), three('treble', TRAD.VELOCITY.t),
                          three('ghost', TRAD.VELOCITY.g)]).then(function (r) {
        var tak = r[1] - r[0], ghost = r[2] - r[0];
        expect(tak > -14 && tak < -8, 'tak is ' + round(tak) + ' dB (expected about -11)');
        expect(ghost > -25 && ghost < -18.5, 'ghost is ' + round(ghost) + ' dB (expected about -22)');
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

  check('Sound', 'The dum settles a little, as a goatskin does: no electronic swoop',
    'Each dum used to drop almost an octave in its first 55 ms (148 Hz to the skin’s 78), the recipe of an electronic kick drum, nearly all of it under 120 Hz, so a phone’s speaker heard little but the click. A struck goatskin settles a few percent, and its higher modes and slap give it a middle. Its note 15–45 ms in must be within a semitone of where it settles, and above 300 Hz (about where a phone’s speaker starts) must carry more than 1/30 of its first 100 ms.',
    function () {
      function hit(chain) {
        return render(1.0, 1, function (oc) {
          var dest = oc.destination;
          chain.slice().reverse().forEach(function (x) {
            var f = oc.createBiquadFilter(); f.type = x[0]; f.frequency.value = x[1]; f.Q.value = x[2]; f.connect(dest); dest = f;
          });
          var b = new TRAD.Bodhran(oc, dest);
          b.setRoom(0);
          b.hit('bass', 0.02, TRAD.VELOCITY.D);
        }).then(function (buf) { return buf.getChannelData(0); });
      }
      function freq(d, a, z) {       // from its upward zero crossings
        var zc = [];
        for (var i = Math.floor(a * SR) + 1; i < Math.floor(z * SR); i++) if (d[i - 1] < 0 && d[i] >= 0) zc.push(i - d[i] / (d[i] - d[i - 1]));
        return zc.length > 1 ? (zc.length - 1) * SR / (zc[zc.length - 1] - zc[0]) : 0;
      }
      function energy(d) { var s = 0; for (var i = Math.floor(0.02 * SR); i < Math.floor(0.12 * SR); i++) s += d[i] * d[i]; return s; }
      return Promise.all([hit([['lowpass', 110, 0.6], ['lowpass', 110, 0.6]]), hit([]), hit([['highpass', 300, 0.7], ['highpass', 300, 0.7]])]).then(function (r) {
        var early = freq(r[0], 0.035, 0.065), settled = freq(r[0], 0.12, 0.22), semis = 12 * Math.log2(early / settled);
        var above = 10 * Math.log10(energy(r[2]) / energy(r[1]));
        expect(semis < 1, 'it settles ' + round(semis) + ' semitones (' + Math.round(early) + ' Hz early on, ' + Math.round(settled) + ' Hz settled)');
        expect(above > -15, 'above 300 Hz it has only ' + round(above) + ' dB of its sound');
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

  check('The app', 'Your settings come back after a reload',
    'Every slider (volume, tuning, tone, back hand, room, drone level, busyness, humanise, fills every) came back at its default on every visit: each was saved at its starting value as the page set it up, just before the saved one was read back. Moved and reloaded, each must come back where it was left, its label with it.',
    function () {
      var moved = { level: 0.5, tuning: 100, tone: 0.3, backhand: 0.5, room: 0.6, 'drone-level': 0.3,
                    complexity: 0.3, humanize: 0.7, phrase: 8 };
      return withApp(function (win, doc) {
        viewTo(doc, 'advanced');
        var labels = {};
        Object.keys(moved).forEach(function (id) {
          var el = doc.getElementById(id);
          el.value = moved[id]; el.dispatchEvent(new win.Event('input'));
          labels[id] = el.closest('label').querySelector('output').textContent;
        });
        return new Promise(function (ok) { win.frameElement.onload = ok; win.location.reload(); })
          .then(function () { return wait(300); })
          .then(function () {
            var d = win.document, bad = [];
            Object.keys(moved).forEach(function (id) {
              var el = d.getElementById(id), out = el.closest('label').querySelector('output').textContent;
              if (Math.abs(+el.value - moved[id]) > 1e-9) bad.push(id + ' came back at ' + el.value + ', not ' + moved[id]);
              else if (out !== labels[id]) bad.push(id + ' says ' + out + ', not ' + labels[id]);
            });
            expect(bad.length === 0, bad.join('\n'));
          });
      });
    });

  check('The app', 'The screen stays on while anything plays, on both pages',
    'A phone screen that locks itself takes the sound with it. Only the app held the screen on, and only for the drum: not for the drone alone, and not at all in Session Buddies (or the guitar demo, since retired). Now each holds it while it plays (the drone included) and lets go when stopped; and since the browser lets go whenever the page is hidden, each takes it back when the page is shown again.',
    function () {
      // A stand-in for the browser's screen lock, and a page that counts as shown.
      function fake(win) {
        var log = { asked: 0, held: [] };
        Object.defineProperty(win.navigator, 'wakeLock', { configurable: true, value: { request: function () {
          log.asked++;
          var lock = new win.EventTarget();
          lock.released = false;
          lock.release = function () {
            if (!lock.released) { lock.released = true; lock.dispatchEvent(new win.Event('release')); }
            return win.Promise.resolve();
          };
          log.held.push(lock);
          return win.Promise.resolve(lock);
        } } });
        Object.defineProperty(win.document, 'hidden', { configurable: true, value: false });
        Object.defineProperty(win.document, 'visibilityState', { configurable: true, value: 'visible' });
        log.holding = function () { return log.held.filter(function (l) { return !l.released; }).length; };
        log.hide = function () { log.held.forEach(function (l) { l.release(); }); };   // what the browser does
        log.show = function () { win.document.dispatchEvent(new win.Event('visibilitychange')); };
        return log;
      }
      function step(f) { f(); return wait(60); }
      var bad = [];
      function want(log, n, what) { if (log.holding() !== n) bad.push(what + ': ' + (log.holding() ? 'the screen is held' : 'the screen is not held')); }
      var app = withApp(function (win, doc) {
        var L = fake(win), play = doc.getElementById('play'), drone = doc.getElementById('drone-on');
        return step(function () { play.click(); })
          .then(function () { want(L, 1, 'the app, playing'); return step(function () { play.click(); }); })
          .then(function () { want(L, 0, 'the app, stopped'); return step(function () { drone.click(); }); })
          .then(function () { want(L, 1, 'the app, the drone alone'); return step(function () { drone.click(); }); })
          .then(function () { want(L, 0, 'the app, the drone off'); return step(function () { play.click(); }); })
          .then(function () { return step(L.hide); })
          .then(function () { return step(L.show); })
          .then(function () { want(L, 1, 'the app, shown again while playing'); return step(function () { play.click(); }); });
      });
      return app.then(function () {
        return withBuddies(function (win, doc) {
          var L = fake(win), play = doc.getElementById('play');
          return step(function () { play.click(); })
            .then(function () { want(L, 1, 'Session Buddies, playing'); return step(L.hide); })
            .then(function () { return step(L.show); })
            .then(function () { want(L, 1, 'Session Buddies, shown again while playing'); return step(function () { play.click(); }); })
            .then(function () { want(L, 0, 'Session Buddies, stopped'); });
        });
      }).then(function () { expect(bad.length === 0, bad.join('\n')); });
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
    'Twice a Safari tab went silent while the Mac played its stream, and nothing could tell whether the page sent silence or Safari lost the sound. The line under Play measures what leaves the page for the speaker. Since 1.10.1 the line is hidden unless the address asks for it (?soundcheck); it still measures.',
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
          expect(el.hidden, 'the line shows without ?soundcheck');
        });
      });
    });

  check('The app', 'Text and buttons stay easy to read in the colours',
    'Green and gold since 1.8.0. Every pairing of text on its ground must reach a contrast of 4.5 to 1, the usual standard for reading: button text on green, green and gold on the dark grounds, the quieter grey on the panels.',
    function () {
      return text('../css/app.css').then(function (css) {
        var root = /:root\s*\{([\s\S]*?)\}/.exec(css)[1], tok = {}, m, re = /--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g;
        while ((m = re.exec(root))) tok[m[1]] = m[2];
        function lum(h) {
          return [1, 3, 5].map(function (i) { var c = parseInt(h.substr(i, 2), 16) / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); })
                          .reduce(function (a, c, i) { return a + c * [0.2126, 0.7152, 0.0722][i]; }, 0);
        }
        function ratio(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
        var pairs = [['on-accent', 'accent'], ['accent', 'bg'], ['accent', 'panel'], ['skin', 'bg'], ['text', 'panel'],
                     ['muted', 'panel'], ['muted', 'panel-2'], ['text', 'panel-2']];
        var bad = pairs.filter(function (p) { return !tok[p[0]] || !tok[p[1]] || ratio(tok[p[0]], tok[p[1]]) < 4.5; })
                       .map(function (p) { return p[0] + ' on ' + p[1] + ': ' + (tok[p[0]] && tok[p[1]] ? ratio(tok[p[0]], tok[p[1]]).toFixed(1) + ' to 1' : 'missing'); });
        expect(bad.length === 0, bad.join('\n'));
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
        var sw = doc.getElementById('swing'); sw.value = 60; sw.dispatchEvent(new win.Event('input'));
        viewTo(doc, 'basic');
        var drum = drumHint.textContent, feel = feelHint.textContent;
        doc.querySelector('.chip[data-id="jig"]').click();          // a new tune comes with its own swing
        var feelAfter = feelHint.textContent;
        expect(!/changed/.test(fresh), 'a first visit already flags changes: ' + fresh);
        expect(/changed: back hand \(moderate\)/.test(drum), 'the Drum panel says: ' + drum);
        expect(/changed: swing \(60:40\)/.test(feel), 'the Feel panel says: ' + feel);
        expect(!/changed/.test(feelAfter), 'still flags swing after a new tune reset it: ' + feelAfter);
      });
    });

  check('Basic and Advanced', 'Swing is set as long : short, shows with a tune that swings, and is kept for each type',
    'The Swing slider was a percentage of the engine’s own measure, kept in Advanced, and put back to the tune’s own at every change of tune. It now reads as a player says it, 50:50 (straight) to 70:30; a hornpipe starts at 64:36 (it was 60:40) and a barndance at 57:43; for a type that swings it shows in Basic; each type keeps the swing you set for it; and the drum plays it.',
    function () {
      return withApp(function (win, doc) {
        var sw = doc.getElementById('swing'), out = doc.getElementById('swing-out'), label = sw.closest('label');
        function visible() { return win.getComputedStyle(label).display !== 'none'; }
        viewTo(doc, 'basic');
        doc.querySelector('.chip[data-id="reel"]').click();
        var reel = { shown: visible(), says: out.textContent };
        doc.querySelector('.chip[data-id="hornpipe"]').click();
        var horn = { shown: visible(), says: out.textContent };
        doc.querySelector('.chip[data-id="barndance"]').click();
        var barn = out.textContent;
        doc.querySelector('.chip[data-id="hornpipe"]').click();
        sw.value = 68; sw.dispatchEvent(new win.Event('input'));
        var set = out.textContent;
        doc.querySelector('.chip[data-id="reel"]').click();
        var reelAfter = out.textContent;
        doc.querySelector('.chip[data-id="hornpipe"]').click();
        var back = sw.value + ' ' + out.textContent;
        // The drum: the swing it is handed for the hornpipe's offbeats.
        var heard = [], shift = win.TRAD.swingShift;
        win.TRAD.swingShift = function (f, s) { heard.push(s); return shift(f, s); };
        var ci = doc.getElementById('countin'); ci.value = '0'; ci.dispatchEvent(new win.Event('change'));
        doc.getElementById('play').click();
        return wait(700).then(function () {
          doc.getElementById('play').click();
          win.TRAD.swingShift = shift;
          var most = heard.filter(function (s) { return s > 0; });
          expect(!reel.shown && /straight/.test(reel.says), 'a reel in Basic: Swing ' + (reel.shown ? 'shown' : 'hidden') + ', says ' + reel.says);
          expect(horn.shown && horn.says === 'tune default (64:36)', 'a hornpipe in Basic: Swing ' + (horn.shown ? 'shown' : 'hidden') + ', says ' + horn.says);
          expect(barn === 'tune default (57:43)', 'a barndance says ' + barn);
          expect(set === '68:32' && reelAfter === 'tune default (straight)', 'set to 68 it says ' + set + '; the reel then says ' + reelAfter);
          expect(back === '68 68:32', 'back on the hornpipe: ' + back);
          expect(most.length && most.every(function (s) { return Math.abs(s - win.TRAD.swingFromShare(0.68)) < 1e-9; }),
                 'the drum swung by ' + most.slice(0, 4).join(', ') + ', not 68:32 (' + round(win.TRAD.swingFromShare(0.68), 2) + ')');
        });
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
        // The app's page is saved as './': index.html is a redirect on the host, which cannot answer a page load (sw.js).
        expect(files.indexOf('') !== -1 || files.indexOf('./') !== -1 || files.indexOf('.') !== -1, 'the app’s page itself is not in the offline list');
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

  /* sw.js itself, run against a stand-in network and cache store, its
   * clock a hundred times faster (its 2.5 s wait for a page is 25 ms). */
  var swClock = 1e12;                     // one clock for every sandbox: no two copies share a name
  function swSandbox(src, shared) {
    var base = new URL('../', location.href).href, on = {}, store = shared || {}, net = {}, fetched = [];
    function abs(u) { return new URL(typeof u === 'string' ? u : u.url, base).href; }
    function path(u) { var x = new URL(abs(u)); return x.pathname.slice(new URL(base).pathname.length - 1) + x.search; }
    function fake(body, redirected) {
      return { ok: true, status: 200, statusText: 'OK', headers: new Headers(), redirected: !!redirected, body: body,
               text: function () { return Promise.resolve(body); }, blob: function () { return Promise.resolve(new Blob([body])); } };
    }
    function Cache() { this.m = {}; }
    Cache.prototype.put = function (r, res) { this.m[abs(r)] = res; return Promise.resolve(); };
    Cache.prototype.match = function (r, o) {
      var k = abs(r); if (o && o.ignoreSearch) k = k.split('?')[0];
      return Promise.resolve(this.m[k]);
    };
    Cache.prototype.addAll = function (reqs) {
      var c = this;
      return Promise.all(reqs.map(function (r) {
        return fetchIt(r).then(function (res) { if (!res.ok) throw new Error('not ok'); return c.put(r, res); });
      }));
    };
    var caches = {
      open: function (n) { return Promise.resolve(store[n] || (store[n] = new Cache())); },
      keys: function () { return Promise.resolve(Object.keys(store)); },
      delete: function (n) { var had = n in store; delete store[n]; return Promise.resolve(had); }
    };
    function fetchIt(r) {
      var p = path(r), rule = net[p] || net['*'] || { fail: true };
      fetched.push(p);
      return new Promise(function (ok, no) {
        setTimeout(function () { if (rule.fail) no(new TypeError('offline')); else ok(fake(rule.body || ('new ' + p), rule.redirected)); }, (rule.delay || 1) / 100);
      });
    }
    var self = { location: new URL(base + 'sw.js'), addEventListener: function (t, f) { on[t] = f; },
                 skipWaiting: function () { return Promise.resolve(); }, clients: { claim: function () { return Promise.resolve(); } } };
    function Req(u, o) { this.url = abs(u); this.cache = o && o.cache; }
    new Function('self', 'caches', 'fetch', 'Request', 'Response', 'URL', 'setTimeout', 'clearTimeout', 'Date', src)(
      self, caches, fetchIt, Req, Response, URL, function (f, ms) { return setTimeout(f, ms / 100); }, clearTimeout,
      { now: function () { return (swClock += 7); } });
    function wait(ev) { var w = Promise.resolve(); ev.waitUntil = function (p) { w = p; }; return function () { return w; }; }
    return {
      net: net, fetched: fetched, store: store,
      install: function () { var ev = {}, w = wait(ev); on.install(ev); return w(); },
      started: function (id) { var ev = { data: { type: 'started' }, source: { id: id } }, w = wait(ev); on.message(ev); return w(); },
      open: function (u, id) {      // a page load; resolves with { text, redirected } or { error }
        var res, ev = { request: { url: abs(u), method: 'GET', mode: 'navigate' }, resultingClientId: id, respondWith: function (p) { res = p; } };
        on.fetch(ev);
        return Promise.resolve(res).then(function (r) {
          if (!r) return { error: 'nothing' };
          return r.text().then(function (t) { return { text: t, redirected: !!r.redirected }; });
        }, function (err) { return { error: String(err) }; });
      },
      get: function (u, id) {
        var res, ev = { request: { url: abs(u), method: 'GET', mode: 'no-cors' }, clientId: id, respondWith: function (p) { res = p; } };
        on.fetch(ev);
        return Promise.resolve(res).then(function (r) { return r ? r.text() : 'nothing'; }, function () { return 'failed'; });
      },
      complete: function () {
        return Promise.all(Object.keys(store).map(function (n) { return store[n].match('./__complete__').then(function (m) { return m ? n : null; }); }))
          .then(function (l) { return l.filter(Boolean); });
      }
    };
  }

  check('Offline copy', 'A slow page never mixes old and new files, and the copy survives',
    'The audit found: a slow page not in the offline copy (Session Buddies, the guitar demo) was marked offline and given the shared files (patterns.js, wake.js…) from the old copy beside its own new ones — the mix this is meant to prevent, and a page that played nothing — and was then fetched twice. Two refreshes at once could delete each other’s copy, leaving none for the pub. The saved index.html was the host’s redirect, which cannot answer a page load. And a new sw.js refreshed the copy mid-deploy. Run here against a stand-in network: none of these happen.',
    function () {
      return text('../sw.js').then(function (src) {
        var bad = [], sb = swSandbox(src), N = sb.net;
        N['*'] = { body: null };                                     // every file: 'new <path>'
        N['/index.html'] = { redirected: true, body: 'the app' };    // as Cloudflare answers it
        // First install, with an "old" set: the offline copy.
        Object.keys({ '/': 1, '/css/app.css': 1, '/js/patterns.js': 1, '/js/app.js': 1 }).forEach(function (p) { N[p] = { body: 'old ' + p }; });
        return sb.install().then(function () {
          // Now the site has moved on, and Session Buddies is slow (3 s) on pub wifi.
          Object.keys(N).forEach(function (p) { if (p !== '/index.html') delete N[p]; });
          N['*'] = { body: null }; N['/buddies/'] = { delay: 3000 };
          var before = sb.fetched.length;
          return sb.open('/buddies/', 'b1').then(function (page) {
            var times = sb.fetched.slice(before).filter(function (p) { return p === '/buddies/'; }).length;
            if (page.text !== 'new /buddies/') bad.push('the slow page came as ' + (page.text || page.error));
            if (times !== 1) bad.push('the slow page was fetched ' + times + ' times, not once');
            return sb.get('/js/patterns.js', 'b1');
          }).then(function (t) {
            if (t !== 'new /js/patterns.js') bad.push('the slow page’s shared patterns.js came from the offline copy (' + t + '): old beside new');
          });
        }).then(function () {
          // Offline: the app from its copy, as / or /index.html or with a ?query, never a redirect.
          Object.keys(N).forEach(function (p) { delete N[p]; });     // everything fails now
          return Promise.all(['/', '/index.html', '/?fbclid=1'].map(function (u, i) { return sb.open(u, 'o' + i); })).then(function (r) {
            r.forEach(function (x, i) {
              var u = ['/', '/index.html', '/?fbclid=1'][i];
              if (x.error || !/\/$|the app/.test(x.text || '') || x.redirected) bad.push('offline, ' + u + ' gave ' + (x.error || (x.redirected ? 'a redirect' : x.text)));
            });
            return sb.get('/js/app.js', 'o0');
          }).then(function (t) { if (t !== 'old /js/app.js') bad.push('offline, the app’s own files came as ' + t); });
        }).then(function () {
          // A new sw.js, with a complete copy there: it keeps it as it installs.
          var sb2 = swSandbox(src, sb.store);
          sb2.net['*'] = { body: null };
          return sb2.install().then(function () {
            if (sb2.fetched.length) bad.push('a new sw.js re-downloaded ' + sb2.fetched.length + ' files as it installed, mid-deploy');
          });
        }).then(function () {
          // Two refreshes at once (two clean starts): a complete copy is left.
          var sc = swSandbox(src);
          sc.net['*'] = { body: null, delay: 400 };
          return sc.install().then(function () { return sc.open('/', 'c1'); }).then(function () {
            return Promise.all([sc.started('c1'), sc.started('c1')]);
          }).then(function () { return sc.complete(); }).then(function (done) {
            if (!done.length) bad.push('two refreshes at once left no offline copy at all');
            Object.keys(sc.net).forEach(function (p) { delete sc.net[p]; });
            return sc.open('/', 'c2');
          }).then(function (x) { if (x.error) bad.push('after two refreshes at once, offline the app did not open: ' + x.error); });
        }).then(function () { expect(bad.length === 0, bad.join('\n')); });
      });
    });

  check('Offline copy', 'The app asks for a fresh copy a while after it starts, not at once',
    'The first look straight after an update is when a deploy may still be serving some old files beside new ones, and a copy taken then would save the mix. So a clean start asks for a refresh after a while (30 s; here 1.5 s), not at once.',
    function () {
      var first = "window.TRAD = { STARTED_AFTER: 1.5 }; window.__posted = [];" +
        "Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { controller: { postMessage: function (m) { window.__posted.push(m.type); } }," +
        " register: function () { return Promise.resolve(); } } });";
      return withApp(function (win) {
        var atOnce = win.__posted.slice();
        return wait(1800).then(function () {
          expect(atOnce.length === 0, 'it asked straight away: ' + atOnce.join(', '));
          expect(win.__posted.join() === 'started', 'after a while it asked ' + JSON.stringify(win.__posted));
        });
      }, null, first);
    });

  /* ================================================================
   * Guitar: the guitar Session Buddies plays (guitar/guitar.js), tried on
   * The Kesh as the guitar demo played it (tests/kesh.js). The demo page
   * itself was retired on 3 October 2026.
   * ================================================================ */

  check('Guitar', 'The guitar demo’s old address points to Session Buddies and the app',
    'The guitar demo was retired on 3 October 2026: Session Buddies does all it did, with any tune. Its address stays, for bookmarks, saying so and linking to Session Buddies and the Bodhrán app; the demo’s own code is gone, and the guitar Session Buddies plays stays where it was.',
    function () {
      return Promise.all([text('../guitar/'), fetch('../guitar/demo.js', { cache: 'no-store' }), fetch('../guitar/guitar.js', { cache: 'no-store' })]).then(function (r) {
        var html = r[0], links = html.match(/href="([^"]+)"/g) || [];
        expect(/retired/i.test(html), 'the old address does not say the demo has been retired');
        expect(html.indexOf('href="../buddies/"') !== -1, 'it does not link to Session Buddies: ' + links.join(' '));
        expect(html.indexOf('href="../"') !== -1, 'it does not link to the Bodhrán app: ' + links.join(' '));
        expect(!/<script/i.test(html), 'it still runs a script');
        expect(!r[1].ok, 'the demo’s code (demo.js) is still served');
        expect(r[2].ok, 'the guitar Session Buddies plays (guitar.js) is gone');
      });
    });

  check('Guitar', 'The Kesh: every bar is a full 6/8 bar',
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

  check('Guitar', 'Every chord has a shape, and the drone rings through',
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

  check('Guitar', 'DADGAD: D A D G A D, with the low D and top D open in every shape',
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

  check('Guitar', 'The guitar is in tune',
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

  check('Guitar', 'Bass runs walk up into the next chord',
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

  check('Guitar', 'A picked bass note settles like a guitar string, not a piano',
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

  check('Guitar', 'A bass run note starts from a thumb pluck, not a burst of noise',
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

  check('Guitar', 'Open strings ring in sympathy, and DADGAD rings more',
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

  check('Guitar', 'In DADGAD the low D drones under every chord',
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
      });
    });

  check('Guitar', 'A fretted string the next chord leaves out stops',
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

  check('Session Buddies', 'The concertina plays recordings of a real one, credited',
    'Synthesised, it sounded “too much like a keyboard”. Its notes now come from a real Anglo concertina, recorded by Alwayswonder (Wikimedia Commons, CC BY-SA 4.0): every note a tune is likely to need, G3 to D6, within a semitone of a steady recorded one, the licence noted with the samples and the recording credited on the page, and once they have loaded the synthesised one plays no notes.',
    function () {
      return Promise.all([json('../buddies/concertina/samples.json'), text('../buddies/concertina/README.md'), text('../buddies/'), json(FIX + 'the-kesh.json')]).then(function (r) {
        var have = PL.Concertina.steady(r[0].notes).map(function (n) { return n.midi; }), gaps = [];   // those it plays
        for (var m = 55; m <= 86; m++) if (!have.some(function (h) { return Math.abs(h - m) <= 1; })) gaps.push(m);
        expect(have.length >= 30 && gaps.length === 0, have.length + ' recorded notes; nothing within a semitone of ' + gaps.join(', '));
        expect(/CC BY-SA 4\.0/.test(r[1]) && /Alwayswonder/.test(r[1]) && /CC BY-SA 4\.0/.test(r[0].licence || ''), 'the samples do not carry their licence and credit');
        var credit = (/<p id="concertina-credit">[\s\S]*?<\/p>/.exec(r[2]) || [''])[0];
        expect(/Alwayswonder/.test(credit) && /CC BY-SA 4\.0/.test(credit), 'the page does not credit the recording');
        return withBuddies(function (win, doc) {
          var synth = 0, S = win.BUDDIES.ConcertinaSynth.prototype, orig = S.note;
          S.note = function () { synth++; return orig.apply(this, arguments); };
          win.BUDDIES_PAGE.loadTune(r[3], 0);
          doc.getElementById('on-concertina').click();           // ticking it starts the recordings loading
          var inst = win.BUDDIES_PAGE.audio().concertina;
          return inst.ready.then(function (loaded) {
            doc.getElementById('play').click();
            return wait(3000).then(function () {
              expect(loaded, 'the recordings did not load');
              expect(synth === 0, 'the synthesised concertina played ' + synth + ' notes after the recordings had loaded');
            });
          });
        });
      });
    });

  check('Session Buddies', 'The concertina’s stand-in plays at the recordings’ level',
    'Until the recordings arrive (or if they never do) a synthesised concertina stands in. It played at its own old level, 12 dB over the recordings: on a slow first load the first bars came in loud and buzzy over everything, then dropped and changed sound. A phrase on each now sits within 2 dB.',
    function () {
      var SRG = 48000, notes = [62, 64, 66, 67, 69, 71, 74, 76, 78, 74, 71, 69, 67, 66, 64, 62], q = 0.2, retry = PL.Concertina.RETRY;
      function phrase(base) {
        var o = new OfflineAudioContext(1, Math.ceil(SRG * (notes.length * q + 1)), SRG);
        var inst = new PL.Concertina(o, o.destination, base);
        return inst.ready.then(function (loaded) {
          notes.forEach(function (m, i) { inst.note(0.05 + i * q, q, m, i % 3 ? 0.7 : 0.9); });
          return o.startRendering().then(function (b) { return { loaded: loaded, d: b.getChannelData(0) }; });
        });
      }
      function level(d) { var s = 0; for (var i = 0; i < d.length; i++) s += d[i] * d[i]; return 10 * Math.log10(s / d.length); }
      PL.Concertina.RETRY = 0.05;
      return Promise.all([phrase(), phrase('../buddies/concertina/not-here/')]).then(function (r) {
        expect(r[0].loaded, 'the recordings did not load');
        expect(!r[1].loaded, 'recordings loaded from a folder that has none');
        var gap = level(r[1].d) - level(r[0].d);
        expect(Math.abs(gap) < 2, 'the stand-in is ' + round(gap) + ' dB against the recordings');
      }).finally(function () { PL.Concertina.RETRY = retry; });
    });

  check('Session Buddies', 'A recording lost on bad wifi costs one note, not the concertina',
    'The 34 recordings loaded as one bundle: one lost on patchy wifi lost them all, and the stand-in played for the rest of the visit with nothing said. Now each comes on its own and is tried a second time, what arrives is kept, a note whose recording is missing is borrowed from a neighbour, and the missing ones are tried again at the next Play.',
    function () {
      var realFetch = window.fetch, tries = {}, down = { 'c-62.m4a': Infinity, 'c-64.m4a': 1 }, retry = PL.Concertina.RETRY;
      window.fetch = function (url) {
        var f = String(url).split('/').pop();
        tries[f] = (tries[f] || 0) + 1;
        if (down[f] && tries[f] <= down[f]) return Promise.reject(new TypeError('Load failed'));
        return realFetch.apply(this, arguments);
      };
      PL.Concertina.RETRY = 0.05;
      var o = new OfflineAudioContext(1, 48000 * 2, 48000), inst = new PL.Concertina(o, o.destination);
      var synth = 0, sn = inst.synth.note;
      inst.synth.note = function () { synth++; return sn.apply(this, arguments); };
      return inst.ready.then(function (loaded) {
        var have = (inst.samples || []).map(function (s) { return s.midi; });
        expect(loaded, 'one lost recording lost them all');
        expect(have.indexOf(64) >= 0 && tries['c-64.m4a'] === 2, 'a recording that failed once was not tried again (' + tries['c-64.m4a'] + ' tries)');
        expect(have.indexOf(62) < 0 && inst.status === 'partial' && inst.missing.join() === '62',
               'with D4 lost: ' + inst.status + ', missing ' + inst.missing.join(', '));
        inst.note(0.1, 0.3, 62, 0.8);
        expect(synth === 0, 'the missing D4 went to the stand-in, not to a neighbour a semitone away');
        down = {};
        return inst.retry();
      }).then(function () {
        expect(inst.status === 'ready' && !inst.missing.length && inst.samples.some(function (s) { return s.midi === 62; }),
               'trying again did not bring D4 back: ' + inst.status);
      }).finally(function () { window.fetch = realFetch; PL.Concertina.RETRY = retry; });
    });

  check('Session Buddies', 'The page says when the stand-in concertina is playing, and tries again at Play',
    'Lost recordings used to be silent: you heard the old “keyboard” concertina all session and thought the recordings had been undone. Now a line under the mixer says so, and pressing Play tries again; once they arrive the line goes.',
    function () {
      return json(FIX + 'the-kesh.json').then(function (j) {
        return withBuddies(function (win, doc) {
          var realFetch = win.fetch, cut = true;
          win.fetch = function (url) {
            if (cut && /concertina\//.test(String(url))) return Promise.reject(new TypeError('Load failed'));
            return realFetch.apply(win, arguments);
          };
          win.BUDDIES.Concertina.RETRY = 0.05;
          win.BUDDIES_PAGE.loadTune(j, 0);
          doc.getElementById('on-concertina').click();
          var note = doc.getElementById('concertina-note'), inst = win.BUDDIES_PAGE.audio().concertina;
          return inst.ready.then(function (loaded) {
            expect(!loaded && inst.status === 'failed', 'with the recordings cut off, the concertina reports “' + inst.status + '”, not “failed”');
            expect(!note.hidden && /stand-in/.test(note.textContent), 'nothing said: “' + note.textContent + '”');
            cut = false;
            doc.getElementById('play').click();
            return inst.ready;
          }).then(function (loaded) {
            expect(loaded && inst.status === 'ready', 'pressing Play did not try again: ' + inst.status);
            expect(note.hidden, 'the line stayed once the recordings arrived: “' + note.textContent + '”');
          });
        });
      });
    });

  check('Guitar', 'The guitar strums smoothly: no wire-fence edge',
    'Its strings started from bursts of random noise and kept their top as they rang: “someone hitting a wire fence with a pole”. A real steel-string G chord (measured, Wikimedia Commons) has its top, above 2 kHz against below 1 kHz, at -16.5 dB a third of a second on and -21.5 dB at 0.8 s. A strummed G must come near that, sparkle at the strum but no clang, and not dull to a thud.',
    function () {
      var SRG = 48000, G = window.GTR, Gstd = [43, 47, 50, 55, 59, 67], STD = [40, 45, 50, 55, 59, 64];
      var o = new OfflineAudioContext(1, SRG * 2, SRG), g = new G.Guitar(o, o.destination);
      g.setLevel(0.7); g.prepare(Gstd); g.strum(Gstd, 0.05, 'D', 1, 4, STD);
      return o.startRendering().then(function (b) {
        var d = b.getChannelData(0), pk = 0, on = 0, i;
        for (i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i]));
        for (i = 0; i < d.length; i++) if (Math.abs(d[i]) > pk * 0.1) { on = i / SRG; break; }
        function top(a, n) {        // energy above 2 kHz against below 1 kHz, in dB
          var s0 = Math.floor(a * SRG), hi = 0, lo = 0;
          for (var k = 1; k < Math.round(8000 * n / SRG); k++) {
            var re = 0, im = 0, f = k * SRG / n;
            for (var j = 0; j < n; j++) { var x = d[s0 + j] || 0, w = 0.5 - 0.5 * Math.cos(2 * Math.PI * j / n), ph = 2 * Math.PI * k * j / n; re += x * w * Math.cos(ph); im -= x * w * Math.sin(ph); }
            var p = re * re + im * im; if (f > 2000) hi += p; if (f < 1000) lo += p;
          }
          return 10 * Math.log10(hi / lo);
        }
        var strum = (top(on, 1024) + top(on + 0.02, 1024) + top(on + 0.04, 1024)) / 3, ring = top(on + 0.3, 2048), late = top(on + 0.8, 2048);
        expect(strum < -5, 'at the strum its top is ' + round(strum) + ' dB: the old edge (the first voice: -3.8)');
        expect(ring < -12 && ring > -24, 'a third of a second on its top is ' + round(ring) + ' dB: ' + (ring >= -12 ? 'still ringing bright, like wire (the real chord: -16.5)' : 'dull, a thud'));
        expect(late < -16, 'at 0.8 s its top is ' + round(late) + ' dB (the real chord: -21.5)');
      });
    });

  /* ================================================================
   * Session Buddies
   * ================================================================ */
  var PL = window.BUDDIES;
  var FIX = '../tests/fixtures/thesession-';
  function json(url) { return text(url).then(function (t) { return JSON.parse(t); }); }
  function layOf(j, i) { return PL.layout(j.settings[i || 0].abc, { key: j.settings[i || 0].key, meter: j.type === 'jig' ? '6/8' : '4/4' }); }
  /* The Session Buddies page in a frame, its saved state put back after. */
  function withBuddies(fn) {
    var keys = ['players.current', 'players.tuning', 'players.sympathy', 'players.volume', 'players.swing.hornpipe',
                'buddies.favourites', 'buddies.recent', 'players.melody', 'players.yourturn', 'players.backing',
                'players.drumstyle', 'players.drumbusy', 'players.voices', 'players.mineopen',
                'players.ornaments', 'players.drumhand', 'players.hearopen'], saved = {};
    keys.forEach(function (k) { saved[k] = localStorage.getItem(k); localStorage.removeItem(k); });
    var frame = document.createElement('iframe');
    frame.src = '../buddies/';
    frame.style.cssText = 'position:absolute;left:-10000px;top:0;border:0;width:420px;height:900px';
    document.body.appendChild(frame);
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () { reject(new Error('the Session Buddies page did not load')); }, 10000);
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

  check('Session Buddies', 'It reads The Kesh from the Session note for note',
    'The Session’s setting 1 of The Kesh, read by Session Buddies, must be the melody the guitar demo plays: every note, every length, AABB, 32 bars.',
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

  check('Session Buddies', 'Repeats, endings and pickups come out as played',
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

  check('Session Buddies', 'Keys and accidentals come out right',
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

  check('Session Buddies', 'Triplets, halved notes, dotted pairs and ties keep the bar',
    'A triplet is three in the time of two, A/ is half a quaver, A>B is dotted, and a tie makes one longer note. Get one wrong and the backing slips against the tune.',
    function () {
      var b = PL.readBars('(3ABc d2 e>f g/a/b|A4- A4', { key: 'D', meter: '4/4' }), q = PL.TPQ;
      var lens = b[0].notes.map(function (n) { return n.dur / q; });
      expect(b[0].len === 8 * q, 'the bar is ' + b[0].len / q + ' quavers, not 8');
      expect(lens.join() === [2 / 3, 2 / 3, 2 / 3, 2, 1.5, 0.5, 0.5, 0.5, 1].join(), 'the notes are ' + lens.map(function (x) { return x.toFixed(2); }).join(' '));
      expect(b[1].notes.length === 1 && b[1].notes[0].dur === 8 * q, 'A4- A4 is ' + b[1].notes.length + ' notes, not one of 8 quavers');
    });

  check('Session Buddies', 'Real settings lay out in whole bars',
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

  check('Session Buddies', 'Chords come from the key, start and end at home, and all have shapes',
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

  check('Session Buddies', 'Chords follow the shape of a part',
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

  check('Session Buddies', 'Reopening the page keeps your chords and chooses the rest afresh',
    'The last tune comes back with the chords you changed, and the others chosen again, so a better way of choosing reaches it. A saved file comes back exactly as saved.',
    function () {
      return json(FIX + 'the-kesh.json').then(function (j) {
        return withBuddies(function (win, doc) {
          var PP = win.BUDDIES_PAGE;
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

  check('Session Buddies', 'Every shape plays its chord',
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

  /* The Kesh's A part on one melody instrument, each note held as the page
   * holds it: { data, notes: [{ t, midi }] }. */
  function playKeshA(lay, Instrument, level, length, SRG) {
    var q = 60 / 100 / 3, bars = lay.timeline.slice(0, 8), notes = [], t0 = 0.05;
    bars.forEach(function (tb) {
      tb.notes.forEach(function (n, i) {
        // The flute tongued on the beat and slurred between, as the page plays it (articulate()).
        var p = tb.notes[i - 1], slur = !!p && p.tick + p.dur === n.tick && p.midi !== n.midi && n.tick % 72 !== 0;
        if (slur) notes[notes.length - 1].into = true;
        notes.push({ t: t0 + n.tick / PL.TPQ * q, lenQ: n.dur / PL.TPQ, midi: n.midi, vel: n.tick % 72 === 0 ? 0.9 : 0.7, slur: slur });
      });
      t0 += 6 * q;
    });
    var o = new OfflineAudioContext(1, Math.ceil(SRG * (8 * 6 * q + 1)), SRG), bus = o.createGain();
    bus.gain.value = level; bus.connect(o.destination);
    var inst = new Instrument(o, bus);
    return Promise.resolve(inst.ready).then(function (loaded) {
      if (inst.ready && !loaded) throw new Error('the concertina recordings did not load');
      notes.forEach(function (n, i) {
        var nx = notes[i + 1];
        if (Instrument === PL.Flute) inst.note(n.t, length(n.lenQ * q, n.lenQ, !!n.into), n.midi, n.vel, 1, { slur: n.slur, into: !!n.into });
        else inst.note(n.t, length(n.lenQ * q, n.lenQ, !!nx && nx.midi === n.midi), n.midi, n.vel);
      });
      return o.startRendering();
    }).then(function (b) { return { data: b.getChannelData(0), notes: notes }; });
  }

  check('Session Buddies', 'The tune lilts: leaning on the beat, the first of a jig’s three held long',
    'Played dead even the melody ticked rather than danced. The first quaver of each group of three is held long (12% on the flute alone, more on the concertina, whose bellows give it more bounce; together they take the concertina’s lilt and play as one), the beats landing on time, beat notes leant on (the concertina harder), and no two notes weighted quite alike. The flute is labelled like the concertina.',
    function () {
      return json(FIX + 'the-kesh.json').then(function (j) {
        return withBuddies(function (win, doc) {
          var calls = { flute: [], concertina: [] };
          [['Flute', 'flute'], ['Concertina', 'concertina']].forEach(function (x) {
            var P0 = win.BUDDIES[x[0]].prototype, orig = P0.note;
            P0.note = function (t, d, m, v) { calls[x[1]].push({ t: t, v: v }); return orig.apply(this, arguments); };
          });
          win.BUDDIES_PAGE.loadTune(j, 0);
          var label = doc.getElementById('on-tune').parentNode.textContent.replace(/\s+/g, ' ').trim(), play = doc.getElementById('play');
          var q = 60 / 100 / 3;
          function measure(list) {
            var c = list.slice().sort(function (a, b) { return a.t - b.t; }), t0 = c[0] && c[0].t;
            var pos = c.map(function (x) { return (x.t - t0) / q; }), on = [], off = [], distinct = {};
            c.forEach(function (x, i) {
              var m = pos[i] % 3;
              (Math.abs(m) < 0.01 || Math.abs(m - 3) < 0.01 ? on : off).push(x.v);
              distinct[x.v.toFixed(3)] = 1;
            });
            function avg(a) { return a.reduce(function (x, y) { return x + y; }, 0) / a.length; }
            // Bar 1 is "G3 GAB", bar 2 "A3 ABd": G, then G A B, then the next bar's A.
            return { n: c.length, pos: pos, lilt: (pos[2] - pos[1]) / ((pos[3] - pos[2] + pos[4] - pos[3]) / 2),
                     lean: avg(on) / avg(off), distinct: Object.keys(distinct).length };
          }
          play.click();                                        // the flute alone
          return wait(3500).then(function () {
            play.click();
            var alone = measure(calls.flute);
            calls.flute = []; calls.concertina = [];
            doc.getElementById('on-concertina').click();       // and now both together
            return win.BUDDIES_PAGE.audio().concertina.ready.then(function () {
              play.click();
              return wait(3500);
            }).then(function () {
              var f = measure(calls.flute), c = measure(calls.concertina);
              expect(label === 'Flute (the tune)', 'the flute is labelled "' + label + '"');
              expect(alone.n >= 9 && c.n >= 9, 'only ' + alone.n + ' flute and ' + c.n + ' concertina notes were played');
              expect(alone.lilt > 1.15 && c.lilt > alone.lilt + 0.04, 'the first of "GAB" against the other two: flute alone ' + round(alone.lilt) + ', concertina ' + round(c.lilt) + ' (want over 1.15, the concertina more)');
              expect(Math.abs(f.lilt - c.lilt) < 0.005, 'together the flute lilts ' + round(f.lilt) + ', the concertina ' + round(c.lilt) + ': not as one');
              [alone, c].forEach(function (x, i) {
                expect(Math.abs(x.pos[1] - 3) < 0.001 && Math.abs(x.pos[4] - 6) < 0.001,
                       (i ? 'the concertina’s' : 'the flute’s') + ' beats land ' + round(x.pos[1]) + ' and ' + round(x.pos[4]) + ' quavers in, not on time at 3 and 6');
              });
              expect(alone.lean > 1.2 && c.lean > alone.lean, 'beat notes against the notes between: flute ' + round(alone.lean) + ', concertina ' + round(c.lean) + ' (want over 1.2, the concertina more)');
              expect(c.distinct > c.n / 2, 'only ' + c.distinct + ' different weights in ' + c.n + ' notes: mechanical');
            });
          });
        });
      });
    });

  check('Session Buddies', 'Flute and concertina are heard on time, together, on every note',
    'The flute swells in over 30 ms, so it was heard 27 ms after every note’s time while the recorded concertina was heard on it: a flam on every note, which made the two together sound jittery, and put the flute behind the backing. Each is now heard (within 6 dB of its full level) within a few milliseconds of the time, D4 to D6, and of the other.',
    function () {
      var SRG = 48000;
      function heard(Instrument, m) {
        var o = new OfflineAudioContext(1, SRG, SRG), inst = new Instrument(o, o.destination);
        return Promise.resolve(inst.ready).then(function () {
          inst.note(0.2, 0.5, m, 0.85);
          return o.startRendering();
        }).then(function (b) {
          var d = b.getChannelData(0);
          function fr(a) { var s0 = Math.floor(a * SRG), x = 0; for (var i = s0; i < s0 + 96; i++) x += d[i] * d[i]; return 10 * Math.log10(x / 96 + 1e-12); }
          var st = 0; for (var a = 0.35; a < 0.55; a += 0.002) st += fr(a); st /= 100;
          for (a = 0.15; a < 0.35; a += 0.001) if (fr(a) > st - 6) return (a - 0.2) * 1000;
          return 999;
        });
      }
      var notes = [62, 66, 69, 74, 78, 81, 86], chain = Promise.resolve(), bad = [];
      notes.forEach(function (m) {
        chain = chain.then(function () { return Promise.all([heard(PL.Flute, m), heard(PL.Concertina, m)]); }).then(function (r) {
          if (r[0] < -8 || r[0] > 10) bad.push('MIDI ' + m + ': the flute is heard at ' + Math.round(r[0]) + ' ms');
          if (r[1] < -8 || r[1] > 10) bad.push('MIDI ' + m + ': the concertina is heard at ' + Math.round(r[1]) + ' ms');
          if (Math.abs(r[0] - r[1]) > 8) bad.push('MIDI ' + m + ': ' + Math.round(Math.abs(r[0] - r[1])) + ' ms apart');
        });
      });
      return chain.then(function () { expect(bad.length === 0, bad.join('\n')); });
    });

  check('Session Buddies', 'The flute’s vibrato is light, late, and left out with the concertina',
    'Every flute note over 0.4 s wavered ±9 cents, in full within a third of a second. Against the recorded concertina, which holds its pitch to a cent or two, that beat and sounded warbly; and an Irish flute player uses little vibrato. A held note is now steady at first, with a light vibrato coming in late; playing with the concertina, none at all. (Since 1.17.0 the pitch is read from the note’s fundamental alone: the wooden flute’s overtones and breath crossed zero too; the breath still moves the reading by about a cent, a vibrato by four.)',
    function () {
      var SRG = 48000;
      // A held A4, 1.2 s: its pitch in cents, every 20 ms, from zero crossings
      // over 40 ms of its fundamental (overtones and breath filtered off).
      function held(vib) {
        var o = new OfflineAudioContext(1, SRG * 1.5, SRG), lp1 = o.createBiquadFilter(), lp2 = o.createBiquadFilter();
        lp1.type = lp2.type = 'lowpass'; lp1.frequency.value = lp2.frequency.value = 440 * 1.4;
        lp1.connect(lp2); lp2.connect(o.destination);
        var fl = new PL.Flute(o, lp1);
        fl.note(0.1, 1.2, 69, 0.85, vib);
        return o.startRendering().then(function (b) {
          var d = b.getChannelData(0), ups = [];
          for (var i = 1; i < d.length; i++) if (d[i - 1] < 0 && d[i] >= 0) ups.push(i - 1 + d[i - 1] / (d[i - 1] - d[i]));
          var out = [];
          for (var a = 0.15; a < 1.2; a += 0.02) {
            var s = (a - 0.02) * SRG, e = (a + 0.02) * SRG, w = ups.filter(function (x) { return x >= s && x < e; });
            var f = (w.length - 1) * SRG / (w[w.length - 1] - w[0]);
            out.push({ a: a - 0.1, c: 1200 * Math.log2(f / 440) });
          }
          return out;
        });
      }
      function spread(list, from, to) {
        var c = list.filter(function (x) { return x.a >= from && x.a < to; }).map(function (x) { return x.c; });
        return (Math.max.apply(null, c) - Math.min.apply(null, c)) / 2;
      }
      return Promise.all([held(), held(0)]).then(function (r) {
        var early = spread(r[0], 0.05, 0.25), late = spread(r[0], 0.6, 1.05), none = spread(r[1], 0.05, 1.05);
        expect(early < 1.5, 'the flute alone wavers ±' + round(early) + ' cents in the first quarter second of a held note: the vibrato comes in early');
        expect(late > 2.5 && late < 5, 'later in the note it wavers ±' + round(late) + ' cents (want a light vibrato, ±2.5 to 5)');
        expect(none < 1.5, 'asked for no vibrato it still wavers ±' + round(none) + ' cents');
        return json(FIX + 'the-kesh.json');
      }).then(function (j) {
        return withBuddies(function (win, doc) {
          var vibs = { alone: [], both: [] }, mode = 'alone', P0 = win.BUDDIES.Flute.prototype, orig = P0.note;
          P0.note = function (t, d, m, v, vib) { vibs[mode].push(vib == null ? 1 : vib); return orig.apply(this, arguments); };
          win.BUDDIES_PAGE.loadTune(j, 0);
          var play = doc.getElementById('play');
          play.click();
          return wait(2500).then(function () {
            play.click();
            mode = 'both';
            doc.getElementById('on-concertina').click();
            return win.BUDDIES_PAGE.audio().concertina.ready;
          }).then(function () {
            play.click();
            return wait(2500);
          }).then(function () {
            play.click();
            function all(a, v) { return a.length > 3 && a.every(function (x) { return x === v; }); }
            expect(all(vibs.alone, 1), 'the flute alone was asked for vibrato ' + JSON.stringify(vibs.alone.slice(0, 6)));
            expect(all(vibs.both, 0), 'with the concertina the flute was asked for vibrato ' + JSON.stringify(vibs.both.slice(0, 6)));
          });
        });
      });
    });

  check('Session Buddies', 'The flute plays like a player: slurred between the beats, tongued on them, a wooden tone and breath',
    'It sounded “a bit like it’s coming from a keyboard”: every note tongued and let go at 82% of its length (in a reel, about 50 ms of silence between every two notes), the same near-pure tone on every note, no breath once a note had started. Now, in The Kesh as the page plays it, a note on the beat, a repeated note and one after a rest are tongued and the rest slurred, each held into the next; a slurred change keeps the breath (the level dips under 8 dB) and the new note is heard on its time, while a tongued one stops the air; the breath sounds under a held note; and the low octave has a reedy edge the high octave lacks.',
    function () {
      var SRG = 48000;
      function hzOf(m) { return 440 * Math.pow(2, (m - 69) / 12); }
      function g(d, f, a, b) {
        var s = Math.floor(a * SRG), e = Math.floor(b * SRG), k = 2 * Math.cos(2 * Math.PI * f / SRG), q1 = 0, q2 = 0;
        for (var i = s; i < e; i++) { var q0 = k * q1 - q2 + d[i]; q2 = q1; q1 = q0; }
        return Math.sqrt(Math.max(0, q1 * q1 + q2 * q2 - k * q1 * q2));
      }
      function frame(d, a) { var x = 0, n = 0; for (var i = Math.floor(a * SRG); i < Math.floor((a + 0.005) * SRG); i++) { x += d[i] * d[i]; n++; } return 10 * Math.log10(x / n + 1e-12); }
      // Two notes, A4 then B4 at 0.5 s, slurred or tongued as the page would hold them.
      function change(slur) {
        var o = new OfflineAudioContext(1, SRG * 1.2, SRG), fl = new PL.Flute(o, o.destination);
        fl.note(0.2, slur ? 0.3 + (PL.Flute.prototype.OVERLAP || 0.012) : 0.3 - 0.035, 69, 0.8, 0, { into: slur });
        fl.note(0.5, 0.4, 71, 0.8, 0, { slur: slur });
        return o.startRendering().then(function (b) {
          var d = b.getChannelData(0), f = hzOf(71), st = g(d, f, 0.65, 0.67), heard = 999, around = frame(d, 0.42), dip = 0;
          for (var a = 0.45; a < 0.55; a += 0.001) if (g(d, f, a - 0.01, a + 0.01) > st / 2) { heard = (a - 0.5) * 1000; break; }
          for (a = 0.44; a < 0.53; a += 0.0025) dip = Math.min(dip, frame(d, a) - around);
          return { heard: heard, dip: dip };
        });
      }
      // A held note: its 2nd harmonic against the note, and the breath (the rest, harmonics notched out).
      function held(m) {
        var o = new OfflineAudioContext(1, SRG * 1.2, SRG), f = hzOf(m), dest = o.destination;
        var o2 = new OfflineAudioContext(1, SRG * 1.2, SRG), n = o2.destination;
        for (var k = 8; k >= 1; k--) { var nf = o2.createBiquadFilter(); nf.type = 'notch'; nf.frequency.value = f * k; nf.Q.value = 3; nf.connect(n); n = nf; }
        new PL.Flute(o, dest).note(0.1, 0.8, m, 0.85, 0);
        new PL.Flute(o2, n).note(0.1, 0.8, m, 0.85, 0);
        return Promise.all([o.startRendering(), o2.startRendering()]).then(function (r) {
          var d = r[0].getChannelData(0), e = r[1].getChannelData(0);
          function rms(x) { var s = 0, c = 0; for (var i = Math.floor(0.3 * SRG); i < Math.floor(0.7 * SRG); i++) { s += x[i] * x[i]; c++; } return 10 * Math.log10(s / c); }
          return { second: 20 * Math.log10(g(d, 2 * f, 0.3, 0.7) / g(d, f, 0.3, 0.7)), breath: rms(e) - rms(d) };
        });
      }
      return json(FIX + 'the-kesh.json').then(function (j) {
        return withBuddies(function (win) {
          var PP = win.BUDDIES_PAGE, bad = [], fl = [], beat = 60 / +win.document.getElementById('bpm').value;
          PP.loadTune(j, 0);
          [0, 1, 2, 3, 4, 5, 6, 7].forEach(function (n) {
            PP.plan(n).forEach(function (x) { if (x.who === 'flute') fl.push({ bar: n, t: x.t, d: x.dur, m: x.midi, slur: x.slur }); });
          });
          var slurred = 0;
          fl.forEach(function (x, i) {
            var p = fl[i - 1], onBeat = Math.abs(x.t / beat - Math.round(x.t / beat)) < 1e-6;
            if (x.slur) slurred++;
            if (x.slur && onBeat) bad.push('bar ' + (x.bar + 1) + ': a note on the beat is slurred');
            if (x.slur && p && p.bar === x.bar && p.m === x.m) bad.push('bar ' + (x.bar + 1) + ': a repeated note is slurred');
            if (p && p.bar === x.bar) {
              if (x.slur && p.t + p.d <= x.t) bad.push('bar ' + (x.bar + 1) + ': the note before a slur stops before it');
              if (!x.slur && p.t + p.d >= x.t) bad.push('bar ' + (x.bar + 1) + ': the note before a tongued one runs into it');
            }
          });
          if (slurred < fl.length * 0.3 || slurred > fl.length * 0.7) bad.push(slurred + ' of ' + fl.length + ' notes slurred');
          return Promise.all([change(true), change(false), held(62), held(86)]).then(function (r) {
            if (Math.abs(r[0].heard) > 8) bad.push('a slurred note is heard at ' + round(r[0].heard) + ' ms');
            if (r[0].dip < -8) bad.push('a slurred change dips ' + round(-r[0].dip) + ' dB: the breath stops');
            if (r[1].dip > -20) bad.push('a tongued change dips only ' + round(-r[1].dip) + ' dB: the tongue does not stop the air');
            if (r[2].breath < -40) bad.push('no breath under a held low D (' + round(r[2].breath) + ' dB)');
            if (!(r[2].second > -10 && r[3].second < -10)) bad.push('the second harmonic is ' + round(r[2].second) + ' dB at low D and ' + round(r[3].second) + ' at high D: no reedy low octave');
            expect(bad.length === 0, bad.join('\n'));
          });
        });
      });
    });

  check('Session Buddies', 'The flute plays the rolls and cuts a setting writes, and they can be turned off',
    'A roll (~) and grace notes ({g}, a cut) were read past: about one popular setting in five writes rolls. Now the reader keeps them on their notes, every note where it was; the flute plays a long roll (a dotted crotchet: the note, a cut on its second quaver to two steps above, a tap on its third to the step below), a short roll (a crotchet: the cut on its first quaver, the tap on its second) and a grace note as a flick on the note’s time, all under one breath, the flick heard; the concertina keeps to the plain notes; and Ornaments: Off plays the plain tune, the choice kept.',
    function () {
      // The reader: ornaments on their notes, nothing moved.
      var plain = PL.layout('|:A3 B2c|d2B A3:|', { key: 'Dmajor', meter: '6/8' }), fancy = PL.layout('|:~A3 B2{e}c|d2B !roll!A3:|', { key: 'Dmajor', meter: '6/8' });
      function seq(l) { return [].concat.apply([], l.timeline.map(function (tb) { return tb.notes.map(function (n) { return n.tick + ':' + n.dur + ':' + n.midi; }); })).join(' '); }
      expect(seq(plain) === seq(fancy), 'ornaments moved the notes: ' + seq(fancy));
      var n0 = fancy.timeline[0].notes;
      expect(n0[0].orn === 'roll' && n0[2].grace && n0[2].grace[0] === 76 && fancy.timeline[1].notes[2].orn === 'roll', 'the roll, the cut on c (an e) and the !roll! are not on their notes');
      return Promise.all([json(FIX + 'the-kesh.json'), json(FIX + 'cooleys.json')]).then(function (r) {
        return withBuddies(function (win, doc) {
          var PP = win.BUDDIES_PAGE, bad = [];
          function q() { return 60 / +doc.getElementById('bpm').value / PP.TYPES[PP.tune().meta.type].per; }
          function flute(n) { return PP.plan(n).filter(function (x) { return x.who === 'flute'; }); }
          function at(x) { return x.t / q(); }
          // A long roll: The Kesh, setting 3, bar 19, ~B3 (B4 in G).
          PP.loadTune(r[0], 2);
          var b = flute(18), plainNext = b.filter(function (x) { return !x.grace; });
          var cut = b[1], tap = b[3];
          if (!(b[0].midi === 71 && !b[0].grace && Math.abs(at(b[0])) < 0.01)) bad.push('long roll: it does not start on the B, on the beat');
          if (!(cut && cut.grace && cut.midi === 74 && Math.abs(at(cut) - 1) < 0.25)) bad.push('long roll: no cut to D on the second quaver: ' + JSON.stringify(cut));
          if (!(tap && tap.grace && tap.midi === 69 && Math.abs(at(tap) - 2) < 0.25)) bad.push('long roll: no tap to A on the third quaver: ' + JSON.stringify(tap));
          if (!b.slice(1, 5).every(function (x) { return x.slur; })) bad.push('long roll: tongued inside the roll');
          if (!(cut && cut.dur < 0.06 && tap && tap.dur < 0.06)) bad.push('long roll: the cut and tap are not flicks: ' + (cut && Math.round(cut.dur * 1000)) + ', ' + (tap && Math.round(tap.dur * 1000)) + ' ms');
          // A short roll: Cooley's, setting 2, bar 17, ~G2 on beat 2 (G4 in E minor).
          PP.loadTune(r[1], 1);
          var c = flute(16), i = c.findIndex(function (x) { return x.grace; });
          if (!(i >= 0 && c[i].midi === 71 && Math.abs(at(c[i]) - 2) < 0.01 && c[i + 1].midi === 67 && c[i + 2].grace && c[i + 2].midi === 66 && Math.abs(at(c[i + 2]) - 3) < 0.25))
            bad.push('short roll: not a cut to B on the beat and a tap to F♯ on the next quaver: ' + c.map(function (x) { return x.midi + '@' + round(at(x), 2); }).join(' '));
          // The concertina keeps to the plain notes; Off plays them on the flute too.
          doc.getElementById('on-concertina').click();
          var conc = PP.plan(16).filter(function (x) { return x.who === 'concertina'; }).length;
          doc.getElementById('on-concertina').click();
          doc.querySelector('#ornaments [data-orn="off"]').click();
          var off = flute(16);
          if (off.some(function (x) { return x.grace; }) || off.length !== conc) bad.push('Off: the flute plays ' + off.length + ' notes with ' + off.filter(function (x) { return x.grace; }).length + ' flicks; the concertina ' + conc);
          if (win.localStorage.getItem('players.ornaments') !== 'off') bad.push('the choice is not kept');
          doc.querySelector('#ornaments [data-orn="written"]').click();
          // A cut: The Kesh, setting 2, bar 1, {g}A: a G5 flick on the beat, then the A.
          PP.loadTune(r[0], 1);
          var k = flute(0);
          if (!(k[0].grace && k[0].midi === 79 && Math.abs(at(k[0])) < 0.01 && k[1].midi === 69 && !k[1].grace)) bad.push('the cut {g}A is not a G flick on the beat, then the A');
          // And the flick is heard: a long roll on the flute, the cut's pitch over its 26 ms against the plain note there.
          var SRG = 48000;
          function roll(withIt) {
            var o = new OfflineAudioContext(1, SRG, SRG), fl = new PL.Flute(o, o.destination), qs = 0.2, t = 0.1;
            if (withIt) {
              fl.note(t, qs + 0.012, 71, 0.8, 0, { into: true });
              fl.note(t + qs, 0.038, 74, 0.7, 0, { slur: true, into: true });
              fl.note(t + qs + 0.026, qs - 0.026 + 0.012, 71, 0.8, 0, { slur: true, into: true });
              fl.note(t + 2 * qs, 0.044, 69, 0.5, 0, { slur: true, into: true });
              fl.note(t + 2 * qs + 0.032, qs - 0.032, 71, 0.8, 0, { slur: true });
            } else fl.note(t, 3 * qs, 71, 0.8, 0);
            return o.startRendering().then(function (b) { return b.getChannelData(0); });
          }
          function g(d, f, a, z) { var s0 = Math.floor(a * SRG), e = Math.floor(z * SRG), kk = 2 * Math.cos(2 * Math.PI * f / SRG), q1 = 0, q2 = 0; for (var j = s0; j < e; j++) { var q0 = kk * q1 - q2 + d[j]; q2 = q1; q1 = q0; } return Math.sqrt(Math.max(0, q1 * q1 + q2 * q2 - kk * q1 * q2)); }
          return Promise.all([roll(true), roll(false)]).then(function (rr) {
            var fD = 440 * Math.pow(2, (74 - 69) / 12), lift = 20 * Math.log10(g(rr[0], fD, 0.3, 0.326) / g(rr[1], fD, 0.3, 0.326));
            if (!(lift > 10)) bad.push('the cut is not heard: its D only ' + round(lift) + ' dB over the plain B there');
            expect(bad.length === 0, bad.join('\n'));
          });
        });
      });
    });

  check('Session Buddies', 'Together, the flute and concertina start each note as one and don’t clash at the changes',
    'In The Sunny Banks the concertina’s old note sat against the flute’s new one for about 130 ms at most changes, seconds and thirds apart, and their notes between the beats started up to 12 ms apart (each with its own lilt). Playing together they now take one lilt, and the concertina’s note stops as quickly as a real reed does.',
    function () {
      return json(FIX + 'cooleys.json').then(function (j) {
        return withBuddies(function (win, doc) {
          var calls = { flute: [], concertina: [] };
          [['Flute', 'flute'], ['Concertina', 'concertina']].forEach(function (x) {
            var P0 = win.BUDDIES[x[0]].prototype, orig = P0.note;
            P0.note = function (t, d, m) { calls[x[1]].push({ t: t, d: d, m: m }); return orig.apply(this, arguments); };
          });
          win.BUDDIES_PAGE.loadTune(j, 0);
          doc.getElementById('on-concertina').click();
          var inst = win.BUDDIES_PAGE.audio().concertina;
          return inst.ready.then(function () {
            doc.getElementById('play').click();
            return wait(3500);
          }).then(function () {
            var F = calls.flute.sort(function (a, b) { return a.t - b.t; }), C = calls.concertina.sort(function (a, b) { return a.t - b.t; });
            var tail = 2.3 * inst.REL, worst = 0, apart = 0;
            C.forEach(function (c) {
              F.forEach(function (f) {
                if (f.m === c.m) return;
                var a = Math.max(c.t, f.t), b = Math.min(c.t + c.d + tail, f.t + f.d);
                worst = Math.max(worst, b - a);
              });
            });
            C.forEach(function (c, i) { if (F[i] && F[i].m === c.m) apart = Math.max(apart, Math.abs(c.t - F[i].t)); });
            expect(C.length > 8 && F.length === C.length, C.length + ' concertina and ' + F.length + ' flute notes');
            expect(apart < 0.001, 'the same note starts up to ' + Math.round(apart * 1000) + ' ms apart on the two');
            expect(worst < 0.05, 'the concertina’s old note sounds against the flute’s new one for ' + Math.round(worst * 1000) + ' ms');
          });
        });
      });
    });

  check('Session Buddies', 'The concertina’s notes carry over, and a repeated note is struck again',
    'On the instrument the bellows keep the air up, so one note runs into the next; 1.5.0 fell silent, 85 dB down, between every two. A repeated note (the Ds of “edd”) is still played twice. And a held note lives, wandering a little in level, without warbling.',
    function () {
      return Promise.all([json(FIX + 'the-kesh.json')]).then(function (r) {
        return withBuddies(function (win) { return win.BUDDIES_PAGE; }).then(function (PP) {
          var SRG = 48000;
          return playKeshA(layOf(r[0]), PL.Concertina, PP.MIX.concertina, PP.concertinaLength, SRG).then(function (out) {
            var d = out.data, notes = out.notes;
            function frame(a, w) {
              var s = Math.floor(a * SRG), e = s + Math.floor(w * SRG), x = 0;
              for (var i = s; i < e; i++) x += d[i] * d[i];
              return 10 * Math.log10(x / (e - s) + 1e-12);
            }
            var dips = [], reps = [];
            for (var i = 1; i < notes.length; i++) {
              var b = notes[i].t, mid = (frame(b - 0.07, 0.03) + frame(b + 0.05, 0.03)) / 2, lo = Infinity;
              for (var x = b - 0.03; x < b + 0.02; x += 0.002) lo = Math.min(lo, frame(x, 0.004));
              (notes[i].midi === notes[i - 1].midi ? reps : dips).push(lo - mid);
            }
            function median(a) { var s = a.slice().sort(function (p, q) { return p - q; }); return s[Math.floor(s.length / 2)]; }
            var held = [];
            for (var y = 0.15; y < 0.45; y += 0.01) held.push(frame(y, 0.025));
            var mean = held.reduce(function (p, c) { return p + c; }, 0) / held.length;
            var sd = Math.sqrt(held.reduce(function (p, c) { return p + (c - mean) * (c - mean); }, 0) / held.length);
            expect(median(dips) > -6, 'between two different notes the sound falls ' + round(-median(dips)) + ' dB: the notes do not carry over');
            expect(median(reps) < -6, 'a repeated note dips only ' + round(-median(reps)) + ' dB: it runs into one long note');
            expect(sd > 0.15 && sd < 1, 'a held note’s level moves ' + round(sd) + ' dB: ' + (sd <= 0.15 ? 'fixed, like a machine' : 'a warble'));
          });
        });
      });
    });

  check('Session Buddies', 'The concertina holds a long note steady, without a waver each time round its loop',
    'Long notes are looped through their steady part, and until 1.7.4 the loop’s join and its start in a dip just after the attack made them waver with every pass, twice a second (F#4 by 18 cents); and the F#4 recording wobbles ±11 cents on its own. Held for 3 s, each note from D4 to A5 now wavers under 1.5 cents, and with each pass of the loop under 2 cents and 1.3 dB.',
    function () {
      var SR = 48000, secs = 3, bad = [], chain = Promise.resolve();
      function mean(x) { return x.reduce(function (p, v) { return p + v; }, 0) / x.length; }
      function sd(x) { var m = mean(x); return Math.sqrt(mean(x.map(function (v) { return (v - m) * (v - m); }))); }
      function at(x, f) {            // how much of the track moves at f Hz (samples every 10 ms)
        var m = mean(x), re = 0, im = 0;
        x.forEach(function (v, i) { re += (v - m) * Math.cos(2 * Math.PI * f * i * 0.01); im += (v - m) * Math.sin(2 * Math.PI * f * i * 0.01); });
        return 2 * Math.sqrt(re * re + im * im) / x.length;
      }
      function held(midi) {
        var o = new OfflineAudioContext(1, SR * (secs + 0.5), SR), c = new PL.Concertina(o, o.destination);
        return Promise.resolve(c.ready).then(function (loaded) {
          if (!loaded) throw new Error('the concertina recordings did not load');
          c.note(0.1, secs, midi, 0.85);
          return o.startRendering();
        }).then(function (b) {
          var d = b.getChannelData(0), s = c.pick(midi), P = SR / (440 * Math.pow(2, (midi - 69) / 12)), W = Math.round(0.04 * SR);
          var hz = Math.pow(2, (midi - s.midi - s.cents / 100) / 12) / (s.le - s.ls), pitch = [], level = [];
          for (var t = 0.9; t < secs; t += 0.01) {   // well into the loop: pitch by autocorrelation over 40 ms, level over 40 ms
            var a = Math.round(t * SR), sc = {}, best = -1, bl = 0, L, k, v = 0;
            for (L = Math.floor(P * 0.97); L <= Math.ceil(P * 1.03); L++) {
              var xy = 0, xx = 0, yy = 0;
              for (k = 0; k < W; k++) { var x = d[a + k], y = d[a + k + L]; xy += x * y; xx += x * x; yy += y * y; }
              sc[L] = xy / Math.sqrt(xx * yy + 1e-12);
              if (sc[L] > best) { best = sc[L]; bl = L; }
            }
            var p = sc[bl - 1], q = sc[bl + 1], off = p != null && q != null ? 0.5 * (p - q) / (p - 2 * best + q) : 0;
            pitch.push(1200 * Math.log2(P / (bl + off)));
            for (k = 0; k < 1920; k++) v += d[a + k] * d[a + k];
            level.push(10 * Math.log10(v / 1920));
          }
          function loop(x) { return Math.sqrt([1, 2, 3].reduce(function (p, k) { return p + Math.pow(at(x, hz * k), 2); }, 0)); }
          var w = sd(pitch), lp = loop(pitch), ll = loop(level), name = 'MIDI ' + midi + (s.midi !== midi ? ' (from ' + s.midi + ')' : '');
          if (w > 1.5) bad.push(name + ' wavers ' + round(w) + ' cents');
          if (lp > 2) bad.push(name + ' wavers ' + round(lp) + ' cents with each pass of its loop');
          if (ll > 1.3) bad.push(name + ' wavers ' + round(ll) + ' dB with each pass of its loop');
        });
      }
      [62, 64, 66, 67, 69, 71, 74, 76, 78, 79, 81].forEach(function (m) { chain = chain.then(function () { return held(m); }); });
      return chain.then(function () { expect(bad.length === 0, bad.join('\n')); });
    });

  check('Session Buddies', 'The concertina sounds like a reed, plays in tune, and sits with the flute',
    'A free reed is rich in overtones where the flute’s fall away (since 1.17.0 the wooden flute has a reedy edge in its low octave, but still well under the reed’s); each recorded note retuned to within a few cents of true (the instrument sits up to 28 cents sharp); and at their starting levels, each playing the Kesh’s A part as the page plays it, the concertina sits just under the flute, not swamping it or lost.',
    function () {
      return Promise.all([json(FIX + 'the-kesh.json')]).then(function (r) {
        return withBuddies(function (win) { return win.BUDDIES_PAGE; }).then(function (PP) {
          var MIX = PP.MIX, SRG = 48000, lay = layOf(r[0]), q = 60 / 100 / 3;
          function render(Instrument, level, length) { return playKeshA(lay, Instrument, level, length, SRG); }
          function g(d, f, a, b) {
            var s = Math.floor(a * SRG), e = Math.floor(b * SRG), k = 2 * Math.cos(2 * Math.PI * f / SRG), q1 = 0, q2 = 0;
            for (var i = s; i < e; i++) { var q0 = k * q1 - q2 + d[i]; q2 = q1; q1 = q0; }
            return Math.sqrt(Math.max(0, q1 * q1 + q2 * q2 - k * q1 * q2));
          }
          function db(d) { var s = 0; for (var i = 0; i < d.length; i++) s += d[i] * d[i]; return 10 * Math.log10(s / d.length); }
          return Promise.all([render(PL.Concertina, MIX.concertina, PP.concertinaLength), render(PL.Flute, MIX.tune, PP.fluteLength)]).then(function (out) {
            var c = out[0].data, f = out[1].data, f0 = 440 * Math.pow(2, (lay.timeline[0].notes[0].midi - 69) / 12);
            // The note's actual pitch first: each reed is a few cents off on
            // purpose, and at the fifth harmonic that is enough to measure
            // beside the overtone instead of on it.
            var best = 0, bf = 0;
            for (var x = f0 * 0.98; x <= f0 * 1.02; x += f0 / 4000) { var v = g(c, x, 0.15, 0.45); if (v > best) { best = v; bf = x; } }
            function over(d, p, k) { return 20 * Math.log10(g(d, p * k, 0.15, 0.45) / g(d, p, 0.15, 0.45)); }
            var reed = [2, 3, 4, 5, 6].map(function (k) { return over(c, bf, k); }), pure = [4, 5].map(function (k) { return over(f, f0, k); });
            var flutes = [2, 3, 4, 5, 6].map(function (k) { return over(f, f0, k); });
            // A real reed is uneven, its 3rd overtone stronger than the note, its 2nd weak:
            // what counts is how much is in the overtones altogether.
            var together = 10 * Math.log10(reed.reduce(function (p, v) { return p + Math.pow(10, v / 10); }, 0));
            var cents = 1200 * Math.log2(bf / f0), gap = db(c) - db(f);
            expect(together > -6, 'the concertina’s 2nd to 6th overtones (' + reed.map(round).join(', ') + ' dB) come to ' + round(together) + ' dB: too pure for a reed');
            var fTogether = 10 * Math.log10(flutes.reduce(function (p, v) { return p + Math.pow(10, v / 10); }, 0));
            expect(pure.every(function (v) { return v < -15; }) && fTogether < together - 3,
                   'the flute’s overtones (' + flutes.map(round).join(', ') + ' dB, ' + round(fTogether) + ' together) are as strong as a reed’s (' + round(together) + ')');
            expect(Math.abs(cents) < 5, 'the concertina’s first note is ' + round(cents) + ' cents out');
            expect(gap > -3 && gap < 1, 'the concertina is ' + round(gap) + ' dB against the flute, not just under it');
          });
        });
      });
    });

  check('Session Buddies', 'Ticking the concertina plays the tune on it',
    'The concertina is a fourth voice in the mixer, off to begin with. Ticked, the tune is played on it; with the flute unticked, on it alone.',
    function () {
      return json(FIX + 'the-kesh.json').then(function (j) {
        return withBuddies(function (win, doc) {
          var PP = win.BUDDIES_PAGE, n = { c: 0, f: 0 }, PLw = win.BUDDIES;
          var cn = PLw.Concertina.prototype.note, fn = PLw.Flute.prototype.note;
          PLw.Concertina.prototype.note = function () { n.c++; return cn.apply(this, arguments); };
          PLw.Flute.prototype.note = function () { n.f++; return fn.apply(this, arguments); };
          PP.loadTune(j, 0);
          var startsOff = !doc.getElementById('on-concertina').checked;
          doc.getElementById('on-concertina').click();       // tick the concertina
          doc.getElementById('on-tune').click();             // untick the flute
          doc.getElementById('play').click();
          return wait(3500).then(function () {
            expect(startsOff, 'the concertina is ticked on a first visit');
            expect(n.c > 4, 'the concertina played ' + n.c + ' notes');
            expect(n.f === 0, 'the flute played ' + n.f + ' notes though unticked');
          });
        });
      });
    });

  check('Session Buddies', 'A first visit opens with a tune ready to play',
    'Someone pressed Play on a first visit, before finding a tune, and nothing played. A first visit now opens with The Kesh (the Session’s setting 1, kept in the page, so no search or network is needed) and says so, and Play plays it. A tune left on the page last time still comes back instead.',
    function () {
      return Promise.all([json(FIX + 'the-kesh.json'), json(FIX + 'cooleys.json')]).then(function (r) {
        return withBuddies(function (win, doc) {
          var PP = win.BUDDIES_PAGE, t = PP.tune(), play = doc.getElementById('play');
          expect(!!t && t.meta.name === 'The Kesh', 'a first visit opens with ' + (t ? t.meta.name : 'no tune'));
          expect(t.settings[0].abc === r[0].settings[0].abc && t.settings[0].key === r[0].settings[0].key, 'the starter is not the Session’s setting 1 of The Kesh');
          expect(!play.disabled, 'Play is not ready');
          expect(/The Kesh/.test(doc.getElementById('find-status').textContent), 'the page does not say The Kesh is there to start with');
          play.click();
          return wait(1500).then(function () {
            expect(PP.playing(), 'pressing Play did not play it');
            play.click();
            PP.loadTune(r[1], 0);                          // a tune of your own, then the page reopened
            return new Promise(function (ok) { win.frameElement.onload = ok; win.location.reload(); });
          }).then(function () { return wait(300); }).then(function () {
            var again = win.BUDDIES_PAGE.tune();
            expect(again && again.meta.name === r[1].name, 'reopened, the page has ' + (again ? again.meta.name : 'no tune') + ' instead of ' + r[1].name);
          });
        });
      });
    });

  check('Session Buddies', 'Hornpipes, polkas, slides, slip jigs and waltzes play, each in its own time',
    'Only jigs and reels could be played. Now a real tune of each of four more (The Boys of Bluehill, The Britches Full of Stitches, The Road to Lisdoonvarna, The Butterfly), and since 1.16.0 a waltz (a made-up one in 3/4), reads in whole bars, every chord has a shape, and it plays: the strums of a bar where its type puts them, the hornpipe swung long-short and the others straight, the tune’s beats on time; a hornpipe swung by its Swing control (64:36 to start), guitar and tune together, its triplets kept even and a setting written dotted (B>A) played as written; a polka’s written dotted pair (d>e) not dotted twice; a slip jig’s second chord on its third beat, not mid-beat; a slide’s phrase four of its long bars; a waltz’s guitar oom-pa-pa (the bass note alone on 1, the chord on 2 and 3), its second chord on the third beat.',
    function () {
      var names = ['the-boys-of-bluehill', 'britches-full-of-stitches', 'the-road-to-lisdoonvarna', 'the-butterfly'];
      // And a hornpipe written dotted, as many settings are.
      var dotted = { id: 0, name: 'A dotted hornpipe', type: 'hornpipe', url: '', dotted: true, settings: [{ id: 0, url: '', key: 'Dmajor',
        date: '', member: { name: 'a check' }, abc: '|:B>AF>A D2F>A|B>AF>A d2e>d|B>AF>A D2F>A|B>AF>A d4:|' }] };
      // A waltz, made up for the check: a crotchet pickup, two 8-bar parts.
      var waltz = { id: 0, name: 'A made-up waltz', type: 'waltz', url: '', settings: [{ id: 0, url: '', key: 'Dmajor', date: '', member: { name: 'a check' },
        abc: 'A2|:d2 f2 a2|g2 f2 e2|d2 B2 A2|F4 A2|B2 d2 B2|A2 F2 D2|E2 F2 G2|A4 A2:|' +
             '|:a3 g f2|g2 e2 c2|d2 f2 a2|b4 a2|g2 e2 c2|d2 B2 A2|F2 E2 F2|D4 A2:|' }] };
      return Promise.all(names.map(function (n) { return json(FIX + n + '.json'); })).then(function (tunes) {
        tunes.push(dotted, waltz);
        return withBuddies(function (win, doc) {
          var PP = win.BUDDIES_PAGE, B = win.BUDDIES, bad = [], strums = [], notes = [];
          doc.querySelector('#backing-feel [data-backing="straight"]').click();   // where each type puts its strums, before any lilt
          var GP = win.GTR.Guitar.prototype, gs = GP.strum, FP = B.Flute.prototype, fn = FP.note;
          GP.strum = function (n, t, dir) { strums.push({ t: t, d: dir }); return gs.apply(this, arguments); };
          FP.note = function (t, d, m) { notes.push({ t: t, m: m }); return fn.apply(this, arguments); };
          expect(/hornpipes, polkas, slides, slip jigs and waltzes/.test(doc.querySelector('h2 .tag').textContent), 'Find a tune does not say what can be played');
          var chain = Promise.resolve();
          tunes.forEach(function (j) {
            chain = chain.then(function () {
              var ty = PP.TYPES[j.type];
              if (!ty) { bad.push(j.name + ': a ' + j.type + ' cannot be played'); return; }
              PP.loadTune(j, 0);
              var t = PP.tune(), lay = t.lay, L = lay.meter.bar, name = j.name + ' (' + j.type + ')';
              if (lay.meter.bar !== ty.slots * PL.TPQ) bad.push(name + ': its bar is ' + lay.meter.bar / PL.TPQ + ' quavers, not ' + ty.slots);
              lay.timeline.forEach(function (tb) {
                if (!/@0$/.test(tb.slot) && !/^end@/.test(tb.slot)) bad.push(name + ': bar ' + tb.slot + ' does not start on a bar line');
                tb.notes.forEach(function (n) { if (n.tick + n.dur > L + 0.5) bad.push(name + ': a note runs past its bar'); });
              });
              lay.slots.forEach(function (sl) {
                t.chords[sl.id].forEach(function (c) { ['standard', 'dadgad'].forEach(function (tn) { if (!B.shape(tn, c)) bad.push(name + ': no ' + tn + ' shape for ' + c); }); });
              });
              strums = []; notes = [];
              doc.getElementById('countin').value = '1';
              doc.getElementById('bpm').value = ty.bpm.max; doc.getElementById('bpm').dispatchEvent(new win.Event('input'));
              var bpm = +doc.getElementById('bpm').value, q = 60 / bpm / ty.per, bar = ty.slots * q;
              doc.getElementById('play').click();
              return wait((3 * bar + 0.6) * 1000).then(function () {
                doc.getElementById('play').click();
                if (!strums.length) { bad.push(name + ': it did not play'); return; }
                var t0 = strums[0].t, first = strums.filter(function (x) { return x.t < t0 + bar - 0.001; });
                var pos = first.map(function (x) { return (x.t - t0) / q; }), want = ty.strums.lilt.slots;
                if (first.length !== want.length) bad.push(name + ': ' + first.length + ' strums in a bar, not ' + want.length);
                want.forEach(function (w, i) {
                  var at = ty.swing && w.s % ty.per ? w.s + win.TRAD.swingShift((w.s % ty.per) / ty.per, ty.swing) * ty.per : w.s;
                  if (pos[i] == null || Math.abs(pos[i] - at) > 0.03) bad.push(name + ': strum ' + (i + 1) + ' at ' + round(pos[i]) + ' quavers, not ' + round(at));
                });
                var tn = notes.filter(function (x) { return x.t >= t0 - 0.03 && x.t < t0 + bar - 0.03; }).map(function (x) { return (x.t - t0) / q; });
                var beats = tn.filter(function (p) { return Math.abs(p - Math.round(p / ty.per) * ty.per) < 0.03; });
                if (!beats.length || Math.abs(tn[0]) > 0.03) bad.push(name + ': the tune’s first note of the bar is at ' + round(tn[0]) + ' quavers, not on the beat');
                if (j.type === 'hornpipe' && !j.dotted) {   // "BA FA D2 FA": the A between the beats swung late
                  var share = PP.swingNow();
                  if (Math.abs(share - 0.64) > 0.005) bad.push(name + ': its swing starts at ' + win.TRAD.swingLabel(share) + ', not 64:36');
                  if (Math.abs(tn[1] - 2 * share) > 0.04) bad.push(name + ': its straight quavers go ' + round(tn[1], 2) + ' : ' + round(2 - tn[1], 2) + ', not swung ' + win.TRAD.swingLabel(share));
                  if (Math.abs(pos[1] - 2) > 0.03) bad.push(name + ': the guitar’s beat 2 is at ' + round(pos[1]) + ' quavers');
                  if (Math.abs(pos[2] - 2 - 2 * share) > 0.03) bad.push(name + ': the guitar’s up between beats 2 and 3 is ' + round(pos[2] - 2, 2) + ' quavers after beat 2, not swung ' + win.TRAD.swingLabel(share));
                  // Bar 2, "BA (3Bcd e2 de": the triplet even, on 2, 2.67, 3.33.
                  var t2 = notes.filter(function (x) { return x.t >= t0 + bar - 0.03 && x.t < t0 + 2 * bar - 0.03; }).map(function (x) { return (x.t - t0 - bar) / q; });
                  [2, 8 / 3, 10 / 3].forEach(function (want) {
                    if (!t2.some(function (p) { return Math.abs(p - want) < 0.03; })) bad.push(name + ': its triplet is not even: bar 2’s notes at ' + t2.map(function (p) { return round(p, 2); }).join(', '));
                  });
                }
                if (j.dotted && Math.abs(tn[1] - 1.5) > 0.03) bad.push(name + ': its written B>A plays at ' + round(tn[1], 2) + ', not 1.5 (dotted twice)');
                if (j.type === 'polka' && Math.abs(tn[1] - 1.5) > 0.03) bad.push(name + ': its written d>e plays at ' + round(tn[1], 2) + ', not 1.5 (dotted twice)');
                if (j.type === 'slip jig' && lay.meter.half !== 6 * PL.TPQ) bad.push(name + ': its second chord comes in at quaver ' + lay.meter.half / PL.TPQ + ', not on the third beat (6)');
                if (j.type === 'slide' && lay.meter.phrase !== 4) bad.push(name + ': its phrase is ' + lay.meter.phrase + ' long bars, not 4');
                if (j.type === 'waltz') {
                  var dirs = first.map(function (x) { return x.d; }).join('');
                  if (dirs !== 'BTT') bad.push(name + ': its guitar plays ' + dirs + ' in a bar, not the bass note then the chord twice (BTT)');
                  if (lay.meter.half !== 4 * PL.TPQ) bad.push(name + ': its second chord comes in at quaver ' + lay.meter.half / PL.TPQ + ', not on the third beat (4)');
                  if (!/, slip jigs and waltzes$/.test(PP.PLAYABLE)) bad.push('the page says “' + PP.PLAYABLE + '” can be played');
                }
              });
            });
          });
          return chain.then(function () {
            GP.strum = gs; FP.note = fn;
            expect(bad.length === 0, bad.join('\n'));
          });
        });
      });
    });

  check('Session Buddies', 'A waltz’s oom is the bass note alone, its pa-pa the top of the chord',
    'Backing a waltz, the guitar plays the bass note alone on the first beat and the chord on the other two. The bass stroke (B) strikes one string only: the one asked for (since 1.20.0, the root or the fifth), else the shape’s lowest; the chord stroke (T) goes down through its top four, high strings last; in both tunings.',
    function () {
      var bad = [];
      [['standard', 'G'], ['standard', 'Em'], ['dadgad', 'D'], ['dadgad', 'A']].forEach(function (x) {
        var v = PL.voicing(x[0], x[1]), o = new OfflineAudioContext(1, 4800, 48000), g = new window.GTR.Guitar(o, o.destination), hit = [];
        g._string = function (k) { hit.push(k); };
        var played = [];
        v.forEach(function (m, k) { if (m != null) played.push(k); });
        g.strum(v, 0.01, 'B', 1);
        if (hit.join() !== String(played[0])) bad.push(x.join(' ') + ': the bass stroke struck strings ' + hit.join(', ') + ', not ' + played[0] + ' alone');
        hit = [];
        g.strum(v, 0.03, 'B', 1, played[1]);
        if (hit.join() !== String(played[1])) bad.push(x.join(' ') + ': asked for string ' + played[1] + ', the bass stroke struck ' + hit.join(', '));
        hit = [];
        g.strum(v, 0.05, 'T', 0.6, 4);
        if (hit.join() !== played.slice(-4).join()) bad.push(x.join(' ') + ': the chord stroke struck ' + hit.join(', ') + ', not ' + played.slice(-4).join(', '));
      });
      expect(bad.length === 0, bad.join('\n'));
    });

  check('Session Buddies', 'A waltz’s bass walks between the root and the fifth',
    'The oom of a waltz was always the shape’s lowest string. A guitarist backing a waltz takes the chord’s root on one bar and its fifth on the next; so does the page, from the first bar of each time through, in both tunings, on the lowest string of the shape that has each.',
    function () {
      return withBuddies(function (win, doc) {
        var PP = win.BUDDIES_PAGE, bad = [];
        var waltz = { id: 0, name: 'A made-up waltz', type: 'waltz', url: '', settings: [{ id: 0, url: '', key: 'Dmajor', date: '', member: { name: 'a check' },
          abc: 'A2|:d2 f2 a2|g2 f2 e2|d2 B2 A2|F4 A2|B2 d2 B2|A2 F2 D2|E2 F2 G2|A4 A2:|' + '|:a3 g f2|g2 e2 c2|d2 f2 a2|b4 a2|g2 e2 c2|d2 B2 A2|F2 E2 F2|D4 A2:|' }] };
        PP.loadTune(waltz, 0);
        doc.querySelector('#strums [data-strum="lilt"]').click();
        ['standard', 'dadgad'].forEach(function (tn) {
          doc.querySelector('#tunings [data-tuning="' + tn + '"]').click();
          for (var n = 0; n < 8; n++) {
            var chord = PP.tune().chords[PP.form()[n].slot][0], ch = PL.chord(chord), want = n % 2 ? (ch.root + 7) % 12 : ch.root;
            var b = PP.plan(n).filter(function (x) { return x.who === 'guitar' && x.bass != null; })[0];
            if (!b) { bad.push(tn + ', bar ' + (n + 1) + ': no bass note'); continue; }
            var notes = PL.voicing(tn, chord), lowest = notes.filter(function (m) { return m != null && m % 12 === want; })[0];
            if (b.bass % 12 !== want) bad.push(tn + ', bar ' + (n + 1) + ' (' + chord + '): the bass is MIDI ' + b.bass + ', not the ' + (n % 2 ? 'fifth' : 'root'));
            else if (lowest != null && b.bass !== lowest) bad.push(tn + ', bar ' + (n + 1) + ': the ' + (n % 2 ? 'fifth' : 'root') + ' is not on the lowest string that has it');
          }
        });
        expect(bad.length === 0, bad.join('\n'));
      });
    });

  check('Session Buddies', 'The bodhrán’s back hand presses through each four bars, as in the app',
    'The app’s back hand (the other hand pressing the skin from inside, the pitch rising and the ring shortening) was not in Session Buddies. Now it is, off to begin with and kept: one arc over each four bars of the tune, open at the top, pressed hardest about 70% through, let go across the fourth bar; the same every time in Simple, each a little different in Full; never in Pulse or on the closing stroke.',
    function () {
      return json(FIX + 'cooleys.json').then(function (j) {
        return withBuddies(function (win, doc) {
          var PP = win.BUDDIES_PAGE, bad = [], hand = doc.getElementById('drum-hand');
          function set(v) { hand.value = v; hand.dispatchEvent(new win.Event('input')); }
          function presses(n) { return PP.plan(n).filter(function (x) { return x.who === 'drum'; }).map(function (x) { return x.press || 0; }); }
          PP.loadTune(j, 0);
          if (!hand || doc.getElementById('drum-hand-box').hidden) { expect(false, 'there is no back hand for the bodhrán'); }
          if (+hand.value !== 0 || presses(2).some(function (p) { return p > 0; })) bad.push('the back hand does not start off');
          doc.querySelector('#drum-style [data-drum="simple"]').click();
          set(1);
          var bars = [0, 1, 2, 3, 4].map(presses), firsts = bars.map(function (b) { return b[0]; });
          if (!(firsts[0] < 0.01 && firsts[1] > firsts[0] && firsts[2] > firsts[1] && firsts[3] > 0.5 && firsts[4] < 0.01)) bad.push('Simple: the bars open at ' + firsts.map(function (v) { return round(v, 2); }).join(', ') + ' (want an arc from open, pressed by bar 4, open again at bar 5)');
          var top = Math.max.apply(null, [].concat.apply([], bars)), lastOf4 = bars[3][bars[3].length - 1];
          if (!(top > 0.95 && lastOf4 < 0.3)) bad.push('Simple: pressed hardest ' + round(top, 2) + ', at the end of bar 4 still ' + round(lastOf4, 2));
          var again = [4, 5, 6, 7].map(presses);
          if (JSON.stringify(again) !== JSON.stringify([0, 1, 2, 3].map(presses))) bad.push('Simple: the next four bars do not press the same');
          doc.querySelector('#drum-style [data-drum="full"]').click();
          var tops = [0, 4, 8, 12, 16, 20].map(function (s0) { return Math.max.apply(null, [].concat.apply([], [s0, s0 + 1, s0 + 2, s0 + 3].map(presses))); });
          if (!tops.every(function (t) { return t > 0.6 && t <= 1; }) || Math.max.apply(null, tops) - Math.min.apply(null, tops) < 0.01) bad.push('Full: each arc’s depth ' + tops.map(function (v) { return round(v, 2); }).join(', ') + ' (want each 0.65 to 1, not all alike)');
          doc.querySelector('#drum-style [data-drum="pulse"]').click();
          if (!doc.getElementById('drum-hand-box').hidden || presses(2).some(function (p) { return p > 0; })) bad.push('Pulse: the back hand is offered, or presses');
          if (win.localStorage.getItem('players.drumhand') !== '1') bad.push('the back hand is not kept');
          expect(bad.length === 0, bad.join('\n'));
        });
      });
    });

  check('Session Buddies', 'A hornpipe’s swing is set by ear, and kept',
    'At 60:40 The Boys of Bluehill sounded “devoid of the swing a hornpipe normally has”, at 2:1 “almost slightly too much”. So a hornpipe has a Swing control, from 50:50 (straight) to 70:30, starting at 64:36: the guitar and the tune follow it, the triplets stay even, it is kept for next time, and it is not offered for a tune that does not swing.',
    function () {
      return Promise.all([json(FIX + 'the-boys-of-bluehill.json'), json(FIX + 'the-kesh.json')]).then(function (r) {
        return withBuddies(function (win, doc) {
          var PP = win.BUDDIES_PAGE, bad = [], strums = [], notes = [];
          var GP = win.GTR.Guitar.prototype, gs = GP.strum, FP = win.BUDDIES.Flute.prototype, fn = FP.note;
          GP.strum = function (n, t) { strums.push(t); return gs.apply(this, arguments); };
          FP.note = function (t) { notes.push(t); return fn.apply(this, arguments); };
          PP.loadTune(r[1], 0);
          var jigHides = doc.getElementById('swing-box').hidden;
          PP.loadTune(r[0], 0);
          var box = doc.getElementById('swing-box'), sw = doc.getElementById('swing'), out = doc.getElementById('swing-out');
          var shown = !box.hidden, startsAt = out.textContent;
          // At 70:30, then straight: the up between beats 2 and 3, and the tune's A in "BA FA".
          function playAt(v) {
            sw.value = v; sw.dispatchEvent(new win.Event('input'));
            strums = []; notes = [];
            doc.getElementById('countin').value = '1';
            doc.getElementById('bpm').value = 120; doc.getElementById('bpm').dispatchEvent(new win.Event('input'));
            var q = 60 / 120 / 2, bar = 8 * q;
            doc.getElementById('play').click();
            return wait((3 * bar + 0.6) * 1000).then(function () {
              doc.getElementById('play').click();
              var t0 = strums[0], up = (strums[2] - t0) / q - 2;
              var tn = notes.filter(function (t) { return t >= t0 - 0.03 && t < t0 + 2 * bar - 0.03; }).map(function (t) { return (t - t0) / q; });
              var want = 2 * v / 100;
              if (Math.abs(up - want) > 0.03) bad.push('at ' + win.TRAD.swingLabel(v / 100) + ' the guitar’s up is ' + round(up, 2) + ' quavers after the beat, not ' + round(want, 2));
              if (Math.abs(tn[1] - want) > 0.03) bad.push('at ' + win.TRAD.swingLabel(v / 100) + ' the tune’s A in “BA” is at ' + round(tn[1], 2) + ', not ' + round(want, 2));
              [10, 10 + 2 / 3, 10 + 4 / 3].forEach(function (p) {      // bar 2's triplet, "(3Bcd", from quaver 2 of bar 2
                if (!tn.some(function (x) { return Math.abs(x - p) < 0.03; })) bad.push('at ' + win.TRAD.swingLabel(v / 100) + ' the triplet is not even');
              });
              return out.textContent;
            });
          }
          return playAt(70).then(function (l70) {
            return playAt(50).then(function (l50) {
              sw.value = 66; sw.dispatchEvent(new win.Event('input'));
              PP.loadTune(r[1], 0); PP.loadTune(r[0], 0);    // away to a jig and back
              var kept = sw.value + ' ' + out.textContent;
              GP.strum = gs; FP.note = fn;
              expect(jigHides, 'a jig offers a Swing control');
              expect(shown && startsAt === '64:36', 'a hornpipe’s Swing control ' + (shown ? 'starts at ' + startsAt : 'is not shown'));
              expect(l70 === '70:30' && l50 === 'straight', 'the control says ' + l70 + ' and ' + l50);
              expect(kept === '66 66:34', 'the swing set was not kept: ' + kept);
              expect(win.localStorage.getItem('players.swing.hornpipe') === '66', 'the swing set is not kept for next time');
              expect(bad.length === 0, bad.join('\n'));
            });
          });
        });
      });
    });

  check('Session Buddies', 'Your tunes are a tap away: favourites, and those played lately',
    'Asked for so the tunes you play need no search each time. ☆ Favourite keeps a tune in your favourites (by name), Play puts it at the top of those played lately (twelve at most, no tune twice), and either opens with a tap: no search or network, its setting, the chords you changed, the list folded away. A chord you change is kept in your copy too, and Save my tunes writes them to a file that Open a saved tune brings back.',
    function () {
      var names = ['the-kesh', 'cooleys', 'the-swallowtail', 'the-silver-spear', 'out-on-the-ocean', 'banish-misfortune', 'the-butterfly', 'the-road-to-lisdoonvarna'];
      return Promise.all(names.map(function (n) { return json(FIX + n + '.json'); })).then(function (T) {
        var kesh = T[0], cooleys = T[1];
        return withBuddies(function (win, doc) {
          var PP = win.BUDDIES_PAGE, $ = function (id) { return doc.getElementById(id); };
          function texts(id) { return Array.prototype.map.call(doc.querySelectorAll('#' + id + ' .open'), function (b) { return b.firstChild.textContent; }); }
          function playBriefly() { $('play').click(); $('play').click(); }
          function tapRow(id, re, what) {
            var b = Array.prototype.filter.call(doc.querySelectorAll('#' + id + ' .open'), function (x) { return re.test(x.textContent); })[0];
            if (!b) throw new Error(what + ' is not in ' + (id === 'favs' ? 'your favourites' : 'those played lately') + ': ' + texts(id).join(', '));
            b.click();
          }
          var empty = !$('favs-empty').hidden && !$('recent-empty').hidden && !$('mine').open;
          PP.loadTune(kesh, 0);
          $('fav').click();
          var starred = $('fav').getAttribute('aria-pressed') === 'true' && /★/.test($('fav').textContent);
          PP.loadTune(cooleys, 0);
          var otherUnstarred = $('fav').getAttribute('aria-pressed') === 'false';
          $('fav').click();                                   // Cooley's a favourite too
          playBriefly();
          PP.loadTune(kesh, 0); playBriefly();
          PP.loadTune(cooleys, 0); playBriefly();             // again: to the top, not twice
          var favs = texts('favs'), recent = texts('recent');
          // A chord you change goes into your copy.
          var slot = PP.tune().lay.slots[1].id;
          PP.setChord(slot, ['Em']);
          // Open The Kesh from the favourites with the network down: it needs none.
          // (Since 1.18.3 it asks the Session for the tune's other settings
          // afterwards, for the Setting menu; that, and nothing else, is allowed.)
          var other = [], f0 = win.fetch;
          win.fetch = function (url) {
            if (!/thesession\.org\/tunes\/\d+\?format=json$/.test(String(url))) other.push(String(url));
            return Promise.reject(new TypeError('offline'));
          };
          $('mine').open = true;
          doc.querySelector('#favs .open').click();             // "Cooley's" sorts first; take The Kesh
          var first = PP.tune().meta.name;
          tapRow('favs', /Kesh/, 'The Kesh');
          var opened = PP.tune().meta.name, folded = !$('mine').open, said = $('find-status').textContent;
          // And Cooley's from those played lately, with the changed chord.
          tapRow('recent', /Cooley/, 'Cooley’s');
          var kept = PP.tune().chords[slot] && PP.tune().chords[slot].join('/') === 'Em' && !!PP.tune().mine[slot];
          win.fetch = f0;
          // Twelve at most.
          T.forEach(function (j) { j.settings.forEach(function (st, i) { PP.loadTune(j, i); playBriefly(); }); });
          var many = texts('recent').length;
          // Saved to a file and brought back.
          var list = PP.listText();
          win.localStorage.removeItem('buddies.favourites'); win.localStorage.removeItem('buddies.recent');
          PP.loadTune(kesh, 0);
          var cleared = texts('favs').length;
          PP.openText(list);
          var back = texts('favs');
          // Unstarred from the tune, and with ✕ in the list.
          $('fav').click();
          var afterUnstar = texts('favs');
          doc.querySelector('#favs .remove').click();
          var afterRemove = texts('favs').length;
          expect(empty, 'a first visit does not start with My tunes empty and folded');
          expect(starred && otherUnstarred, 'the ☆ does not show which tune is a favourite');
          expect(favs.join(',') === "Cooley's,The Kesh", 'the favourites are ' + favs.join(', ') + ', not both by name');
          expect(recent.join(',') === "Cooley's,The Kesh", 'played lately: ' + recent.join(', ') + ' (want Cooley’s, then The Kesh, once each)');
          expect(first === "Cooley's" && opened === 'The Kesh' && folded, 'opening from the favourites gave ' + first + ' then ' + opened + (folded ? '' : ', and the list stayed open'));
          expect(other.length === 0, 'opening your tunes asked the network for ' + other.join(', '));
          expect(/from your tunes/.test(said), 'the page did not say where it came from: ' + said);
          expect(kept, 'the chord changed in Cooley’s was not kept in your copy');
          expect(many === 12, 'played lately holds ' + many + ', not twelve');
          expect(cleared === 0 && back.join(',') === "Cooley's,The Kesh", 'the saved list brought back ' + back.join(', '));
          expect(afterUnstar.join(',') === "Cooley's" && afterRemove === 0, 'taking them out left ' + afterUnstar.join(', ') + ' then ' + afterRemove);
        });
      });
    });

  check('Session Buddies', 'Your work is kept: your copy opens when you search, its setting sticks, your tuning stays',
    'Found by the audit. Searching a tune you had worked on fetched it fresh and stored that over your copy, chord changes and all. A tune reopened on setting 3 was stored as setting 1, and stayed so after a second reload. And opening an old favourite switched the guitar back to the tuning it had when starred. Now: the search marks the tune as yours and opens your copy (your setting, chords and tempo); the setting number sticks through reloads and My tunes; and only the tune’s own things come back with it.',
    function () {
      return Promise.all([json(FIX + 'the-kesh.json'), json(FIX + 'cooleys.json')]).then(function (r) {
        var kesh = r[0], cooleys = r[1];
        return withBuddies(function (win, doc) {
          function $(id) { return win.document.getElementById(id); }
          function PP() { return win.BUDDIES_PAGE; }
          function reload() { return new Promise(function (ok) { win.frameElement.onload = ok; win.location.reload(); }).then(function () { return wait(300); }); }
          function facts() { return $('chosen-facts').textContent; }
          function stored(key) { try { return JSON.parse(win.localStorage.getItem(key)); } catch (e) { return null; } }
          var bad = [];
          // The Kesh, setting 3, a chord changed, at 80, starred.
          PP().loadTune(kesh, 2);
          var slot = PP().tune().lay.slots[1].id;
          PP().setChord(slot, ['Em']);
          $('bpm').value = 80; $('bpm').dispatchEvent(new win.Event('input')); $('bpm').dispatchEvent(new win.Event('change'));
          $('fav').click();
          return reload().then(reload).then(function () {
            if (!/Setting 3\b/.test(facts())) bad.push('after two reloads it says “' + facts() + '”, not setting 3');
            var cur = stored('players.current'), fav = (stored('buddies.favourites') || [])[0];
            if (!cur || cur.settingNumber !== 3) bad.push('the page stored it as setting ' + (cur && cur.settingNumber));
            if (!fav || fav.data.settingNumber !== 3) bad.push('the favourite now holds setting ' + (fav && fav.data.settingNumber));
            // Away to Standard tuning and another tune; then the favourite.
            PP().loadTune(cooleys, 0);
            win.document.querySelector('#tunings [data-tuning="standard"]').click();
            Array.prototype.filter.call(win.document.querySelectorAll('#favs .open'), function (b) { return /Kesh/.test(b.textContent); })[0].click();
            var tuned = win.document.querySelector('#tunings [aria-checked="true"]').dataset.tuning;
            if (tuned !== 'standard') bad.push('opening the favourite switched the tuning to ' + tuned);
            if (!/Setting 3\b/.test(facts())) bad.push('the favourite opened as “' + facts() + '”');
            // Away again, then The Kesh found by a search.
            PP().loadTune(cooleys, 0);
            var f0 = win.fetch;
            win.fetch = function (url) {
              var body = /search/.test(url) ? { tunes: [{ id: 55, name: 'The Kesh', type: 'jig' }] } : kesh;
              return Promise.resolve({ ok: true, json: function () { return Promise.resolve(body); } });
            };
            $('q').value = 'kesh';
            $('find-go').click();
            return wait(100).then(function () {
              var row = win.document.querySelector('#results button');
              if (!row || !/in your favourites/.test(row.textContent)) bad.push('the search does not mark it as yours: ' + (row && row.textContent));
              row.click();
              return wait(150);
            }).then(function () {
              win.fetch = f0;
              var t = PP().tune(), fav = (stored('buddies.favourites') || [])[0];
              if (!t || t.meta.name !== 'The Kesh' || t.index !== 2) bad.push('the search opened ' + (t && t.meta.name) + ' setting ' + (t && t.index + 1) + ', not your setting 3');
              if (!(t && t.chords[slot] && t.chords[slot][0] === 'Em' && t.mine[slot])) bad.push('the search opened it without your chord change');
              if (+$('bpm').value !== 80) bad.push('the search opened it at ' + $('bpm').value + ', not your 80');
              if (!fav || !fav.data.mine || fav.data.mine.indexOf(slot) === -1) bad.push('your favourite’s chord change was overwritten');
              if (!/Your copy from My tunes/.test($('find-status').textContent)) bad.push('it does not say it opened your copy: ' + $('find-status').textContent);
              expect(bad.length === 0, bad.join('\n'));
            });
          });
        });
      });
    });

  check('Session Buddies', 'Real settings the audit found misread now read right',
    'A second ending closed by a plain bar line before |: marked the whole next part as “ending 2”, and it was never played (Off To California #17, The Swallowtail #23). Any quoted text starting A–G was a chord, and any chord at all set the whole tune: The Star of Munster #19, whose only quoted text is “Ending”, was strummed on E major throughout, and The Silver Spear #9, with one “D” on bar 1, on D for all 32 bars. Now: the parts are all there; a quoted word is a chord only if it is a whole chord name; and a setting’s chords are used only if they cover the tune, else they are chosen from the melody — while a setting that really is chorded keeps its own.',
    function () {
      return Promise.all([json(FIX + 'audit-settings.json'), json(FIX + 'the-road-to-lisdoonvarna.json')]).then(function (r) {
        var cases = {}, bad = [];
        r[0].forEach(function (t) { cases[t.name] = t; });
        function lay(t, i) { var st = t.settings[i || 0]; return PL.layout(st.abc, { key: st.key, meter: { jig: '6/8', reel: '4/4', hornpipe: '4/4' }[t.type] || '12/8' }); }
        ['Off To California', 'The Swallowtail'].forEach(function (n) {
          var l = lay(cases[n]), parts = {}, heard = {};
          l.slots.forEach(function (sl) { parts[sl.part] = true; });
          l.timeline.forEach(function (tb) { heard[tb.slot] = true; });
          var unheard = l.slots.filter(function (sl) { return !heard[sl.id]; }).length;
          if (Object.keys(parts).length < 2 || l.timeline.length < 32 || unheard) bad.push(n + ' #' + cases[n].settingNumber + ': ' + Object.keys(parts).length + ' parts, ' + l.timeline.length + ' bars played');
        });
        var munster = lay(cases['The Star Of Munster']), spear = lay(cases['The Silver Spear']);
        if (PL.chordSource(munster) !== 'auto') bad.push('The Star of Munster #19 still takes its chords from “Ending”');
        var mc = PL.chords(munster), allE = munster.slots.every(function (sl) { return mc[sl.id].join() === 'E'; });
        if (allE) bad.push('The Star of Munster #19 is still on E throughout');
        if (PL.chordSource(spear) !== 'auto') bad.push('The Silver Spear #9 still takes every chord from one “D”');
        var road = lay({ type: 'slide', settings: r[1].settings }, 2);
        if (PL.chordSource(road) !== 'setting') bad.push('The Road to Lisdoonvarna #3, chorded by its setter, no longer uses its own chords');
        var names = { G: 1, Em7: 1, 'D/F#': 1, Bm7b5: 1, Asus4: 1, 'C (2nd time)': 1, 'D/H': 1, 'Am(7x0700)': 1, Ending: 0, Chorus: 0, "A'": 0, Fine: 0, 'D G': 0 };
        Object.keys(names).forEach(function (n) { if (!!PL.isChordName(n) !== !!names[n]) bad.push('“' + n + '” ' + (names[n] ? 'is not taken as a chord' : 'is taken as a chord')); });
        expect(bad.length === 0, bad.join('\n'));
      });
    });

  check('Session Buddies', 'The last time through ends on the tune’s own last note',
    'Many settings write a lead-in back to the top at the end of the last bar. On the last time it became the final note, held for a bar over the home chord: The Silver Spear ended on a G over D (about 1 in 12 popular settings did the like). Between times, a written lead-in that differed from the pickup was cut and the pickup added, so “B2 AG” came out “B2 A A”. Now the last time leaves a written lead-in off (never a held note, and not if the tune ends better with it), and between times a bar is played as written unless its lead-in is the pickup, which is then played once.',
    function () {
      return Promise.all([json(FIX + 'the-silver-spear.json'), json(FIX + 'audit-settings.json')]).then(function (r) {
        var cooleys7 = r[1].filter(function (t) { return t.name === "Cooley's"; })[0];
        var made = { id: 0, name: 'A made-up reel', type: 'reel', url: '', settings: [{ id: 0, url: '', key: 'Dmajor', date: '', member: { name: 'a check' },
          abc: 'A|:DFAd fdAF|GBdB AFDF|DFAd fdAF|d2fe d3A:|' }] };
        return withBuddies(function (win, doc) {
          var PP = win.BUDDIES_PAGE, bad = [], times = doc.getElementById('times');
          function flute(n) { return PP.plan(n).filter(function (x) { return x.who === 'flute'; }); }
          function names(list) { return list.map(function (x) { return 'C C# D D# E F F# G G# A A# B'.split(' ')[x.midi % 12]; }).join(' '); }
          // The Silver Spear #1 ends "dfed B2 AG"; its pickup is A.
          PP.loadTune(r[0], 0);
          var L = PP.form().length;
          times.value = '1';
          var end = flute(L - 1), fin = end.filter(function (x) { return x.final; });
          if (names(end.slice(-3)) !== 'D B A' || fin.length !== 1 || fin[0].midi % 12 !== 9) bad.push('The Silver Spear ends ' + names(end.slice(-4)) + (fin[0] ? ', holding ' + names(fin) : '') + ' (want D B A, holding the A)');
          times.value = '2';
          var turn = flute(L - 1);
          if (names(turn.slice(-3)) !== 'B A G') bad.push('Between times The Silver Spear’s last bar goes ' + names(turn.slice(-4)) + ' (want B2 AG as written)');
          // Cooley's #7 ends on a held E: never cut.
          PP.loadTune(cooleys7, 0);
          times.value = '1';
          var c = flute(PP.form().length - 1), cf = c.filter(function (x) { return x.final; })[0];
          if (!cf || cf.midi % 12 !== 4) bad.push('Cooley’s #7 ends on ' + (cf ? names([cf]) : 'nothing') + ', not its held E');
          // A lead-in that is the pickup: played once between times, left off at the end.
          PP.loadTune(made, 0);
          var M = PP.form().length;
          times.value = '2';
          var q = 60 / +doc.getElementById('bpm').value / 2;
          var mid = flute(M - 1).filter(function (x) { return x.midi % 12 === 9 && x.t > 6.5 * q; });
          if (mid.length !== 1) bad.push('the made-up reel’s lead-in A is played ' + mid.length + ' times at the turn, not once');
          var last = flute(2 * M - 1), lf = last.filter(function (x) { return x.final; })[0];
          if (!lf || lf.midi % 12 !== 2 || last.some(function (x) { return x.t > 6.5 * q; })) bad.push('the made-up reel ends ' + names(last.slice(-2)) + ' (want the held D, the lead-in A left off)');
          expect(bad.length === 0, bad.join('\n'));
        });
      });
    });

  check('Session Buddies', 'A chord you change is kept, played or not, and a reset can be undone',
    'A tune joined those played lately only on Play, and the page keeps only its last tune: chords changed and then a search, and they were gone. And “Back to the chosen chords” wiped every change at one tap. Now a changed chord puts the tune in those played lately, and the reset offers to undo it until you change a chord or the tune.',
    function () {
      return Promise.all([json(FIX + 'cooleys.json'), json(FIX + 'the-kesh.json')]).then(function (r) {
        return withBuddies(function (win, doc) {
          var PP = win.BUDDIES_PAGE, $ = function (id) { return doc.getElementById(id); }, bad = [];
          PP.loadTune(r[0], 0);
          var slot = PP.tune().lay.slots[2].id, other = PP.tune().lay.slots[3].id, before = PP.tune().chords[slot].join('/');
          PP.setChord(slot, [before === 'Bm' ? 'G' : 'Bm']);
          var mineChord = PP.tune().chords[slot].join('/');
          var rec = JSON.parse(win.localStorage.getItem('buddies.recent') || '[]');
          if (!rec.length || !/Cooley/.test(rec[0].name)) bad.push('changing a chord without Play did not keep the tune in those played lately');
          PP.loadTune(r[1], 0);                              // away, then back from the list
          var row = Array.prototype.filter.call(doc.querySelectorAll('#recent .open'), function (b) { return /Cooley/.test(b.textContent); })[0];
          if (row) row.click();
          if (!PP.tune() || PP.tune().chords[slot].join('/') !== mineChord) bad.push('back from the list, the changed chord is gone');
          $('reset-chords').click();
          var afterReset = PP.tune().chords[slot].join('/'), undoText = $('reset-chords').textContent, undoShown = !$('reset-chords').hidden;
          $('reset-chords').click();
          var undone = PP.tune().chords[slot].join('/'), mineBack = !!PP.tune().mine[slot];
          var rec2 = JSON.parse(win.localStorage.getItem('buddies.recent') || '[]').filter(function (x) { return /Cooley/.test(x.name); })[0];
          if (afterReset === mineChord) bad.push('the reset did not put the chord back to the chosen one');
          if (!undoShown || !/Undo/.test(undoText)) bad.push('after the reset the button says “' + undoText + '”' + (undoShown ? '' : ' and is hidden'));
          if (undone !== mineChord || !mineBack) bad.push('undo gave ' + undone + ', not ' + mineChord);
          if (!rec2 || (rec2.data.mine || []).indexOf(slot) === -1) bad.push('after the undo your copy no longer has the change');
          $('reset-chords').click();                           // reset again, then change another chord: no undo now
          PP.setChord(other, ['D']);
          if (/Undo/.test($('reset-chords').textContent)) bad.push('the undo is still offered after a new change');
          expect(bad.length === 0, bad.join('\n'));
        });
      });
    });

  check('Session Buddies', 'Finish ends at the end of this time through, and so does lowering “Play it”',
    'Finish (button or F) plays on to the end of the time through it is pressed in and closes the tune there; pressed when that time’s last bar is already on its way, it goes round once more; pressed again, it is taken back. And lowering “Play it” mid-tune below the time already reached used to stop the music dead and leave the page “playing” for good (the audit’s B5): now it too ends at the end of the time through it is in.',
    function () {
      var polka = { id: 0, name: 'A made-up polka', type: 'polka', url: '', settings: [{ id: 0, url: '', key: 'Dmajor', date: '', member: { name: 'a check' },
        abc: '|:d2 fd|ed BA|d2 fd|e2 d2:|' }] };
      return withBuddies(function (win, doc) {
        var PP = win.BUDDIES_PAGE, $ = function (id) { return doc.getElementById(id); }, bad = [];
        function setTimes(v) { $('times').value = v; $('times').dispatchEvent(new win.Event('change')); }
        function until(test, ms) {
          var end = Date.now() + ms;
          return new Promise(function (ok) { (function poll() { if (test() || Date.now() > end) ok(test()); else setTimeout(poll, 50); })(); });
        }
        PP.loadTune(polka, 0);
        $('countin').value = '1';
        $('bpm').value = 170; $('bpm').dispatchEvent(new win.Event('input'));
        var L = PP.form().length;
        // Finish: pressed, taken back (F), pressed again; then it ends by itself.
        // Bars are laid ahead (seconds ahead if the page is hidden), so Finish
        // ends the time through of the next bar still to be laid.
        setTimes('0');
        $('play').click();
        var n0 = PP.laid(), want = n0 < 0 ? 1 : Math.floor(n0 / L) + 1;
        $('finish').click();
        var on = PP.finishing(), pressed = $('finish').getAttribute('aria-pressed'), label = $('finish').textContent;
        var finalPlanned = PP.plan(want * L - 1).some(function (x) { return x.final; });
        if (!(on === want && want * L - 1 >= n0 && pressed === 'true' && label === 'Finishing' && finalPlanned))
          bad.push('Finish pressed with bar ' + n0 + ' next: ends after time ' + on + ' (want ' + want + '), button ' + pressed + ' “' + label + '”' + (finalPlanned ? '' : ', no closing note planned'));
        key(win, doc.body, 'KeyF', 'f');                     // F takes it back
        var off = PP.finishing(), noFinal = !PP.plan(want * L - 1).some(function (x) { return x.final; });
        if (!(off === null && noFinal)) bad.push('pressed again (F), Finish was not taken back');
        $('finish').click();
        return until(function () { return !PP.playing(); }, 20000).then(function (stopped) {
          if (!stopped) { bad.push('after Finish the tune did not end by itself'); $('play').click(); }
          if ($('play').querySelector('.play-label').textContent !== 'Play') bad.push('after Finish the button still says Stop');
          // "Play it" lowered below the time reached: it ends at the end of the time it is in.
          setTimes('0');
          $('play').click();
          return until(function () { return PP.laid() > L; }, 10000);
        }).then(function () {
          setTimes('1');                                      // once through, in time 2
          return until(function () { return !PP.playing(); }, 20000);
        }).then(function (stopped) {
          if (!stopped) { bad.push('“Play it” lowered to once through in time 2: still playing, the page hung'); $('play').click(); }
          expect(bad.length === 0, bad.join('\n'));
        });
      });
    });

  check('Session Buddies', 'Your turn: the melody drops out where you choose, the lead-in still brings you in',
    'Taking turns, they play a time through and you the next; or they play the A part and you the B, or the other way round. During your turn the melody is silent, or there quietly (about 10 dB down) as a guide. The lead-in at the end of their bar is still played, so you know where to come in. The choice is kept.',
    function () {
      return Promise.all([json(FIX + 'the-kesh.json'), json(FIX + 'the-silver-spear.json')]).then(function (r) {
        return withBuddies(function (win, doc) {
          var PP = win.BUDDIES_PAGE, bad = [];
          function pick(group, attr, v) { doc.querySelector('#' + group + ' [data-' + attr + '="' + v + '"]').click(); }
          function fl(n) { return PP.plan(n).filter(function (x) { return x.who === 'flute'; }); }
          PP.loadTune(r[0], 0);                               // The Kesh: AABB, 32 bars a time
          var L = PP.form().length, B1 = 16;
          doc.getElementById('times').value = '2';
          pick('melody-mode', 'melody', 'turns');
          if (!fl(0).length) bad.push('taking turns, they do not play time 1');
          if (fl(L).length) bad.push('taking turns, they still play time 2 (your turn)');
          pick('your-turn-level', 'level', 'quiet');
          var quiet = fl(L), loud = fl(0);
          if (!quiet.length) bad.push('“quietly”, there is no melody on your turn');
          else if (Math.max.apply(null, quiet.map(function (x) { return x.w; })) > 0.35 * Math.max.apply(null, loud.map(function (x) { return x.w; }))) bad.push('“quietly” is not about 10 dB down');
          pick('your-turn-level', 'level', 'silent');
          pick('melody-mode', 'melody', 'a');                 // they play A, you play B
          if (!fl(0).length || fl(B1).length) bad.push('“You play B”: A ' + (fl(0).length ? 'played' : 'silent') + ', B ' + (fl(B1).length ? 'played' : 'silent'));
          pick('melody-mode', 'melody', 'b');                 // they play B, you play A
          if (fl(0).length || !fl(B1).length) bad.push('“You play A”: A ' + (fl(0).length ? 'played' : 'silent') + ', B ' + (fl(B1).length ? 'played' : 'silent'));
          if (PP.plan(-1).some(function (x) { return x.who === 'flute'; })) bad.push('“You play A”: they play the lead-in to your A part from the count-in');
          // The Silver Spear's pickup: taking turns, their last bar brings you in.
          PP.loadTune(r[1], 0);
          var S = PP.form().length;
          pick('melody-mode', 'melody', 'turns');
          var q = 60 / +doc.getElementById('bpm').value / 2, end1 = fl(S - 1);
          var lead = end1.filter(function (x) { return x.t > 6.5 * q; });   // "B2 AG": the G
          if (!lead.length) bad.push('taking turns, the lead-in into your turn is not played');
          if (fl(2 * S - 1).length) bad.push('taking turns, they play in your turn’s last bar');
          // Kept for next time.
          return new Promise(function (ok) { win.frameElement.onload = ok; win.location.reload(); }).then(function () { return wait(300); }).then(function () {
            var d = win.document, mode = d.querySelector('#melody-mode [aria-checked="true"]'), lvl = d.querySelector('#your-turn-level [aria-checked="true"]');
            if (!mode || mode.dataset.melody !== 'turns' || !lvl || lvl.dataset.level !== 'silent') bad.push('after a reload the choice is ' + (mode && mode.dataset.melody) + ' / ' + (lvl && lvl.dataset.level));
            expect(bad.length === 0, bad.join('\n'));
          });
        });
      });
    });

  check('Session Buddies', 'My tunes stays as you left it, and a tune brought back offers all its settings',
    'My tunes opened at every load if you had any tunes, however you had left it; and a tune brought back from storage (after a reload, or from My tunes) held only its own setting, so the Setting menu could not switch until you searched again. Now My tunes is open or closed as you left it, and the tune’s other settings are fetched from the Session and added to the menu, the one on the page kept as it is.',
    function () {
      return json(FIX + 'the-kesh.json').then(function (j) {
        return withBuddies(function (win, doc) {
          var fr = win.frameElement, bad = [];
          function W() { return fr.contentWindow; }
          function $(id) { return fr.contentDocument.getElementById(id); }
          function reloaded() { return new Promise(function (ok) { fr.onload = function () { setTimeout(ok, 400); }; W().location.reload(); }); }
          W().BUDDIES_PAGE.loadTune(j, 1);                    // setting 2 of The Kesh
          $('play').click(); $('play').click();                 // played: now in your tunes
          $('mine').open = false;                               // closed, as you might leave it
          return wait(100).then(reloaded).then(function () {
            if ($('mine').open) bad.push('My tunes opened by itself after a reload');
            $('mine').open = true;
            return wait(100).then(reloaded);
          }).then(function () {
            if (!$('mine').open) bad.push('My tunes, left open, was closed after a reload');
            // Brought back from storage, with the Session answering.
            var PP = W().BUDDIES_PAGE, text = PP.saveText(), asked = 0, real = W().fetch;
            W().fetch = function (url) {
              if (/thesession\.org\/tunes\/55/.test(String(url))) { asked++; var Res = W().Response; return Promise.resolve(new Res(JSON.stringify(j), { status: 200 })); }
              return real.apply(W(), arguments);
            };
            PP.openText(text, true);
            return wait(400).then(function () {
              var sel = $('setting');
              if (!asked) bad.push('the Session was not asked for the other settings');
              if (sel.options.length !== j.settings.length || sel.disabled) bad.push('the Setting menu offers ' + sel.options.length + ' of ' + j.settings.length + ' settings');
              if (sel.value !== '1' || PP.tune().index !== 1) bad.push('the menu is on setting ' + (+sel.value + 1) + ', not the one on the page (2)');
              if (!/Setting 2 of 3/.test($('chosen-facts').textContent)) bad.push('the tune says “' + $('chosen-facts').textContent + '”');
              Array.prototype.forEach.call(sel.options, function (o, k) {
                var who = j.settings[k].member && j.settings[k].member.name;
                if (/\[object/.test(o.textContent) || (who && o.textContent.indexOf(who) === -1)) bad.push('the menu reads “' + o.textContent + '”, not naming ' + who);
              });
              sel.value = '0'; sel.dispatchEvent(new (W().Event)('change'));
              if (PP.tune().index !== 0 || PP.tune().settings[0].id !== j.settings[0].id) bad.push('choosing setting 1 did not open it');
              if (/\[object/.test($('chosen-facts').textContent + $('credit').textContent)) bad.push('setting 1, chosen from the filled menu, is credited “' + $('credit').textContent + '”');
              // A tune saved while that bug was live holds the Session's raw record of who posted it.
              var old = JSON.parse(PP.saveText());
              old.setting.member = { id: 1, name: 'Old Saved', url: '' };
              W().fetch = function () { return Promise.reject(new TypeError('offline')); };
              PP.openText(JSON.stringify(old), true);
              var shown = sel.options[0].textContent + ' | ' + $('chosen-facts').textContent + ' | ' + $('credit').textContent;
              if (/\[object/.test(shown) || shown.indexOf('Old Saved') === -1) bad.push('a tune saved with the raw record shows “' + shown + '”');
              if (/\[object|"member":\s*\{/.test(W().localStorage.getItem('players.current'))) bad.push('it is saved again with the raw record');
              W().fetch = real;
              expect(bad.length === 0, bad.join('\n'));
            });
          });
        });
      });
    });

  check('Session Buddies', 'Your choices survive a reload, and Reset settings puts them back to how they start',
    'Reloading put some choices back to their starting values (which instruments were ticked), and another setting of the same tune put the tempo back. Now every choice on the page comes back after a reload; another setting keeps your tempo; and Reset settings puts every choice back to how it starts, keeping the tune, your tunes and your chord changes, with Undo bringing them all back.',
    function () {
      return json(FIX + 'the-kesh.json').then(function (j) {
        return withBuddies(function (win, doc) {
          var fr = win.frameElement, bad = [];
          function D() { return fr.contentDocument; }
          function $(id) { return D().getElementById(id); }
          function set(id, v) { var e = $(id); e.value = v; e.dispatchEvent(new fr.contentWindow.Event('input')); e.dispatchEvent(new fr.contentWindow.Event('change')); }
          function click(sel) { D().querySelector(sel).click(); }
          function on(sel) { var e = D().querySelector(sel + ' [aria-checked="true"]'); return e ? e.textContent.trim() : null; }
          function snap() {
            return { tune: fr.contentWindow.BUDDIES_PAGE.tune().meta.name, bpm: $('bpm').value, times: $('times').value, countin: $('countin').value,
                     vols: ['guitar', 'tune', 'concertina', 'drum'].map(function (k) { return $('vol-' + k).value; }).join(','),
                     ticks: ['guitar', 'tune', 'concertina', 'drum'].map(function (k) { return $('on-' + k).checked; }).join(','),
                     melody: on('#melody-mode'), turn: on('#your-turn-level'), strum: on('#strums'), backing: on('#backing-feel'),
                     drum: on('#drum-style'), busy: $('drum-busy').value, tuning: on('#tunings'), sympathy: on('#sympathy') };
          }
          function reloaded(go) {
            return new Promise(function (ok) { fr.onload = function () { setTimeout(ok, 400); }; go(); });
          }
          function differ(a, b) { return Object.keys(a).filter(function (k) { return a[k] !== b[k]; }).map(function (k) { return k + ' ' + a[k] + ' → ' + b[k]; }); }
          win.BUDDIES_PAGE.loadTune(j, 0);
          var start = snap();
          // Another setting of the same tune keeps the tempo.
          set('bpm-num', 83);
          var sel = $('setting'); sel.value = '1'; sel.dispatchEvent(new win.Event('change'));
          if ($('bpm').value !== '83') bad.push('another setting put the tempo back to ' + $('bpm').value);
          // Everything off its start.
          set('times', 3); set('countin', 1);
          ['guitar', 'tune', 'concertina', 'drum'].forEach(function (k) { set('vol-' + k, 1.3); });
          $('on-guitar').click(); $('on-concertina').click();
          click('#melody-mode [data-melody="turns"]'); click('#your-turn-level [data-level="quiet"]');
          click('#strums [data-strum="drive"]'); click('#backing-feel [data-backing="little"]');
          click('#drum-style [data-drum="pulse"]'); set('drum-busy', 0.8);
          click('#tunings [data-tuning="standard"]'); click('#sympathy [data-sympathy="off"]');
          var mine = snap();
          return reloaded(function () { fr.contentWindow.location.reload(); }).then(function () {
            differ(mine, snap()).forEach(function (d) { bad.push('after a reload: ' + d); });
            if (!$('reset-settings')) { bad.push('there is no Reset settings'); expect(false, bad.join('\n')); }
            return reloaded(function () { $('reset-settings').click(); });
          }).then(function () {
            var now = snap();
            differ(start, now).forEach(function (k) { if (!/^tune /.test(k)) bad.push('after Reset settings: ' + k); });
            if (now.tune !== start.tune) bad.push('Reset settings changed the tune to ' + now.tune);
            if ($('reset-done').hidden) bad.push('Reset settings offers no Undo');
            return reloaded(function () { $('reset-undo').click(); });
          }).then(function () {
            differ(mine, snap()).forEach(function (d) { bad.push('after Undo: ' + d); });
            expect(bad.length === 0, bad.join('\n'));
          });
        });
      });
    });

  check('Session Buddies', 'The bodhrán has no snare-drum treble lift, and is still heard against the guitar',
    'It had the guitar demo’s lift, 9 dB around 2.5 kHz, added so the old drum (nearly all under 120 Hz) could be picked out. On the new drum it put five times the share of its sound above 1.5 kHz, for 0.4 dB of loudness: “a touch too much of a snare drum”, more than in the app. Now none, its level raised 0.5 dB instead: as the page mixes them, the bodhrán within 2 dB of the guitar overall and its stick within 24 dB of the guitar at 1.5–5 kHz.',
    function () {
      return withBuddies(function (win, doc) {
        var T = win.TRAD, Real = T.Bodhran, dests = [];
        T.Bodhran = function (ctx, dest) { dests.push(dest); return new Real(ctx, dest); };
        doc.getElementById('play').click();
        return wait(300).then(function () {
          doc.getElementById('play').click();
          T.Bodhran = Real;
          var d = dests[0], MIX = win.BUDDIES_PAGE.MIX;
          expect(d, 'the page made no bodhrán');
          expect(!(d.type === 'peaking' && d.gain && d.gain.value > 3), 'the bodhrán goes through a ' + (d.gain && round(d.gain.value)) + ' dB lift at ' + (d.frequency && Math.round(d.frequency.value)) + ' Hz');
          var SRG = 48000, q = 60 / 100 / 3, K = window.KESH, len = Math.ceil(SRG * (8 * 6 * q + 2));
          function level(x, lo, hi) {
            var o = new OfflineAudioContext(1, x.length, SRG), b = o.createBuffer(1, x.length, SRG);
            b.getChannelData(0).set(x);
            var src = o.createBufferSource(); src.buffer = b; var node = src;
            [[lo, 'highpass'], [lo, 'highpass'], [hi, 'lowpass'], [hi, 'lowpass']].forEach(function (f) {
              if (!f[0]) return;
              var bq = o.createBiquadFilter(); bq.type = f[1]; bq.frequency.value = f[0]; node.connect(bq); node = bq;
            });
            node.connect(o.destination); src.start();
            return o.startRendering().then(function (r) { var y = r.getChannelData(0), e = 0; for (var i = 0; i < y.length; i++) e += y[i] * y[i]; return 10 * Math.log10(e / y.length); });
          }
          var og = new OfflineAudioContext(1, len, SRG), g = new window.GTR.Guitar(og, og.destination), notes = {};
          g.level.gain.value = MIX.guitar;
          ['G', 'D', 'C'].forEach(function (c) { K.voicing(c, 'dadgad').forEach(function (m) { if (m != null) notes[m] = 1; }); });
          g.prepare(Object.keys(notes).map(Number));
          var od = new OfflineAudioContext(1, len, SRG), drum = new TRAD.Bodhran(od, od.destination);
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
            expect(click > -24, 'its stick is ' + round(-click) + ' dB under the guitar at 1.5–5 kHz');
          });
        });
      });
    });

  check('Session Buddies', 'The bodhrán plays Full, Simple or Pulse as you choose, and Full phrases like a player',
    'The bodhrán always played one plain bar, where the app lets you choose. Now, while it is ticked, it offers the app’s three: Full (where it starts) changes pattern bar to bar by its Busyness, with fills only at the end of a phrase of the tune or half way (most often at the end), and a player’s scatter; Simple the one plain bar; Pulse one low stroke per beat. Busyness weights the patterns from sparse to busy, and both are kept for next time.',
    function () {
      return json(FIX + 'cooleys.json').then(function (j) {
        return withBuddies(function (win, doc) {
          var PP = win.BUDDIES_PAGE, T = win.TRAD, app = T.tuneById('reel'), bad = [];
          function style(v) { doc.querySelector('#drum-style [data-drum="' + v + '"]').click(); }
          function busy(v) { var b = doc.getElementById('drum-busy'); b.value = v; b.dispatchEvent(new win.Event('input')); }
          function bars(n) {          // the pattern of each of n bars, and its strokes
            var out = [];
            for (var i = 0; i < n; i++) { var st = PP.plan(i).filter(function (x) { return x.who === 'drum'; }); out.push({ grid: PP.drumGrid(), strokes: st }); }
            return out;
          }
          PP.loadTune(j, 0);
          var box = doc.getElementById('drum-box'), drum = doc.getElementById('on-drum');
          expect(box && doc.getElementById('drum-style'), 'there is no choice of how the bodhrán plays');
          if (box.hidden) bad.push('the bodhrán’s choices are hidden while it is ticked');
          drum.click();
          if (!box.hidden) bad.push('the bodhrán’s choices show while it is unticked');
          drum.click();
          var starts = doc.querySelector('#drum-style [aria-checked="true"]').dataset.drum;
          if (starts !== 'full') bad.push('it starts on ' + starts + ', not Full');
          if (doc.getElementById('drum-busy-box').hidden) bad.push('Busyness is hidden in Full');
          // Full: fills only at bar 4 or 8 of a phrase, most at 8; patterns vary; busyness weights the banks.
          busy(1);
          var full = bars(64), at = { 3: 0, 7: 0 }, kinds = {};
          full.forEach(function (b, i) {
            kinds[b.grid] = 1;
            if (app.grids.fills.indexOf(b.grid) !== -1) { if (i % 8 === 3 || i % 8 === 7) at[i % 8]++; else bad.push('a fill in bar ' + (i % 8 + 1) + ' of a phrase'); }
            if (app.grids.sparse.indexOf(b.grid) !== -1) bad.push('a sparse bar at full busyness');
          });
          if (!(at[7] >= 3 && at[7] > at[3])) bad.push('fills at the end of a phrase ' + at[7] + ' times in 8 phrases, half way ' + at[3]);
          if (Object.keys(kinds).length < 3) bad.push('only ' + Object.keys(kinds).length + ' patterns in 64 bars of Full');
          var scattered = full.some(function (b) { return b.strokes.some(function (x) { return Math.abs(x.t / (60 / +doc.getElementById('bpm').value / 2) - x.slot) > 0.004 && x.slot % 2 === 0; }); });
          if (!scattered) bad.push('Full’s strokes on the beats land exactly on them, every one: no player’s scatter');
          busy(0);
          // (A bar played on can carry over into the next, as in the app; once a calmer one comes, no more busy ones.)
          var calm = bars(40), firstCalm = calm.findIndex(function (b) { return app.grids.busy.indexOf(b.grid) === -1; });
          calm.slice(firstCalm).forEach(function (b) { if (app.grids.busy.indexOf(b.grid) !== -1) bad.push('a busy bar at no busyness'); });
          // Simple: the plain bar every bar; Pulse: one stroke per beat.
          style('simple');
          if (!doc.getElementById('drum-busy-box').hidden) bad.push('Busyness shows in Simple');
          bars(8).forEach(function (b, i) { if (b.grid !== app.grids.simple[0]) bad.push('Simple bar ' + (i + 1) + ' plays ' + b.grid); });
          style('pulse');
          bars(8).forEach(function (b, i) { if (b.strokes.length !== 4) bad.push('Pulse bar ' + (i + 1) + ' has ' + b.strokes.length + ' strokes, not 4'); });
          if (win.localStorage.getItem('players.drumstyle') !== 'pulse' || win.localStorage.getItem('players.drumbusy') !== '0') bad.push('the choice is not kept');
          expect(bad.length === 0, bad.join('\n'));
        });
      });
    });

  check('Session Buddies', 'The backing rides the tune’s lilt as you choose, and triplets stay even',
    'The melody lilted over a dead-even backing, so in a reel at 100 its off-beats landed 30–42 ms after the guitar’s up-strum and the drum’s tak. With the tune (the start), the guitar and bodhrán ride the melody’s lilt: the concertina’s if it is ticked, else the flute’s; A little goes half way; Straight is as before. The beats stay put. And the lilt no longer bends triplets in reels and jigs: The Silver Spear’s “(3AAA” comes out even, as players keep it (hornpipes already did). The choice is kept.',
    function () {
      return Promise.all([json(FIX + 'the-silver-spear.json'), json(FIX + 'the-boys-of-bluehill.json')]).then(function (r) {
        return withBuddies(function (win, doc) {
          var PP = win.BUDDIES_PAGE, bad = [];
          function feel(v) { doc.querySelector('#backing-feel [data-backing="' + v + '"]').click(); }
          function conc(on) { var c = doc.getElementById('on-concertina'); if (c.checked !== on) c.click(); }
          PP.loadTune(r[0], 0);                               // The Silver Spear, a reel
          var q = 60 / +doc.getElementById('bpm').value / 2;
          function at(n, who, slot) { var x = PP.plan(n).filter(function (y) { return y.who === who && y.slot === slot; })[0]; return x ? x.t / q : null; }
          function noteAt(n, who, near) { var x = PP.plan(n).filter(function (y) { return y.who === who && Math.abs(y.t / q - near) < 0.3; })[0]; return x ? x.t / q : null; }
          var starts = doc.querySelector('#backing-feel [aria-checked="true"]').dataset.backing;
          if (starts !== 'tune') bad.push('the backing starts “' + starts + '”, not with the tune');
          // Bar 2, "dfed BddA": the d on quaver 3, between beats 2 and 3.
          doc.querySelector('#drum-style [data-drum="simple"]').click();   // the plain bar, its tak on quaver 3, unscattered
          conc(false); feel('tune');
          var f3 = noteAt(1, 'flute', 3), g3 = at(1, 'guitar', 3), d3 = at(1, 'drum', 3);
          if (Math.abs(g3 - f3) > 0.004 || Math.abs(d3 - f3) > 0.004) bad.push('with the tune (flute): the up-strum at ' + round(g3, 3) + ', the tak at ' + round(d3, 3) + ', the flute’s d at ' + round(f3, 3) + ' quavers');
          if (Math.abs(at(1, 'guitar', 2) - 2) > 0.004 || Math.abs(at(1, 'guitar', 4) - 4) > 0.004) bad.push('with the tune, the strums on the beats moved');
          conc(true);
          var c3 = noteAt(1, 'concertina', 3), gc = at(1, 'guitar', 3);
          if (Math.abs(gc - c3) > 0.004) bad.push('with the tune (concertina): the up-strum at ' + round(gc, 3) + ', the concertina’s d at ' + round(c3, 3));
          conc(false); feel('little');
          var gl = at(1, 'guitar', 3);
          if (Math.abs(gl - (3 + f3) / 2) > 0.004) bad.push('a little: the up-strum at ' + round(gl, 3) + ', not half way to the flute’s ' + round(f3, 3));
          feel('straight');
          if (Math.abs(at(1, 'guitar', 3) - 3) > 0.004) bad.push('straight: the up-strum is not on quaver 3');
          // Bar 1, "FA (3AAA BAFA": the triplet on beat 2 even, on 2, 2.67, 3.33.
          feel('tune');
          ['flute', 'concertina'].forEach(function (who) {
            conc(who === 'concertina');
            var trip = PP.plan(0).filter(function (y) { return y.who === who; }).map(function (y) { return y.t / q; }).filter(function (p) { return p > 1.9 && p < 3.9; });
            var want = [2, 8 / 3, 10 / 3];
            if (trip.length !== 3 || trip.some(function (p, i) { return Math.abs(p - want[i]) > 0.01; })) bad.push('the ' + who + '’s triplet “(3AAA” at ' + trip.map(function (p) { return round(p, 2); }).join(', ') + ', not 2, 2.67, 3.33');
          });
          // A hornpipe: with the concertina, the backing swings with it.
          PP.loadTune(r[1], 0);
          var qh = 60 / +doc.getElementById('bpm').value / 2;
          var hc = PP.plan(0).filter(function (y) { return y.who === 'concertina' && Math.abs(y.t / qh - 1.3) < 0.2; })[0];
          var hg = PP.plan(0).filter(function (y) { return y.who === 'guitar' && y.slot === 3; })[0];
          if (!hc || !hg || Math.abs((hg.t - 2 * qh) - hc.t) > 0.004 * qh) bad.push('a hornpipe with the concertina: the backing does not swing with it');
          conc(false);
          // Kept for next time.
          feel('little');
          return new Promise(function (ok) { win.frameElement.onload = ok; win.location.reload(); }).then(function () { return wait(300); }).then(function () {
            var kept = win.document.querySelector('#backing-feel [aria-checked="true"]').dataset.backing;
            if (kept !== 'little') bad.push('after a reload the backing feel is ' + kept);
            expect(bad.length === 0, bad.join('\n'));
          });
        });
      });
    });

  check('Session Buddies', 'The page builds a tune and plays it',
    'From the Session’s JSON to a chart of the tune’s bars, a shape for each chord, and sound, with a count-in first. The sound check measures it, its line hidden unless the address asks for it (?soundcheck).',
    function () {
      return json(FIX + 'the-kesh.json').then(function (j) {
        return withBuddies(function (win, doc) {
          var PP = win.BUDDIES_PAGE;
          PP.loadTune(j, 0);
          var bars = doc.querySelectorAll('#chart .bar').length, shapes = doc.querySelectorAll('#shapes svg').length;
          var facts = doc.getElementById('chosen-name').textContent + ' · ' + doc.getElementById('chosen-facts').textContent, play = doc.getElementById('play');
          play.click();
          return wait(1500).then(function () {
            var where = doc.getElementById('where').textContent, check = doc.getElementById('sound-check').textContent;
            expect(bars === 16 && shapes >= 3, bars + ' bars in the chart and ' + shapes + ' shapes');
            expect(/^The Kesh · Jig · 6\/8 · G major · Setting 1\b/.test(facts), 'the page says "' + facts + '"');
            expect(/^count-in [12] of 2/.test(where), 'it started with "' + where + '", not the two-bar count-in');
            expect(/making sound/.test(check), 'the sound check says "' + check + '"');
            expect(doc.getElementById('sound-check').hidden, 'the sound check’s line shows without ?soundcheck');
          });
        });
      });
    });

  check('Session Buddies', 'A chord you change holds through every repeat, and through save and open',
    'Tap a bar, pick a chord: it is played every time that bar comes round, marked as yours, and a saved file brings it back exactly, with nothing fetched.',
    function () {
      return Promise.all([json(FIX + 'the-kesh.json'), json(FIX + 'cooleys.json')]).then(function (r) {
        return withBuddies(function (win, doc) {
          var PP = win.BUDDIES_PAGE;
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
          expect(/The Kesh/.test(doc.getElementById('chosen-name').textContent), 'the opened file is not The Kesh');
        });
      });
    });

  check('Session Buddies', 'Finding a tune asks the Session, offers only what it can play, and folds away',
    'The search goes to thesession.org’s own API, from the page. Jigs, reels, hornpipes, polkas, slides, slip jigs and waltzes can be picked; other types (a mazurka, say) are listed but not yet playable. Once one is picked the list folds under one line, so it no longer pushes the tune far down the page.',
    function () {
      return json(FIX + 'the-kesh.json').then(function (kesh) {
        return withBuddies(function (win, doc) {
          var asked = [];
          win.fetch = function (url) {
            asked.push(String(url));
            var body = /search/.test(url)
              ? { tunes: [{ id: 55, name: 'The Kesh', type: 'jig' }, { id: 1, name: 'Some Mazurka', type: 'mazurka' }] }
              : kesh;
            return Promise.resolve({ ok: true, json: function () { return Promise.resolve(body); } });
          };
          doc.getElementById('q').value = 'kesh';
          doc.getElementById('find-go').click();
          return wait(100).then(function () {
            var btns = doc.querySelectorAll('#results button'), box = doc.getElementById('matches');
            var other = btns[1] && btns[1].disabled;
            var openFirst = box.open && !box.hidden, sumFirst = doc.getElementById('matches-sum').textContent;
            btns[0].click();
            return wait(100).then(function () {
              var sumAfter = doc.getElementById('matches-sum').textContent;
              expect(openFirst && /^2 found for “kesh”/.test(sumFirst), 'the matches were not shown: "' + sumFirst + '"');
              expect(!box.open && /^1 other match for “kesh”/.test(sumAfter), 'after picking one the matches did not fold away: "' + sumAfter + '"');
              expect(/^https:\/\/thesession\.org\/tunes\/search\?q=kesh&format=json/.test(asked[0] || ''), 'it asked ' + asked[0]);
              expect(btns.length === 2 && other && !btns[0].disabled, 'the results were not two, with the jig playable and the mazurka not');
              expect(/^https:\/\/thesession\.org\/tunes\/55\?format=json/.test(asked[1] || ''), 'picking it fetched ' + asked[1]);
              expect(win.BUDDIES_PAGE.tune() && win.BUDDIES_PAGE.tune().meta.name === 'The Kesh', 'picking it did not load The Kesh');
            });
          });
        });
      });
    });

  check('Session Buddies', 'The chosen tune and setting are shown where you found it',
    'Once picked, the tune’s name fills the search box and stands out under it, with which setting of how many is playing, so it is clear what is on the page.',
    function () {
      return json(FIX + 'the-kesh.json').then(function (j) {
        return withBuddies(function (win, doc) {
          var PP = win.BUDDIES_PAGE, $ = function (id) { return doc.getElementById(id); };
          PP.loadTune(j, 0);
          var box = $('q').value, name = $('chosen-name').textContent, facts1 = $('chosen-facts').textContent, shown = !$('chosen').hidden;
          $('setting').value = '1'; $('setting').dispatchEvent(new win.Event('change'));
          var facts2 = $('chosen-facts').textContent;
          PP.openText(PP.saveText());
          var facts3 = $('chosen-facts').textContent;
          PP.openText(PP.saveText(), true);              // the page bringing back its last tune
          var facts4 = $('chosen-facts').textContent;
          expect(box === 'The Kesh', 'the search box says "' + box + '"');
          expect(shown && name === 'The Kesh', 'the chosen tune is not shown under the search: "' + name + '"');
          expect(/^Jig · 6\/8 · G major · Setting 1 of 3 by /.test(facts1), 'it says "' + facts1 + '"');
          expect(/Setting 2 of 3/.test(facts2), 'after choosing setting 2 it says "' + facts2 + '"');
          expect(/Setting 2, from a saved file/.test(facts3), 'opened from a file it says "' + facts3 + '"');
          expect(/Setting 2/.test(facts4) && !/saved file/.test(facts4), 'brought back on reopening it says "' + facts4 + '"');
        });
      });
    });

  check('Session Buddies', 'The app and Session Buddies link to each other at the foot',
    'One tap at the bottom of either page switches to the other, the page you are on shown but not linked. The Kesh demo is no longer linked from there.',
    function () {
      return Promise.all([text('../index.html'), text('../buddies/')]).then(function (r) {
        function foot(html) { var m = /<footer[\s\S]*?<\/footer>/.exec(html); return m ? m[0] : ''; }
        var app = foot(r[0]), pl = foot(r[1]);
        expect(/<a href="buddies\/">Session Buddies<\/a>/.test(app) && /aria-current="page">Bodhrán</.test(app),
               'the app’s foot does not offer Session Buddies beside itself');
        expect(/<a href="\.\.\/">Bodhrán<\/a>/.test(pl) && /aria-current="page">Session Buddies</.test(pl),
               'Session Buddies’ foot does not offer the app beside itself');
        expect(pl.indexOf('guitar/') === -1, 'Session Buddies’ foot still links to the Kesh demo');
      });
    });

  check('Session Buddies', 'It is called Session Buddies, says what plays, and the old address leads to it',
    'Session Players was renamed Session Buddies and moved from /players/ to /buddies/. The old address stays for bookmarks: it says so, links to the new one and goes on there by itself. The description (at the top until 1.21.0, in About since) names the concertina as well as the flute, which it once left out.',
    function () {
      return Promise.all([text('../buddies/'), text('../players/')]).then(function (r) {
        var page = r[0], old = r[1];
        var sub = ((/<p class="lede">([\s\S]*?)<\/p>/.exec(page) || [])[1] || '').replace(/\s+/g, ' ').replace(/&aacute;/g, 'á');
        expect(/<title>Session Buddies<\/title>/.test(page) && /<h1>Session Buddies /.test(page), 'the page is not called Session Buddies');
        expect(page.indexOf('Session Players') === -1, 'the page still says Session Players');
        expect(/concertina/i.test(sub) && /flute/i.test(sub) && /guitar/i.test(sub) && /bodhrán/i.test(sub), 'the description leaves out an instrument: "' + sub + '"');
        expect(/<a [^>]*href="\.\.\/buddies\/"/.test(old), 'the old address does not link to the new one');
        expect(/http-equiv="refresh" content="\d+; url=\.\.\/buddies\/"/.test(old), 'the old address does not go on to the new one');
        expect(old.indexOf('<script') === -1, 'the old address still runs a page of its own');
      });
    });

  check('Session Buddies', 'In Mac Safari its sound goes straight to the speaker, not through an audio element',
    'Through the audio element the app uses in Mac Safari, Sí Bheag Sí Mhór slowed and dropped in pitch after a while, like a tape running down, while the chords kept time: Safari’s audio faltered for a moment under four instruments, and the element made up the gap by playing slower and stayed behind. Since 1.21.1 Session Buddies goes direct, with the near-silent nudge on each Play that woke a stuck tab before.',
    function () {
      return json(FIX + 'the-kesh.json').then(function (j) {
        return withBuddies(function (win, doc) {
          var SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
          Object.defineProperty(win.Navigator.prototype, 'userAgent', { configurable: true, get: function () { return SAFARI; } });
          Object.defineProperty(win.Navigator.prototype, 'maxTouchPoints', { configurable: true, get: function () { return 0; } });
          var streams = 0, routed = 0, nudged = 0, mk = win.AudioContext.prototype.createMediaStreamDestination;
          win.AudioContext.prototype.createMediaStreamDestination = function () { streams++; return mk.call(this); };
          win.HTMLMediaElement.prototype.play = function () { if (this.srcObject) routed++; else if (this.src) nudged++; return Promise.resolve(); };
          win.BUDDIES_PAGE.loadTune(j, 0);
          expect(win.TRAD.isMacSafari(), 'the page did not take itself for Mac Safari');
          doc.getElementById('play').click();
          return wait(300).then(function () {
            doc.getElementById('play').click();
            expect(streams === 0 && routed === 0, 'its sound went through an audio element: ' + streams + ' stream(s), ' + routed + ' play(s)');
            expect(nudged >= 1, 'Play made no near-silent nudge');
            expect(!win.BUDDIES_PAGE.audio().ctx.__route, 'the audio still has a route through an element');
          });
        });
      });
    });

  check('Session Buddies', 'Its top is the app’s, and What you hear folds into a summary',
    'Asked for in 1.21.0: the top of the page laid out as the app’s (its own icon, the name and version, a one-line tagline, About), the paragraph that was there moved into About; and the What you hear panel, most of a phone’s page of choices, folded into a few lines saying how each is set once you are happy with them. Hide or Done folds it, the summary or Change opens it; it stays as you left it through a reload, and Reset opens it.',
    function () {
      return json(FIX + 'the-kesh.json').then(function (j) {
        return withBuddies(function (win, doc) {
          var fr = win.frameElement, bad = [];
          function W() { return fr.contentWindow; }
          function $(id) { return fr.contentDocument.getElementById(id); }
          function reloaded() { return new Promise(function (ok) { fr.onload = function () { setTimeout(ok, 400); }; W().location.reload(); }); }
          function folded() { return $('hear-body').hidden && !$('hear-summary').hidden && $('hear-toggle').getAttribute('aria-expanded') === 'false'; }
          function opened() { return !$('hear-body').hidden && $('hear-summary').hidden && $('hear-toggle').getAttribute('aria-expanded') === 'true'; }
          function row(k) { var r = W().BUDDIES_PAGE.hearRows().filter(function (x) { return x[0] === k; })[0]; return r ? r[1] : null; }
          function shown() { return $('hear-rows').textContent; }
          W().BUDDIES_PAGE.loadTune(j, 0);
          // The top.
          var logo = fr.contentDocument.querySelector('.head img.logo'), touch = fr.contentDocument.querySelector('link[rel="apple-touch-icon"]');
          if (!logo || !/\/buddies\/icons\/icon-192\.png$/.test(logo.src)) bad.push('the top has no icon of its own: ' + (logo && logo.src));
          else if (!logo.complete || !logo.naturalWidth) bad.push('its icon did not load');
          if (!touch || !/\/buddies\/icons\/apple-touch-icon\.png$/.test(touch.href)) bad.push('the home-screen icon is ' + (touch && touch.href));
          if (fr.contentDocument.querySelector('.head .sub').textContent.length > 60) bad.push('the tagline is a paragraph again');
          $('about-open').click();
          if (!$('about').open) bad.push('About did not open');
          if ($('about-version').textContent.indexOf(W().BUDDIES_PAGE.VERSION) === -1) bad.push('About does not give the version');
          $('about-close').click();
          // Open to begin with; Hide folds it into the summary.
          if (!opened()) bad.push('What you hear did not start open');
          $('hear-toggle').click();
          if (!folded()) bad.push('Hide did not fold it');
          if (W().localStorage.getItem('players.hearopen') !== 'folded') bad.push('folded is not kept');
          if (!/Guitar/.test(row('Playing')) || !/Flute/.test(row('Playing')) || /Concertina/.test(row('Playing'))) bad.push('Playing says “' + row('Playing') + '”');
          if (!/Full/.test(row('Bodhrán') || '') || !/DADGAD/.test(row('Guitar') || '')) bad.push('the summary says “' + shown() + '”');
          // Changed while folded (a reset's Undo, a tune of another type), the summary follows.
          fr.contentDocument.querySelector('#drum-style [data-drum="simple"]').click();
          return wait(50).then(function () {
            if (!/Simple/.test(row('Bodhrán') || '') || shown().indexOf('Simple') === -1) bad.push('after Simple the summary says “' + shown() + '”');
            $('on-drum').click();
            return wait(50);
          }).then(function () {
            if (row('Bodhrán') !== null || /Bodhrán/.test(shown())) bad.push('with the bodhrán off the summary says “' + shown() + '”');
            return reloaded();
          }).then(function () {
            if (!folded()) bad.push('after a reload it was open again');
            if (/Bodhrán/.test(shown()) || !/Guitar/.test(shown())) bad.push('after a reload the summary says “' + shown() + '”');
            $('hear-summary').click();
            if (!opened()) bad.push('the summary did not open it');
            $('hear-done').click();
            if (!folded()) bad.push('Done did not fold it');
            $('reset-settings').click();               // reloads the page
            return new Promise(function (ok) { fr.onload = function () { setTimeout(ok, 400); }; });
          }).then(function () {
            if (!opened()) bad.push('after Reset settings it stayed folded');
            $('reset-undo').click();
            return new Promise(function (ok) { fr.onload = function () { setTimeout(ok, 400); }; });
          }).then(function () {
            if (!folded()) bad.push('Undo did not fold it again');
            expect(bad.length === 0, bad.join('\n'));
          });
        });
      });
    });

  check('Session Buddies', 'It shows its own version, and the notes cover it',
    'Session Buddies has its own version number. Bump it? Add it to CHANGELOG.md and the release notes in the same change.',
    function () {
      return withBuddies(function (win, doc) {
        var v = win.BUDDIES_PAGE && win.BUDDIES_PAGE.VERSION;
        expect(!!v, 'Session Buddies has no version');
        expect(doc.getElementById('buddies-version').textContent === 'v' + v, 'the title shows "' + doc.getElementById('buddies-version').textContent + '"');
        expect(doc.getElementById('foot-version').textContent.indexOf(v) !== -1, 'the foot of the page does not show ' + v);
        return Promise.all([text('../CHANGELOG.md'), text('../release-notes/')]).then(function (r) {
          expect(r[0].indexOf('### Session Buddies ' + v + ' ') !== -1, 'CHANGELOG.md has no entry for Session Buddies ' + v);
          expect(r[1].indexOf('<span class="ver">Session Buddies ' + v + '</span>') !== -1, 'the release notes have no entry for Session Buddies ' + v);
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
