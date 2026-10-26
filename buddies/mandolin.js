/* mandolin.js — a mandolin for the melody (since Session Buddies 1.25.0),
 * the same shape as the flute and the concertina: new Mandolin(ctx, dest),
 * .prepare(midis), .note(t, dur, midi, vel, art), .cancelFrom(t).
 *
 * No recordings: each note is a pair of plucked strings, built as the
 * guitar's are (guitar.js, thumbString: a tuned string loop that loses its
 * top as it rings). Since 1.28.0 it is set against the user's mandolin
 * teacher's playing (The Kesh, part A, and open strings picked and strummed,
 * October 2026), after he said the 1.25 mandolin sounded "like striking a
 * piano key" rather than plucking a string. Measured against him, it was
 * built like a struck string: nearly a pure tone (its overtones 20-30 dB
 * under the note; on his, louder than the note at the pick), full at once,
 * then the whole note falling 10 dB, a piano's two-stage fade. It had been
 * matched to an earlier recording that turned out about 25 dB muffled. Now:
 *   - the bridge feels the string's slope, not its shape (as guitar.js
 *     learned for the thumb), so a pick is bright: its overtones as strong
 *     as the note, fading 10-15 dB in the first quarter second while the
 *     note itself holds (his: the same);
 *   - the pick crosses the pair one string after the other, 8-14 ms apart
 *     (longer on the heavier strings), so a note swells in over 15-30 ms;
 *     and it meets the old note a moment before it lets go;
 *   - the pitch starts sharp and settles over a tenth of a second, more on
 *     the heavier strings (his: about 10 cents on A, 20 on G);
 *   - the acoustic sound he asked for, as the guitar has: a body that rings
 *     along with each pick, open strings humming in sympathy with the notes
 *     they agree with, and a small room around it;
 *   - a player's touch, as before: no two picks alike (four renderings of
 *     each note), each a shade off in time, strength and pitch; a note stops
 *     when its own string is picked again, a fretted one just after the
 *     finger lifts, while an open string rings on under what follows.
 * The teacher chose it by ear, from clips, over two rounds.
 *
 * art: { up: an up-stroke (a little lighter), picks: [seconds] re-picked at
 * these offsets from t (a triplet, in place of a roll), tremolo: picked
 * fast all through, for a long note in a waltz }.
 */
