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
  function pluck(sr, f, bright, seed) {
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

  function Guitar(ctx, destination) {
    this.ctx = ctx;
    this.notes = {};         // midi -> [{ buffer, rate }]
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

  /* One string picked on its own, as in a bass run: it cuts that string's
   * last note, and leaves the rest of the chord ringing. */
  Guitar.prototype.pick = function (string, midi, t, vel) {
    this._string(string, midi, t, vel * 0.36);
  };

  /* Stop everything ringing, quickly, from time t. */
  Guitar.prototype.silence = function (t) {
    for (var s = 0; s < 6; s++) this._damp(s, t, false);
    this.shape = null;
  };

  GTR.Guitar = Guitar;
  GTR.hz = hz;
})(window.GTR = window.GTR || {});
