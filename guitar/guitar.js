/* guitar.js — a synthesised steel-string guitar, strummed.
 *
 * No recordings. Each string is a Karplus–Strong plucked string: a burst of
 * noise fed round a delay line one period long, softened a little on every
 * trip, which is very close to what a real string does to the pick's click.
 * Every string note is rendered once into a buffer when the page first
 * plays, and a strum plays the strings one after another, a few milliseconds
 * apart: bass to treble going down, treble to bass coming up.
 *
 * A string sounding again cuts off its last note, and a chord change damps
 * any string the new shape does not play, as a fretting hand does.
 */
(function (GTR) {
  'use strict';

  var SECONDS = 2.6;   // how long each rendered string note lasts
  var VARIANTS = 2;    // renderings per note, so repeated strums never match

  function hz(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

  /* One plucked string. Returns the samples and the pitch they sound at. */
  function pluck(sr, f, bright, seed, pos) {
    var N = Math.max(2, Math.floor(sr / f - 0.5));
    var len = Math.floor(sr * SECONDS), out = new Float32Array(len);
    // Lower strings ring longer, as they do; on a dreadnought the bass rings on.
    var t60 = 1.6 + 3.2 * Math.max(0, Math.min(1, (400 - f) / 320));
    var rho = Math.pow(0.001, 1 / (t60 * f));
    // One period and one sample of noise to start: the loop below reads a
    // period and a sample back, so it needs both before it can begin.
    var s = seed, last = 0, mean = 0, fill = N + 1;
    for (var i = 0; i < fill; i++) {
      s = (s * 16807) % 2147483647;
      var n = (s / 2147483647) * 2 - 1;
      last = last + bright * (n - last);     // the pick: brighter or softer
      out[i] = last; mean += last;
    }
    mean /= fill;
    for (i = 0; i < fill; i++) out[i] -= mean;
    // Where along the string it is plucked: near the bridge, a fraction `pos`
    // of the way, every harmonic that has a node there goes missing. That
    // gap pattern is much of what makes a plucked string sound like a guitar.
    if (pos) {
      var M = Math.max(1, Math.round(pos * N)), ex = out.slice(0, fill);
      for (i = M; i < fill; i++) out[i] = ex[i] - ex[i - M];
    }
    for (i = fill; i < len; i++) {
      out[i] = rho * 0.5 * (out[i - N] + out[i - N - 1]);
    }
    var peak = 0;
    for (i = 0; i < len; i++) peak = Math.max(peak, Math.abs(out[i]));
    for (i = 0; i < len; i++) out[i] /= peak || 1;
    // The averaging adds half a sample to the loop, so it sounds at sr/(N+½).
    return { data: out, sounds: sr / (N + 0.5) };
  }
  GTR.pluck = pluck;

  /* A string that loses its top as a real one does, for single picked notes.
   *
   * In the plain model above, the only thing taking the top off is the
   * averaging of two neighbouring samples, and on a low note that is almost
   * nothing: measured, the raw A string had 14-27 dB more energy above 800 Hz
   * than below 400, and kept it as it rang. Inside a strum that is sparkle;
   * a single bass note it makes bright and thin, like a piano. Here a proper
   * lowpass sits inside the loop, so every trip round the string takes more
   * off the top: the note starts with the pick in it and settles into its
   * warm fundamental within a fraction of a second.
   *
   * The loop filter delays the note a little too, which would pull it flat,
   * so the delay is worked out exactly at the note's own pitch and taken off
   * the delay line, and the remainder corrected by the playback rate. */
  function pluckDark(sr, f, seed, cutoff, pos) {
    var a = Math.exp(-2 * Math.PI * cutoff / sr), c = 1 - a;   // one-pole lowpass
    var w = 2 * Math.PI * f / sr;
    var lag = Math.atan2(a * Math.sin(w), 1 - a * Math.cos(w)) / w;   // its delay, in samples
    var N = Math.max(2, Math.floor(sr / f - lag));
    var len = Math.floor(sr * SECONDS), out = new Float32Array(len);
    var t60 = 1.8 + 2.6 * Math.max(0, Math.min(1, (400 - f) / 320));
    // The filter takes a little off the fundamental too; allow for it.
    var gain = Math.sqrt(1 + a * a - 2 * a * Math.cos(w)) / c;
    var rho = Math.min(0.99995, Math.pow(0.001, 1 / (t60 * f)) * gain);
    var s = seed, mean = 0, i;
    for (i = 0; i < N; i++) {
      s = (s * 16807) % 2147483647;
      out[i] = (s / 2147483647) * 2 - 1; mean += out[i];
    }
    mean /= N;
    for (i = 0; i < N; i++) out[i] -= mean;
    if (pos) {
      var M = Math.max(1, Math.round(pos * N)), ex = out.slice(0, N);
      for (i = M; i < N; i++) out[i] = ex[i] - ex[i - M];
    }
    var lp = 0;
    for (i = N; i < len; i++) {
      lp += c * (out[i - N] - lp);
      out[i] = rho * lp;
    }
    var peak = 0;
    for (i = 0; i < len; i++) peak = Math.max(peak, Math.abs(out[i]));
    for (i = 0; i < len; i++) out[i] /= peak || 1;
    return { data: out, sounds: sr / (N + lag) };
  }
  GTR.pluckDark = pluckDark;

  /* A low string plucked with the thumb, for the bass runs.
   *
   * The models above start every note from a burst of random noise. Inside a
   * strum that is fine; a single bass note it gives away: its overtones came
   * out jagged, jumping up and down at random by 4-5 dB from one to the next
   * (the low D's second overtone louder than its fundamental). A real pluck
   * pulls the string into a bend and lets go, and its overtones fall away
   * smoothly, with only the soft dips set by where it was plucked. So:
   *   - the string starts from that bend: a triangle peaking a little under a
   *     quarter of the way along, its corner rounded, as a broad soft thumb
   *     leaves it (and a trace of noise, so it is not sterile);
   *   - a lowpass inside the loop, so it loses its top as it rings;
   *   - a string vibrates two ways at once, very slightly apart in pitch and
   *     dying at different rates: two such vibrations, mixed, give the gentle
   *     shimmer and the bloom-then-long-tail of a real one;
   *   - each loop is tuned exactly (the filter's delay taken off, the rest
   *     made up by a fractional-delay allpass), so both are in tune and the
   *     note needs no playback correction. */
  function thumbString(sr, f, t60, cutoff, shape, seed) {
    var a = Math.exp(-2 * Math.PI * cutoff / sr), c = 1 - a, w = 2 * Math.PI * f / sr;
    var lag = Math.atan2(a * Math.sin(w), 1 - a * Math.cos(w)) / w;
    var total = sr / f - lag;
    var N = Math.max(2, Math.floor(total - 0.1)), d = total - N;   // d: the allpass's share, 0.1..1.1
    // The allpass coefficient giving exactly that delay at this note's pitch
    // (the usual (1-d)/(1+d) is only exact at very low frequencies).
    function apDelay(C) {
      var re = C + Math.cos(w), im = -Math.sin(w), re2 = 1 + C * Math.cos(w), im2 = -C * Math.sin(w);
      return -(Math.atan2(im, re) - Math.atan2(im2, re2)) / w;
    }
    var lo = -0.99, hi = 0.99;
    for (var it = 0; it < 50; it++) { var mid = (lo + hi) / 2; if (apDelay(mid) > d) lo = mid; else hi = mid; }
    var C = (lo + hi) / 2;
    var len = Math.floor(sr * SECONDS), out = new Float32Array(len);
    var gain = Math.sqrt(1 + a * a - 2 * a * Math.cos(w)) / c;
    var rho = Math.min(0.99995, Math.pow(0.001, 1 / (t60 * f)) * gain);
    var s = seed, mean = 0, i;
    for (i = 0; i < N; i++) {
      s = (s * 16807) % 2147483647;
      out[i] = shape[Math.floor(i * shape.length / N)] + 0.02 * ((s / 2147483647) * 2 - 1);
      mean += out[i];
    }
    mean /= N;
    for (i = 0; i < N; i++) out[i] -= mean;
    var lp = 0, apIn = 0, apOut = 0;
    for (i = N; i < len; i++) {
      lp += c * (out[i - N] - lp);
      var y = C * lp + apIn - C * apOut;
      apIn = lp; apOut = y;
      out[i] = rho * y;
    }
    return out;
  }

  function pluckThumb(sr, f, seed) {
    // The bend: a triangle peaking 0.23 of the way along, its corner rounded
    // by the width of the thumb, a few per cent of the string's length. (The
    // first try rounded it over 40%, which left very nearly a pure tone.)
    var R = 1024, tri = new Float32Array(R), shape = new Float32Array(R), P = 0.23 * R, W = Math.round(0.03 * R);
    for (var i = 0; i < R; i++) tri[i] = i < P ? i / P : (R - i) / (R - P);
    var bend = new Float32Array(R);
    for (i = 0; i < R; i++) {
      var sum = 0, wsum = 0;
      for (var k = -W; k <= W; k++) {
        var wk = 0.5 + 0.5 * Math.cos(Math.PI * k / W), j = i + k;
        if (j >= 0 && j < R) { sum += wk * tri[j]; wsum += wk; }
      }
      bend[i] = sum / wsum;
    }
    // What the bridge, and so the body, hears is the string's slope pushing
    // on it, not its shape: start the loop from the slope of the bend. Its
    // overtones fall away far more gently than the shape's (by 1/k, not
    // 1/k squared); started from the shape, the note came out near a pure tone.
    for (i = 0; i < R; i++) shape[i] = (bend[(i + 1) % R] - bend[i]) * R;
    var t60 = 2.2 + 2.6 * Math.max(0, Math.min(1, (400 - f) / 320));
    // The long, singing way right on the note, the short one 2.4 cents
    // under it: the note you hear as it rings is the long one.
    var up = 1, down = Math.pow(2, -2.4 / 1200);
    var one = thumbString(sr, f * up, t60, 2600, shape, seed);              // the long, singing way
    var two = thumbString(sr, f * down, t60 * 0.55, 1800, shape, seed + 7);  // the quicker, duller way
    // Mixed, with anything below 20 Hz taken out (the loops pass it almost
    // unchanged, and it would only drift).
    var out = new Float32Array(one.length), peak = 0, xPrev = 0, yPrev = 0, R20 = Math.exp(-2 * Math.PI * 20 / sr);
    for (i = 0; i < out.length; i++) {
      var x = 0.62 * one[i] + 0.38 * two[i];
      yPrev = x - xPrev + R20 * yPrev; xPrev = x;
      out[i] = yPrev; peak = Math.max(peak, Math.abs(yPrev));
    }
    for (i = 0; i < out.length; i++) out[i] /= peak || 1;
    return { data: out, sounds: f };
  }
  GTR.pluckThumb = pluckThumb;

  /* The guitar body's response: the note straight through, plus its main
   * low resonances (air near 100 Hz, the top near 200, and above), each a
   * decaying ring. */
  function bodyResponse(ctx) {
    var sr = ctx.sampleRate, len = Math.floor(sr * 0.4), buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
    // [frequency, how long it rings (s), how much it adds at its peak]. A
    // ring's gain at its own pitch builds up over its whole length, so each
    // is scaled by that length: set per sample, the first version made the
    // air resonance 37 dB too strong.
    // Spread fairly evenly: a guitar's low strings sound warm and heavy through
    // their 2nd to 5th overtones, not through a boosted fundamental.
    var modes = [[98, 0.10, 0.4], [204, 0.07, 0.5], [385, 0.045, 0.45], [560, 0.035, 0.3], [870, 0.025, 0.2]];
    d[0] = 1;
    for (var i = 1; i < len; i++) {
      var t = i / sr, v = 0;
      for (var k = 0; k < modes.length; k++) {
        var amp = 2 * modes[k][2] / (modes[k][1] * sr);
        v += amp * Math.exp(-t / modes[k][1]) * Math.sin(2 * Math.PI * modes[k][0] * t);
      }
      d[i] += v;
    }
    return buf;
  }

  function Guitar(ctx, destination) {
    this.ctx = ctx;
    this.notes = {};         // midi -> [{ buffer, rate }]
    this.picks = {};         // midi -> renderings for single picked notes (bass runs)
    this.voices = [];        // per string: { gain, src } of what is ringing
    this.queued = [];        // every string note handed to the audio but not yet sounding
    this.shape = null;       // the notes of the shape currently held

    // The body, shaped like a big dreadnought (the Martin sound): a deep air
    // resonance near 100 Hz and a full low end, the mids scooped a little,
    // and a crisp but gentle top. It used to be a small bright guitar, loudest
    // between 1.5 and 5 kHz, with the bass 12 dB under that.
    var input = ctx.createGain();
    var hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 60;
    var low = ctx.createBiquadFilter(); low.type = 'lowshelf';
    low.frequency.value = 280; low.gain.value = 6;
    var body = ctx.createBiquadFilter(); body.type = 'peaking';
    body.frequency.value = 100; body.Q.value = 1.3; body.gain.value = 5;
    var scoop = ctx.createBiquadFilter(); scoop.type = 'peaking';
    scoop.frequency.value = 750; scoop.Q.value = 0.9; scoop.gain.value = -3;
    var air = ctx.createBiquadFilter(); air.type = 'peaking';
    air.frequency.value = 3400; air.Q.value = 0.9; air.gain.value = -1;
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.value = 5800; lp.Q.value = 0.5;
    this.level = ctx.createGain();
    this.level.gain.value = 0.8;
    input.connect(hp); hp.connect(low); low.connect(body); body.connect(scoop);
    scoop.connect(air); air.connect(lp);
    lp.connect(this.level); this.level.connect(destination);
    this.input = input;

    // Picked bass notes get more bottom than the strums: a low shelf, into
    // the same body.
    this.pickBus = ctx.createGain();
    var fat = ctx.createBiquadFilter(); fat.type = 'lowshelf';
    fat.frequency.value = 200; fat.gain.value = 0;   // the body shaping above is bass enough
    // The body ringing along: the top and the air inside have low resonances
    // of their own, and a plucked note sets them going. A short response made
    // of those resonances, each dying away, convolved with every picked note.
    var body = ctx.createConvolver();
    body.normalize = false;
    body.buffer = bodyResponse(ctx);
    this.pickBus.connect(body); body.connect(fat); fat.connect(input);
  }

  /* Render every note the given shapes use. Done once, on first play. */
  Guitar.prototype.prepare = function (midis) {
    var ctx = this.ctx, self = this;
    midis.forEach(function (m) {
      if (self.notes[m]) return;
      var f = hz(m), list = [];
      // A softer pick on the bass strings, brighter towards the treble: the
      // attack of a big-bodied guitar is round at the bottom.
      var bright = 0.24 + 0.2 * Math.min(1, f / 400);
      for (var v = 0; v < VARIANTS; v++) {
        var p = pluck(ctx.sampleRate, f, bright + 0.06 * v, 1 + m * 97 + v * 7919);
        var buf = ctx.createBuffer(1, p.data.length, ctx.sampleRate);
        buf.getChannelData(0).set(p.data);
        list.push({ buffer: buf, rate: f / p.sounds });
      }
      self.notes[m] = list;
    });
  };

  /* Render single picked notes for the bass runs: played with weight, more
   * thumb than pick tip, so a round attack rather than a click, plucked a
   * little further from the bridge. (1.4.1 used a bright pick near the
   * bridge; it read as bright and a bit weak for a bass line.) */
  Guitar.prototype.preparePicks = function (midis) {
    var ctx = this.ctx, self = this;
    midis.forEach(function (m) {
      if (self.picks[m]) return;
      var f = hz(m), list = [];
      for (var v = 0; v < VARIANTS; v++) {
        var p = pluckThumb(ctx.sampleRate, f, 3 + m * 131 + v * 7919);
        var buf = ctx.createBuffer(1, p.data.length, ctx.sampleRate);
        buf.getChannelData(0).set(p.data);
        list.push({ buffer: buf, rate: f / p.sounds });
      }
      self.picks[m] = list;
    });
  };

  Guitar.prototype.setLevel = function (v) {
    this.level.gain.setTargetAtTime(v, this.ctx.currentTime, 0.03);
  };

  /* Let a string's note die away quickly from time t: re-struck or damped. */
  Guitar.prototype._damp = function (string, t, fast) {
    var v = this.voices[string];
    if (!v) return;
    v.gain.gain.setTargetAtTime(0, t, fast ? 0.008 : 0.03);
    try { v.src.stop(t + 0.3); } catch (e) {}
    this.voices[string] = null;
  };

  Guitar.prototype._string = function (string, midi, t, vel) {
    var ctx = this.ctx, list = this.notes[midi];
    if (!list) return;
    this._damp(string, t, true);
    var pick = list[(Math.random() * list.length) | 0];
    var src = ctx.createBufferSource();
    src.buffer = pick.buffer;
    src.playbackRate.value = pick.rate;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.002);
    src.connect(g); g.connect(this.input);
    src.start(t);
    this.voices[string] = { gain: g, src: src };
    var now = ctx.currentTime;
    this.queued = this.queued.filter(function (q) { return q.t > now; });
    this.queued.push({ t: t, gain: g, src: src });
  };

  /* Drop every note due at or after time t: handed to the audio ahead of
   * time, but not yet sounding. Notes already ringing are left to Stop's
   * fade. (A tab in the background hands notes seconds ahead.) */
  Guitar.prototype.cancelFrom = function (t) {
    this.queued = this.queued.filter(function (q) {
      if (q.t < t) return true;
      q.gain.disconnect();
      try { q.src.stop(); } catch (e) {}
      return false;
    });
  };

  /* Strum a shape at time t.
   *   dir 'D' goes bass to treble through every string the shape plays;
   *   dir 'U' comes back from the treble through the top `reach` strings.
   *   vel is how hard, 0..1. Harder strums sweep faster. */
  Guitar.prototype.strum = function (notes, t, dir, vel, reach) {
    // A new shape: the fretting hand lets go of strings it no longer plays.
    if (notes !== this.shape) {
      for (var s = 0; s < 6; s++) if (notes[s] == null) this._damp(s, t, false);
      this.shape = notes;
    }
    var strings = [];
    for (s = 0; s < 6; s++) if (notes[s] != null) strings.push(s);
    if (dir === 'U') strings = strings.slice(-(reach || 4)).reverse();
    var gap = (dir === 'U' ? 0.009 : 0.012) - 0.004 * vel;
    for (var i = 0; i < strings.length; i++) {
      var k = strings[i];
      // Down strums lean on the bass, up strums catch the treble.
      var weight = dir === 'U' ? 0.75 + 0.25 * (i === 0) : (k < 3 ? 1.05 : 0.75);
      var v = vel * weight * (0.9 + Math.random() * 0.2) * 0.34;
      this._string(k, notes[k], t + i * gap + Math.random() * 0.002, v);
    }
  };

  /* One string plucked on its own with the thumb, as in a bass run: it cuts
   * that string's last note, and leaves the rest of the chord ringing. The
   * note is a thumb-plucked string (pluckThumb); here it settles its pitch,
   * rounds its top off as it rings, and goes through the body's own
   * resonances on the pick bus. */
  Guitar.prototype.pick = function (string, midi, t, vel) {
    var ctx = this.ctx, list = this.picks[midi] || this.notes[midi];
    if (!list) return;
    this._damp(string, t, true);
    var p = list[(Math.random() * list.length) | 0];
    var src = ctx.createBufferSource();
    src.buffer = p.buffer;
    // A plucked string starts a shade sharp, stretched by the pluck, and
    // settles within a tenth of a second.
    src.playbackRate.setValueAtTime(p.rate * Math.pow(2, 5 / 1200), t);
    src.playbackRate.setTargetAtTime(p.rate, t + 0.004, 0.05);
    var tone = ctx.createBiquadFilter();
    tone.type = 'lowpass'; tone.Q.value = 0.6;
    // The string darkens itself now (pluckDark); this only rounds the rest
    // off, relative to the note so the low D and the A above it match.
    var f0 = hz(midi);
    tone.frequency.setValueAtTime(Math.min(6000, f0 * 40), t);
    tone.frequency.setTargetAtTime(Math.max(500, f0 * 9), t + 0.006, 0.12);
    var g = ctx.createGain();
    // A bass line, a little above the strums (measured: about 1-7 dB over
    // them). The thumb note is round and dense, so it needs far less gain
    // for its weight than the noisy ones did.
    var level = vel * 0.23;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + 0.004);    // a thumb, not a pick: no click
    src.connect(tone); tone.connect(g); g.connect(this.pickBus);
    src.start(t);
    this.voices[string] = { gain: g, src: src };
    var now = ctx.currentTime;
    this.queued = this.queued.filter(function (q) { return q.t > now; });
    this.queued.push({ t: t, gain: g, src: src });
  };

  /* Stop everything ringing, quickly, from time t. */
  Guitar.prototype.silence = function (t) {
    for (var s = 0; s < 6; s++) this._damp(s, t, false);
    this.shape = null;
  };

  GTR.Guitar = Guitar;
  GTR.hz = hz;
})(window.GTR = window.GTR || {});
