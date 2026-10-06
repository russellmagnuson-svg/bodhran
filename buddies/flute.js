/* flute.js — a wooden flute for the melody, the same shape as the
 * concertina (concertina.js): new Flute(ctx, dest),
 * .note(t, dur, midi, vel, vib, art), .cancelFrom(t).
 *
 * Until Session Buddies 1.17.0 it was the guitar demo's simple flute: nearly
 * a pure tone (the second and third harmonics faint), the same on every
 * note, every note tongued and let go before the next began. It sounded
 * "a bit like it's coming from a keyboard". An Irish (simple-system,
 * wooden) flute is other things too:
 *   - its tone changes with the register: the low octave pushed, with a
 *     reedy edge (the second harmonic only a few dB under the note), the
 *     second octave, overblown, nearly pure (wave());
 *   - the breath is part of the sound, not only a puff at the start: a
 *     breathy fluff around the note itself and a little hiss, more in the
 *     low octave;
 *   - a tongued note starts from below and flat, the fundamental first and
 *     the overtones blooming in over a few hundredths of a second;
 *   - most notes are not tongued at all but slurred, the fingers changing
 *     the note under a steady breath, so one note runs into the next
 *     (art.slur, art.into; the page decides which);
 *   - and the breath is never quite steady: the level wanders a little,
 *     and a long note swells and eases.
 * The pitch stays put (a light vibrato late in long notes, as before),
 * so it sits in tune with the concertina, and each note is heard on its
 * time, tongued or slurred.
 */
