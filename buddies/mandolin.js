/* mandolin.js — a mandolin for the melody (since Session Buddies 1.25.0),
 * the same shape as the flute and the concertina: new Mandolin(ctx, dest),
 * .prepare(midis), .note(t, dur, midi, vel, art), .cancelFrom(t).
 *
 * No recordings: each note is a pair of plucked strings, built as the
 * guitar's are (guitar.js, thumbString: a tuned string loop that loses its
 * top as it rings), and set against a real F-style mandolin recorded by the
 * user (The Kesh, setting 3, and its open strings, October 2026):
 *   - the string starts from the bend a pick leaves (bend), so its
 *     overtones fall away as a plucked string's do: on the D and A strings
 *     nearly pure, the 3rd harmonic 20 dB or more under the note, the higher
 *     strings a little brighter. (The first version started from smoothed
 *     noise, as the guitar's strum does: across a tune 5.5 dB more above
 *     2 kHz than below 1 kHz, against the real one's -25. "Too twangy.")
 *   - a quick drop of about 10 dB in the first quarter second, the light
 *     body taking the energy, then a long ring (6-9 dB a second); without
 *     it a note held and faded like a piano's;
 *   - the pair a cent apart, the second a hair after the first: a gentle
 *     shimmer; a faint scratch of pick; a pitch a few cents sharp at the
 *     pick, settling;
 *   - a small body: little below 120 Hz, its strongest around 400 Hz, a dip
 *     near 1 kHz, and (since 1.25.1) some presence near 2.2 kHz, so it
 *     carries on a phone's speaker;
 *   - a player's touch: no two picks alike (four renderings of each note,
 *     each struck a little differently), each a shade off in time, strength
 *     and pitch; a note stops when its own string is picked again, a
 *     fretted one just after the finger lifts, while an open string rings on
 *     under what follows. (Struck alike and cut clean, runs sounded "too
 *     clean".)
 * Chosen by ear, from clips, over several rounds.
 *
 * art: { up: an up-stroke (a little lighter), picks: [seconds] re-picked at
 * these offsets from t (a triplet, in place of a roll), tremolo: picked
 * fast all through, for a long note in a waltz }.
 */