(function (P, GTR) {
  'use strict';

  function hz(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

  var VARIANTS = 4;         // renderings per note, each picked a little differently
  var SECONDS = 2.6;        // kept of each rendering (an open string rings about this long)
  var OPEN = [55, 62, 69, 76];   // the open pairs: G D A E

  /* The string as the pick leaves it, one period at 1024 points: bent to a
   * triangle peaking `pos` of the way from the bridge, its corner rounded
   * over `width` of the string (the pick's breadth and give). */
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

  /* What the bridge, and so the body, feels: the bent string's slope. Its
   * overtones fall away by 1/k, not the shape's 1/k squared; started from
   * the shape (1.25.x) a note was nearly a pure tone. Struck a fifth of the
   * way along, every fifth overtone is missing (his G string: the 5th
   * 25 dB under its neighbours). */
  function slope(shape) {
    var R = shape.length, out = new Float32Array(R), e1 = 0, e2 = 0, i;
    for (i = 0; i < R; i++) { out[i] = shape[(i + 1) % R] - shape[i]; e1 += shape[i] * shape[i]; e2 += out[i] * out[i]; }
    var k = Math.sqrt(e1 / (e2 || 1));
    for (i = 0; i < R; i++) out[i] *= k;
    return out;
  }

  /* One note on a pair of strings, with the tone T (Mandolin.prototype.TONE). */
  function render(sr, f, seed, T) {
    var hi = T.highSustain != null ? T.highSustain : 0.6;                          // a little shorter up high
    var t60 = T.sustain * (hi + (1 - hi) * Math.max(0, Math.min(1, (900 - f) / 600)));
    var cut = Math.min(sr * 0.45, T.cut * Math.sqrt(f / 293.7));       // how long the top lasts
    var start = slope(bend(T.pos, T.width, seed));
    // The pick reaches the pair's second string a little after the first,
    // later on the heavier strings (it drags before it lets go).
    var low = Math.max(0, Math.min(1, (659.3 - f) / (659.3 - 196))), r = ((seed * 48271) % 2147483647) / 2147483647;
    var lag = Math.round((T.lag[0] + (T.lag[1] - T.lag[0]) * r) / 1000 * (1 + T.lagLow * low) * sr);
    var up = Math.pow(2, T.cents / 1200);
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
    // The pick itself: a quick scratch of high noise as it meets the string.
    if (T.click) {
      var cs = seed * 3 + 1, prevN = 0;
      for (i = 0; i < Math.floor(sr * 5 * T.clickTc); i++) {
        cs = (cs * 16807) % 2147483647;
        var nz = (cs / 2147483647) * 2 - 1;
        out[i] += T.click * (nz - prevN) * Math.exp(-i / (sr * T.clickTc)); prevN = nz;
      }
    }
    var rise = Math.floor(sr * 0.0015);                                 // the pick lets go over a millisecond or two:
    for (i = 0; i < rise; i++) out[i] *= i / rise;                      // starting at full tilt, every note clicked
    var fade = Math.floor(sr * 0.05);                                   // the rendering ends without a click
    for (i = 0; i < fade; i++) out[len - 1 - i] *= i / fade;
    return out;
  }

  /* The body ringing along: the dry note, plus the body's own resonances,
   * each set going by the pick and dying away (as guitar.js bodyResponse,
   * for a much smaller body: the air inside near 285 Hz, the top near 420,
   * and smaller rings up to 3 kHz). */
  function bodyResponse(ctx, modes) {
    var sr = ctx.sampleRate, len = Math.floor(sr * 0.25), buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
    d[0] = 1;
    for (var i = 1; i < len; i++) {
      var t = i / sr, v = 0;
      for (var k = 0; k < modes.length; k++) v += (2 * modes[k][2] / (modes[k][1] * sr)) * Math.exp(-t / modes[k][1]) * Math.sin(2 * Math.PI * modes[k][0] * t);
      d[i] += v;
    }
    return buf;
  }

  /* A small room's reflections (the dry sound goes round them): a burst of
   * noise dying away over `rt` seconds, its top soaked up by the walls. His
   * recording carries 10-15 dB more sound between a note's overtones, for
   * 150 ms and more after a pick, than a dry string does; this brings it to
   * within a few dB. */
  function roomResponse(ctx, room) {
    var sr = ctx.sampleRate, len = Math.floor(sr * room.rt * 1.2), buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
    var pre = Math.floor(sr * room.pre), a = Math.exp(-2 * Math.PI * room.lp / sr), s = 12345, lp = 0, e = 0, i;
    for (i = pre; i < len; i++) {
      s = (s * 16807) % 2147483647;
      lp = (1 - a) * ((s / 2147483647) * 2 - 1) + a * lp;
      d[i] = lp * Math.exp(-6.9 * (i - pre) / (sr * room.rt));
      e += d[i] * d[i];
    }
    for (i = 0; i < len; i++) d[i] *= room.wet / Math.sqrt(e || 1);
    return buf;
  }

  function Mandolin(ctx, dest) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = this.LEVEL;
    var T = this.TONE, node = this.out;
    var body = ctx.createConvolver(); body.normalize = false; body.buffer = bodyResponse(ctx, T.body);
    node.connect(body); node = body;
    // The body's tone: small and bright.
    function add(type, f, q, g) { var b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; if (g != null) b.gain.value = g; node.connect(b); node = b; }
    add('highpass', T.hp, 0.7);
    T.peaks.forEach(function (pk) { add('peaking', pk[0], pk[1], pk[2]); });
    add('lowpass', T.air, 0.5);
    var room = ctx.createConvolver(); room.normalize = false; room.buffer = roomResponse(ctx, T.room);
    node.connect(room); room.connect(dest);
    node.connect(dest);
    this.notes = {};          // midi -> [AudioBuffer]
    this.queued = [];
    this.ringing = [null, null, null, null];   // what each pair of strings is sounding, and until when
    this.sym = [null, null, null, null];       // each open pair's sympathetic ring
  }

  /* The whole mandolin's level, set so it sits with the flute (buddies.js MIX). */
  Mandolin.prototype.LEVEL = 1.1;
  /* The tone, chosen by the teacher's ear (1.28.0, "E").
   *   pick: pos (where it strikes, a fraction of the string from the
   *     bridge), width (how broad and soft), click and clickTc (its scratch,
   *     and how quickly it dies), sharp, sharpLow and sharpTc (cents sharp
   *     at the pick, more on the heavier strings, settling over seconds);
   *   string: cut (how long it keeps its top), sustain (seconds to die away,
   *     highSustain the share kept on the highest notes), cents and mix (the
   *     pair: how far apart, and the first string's share), lag and lagLow
   *     (ms between the pair's two strings, and how much longer on the G);
   *   body: hp, peaks [[Hz, Q, dB]], air (a lowpass), body [[Hz, seconds it
   *     rings, strength]], room { rt (seconds to die away), wet, lp (Hz the
   *     walls soak up above), pre (seconds before the first reflection) },
   *     sympathy (how loud an open pair hums along, at its strongest);
   *   touch: jitter (seconds), detune (cents), vary (share of strength), from
   *     pick to pick; openRing (how long an open string rings on before it
   *     fades), lift (a fretted note held after the next is picked), mute
   *     (seconds the pick stops the old note before the new one sounds). */
  Mandolin.prototype.TONE = {
    pos: 0.2, width: 0.03, click: 0.25, clickTc: 0.004, sharp: 7, sharpLow: 13, sharpTc: 0.1,
    cut: 12000, sustain: 6, highSustain: 0.9, cents: 1.5, mix: 0.4, lag: [8, 14], lagLow: 1.2,
    hp: 160, peaks: [[400, 0.9, 3], [1000, 1.4, -3]], air: 4500,
    body: [[285, 0.06, 1.125], [420, 0.05, 1.25], [600, 0.035, 1], [900, 0.025, 0.75], [1350, 0.02, 0.625], [2000, 0.012, 0.625], [3000, 0.008, 0.5]],
    room: { rt: 0.5, wet: 0.4, lp: 6000, pre: 0.008 }, sympathy: 0.06,
    jitter: 0.004, detune: 1.5, vary: 0.12, openRing: 0.35, lift: 0.025, mute: 0.006
  };
  Mandolin.prototype.TREMOLO = 0.075;   // seconds between strokes of a tremolo, about 13 a second

  /* Render the notes it will be asked for, ahead of time, and the open
   * strings, which hum along with them. */
  Mandolin.prototype.prepare = function (midis) {
    var ctx = this.ctx, self = this;
    midis.concat(OPEN).forEach(function (m) {
      if (self.notes[m] || !(m > 0)) return;
      var list = [];
      for (var v = 0; v < VARIANTS; v++) {
        // No two picks alike: where it strikes, how broad, how much scratch.
        var seed = 7 + m * 131 + v * 7919, r = [], z = seed;
        for (var j = 0; j < 3; j++) { z = (z * 16807) % 2147483647; r.push((z / 2147483647) * 2 - 1); }
        var T = Object.assign({}, self.TONE, { pos: self.TONE.pos * (1 + 0.12 * r[0]),
                                                width: self.TONE.width * (1 + 0.3 * r[1]),
                                                click: self.TONE.click * (1 + 0.4 * r[2]) });
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
  /* How readily an open pair hums along with a note, by the distance between
   * them in semitones: where their overtones line up (as guitar.js). */
  var COUPLING = { 0: 1, 12: 0.8, 24: 0.6, 7: 0.5, 19: 0.5, 5: 0.3, 17: 0.3 };

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
    var nodes = [], prev = null, heavy = Math.max(0, Math.min(1, (76 - midi) / 21));
    picks.forEach(function (off, i) {
      var at = Math.max(ctx.currentTime, t + off + wobble(T.jitter)), src = ctx.createBufferSource(), g = ctx.createGain();
      src.buffer = list[Math.floor(Math.random() * list.length)];
      var tune = Math.pow(2, wobble(T.detune) / 1200);
      // Plucked, a string starts sharp and settles (a piano's does not).
      src.playbackRate.setValueAtTime(tune * Math.pow(2, (T.sharp + T.sharpLow * heavy) * (1 + wobble(0.4)) / 1200), at);
      src.playbackRate.setTargetAtTime(tune, at, T.sharpTc);
      // Down-strokes a little heavier than up-strokes; a tremolo's alternate.
      var up = (art.up ? 1 : 0) + i, k = up % 2 ? 0.82 : 1;
      if (art.tremolo) k *= i ? 0.72 : 1;
      k *= 1 + wobble(T.vary);
      g.gain.setValueAtTime(Math.max(0.0001, vel * k), at);
      src.connect(g); g.connect(self.out);
      src.onended = function () { g.disconnect(); };   // rung out: let it go
      src.start(at);
      // Whatever this string was sounding stops as the pick meets it, just
      // before the pick lets go.
      var was = i ? prev : self.ringing[S];
      if (was) {
        was.g.gain.setTargetAtTime(0, Math.max(ctx.currentTime, at - T.mute), 0.002);
        try { was.src.stop(at + 0.05); } catch (e) {}
      }
      prev = { g: g, src: src };
      nodes.push(g);
    });
    this.ringing[S] = prev;
    prev.until = end + (open ? T.openRing + 0.6 : T.lift);
    if (open) {                    // an open string rings on, fading, until picked again
      prev.g.gain.setTargetAtTime(0, end + T.openRing, 0.2);
      try { prev.src.stop(end + T.openRing + 1.2); } catch (e) {}
    } else {                       // the finger lifts just after the next note sounds
      prev.g.gain.setTargetAtTime(0, end + T.lift, 0.025);
      try { prev.src.stop(end + T.lift + 0.2); } catch (e) {}
    }
    this._sympathize(t, midi, vel, S, nodes);
    this.queued = this.queued.filter(function (q) { return q.t > ctx.currentTime - 1; });
    this.queued.push({ t: t, nodes: nodes });
  };

  /* The open pairs hum along: picked, a note sets ringing any open pair it
   * agrees with (the same note, an octave, a fifth), mostly in its low
   * overtones, building up rather than struck. A pair picked stops its hum;
   * a pair sounding a note of its own does not hum. */
  Mandolin.prototype._sympathize = function (t, midi, vel, S, nodes) {
    var ctx = this.ctx, T = this.TONE, self = this;
    var mine = this.sym[S];
    if (mine) {
      mine.g.gain.setTargetAtTime(0, Math.max(ctx.currentTime, t - T.mute), 0.004);
      try { mine.src.stop(t + 0.1); } catch (e) {}
      this.sym[S] = null;
    }
    for (var s = 0; s < 4; s++) {
      if (s === S) continue;
      var r = this.ringing[s];
      if (r && r.until > t) continue;
      var c = COUPLING[Math.abs(midi - OPEN[s])] || 0;
      if (c < 0.3) continue;
      if (this.sym[s]) { this.sym[s].g.gain.setTargetAtTime(0, t, 0.35); try { this.sym[s].src.stop(t + 2.5); } catch (e) {} }
      var src = ctx.createBufferSource(), pure = ctx.createBiquadFilter(), g = ctx.createGain();
      src.buffer = this.notes[OPEN[s]][0];
      pure.type = 'lowpass'; pure.frequency.value = 1100; pure.Q.value = 0.5;
      g.gain.setValueAtTime(0, t);
      g.gain.setTargetAtTime(T.sympathy * c * vel, t + 0.01, 0.12);
      src.connect(pure); pure.connect(g); g.connect(self.out);
      src.onended = (function (g) { return function () { g.disconnect(); }; })(g);
      src.start(t);
      this.sym[s] = { g: g, src: src };
      nodes.push(g);
    }
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