(function (P) {
  'use strict';

  function hz(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

  /* The tone, harmonic by harmonic against the fundamental, at low D (D4)
   * and two octaves up (D6), blended between. */
  var LOW = [1, 0.45, 0.22, 0.1, 0.045, 0.02], HIGH = [1, 0.2, 0.06, 0.02, 0, 0];
  var waves = new WeakMap();
  function wave(ctx, midi) {
    var byCtx = waves.get(ctx);
    if (!byCtx) waves.set(ctx, (byCtx = {}));
    var m = Math.max(62, Math.min(86, Math.round(midi)));
    if (byCtx[m]) return byCtx[m];
    var x = (m - 62) / 24, n = LOW.length, re = new Float32Array(n + 1), im = new Float32Array(n + 1);
    for (var k = 1; k <= n; k++) im[k] = LOW[k - 1] * (1 - x) + HIGH[k - 1] * x;
    return (byCtx[m] = ctx.createPeriodicWave(re, im, { disableNormalization: true }));
  }

  function Flute(ctx, dest) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = this.LEVEL;
    var soft = ctx.createBiquadFilter(); soft.type = 'lowpass'; soft.frequency.value = 5200;
    this.out.connect(soft); soft.connect(dest);
    this.queued = [];
    var buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.air = buf;
    // The breath's wander: four seconds of noise smoothed to a slow random
    // line (a few times a second), scaled to run between -1 and 1.
    var dl = ctx.sampleRate * 4, db = ctx.createBuffer(1, dl, ctx.sampleRate), w = db.getChannelData(0);
    var k = Math.exp(-2 * Math.PI * 3 / ctx.sampleRate), y = 0, z = 0, peak = 0;
    for (i = 0; i < dl; i++) { y = k * y + (1 - k) * (Math.random() * 2 - 1); z = k * z + (1 - k) * y; w[i] = z; }
    for (i = 0; i < dl; i++) peak = Math.max(peak, Math.abs(w[i]));
    for (i = 0; i < dl; i++) w[i] /= peak;
    this.drift = db;
  }

  /* The whole flute's level: the richer tone and the breath carry more than
   * the old near-pure tone at the same setting, so it is trimmed to keep its
   * place in the mix: on the Kesh's A part, as the page plays it, 2.2 dB
   * louder untrimmed (K-weighted). */
  Flute.prototype.LEVEL = 0.78;

  /* Heard on time: the flute's notes swell in over 30 ms, so each was heard
   * (within 6 dB of its full level) 27 ms after the time it was asked for,
   * behind the guitar and drum and, from Session Players 1.7.0, behind the
   * recorded concertina on every note: a flam that made the two together
   * sound jittery. So the swell starts LEAD seconds early, and the note is
   * heard on its time. A slurred note comes in faster, under the breath
   * already flowing, so it starts LEAD_SLUR early. */
  Flute.prototype.LEAD = 0.022;
  Flute.prototype.LEAD_SLUR = 0.006;
  Flute.prototype.SLUR_IN = 0.012;     // a slurred note's swell, seconds
  Flute.prototype.SLUR_OUT = 0.02;     // the note before it letting go, ending OVERLAP after it starts
  Flute.prototype.OVERLAP = 0.012;

  /* A tongued note's swell and its release, seconds, at an easy pace; and
   * the pace. setPace(quaver): seconds to a quaver of the tune. Faster than
   * EASY (a reel of about 195, a jig of 130), the tongue's swell, release
   * and lead shrink in step with the notes. Until Session Buddies 1.23.5
   * they stayed 30 ms at any tempo: at a reel of 240 the flute spent 18% of
   * its time in the gaps between tongued notes, against 12% at 120, and
   * sounded clipped. Slower than EASY nothing changes. (The page also
   * shortens the gap before a tongued note at speed, and above a reel of
   * about 205 tongues only beats 1 and 3: buddies.js, fluteLength and
   * articulate.) */
  Flute.prototype.TONGUE = 0.03;
  Flute.prototype.EASY = 0.154;
  Flute.prototype.setPace = function (quaver) { this.pace = quaver > 0 ? quaver : 0; };

  /* Vibrato: until Session Players 1.7.3 every note over 0.4 s wavered
   * ±9 cents at 5.2 Hz, in full within 0.35 s. Against the recorded
   * concertina, which holds its pitch to a cent or two, the same note
   * a cent or more apart beats, and the pair sounded warbly. An Irish flute
   * player uses little vibrato anyway: a slight one, late in a long note.
   * So now only notes of at least minDur, from `after` seconds in, swelling
   * over `swell` to ±cents; and note()'s `vib` scales it (0 for none: the
   * flute playing with the concertina has none). */
  Flute.prototype.VIBRATO = { cents: 4, rate: 5, minDur: 0.6, after: 0.25, swell: 0.3 };

  /* One note. t: when it is heard; dur: how long it is held, from t; vel
   * 0-1; vib: the vibrato's share (1, or 0 for none); art: { slur: it is
   * slurred into from the note before (no tongue), into: the note after
   * is slurred from it (dur then runs OVERLAP past that note's start) }. */
  Flute.prototype.note = function (t, dur, midi, vel, vib, art) {
    art = art || {};
    var ctx = this.ctx, f = hz(midi), end = t + dur, slur = !!art.slur, into = !!art.into;
    var V = this.VIBRATO, cents = V.cents * (vib == null ? 1 : vib);
    var x = Math.max(0, Math.min(1, (midi - 62) / 24));          // 0 at low D, 1 two octaves up
    // At speed the tongue is lighter: its swell, release and lead in step
    // with the notes (setPace); at an easy pace as they always were.
    var k = this.pace ? Math.min(1, this.pace / this.EASY) : 1, tongue = this.TONGUE * k;
    t = Math.max(ctx.currentTime, t - (slur ? this.LEAD_SLUR : this.LEAD * k));
    var rel = into ? this.SLUR_OUT : tongue;                     // a tongue stops the air quickly

    // The breath behind the note: its level, wandering a little (±0.5 dB),
    // and on a long note easing in and out.
    var amp = ctx.createGain(), wander = ctx.createGain(), drift = ctx.createBufferSource(), wd = ctx.createGain();
    if (slur) {
      amp.gain.setValueAtTime(0, t);
      amp.gain.linearRampToValueAtTime(vel, t + this.SLUR_IN);
    } else {
      amp.gain.setValueAtTime(0.0001, t);
      amp.gain.exponentialRampToValueAtTime(vel, t + tongue);
    }
    var held = Math.max(t + tongue + 0.001, end - rel);
    if (end - t > 0.45) {                                          // a long note swells and eases
      amp.gain.linearRampToValueAtTime(vel * 1.05, t + (held - t) * 0.45);
      amp.gain.linearRampToValueAtTime(vel * 0.94, held);
    } else amp.gain.setValueAtTime(vel, held);
    if (into) amp.gain.linearRampToValueAtTime(0, end);            // under the next note's swell
    else amp.gain.exponentialRampToValueAtTime(0.0001, end);
    wander.gain.value = 1;
    drift.buffer = this.drift; drift.loop = true;
    wd.gain.value = 0.06;
    drift.connect(wd); wd.connect(wander.gain);
    drift.start(t, Math.random() * this.drift.duration); drift.stop(end + 0.02);
    amp.connect(wander); wander.connect(this.out);

    // The tone: tongued, it starts a shade flat and from below, the
    // fundamental first, the overtones blooming in; slurred, it is simply there.
    var o = ctx.createOscillator(), bloom = ctx.createBiquadFilter();
    o.setPeriodicWave(wave(ctx, midi));
    var open = Math.min(16000, f * (4 + 4 * vel));
    bloom.type = 'lowpass'; bloom.Q.value = 0.5;
    if (slur) {
      o.frequency.setValueAtTime(f, t);
      bloom.frequency.setValueAtTime(open, t);
    } else {
      o.frequency.setValueAtTime(f * Math.pow(2, -18 / 1200), t);
      o.frequency.setTargetAtTime(f, t, 0.01);
      bloom.frequency.setValueAtTime(f * 1.3, t);
      bloom.frequency.exponentialRampToValueAtTime(open, t + 0.05);
    }
    if (cents > 0 && dur >= V.minDur) {  // a touch of vibrato, late in long notes
      var lfo = ctx.createOscillator(), depth = ctx.createGain();
      lfo.frequency.value = V.rate;
      depth.gain.setValueAtTime(0, t);
      depth.gain.setValueAtTime(0, t + V.after);
      depth.gain.linearRampToValueAtTime(cents, t + V.after + V.swell);
      lfo.connect(depth); depth.connect(o.detune);
      lfo.start(t); lfo.stop(end + 0.02);
    }
    o.connect(bloom); bloom.connect(amp);
    o.start(t); o.stop(end + 0.02);

    // The breath itself: a fluff of air around the note, and a little hiss
    // above it, more of both in the low octave; under the note's own level.
    var b = ctx.createBufferSource(), fluff = ctx.createBiquadFilter(), hiss = ctx.createBiquadFilter();
    var fg = ctx.createGain(), hg = ctx.createGain();
    b.buffer = this.air; b.loop = true;
    fluff.type = 'bandpass'; fluff.frequency.value = f; fluff.Q.value = 4;
    hiss.type = 'bandpass'; hiss.frequency.value = Math.min(6000, Math.max(2500, f * 4)); hiss.Q.value = 0.8;
    fg.gain.value = this.BREATH.fluff * (1 - 0.5 * x);
    hg.gain.value = this.BREATH.hiss * (1 - 0.4 * x);
    b.connect(fluff); fluff.connect(fg); fg.connect(amp);
    b.connect(hiss); hiss.connect(hg); hg.connect(amp);
    b.start(t, Math.random() * 0.5); b.stop(end + 0.02);

    // A tongued note's chiff: the puff of air as the tongue lets it go.
    var nodes = [wander];
    if (!slur) {
      var c = ctx.createBufferSource(), cp = ctx.createBiquadFilter(), cg = ctx.createGain();
      c.buffer = this.air; cp.type = 'bandpass'; cp.frequency.value = f * 4; cp.Q.value = 1.2;
      cg.gain.setValueAtTime(0.0001, t);
      cg.gain.exponentialRampToValueAtTime(vel * 0.1, t + 0.012);
      cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      c.connect(cp); cp.connect(cg); cg.connect(this.out);
      c.start(t, Math.random() * 0.5, 0.1);
      nodes.push(cg);
    }
    // Rung out, the note is unplugged so the browser can let it go (since
    // Session Buddies 1.22.0; see js/bodhran.js, Bodhran.prototype._release).
    o.onended = function () { nodes.forEach(function (x) { x.disconnect(); }); };
    this.queued = this.queued.filter(function (q) { return q.t > ctx.currentTime - 1; });
    this.queued.push({ t: t, nodes: nodes });
  };

  /* The breath's two parts, against the note's level (in the low octave;
   * less going up). */
  Flute.prototype.BREATH = { fluff: 0.5, hiss: 0.15 };

  /* Stop: drop every note handed over but not yet begun. */
  Flute.prototype.cancelFrom = function (t) {
    this.queued = this.queued.filter(function (q) {
      if (q.t < t) return true;
      q.nodes.forEach(function (x) { x.disconnect(); });
      return false;
    });
  };

  P.Flute = Flute;
})(window.BUDDIES = window.BUDDIES || {});
