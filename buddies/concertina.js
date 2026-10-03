/* concertina.js — a concertina for the melody: recorded notes (Concertina,
 * below) and, until they load, a synthesised one (ConcertinaSynth).
 *
 * In Irish music the concertina (mostly the Anglo) plays the tune, crisp
 * and bouncy, and without vibrato. It is a free reed: a brass tongue
 * swinging through a slot, which chops the air into a narrow pulse, so its
 * tone is rich in overtones, odd ones a little stronger, the reed's buzz
 * on top; a small box shapes it, with a lift in the upper middle and little
 * real bass. Unlike the accordions heard in Irish music, a concertina has
 * one reed to a note, tuned dry: no beating second reed.
 *
 * Each note: one reed (a waveform built from that spectrum), a few cents
 * off true at random as a real reed's tuning is, speaking quickly but not
 * instantly (the bellows push the air, and a reed's upper overtones build
 * up over its first few hundredths of a second), and a breath of air at the
 * start. Notes carry over into each other, a repeated note re-struck with
 * a little gap: see note().
 */
(function (P) {
  'use strict';

  var waves = new WeakMap();
  // The reed's spectrum, harmonic by harmonic: a narrow pulse, falling
  // gently, odd harmonics a shade stronger than even.
  function wave(ctx) {
    var w = waves.get(ctx);
    if (w) return w;
    var n = 32, re = new Float32Array(n + 1), im = new Float32Array(n + 1);
    for (var k = 1; k <= n; k++) im[k] = (k % 2 ? 1 : 0.72) / Math.pow(k, 0.85);
    w = ctx.createPeriodicWave(re, im);
    waves.set(ctx, w);
    return w;
  }

  function ConcertinaSynth(ctx, dest) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    // The box: little real bass, a lift where the reed chambers ring, and
    // the top rounded off.
    var low = ctx.createBiquadFilter(); low.type = 'highpass'; low.frequency.value = 180; low.Q.value = 0.6;
    var box = ctx.createBiquadFilter(); box.type = 'peaking'; box.frequency.value = 1700; box.Q.value = 0.9; box.gain.value = 4;
    var top = ctx.createBiquadFilter(); top.type = 'lowpass'; top.frequency.value = 6500; top.Q.value = 0.5;
    this.out.connect(low); low.connect(box); box.connect(top); top.connect(dest);
    this.queued = [];
    var len = ctx.sampleRate / 4, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.air = buf;
    // The bellows' wander: four seconds of noise smoothed to a slow random
    // line (moving at a few times a second), scaled to run between -1 and 1.
    var dl = ctx.sampleRate * 4, db = ctx.createBuffer(1, dl, ctx.sampleRate), w = db.getChannelData(0);
    var k = Math.exp(-2 * Math.PI * 5 / ctx.sampleRate), y = 0, z = 0, peak = 0;
    for (i = 0; i < dl; i++) { y = k * y + (1 - k) * (Math.random() * 2 - 1); z = k * z + (1 - k) * y; w[i] = z; }
    for (i = 0; i < dl; i++) peak = Math.max(peak, Math.abs(w[i]));
    for (i = 0; i < dl; i++) w[i] /= peak;
    this.drift = db;
  }

  /* One note: t start, dur seconds held, midi, vel 0-1.
   *
   * Notes run into each other, as on the instrument: the bellows keep the
   * air up through a phrase, so the player passes each note held a touch
   * past the next one's start, and the reed dies away over a twentieth of a
   * second after it is let go rather than stopping dead. (1.5.0 detached
   * the short notes and cut each one off: measured, the sound fell to
   * silence, 85 dB down, between every two notes.)
   *
   * And no two moments of a note are quite alike: the bellows pressure
   * wanders, so the reed drifts a little in pitch and level (randomly, not
   * a vibrato); it bends up into pitch as it starts; and pushed harder it
   * speaks brighter. (1.5.0 held each note as one fixed waveform: its level
   * moved 0.11 dB.) */
  ConcertinaSynth.prototype.note = function (t, dur, midi, vel) {
    var ctx = this.ctx, f = 440 * Math.pow(2, (midi - 69) / 12), end = t + dur, REL = 0.05;
    var reed = ctx.createOscillator(), bright = ctx.createBiquadFilter(), amp = ctx.createGain();
    reed.setPeriodicWave(wave(ctx));
    reed.detune.value = (Math.random() * 2 - 1) * 3;            // a real reed's tuning, a few cents either way
    reed.frequency.setValueAtTime(f * 0.996, t);                 // bending up into pitch as it speaks
    reed.frequency.exponentialRampToValueAtTime(f, t + 0.03);
    // The overtones build up as the reed starts to swing, more of them the harder it is pushed.
    bright.type = 'lowpass'; bright.Q.value = 0.7;
    bright.frequency.setValueAtTime(Math.min(f * 3, 2500), t);
    bright.frequency.exponentialRampToValueAtTime(Math.min(f * (12 + 16 * vel), 16000), t + 0.035);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(vel, t + 0.025);      // the bellows: soft-edged, not a click
    amp.gain.setValueAtTime(vel, end);
    amp.gain.setTargetAtTime(0, end, REL);                      // the reed dying away
    // The bellows' wander: one slow random line moving pitch and level
    // together, the level scaling the note (so it dies away with it).
    var shimmer = ctx.createGain(), drift = ctx.createBufferSource(), cents = ctx.createGain(), level = ctx.createGain();
    shimmer.gain.value = 1;
    reed.connect(bright); bright.connect(amp); amp.connect(shimmer); shimmer.connect(this.out);
    reed.start(t); reed.stop(end + 8 * REL);
    drift.buffer = this.drift; drift.loop = true;
    cents.gain.value = 4; level.gain.value = 0.12;              // at most 4 cents and 1 dB; mostly a third of that
    drift.connect(cents); cents.connect(reed.detune);
    drift.connect(level); level.connect(shimmer.gain);
    drift.start(t, Math.random() * this.drift.duration); drift.stop(end + 8 * REL);
    // Air: a breath as the pallet opens, then a trace of it under the note.
    var b = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), bg = ctx.createGain();
    b.buffer = this.air; b.loop = true;
    bp.type = 'bandpass'; bp.frequency.value = Math.min(f * 6, 5000); bp.Q.value = 1.5;
    bg.gain.setValueAtTime(0.0001, t);
    bg.gain.exponentialRampToValueAtTime(vel * 0.05, t + 0.008);
    bg.gain.exponentialRampToValueAtTime(vel * 0.01, t + 0.07);
    bg.gain.setValueAtTime(vel * 0.01, end);
    bg.gain.setTargetAtTime(0, end, REL);
    b.connect(bp); bp.connect(bg); bg.connect(this.out);
    b.start(t, Math.random() * 0.2); b.stop(end + 8 * REL);
    this.queued = this.queued.filter(function (q) { return q.t > ctx.currentTime - 1; });
    this.queued.push({ t: t, nodes: [shimmer, bg] });
  };

  /* Stop: drop every note handed over but not yet begun. */
  ConcertinaSynth.prototype.cancelFrom = function (t) {
    this.queued = this.queued.filter(function (q) {
      if (q.t < t) return true;
      q.nodes.forEach(function (x) { x.disconnect(); });
      return false;
    });
  };

  P.ConcertinaSynth = ConcertinaSynth;

  /* ---------- the concertina, recorded ----------
   * Since Session Players 1.7.0 the concertina plays real recordings: the
   * notes of a modern 30-key Anglo concertina with steel reeds, cut from
   * "Demonstration of the note range of an Anglo Concertina" by Alwayswonder
   * (Wikimedia Commons, CC BY-SA 4.0; see concertina/README.md). Synthesised,
   * a listener's verdict was "too much like a keyboard".
   *
   * Each note plays the nearest recorded one, retuned to A=440 from its
   * measured tuning (the instrument sits 0-28 cents sharp) and shifted at
   * most a semitone or two where a note was not recorded. Its own attack
   * lands on the beat. Held longer than recorded, it loops through the
   * steady part of the note, a long stretch so the reed's own unevenness
   * goes on (a short loop turns any instrument into an organ). The page's
   * lilt and weighting shape it: softer notes quieter and a little darker,
   * as a gentler push on the bellows makes them. Until the recordings have
   * loaded, the synthesised concertina plays instead. */
  var HERE = (document.currentScript && document.currentScript.src || '').replace(/[^\/]*$/, '');
  P.CONCERTINA_SAMPLES = HERE + 'concertina/';

  function Concertina(ctx, dest, base) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.connect(dest);
    // The stand-in at the recordings' level. Until Session Buddies 1.15.0 it
    // played at its own old level, 12 dB over them (the bus was raised to
    // suit the recordings): the first bars of a slow first load came in loud
    // and buzzy, over everything, then dropped and changed sound.
    this.standIn = ctx.createGain();
    this.standIn.gain.value = Concertina.STAND_IN;
    this.standIn.connect(dest);
    this.synth = new ConcertinaSynth(ctx, this.standIn);
    this.samples = null;          // [{ midi, cents, wobble, buf, start, lead, ls, le }] once loaded
    this.wanted = null;           // the notes it means to play, from samples.json
    this.missing = [];            // of those, the ones that have not arrived
    this.status = 'loading';      // then 'ready', 'partial' (some missing) or 'failed' (none)
    this.onstatus = null;
    this.queued = [];
    this.base = base || P.CONCERTINA_SAMPLES;
    this.ready = this.load();
  }
  Concertina.STAND_IN = 0.25;       // -12 dB: measured, a phrase on each, the stand-in 11.6-12.3 dB over
  Concertina.RETRY = 1.5;           // seconds before a second try at a recording

  /* Loading. Each recording is fetched on its own and, failing, tried once
   * more a moment later, and whatever arrives is kept; any still missing
   * are tried again at the next Play (retry). Until Session Buddies 1.15.0
   * they came as one bundle: one note lost on patchy wifi lost them all,
   * and the stand-in played for the rest of the visit, with nothing said.
   * Resolves true once there are recordings to play. */
  Concertina.prototype.load = function () {
    var ctx = this.ctx, self = this, base = this.base;
    function decode(ab) {          // the promise form, and Safari's older callback form
      return new Promise(function (ok, bad) {
        var p = ctx.decodeAudioData(ab, ok, bad);
        if (p && p.then) p.then(ok, bad);
      });
    }
    function get(url, how) {
      return fetch(url).then(function (r) { if (!r.ok) throw new Error(url + ': ' + r.status); return r[how](); });
    }
    function twice(fn) {
      return fn().catch(function () {
        return new Promise(function (ok) { setTimeout(ok, Concertina.RETRY * 1000); }).then(fn);
      });
    }
    this.loading = true;
    this.tell('loading');
    var meta = this.wanted ? Promise.resolve(this.wanted) :
      twice(function () { return get(base + 'samples.json', 'json'); }).then(function (m) { return (self.wanted = Concertina.steady(m.notes)); });
    return meta.then(function (wanted) {
      var have = (self.samples || []).map(function (s) { return s.midi; });
      return Promise.all(wanted.filter(function (n) { return have.indexOf(n.midi) < 0; }).map(function (n) {
        return twice(function () { return get(base + 'c-' + n.midi + '.m4a', 'arrayBuffer').then(decode); })
          .then(function (buf) { return prepare(buf, n); }, function () { return null; });
      }));
    }).then(function (list) {
      var got = (self.samples || []).concat(list.filter(Boolean));
      if (got.length) self.samples = got.sort(function (a, b) { return a.midi - b.midi; });
    }, function () {}).then(function () {
      var have = (self.samples || []).map(function (s) { return s.midi; });
      self.missing = (self.wanted || []).map(function (n) { return n.midi; }).filter(function (m) { return have.indexOf(m) < 0; });
      self.loading = false;
      self.tell(!self.samples ? 'failed' : self.missing.length || !self.wanted ? 'partial' : 'ready');
      return !!self.samples;   // without any, the synthesised one carries on
    });
  };

  /* Try again for whatever did not arrive: the page calls it at Play. */
  Concertina.prototype.retry = function () {
    if (this.loading || this.status === 'ready') return this.ready;
    return (this.ready = this.load());
  };

  Concertina.prototype.tell = function (status) {
    this.status = status;
    if (this.onstatus) this.onstatus(status);
  };

  /* The recorded notes worth playing. A few waver in pitch on their own
   * (F#4 by ±11 cents, five or six times a second: as much as the flute's old
   * vibrato, and F# is in every D and G tune), which sounded warbly; each of
   * those is played instead from a steady note a semitone away, retuned. */
  Concertina.WOBBLE = 1.5;          // cents, the most a note may waver (samples.json)
  Concertina.steady = function (notes) {
    function ok(n) { return !(n.wobble > Concertina.WOBBLE); }
    return notes.filter(function (n) {
      return ok(n) || !notes.some(function (o) { return ok(o) && Math.abs(o.midi - n.midi) === 1; });
    });
  };

  /* Getting a recorded note ready to play.
   *
   * Where it starts: in the recording each reed swells in gently, taking
   * 0.15-0.2 s to reach full voice (a demonstration, not a dance), which made
   * every note late and blurred repeated ones. So it starts 25 ms before the
   * note has spoken (within 6 dB of its steady level): the reed's own voicing
   * is kept, the slow swell is not.
   *
   * A loop through its steady part, for notes held longer than recorded.
   * The recorded note fades a little as the bellows run on, so looping it
   * made long notes pulse, 5 dB twice a second; its slow fade is evened out
   * across that stretch (its quicker wavering, the reed's own life, is
   * left), and the loop's end is moved to where the wave best matches its
   * start. Until Session Players 1.7.4 the loop began 0.12 s after the note
   * spoke, in a small dip just after its attack, was matched at the join
   * over 2 ms, and its level was evened over 80 ms: long notes still wavered
   * with every pass, twice a second, a little in level and pitch (F#4 by 18
   * cents). Now it begins at LOOP.from, once the note has settled, the join
   * is matched over 10 ms and blended over LOOP.blend, and the level is
   * evened over LOOP.even (its life kept: it still moves 0.1-1 dB). */
  var LOOP = { from: 0.2, to: 0.7, blend: 0.1, even: 0.06 };
  function prepare(buf, n) {
    var d = buf.getChannelData(0), sr = buf.sampleRate, hop = Math.round(sr * 0.005), i, k;
    var env = [];
    for (i = 0; i + 2 * hop < d.length; i += hop) {
      var e2 = 0; for (k = 0; k < 2 * hop; k++) e2 += d[i + k] * d[i + k];
      env.push(Math.sqrt(e2 / (2 * hop)) + 1e-9);
    }
    var mid = env.slice(Math.floor(env.length * 0.4), Math.floor(env.length * 0.7)).sort(function (x, y) { return x - y; });
    var steady = mid[Math.floor(mid.length / 2)] || 1e-3, speak = 0;
    for (i = 0; i < env.length; i++) if (env[i] >= steady * 0.5) { speak = i * hop; break; }
    var start = Math.max(0, speak - Math.round(0.025 * sr));
    var a = speak + Math.round(LOOP.from * sr), b = Math.min(d.length - Math.round(0.12 * sr), speak + Math.round(LOOP.to * sr));
    if (b - a < Math.round(0.2 * sr)) { a = speak + Math.round(0.12 * sr); b = d.length - Math.round(0.06 * sr); }
    // Even out the slow fade from where it has spoken to past the loop's end:
    // the level smoothed over 80 ms, brought to the steady level (at most 6 dB either way).
    var w = Math.round(LOOP.even * sr / hop), from = Math.floor(speak / hop), to = Math.min(env.length - 1, Math.ceil((b + 0.05 * sr) / hop));
    var slow = [];
    for (i = from; i <= to; i++) {
      var sum = 0, cnt = 0;
      for (k = Math.max(0, i - w); k <= Math.min(env.length - 1, i + w); k++) { sum += env[k]; cnt++; }
      slow.push(Math.max(0.5, Math.min(2, steady / (sum / cnt))));
    }
    for (i = speak; i < Math.min(d.length, (to + 1) * hop); i++) {
      var pos = (i / hop) - from, j = Math.min(slow.length - 1, Math.max(0, Math.floor(pos)));
      var g = slow[j], ramp = Math.min(1, (i - speak) / (0.05 * sr));   // eased in over 50 ms from where it spoke
      d[i] *= 1 + (g - 1) * ramp;
    }
    for (i = start; i < Math.min(d.length, start + Math.round(0.004 * sr)); i++) d[i] *= (i - start) / (0.004 * sr);  // no click at the cut
    // The loop's end: where the wave, over 10 ms, best matches its start.
    var period = sr / (440 * Math.pow(2, (n.midi - 69) / 12)), best = -Infinity, e = b, N = Math.round(0.01 * sr);
    for (var c = Math.round(b - 2 * period); c <= b; c++) {
      var xy = 0, yy = 0;
      for (k = 0; k < N; k++) { xy += d[a + k] * d[c + k]; yy += d[c + k] * d[c + k]; }
      var r = xy / Math.sqrt(yy + 1e-12);
      if (r > best) { best = r; e = c; }
    }
    // And the join blended: the last stretch before the end fades into what
    // led up to the start, so passing from end to start is seamless.
    var X = Math.min(Math.round(LOOP.blend * sr), a - speak, Math.floor((e - a) / 3));
    for (k = 0; k < X; k++) { var f = k / X; d[e - X + k] = d[e - X + k] * (1 - f) + d[a - X + k] * f; }
    return { midi: n.midi, cents: n.cents, wobble: n.wobble || 0, buf: buf, start: start / sr, lead: (speak - start) / sr, ls: a / sr, le: e / sr };
  }

  /* A real reed stops quickly when its button is let go: its release, a
   * time constant in seconds (20 dB down in 2.3 of them, 35 ms). 1.7.0's
   * 45 ms, with 30 ms of carry-over, left its old note sounding against the
   * flute's new one for about 130 ms at a change. */
  Concertina.prototype.REL = 0.015;

  Concertina.prototype.pick = function (midi) {
    var s = this.samples, best = s[0];
    for (var i = 1; i < s.length; i++) {           // the nearest; of two as near, the steadier
      var d = Math.abs(s[i].midi - midi) - Math.abs(best.midi - midi);
      if (d < 0 || (d === 0 && s[i].wobble < best.wobble)) best = s[i];
    }
    return best;
  };

  /* With some recordings missing, a note is borrowed from a neighbour at
   * most two semitones away (as notes never recorded already are); further
   * than that, and further than the full set would have gone, it would be
   * stretched out of its voice, so the stand-in plays it. */
  Concertina.prototype.tooFar = function (midi) {
    if (!this.missing.length) return false;
    var near = Math.abs(this.pick(midi).midi - midi);
    var best = Math.min.apply(null, this.wanted.map(function (n) { return Math.abs(n.midi - midi); }));
    return near > Math.max(2, best);
  };

  /* One note: t start, dur seconds held, midi, vel 0-1 (as the synthesised one). */
  Concertina.prototype.note = function (t, dur, midi, vel) {
    if (!this.samples || this.tooFar(midi)) return this.synth.note(t, dur, midi, vel);
    var ctx = this.ctx, s = this.pick(midi), end = t + dur, REL = this.REL;
    var rate = Math.pow(2, (midi - s.midi - s.cents / 100) / 12);
    var src = ctx.createBufferSource(), tone = ctx.createBiquadFilter(), amp = ctx.createGain();
    src.buffer = s.buf; src.loop = true; src.loopStart = s.ls; src.loopEnd = s.le;
    src.playbackRate.value = rate;
    // A gentler push: quieter, and darker.
    tone.type = 'lowpass'; tone.Q.value = 0.5; tone.frequency.value = 2500 + 11000 * vel * vel;
    var lead = s.lead / rate, from = t - lead, offset = s.start;
    if (from < ctx.currentTime) { offset += (ctx.currentTime - from) * rate; from = ctx.currentTime; }
    amp.gain.setValueAtTime(vel, from);
    amp.gain.setValueAtTime(vel, end);
    amp.gain.setTargetAtTime(0, end, REL);
    src.connect(tone); tone.connect(amp); amp.connect(this.out);
    src.start(from, offset); src.stop(end + 8 * REL);
    this.queued = this.queued.filter(function (q) { return q.t > ctx.currentTime - 1; });
    this.queued.push({ t: t, nodes: [amp] });
  };

  Concertina.prototype.cancelFrom = function (t) {
    this.synth.cancelFrom(t);
    this.queued = this.queued.filter(function (q) {
      if (q.t < t) return true;
      q.nodes.forEach(function (x) { x.disconnect(); });
      return false;
    });
  };

  P.Concertina = Concertina;
})(window.BUDDIES = window.BUDDIES || {});