(function (P, GTR) {
  'use strict';

  function hz(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

  var COURSE_LAG = 0.0025;  // the pick reaching the second string of the pair, seconds
  var VARIANTS = 4;         // renderings per note, each picked a little differently
  var SECONDS = 2.6;        // kept of each rendering (an open string rings about this long)

  /* The string as the pick leaves it, one period at 1024 points: bent to a
   * triangle peaking `pos` of the way from the bridge, its corner rounded
   * over `width` of the string (the pick's breadth and give). Its overtones
   * fall away as a plucked string's do (each about a quarter of the one
   * below: the 2nd 8 dB under the note, the 3rd 15), as measured on a real
   * F-style mandolin's D and A strings. (Smoothed random noise, the guitar's
   * pick, gave each note a random spread of overtones, the 3rd as strong as
   * the note: the "twang".) */
  function bend(pos, width, seed) {
    var R = 1024, tri = new Float32Array(R), out = new Float32Array(R), P = Math.max(1, Math.round(pos * R)), W = Math.max(1, Math.round(width * R)), i, mean = 0;
    for (i = 0; i < R; i++) tri[i] = i < P ? i / P : (R - i) / (R - P);
    for (i = 0; i < R; i++) { var sum = 0; for (var k = -W; k <= W; k++) sum += tri[(i + k + R) % R]; out[i] = sum / (2 * W + 1); }
    var s = seed;
    for (i = 0; i < R; i++) { s = (s * 16807) % 2147483647; out[i] += 0.01 * ((s / 2147483647) * 2 - 1); mean += out[i]; }
    mean /= R;
    for (i = 0; i < R; i++) out[i] -= mean;
    return out;
  }

  /* One note on a pair of strings, with the tone T (Mandolin.prototype.TONE). */
  function render(sr, f, seed, T) {
    var hi = T.highSustain != null ? T.highSustain : 0.6;                          // a little shorter up high
    var t60 = T.sustain * (hi + (1 - hi) * Math.max(0, Math.min(1, (900 - f) / 600)));
    var cut = Math.min(sr * 0.45, T.cut * Math.sqrt(f / 293.7));       // how long the top lasts
    // The pick, and where it strikes; brighter on the higher strings (on a
    // real mandolin the D and A strings are nearly pure, the E string bright).
    var start = bend(T.pos * Math.pow(293.7 / f, T.posSlope || 0), T.width * Math.pow(293.7 / f, T.widthSlope || 0), seed);
    var up = Math.pow(2, T.cents / 1200), lag = Math.round((T.lag != null ? T.lag : COURSE_LAG) * sr);
    var a = GTR.thumbString(sr, f * up, t60, cut, start, seed, 0.015);
    var b = GTR.thumbString(sr, f / up, t60 * 0.9, cut * 0.9, start, seed + 7, 0.015);
    var len = Math.min(a.length, Math.floor(sr * SECONDS)), out = new Float32Array(len), peak = 0;
    var xPrev = 0, yPrev = 0, R = Math.exp(-2 * Math.PI * 30 / sr);
    for (var i = 0; i < len; i++) {
      var x = T.mix * a[i] + (1 - T.mix) * (i >= lag ? b[i - lag] : 0);
      yPrev = x - xPrev + R * yPrev; xPrev = x;                         // no DC
      out[i] = yPrev; if (Math.abs(yPrev) > peak) peak = Math.abs(yPrev);
    }
    for (i = 0; i < len; i++) out[i] /= peak || 1;
    // A quick drop, then the ring: a mandolin's light body takes much of the
    // string's energy at once (on a real F-style, about 10 dB in the first
    // quarter second, then 6-9 dB a second). Without it a note held full
    // strength for half a second and faded smoothly, like a piano's.
    if (T.drop) for (i = 0; i < len; i++) out[i] *= 1 - T.drop + T.drop * Math.exp(-i / (T.dropTime * sr));
    // The pick itself: a faint, quick scratch of high noise as it meets the
    // string (on the real one, much of what there is above 5 kHz).
    if (T.click) {
      var cs = seed * 3 + 1, prevN = 0;
      for (i = 0; i < Math.floor(sr * 0.012); i++) {
        cs = (cs * 16807) % 2147483647;
        var nz = (cs / 2147483647) * 2 - 1;
        out[i] += T.click * (nz - prevN) * Math.exp(-i / (sr * 0.0025)); prevN = nz;
      }
    }
    var rise = Math.floor(sr * 0.0015);                                 // the pick lets go over a millisecond or two:
    for (i = 0; i < rise; i++) out[i] *= i / rise;                      // starting at full tilt, every note clicked
    var fade = Math.floor(sr * 0.05);                                   // the rendering ends without a click
    for (i = 0; i < fade; i++) out[len - 1 - i] *= i / fade;
    return out;
  }

  function Mandolin(ctx, dest) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = this.LEVEL;
    // The body: small and bright.
    var T = this.TONE, node = this.out;
    function add(type, f, q, g) { var b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; if (g != null) b.gain.value = g; node.connect(b); node = b; }
    add('highpass', T.hp, 0.7);
    T.peaks.forEach(function (pk) { add('peaking', pk[0], pk[1], pk[2]); });
    add('lowpass', T.air, 0.5);
    if (T.air2) add('lowpass', T.air2, 0.5);      // steeper above the body's top
    node.connect(dest);
    this.notes = {};          // midi -> [AudioBuffer]
    this.queued = [];
    this.ringing = [null, null, null, null];   // what each pair of strings is sounding
  }

  /* The whole mandolin's level, set so it sits with the flute (buddies.js MIX). */
  Mandolin.prototype.LEVEL = 0.5;
  /* The tone, chosen by ear against the user's F-style mandolin.
   *   pick: pos (where it strikes, a fraction of the string from the bridge;
   *     posSlope nearer the bridge going up), width (how broad and soft;
   *     widthSlope sharper going up), click (its scratch), sharp (cents sharp
   *     at the pick, settling);
   *   string: cut (how long it keeps its top), sustain (seconds to die away,
   *     highSustain the share kept on the highest notes), drop and dropTime
   *     (the quick fall after the pick), cents and mix (the pair: how far
   *     apart, and the first string's share), lag (the second string after
   *     the first, seconds);
   *   body: hp, peaks [[Hz, Q, dB]], air (a lowpass);
   *   touch: jitter (seconds), detune (cents), vary (share of strength), from
   *     pick to pick; openRing (how long an open string rings on before it
   *     fades), lift (a fretted note held after the next is picked). */
  /* Since 1.25.1 a little presence (the peak near 2.2 kHz, a crisper pick):
   * warm as it was, the mandolin vanished under the others on an iPhone's
   * speaker, which passes little below 700 Hz. Through a phone speaker's
   * response it was 4.7 dB under the flute (the concertina 1 dB over); now
   * 1.9 under. Its top against its bottom went from -23 to -17.5 dB, still
   * far from the first version's twang (+5.5). Chosen by ear, on the phone. */
  Mandolin.prototype.TONE = {
    pos: 0.18, width: 0.07, widthSlope: 0.7, click: 0.16, sharp: 6,
    cut: 10000, sustain: 6, highSustain: 0.9, drop: 0.68, dropTime: 0.09, cents: 1, mix: 0.62,
    hp: 120, peaks: [[400, 0.9, 3], [1000, 1.4, -3], [2200, 0.8, 6]], air: 6000,
    jitter: 0.004, detune: 1.5, vary: 0.12, openRing: 0.35, lift: 0.025
  };
  Mandolin.prototype.TREMOLO = 0.075;   // seconds between strokes of a tremolo, about 13 a second

  /* Render the notes it will be asked for, ahead of time. */
  Mandolin.prototype.prepare = function (midis) {
    var ctx = this.ctx, self = this;
    midis.forEach(function (m) {
      if (self.notes[m] || !(m > 0)) return;
      var list = [];
      for (var v = 0; v < VARIANTS; v++) {
        // No two picks alike: where it strikes, how broad, how much scratch.
        var seed = 7 + m * 131 + v * 7919, r = [], z = seed;
        for (var j = 0; j < 3; j++) { z = (z * 16807) % 2147483647; r.push((z / 2147483647) * 2 - 1); }
        var T = Object.assign({}, self.TONE, { pos: self.TONE.pos * (1 + 0.12 * r[0]),
                                                width: (self.TONE.width || 0) * (1 + 0.3 * r[1]),
                                                click: (self.TONE.click || 0) * (1 + 0.4 * r[2]) });
        var d = render(ctx.sampleRate, hz(m), seed, T), buf = ctx.createBuffer(1, d.length, ctx.sampleRate);
        buf.getChannelData(0).set(d);
        list.push(buf);
      }
      self.notes[m] = list;
    });
  };

  /* Which of the four pairs a note is played on, in the first position a
   * tune is played in (G D A E, each up to the next's open note), and
   * whether it is the open string itself. */
  function stringOf(midi) { return midi < 62 ? 0 : midi < 69 ? 1 : midi < 76 ? 2 : 3; }
  function isOpen(midi) { return midi === 55 || midi === 62 || midi === 69 || midi === 76; }

  /* One note: picked at t (down-stroke, unless art.up), held dur seconds.
   * As a player's: each pick a shade off in time, strength and pitch (a
   * run of identical strikes sounded "too clean"); a note stops when its
   * own string is picked again, a fretted one soon after the finger lifts,
   * while an open string rings on under what follows. */
  Mandolin.prototype.note = function (t, dur, midi, vel, art) {
    art = art || {};
    var ctx = this.ctx, self = this, T = this.TONE, S = stringOf(midi), open = isOpen(midi);
    if (!this.notes[midi]) this.prepare([midi]);
    var list = this.notes[midi];
    t = Math.max(ctx.currentTime, t);
    var end = t + dur, picks = art.picks ? art.picks.slice() : [0];
    if (art.tremolo) {
      picks = [];
      for (var p = 0; p < dur - 0.04; p += this.TREMOLO) picks.push(p);
    }
    function wobble(n) { return (Math.random() * 2 - 1) * n; }
    var nodes = [], prev = null;
    picks.forEach(function (off, i) {
      var at = Math.max(ctx.currentTime, t + off + wobble(T.jitter || 0)), src = ctx.createBufferSource(), g = ctx.createGain();
      src.buffer = list[Math.floor(Math.random() * list.length)];
      var tune = Math.pow(2, wobble(T.detune || 0) / 1200);
      // Plucked, a string starts a shade sharp and settles (a piano's does not).
      src.playbackRate.setValueAtTime(tune * Math.pow(2, (T.sharp || 0) * (1 + wobble(0.4)) / 1200), at);
      src.playbackRate.setTargetAtTime(tune, at, 0.025);
      // Down-strokes a little heavier than up-strokes; a tremolo's alternate.
      var up = (art.up ? 1 : 0) + i, k = up % 2 ? 0.82 : 1;
      if (art.tremolo) k *= i ? 0.72 : 1;
      k *= 1 + wobble(T.vary || 0);
      g.gain.setValueAtTime(Math.max(0.0001, vel * k), at);
      src.connect(g); g.connect(self.out);
      src.onended = function () { g.disconnect(); };   // rung out: let it go
      src.start(at);
      // Whatever this string was sounding stops as the pick meets it.
      var was = i ? prev : self.ringing[S];
      if (was) {
        was.g.gain.setTargetAtTime(0, at, 0.006);
        try { was.src.stop(at + 0.05); } catch (e) {}
      }
      prev = { g: g, src: src };
      nodes.push(g);
    });
    this.ringing[S] = prev;
    if (open) {                    // an open string rings on, fading, until picked again
      prev.g.gain.setTargetAtTime(0, end + (T.openRing || 0), 0.2);
      try { prev.src.stop(end + (T.openRing || 0) + 1.2); } catch (e) {}
    } else {                       // the finger lifts just after the next note sounds
      prev.g.gain.setTargetAtTime(0, end + (T.lift || 0), 0.025);
      try { prev.src.stop(end + (T.lift || 0) + 0.2); } catch (e) {}
    }
    this.queued = this.queued.filter(function (q) { return q.t > ctx.currentTime - 1; });
    this.queued.push({ t: t, nodes: nodes });
  };

  /* Stop: drop every note handed over but not yet begun. */
  Mandolin.prototype.cancelFrom = function (t) {
    this.queued = this.queued.filter(function (q) {
      if (q.t < t) return true;
      q.nodes.forEach(function (x) { x.disconnect(); });
      return false;
    });
  };

  P.Mandolin = Mandolin;
})(window.BUDDIES = window.BUDDIES || {}, window.GTR = window.GTR || {});
