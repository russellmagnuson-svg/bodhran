/* bodhran.js — a synthesised bodhrán voice.
 *
 * No samples: every hit is built from oscillators and filtered noise, so the
 * app has no audio assets to ship and the drum can be re-tuned at runtime.
 *
 * A real bodhrán hit is three things layered:
 *   1. the skin ringing: its fundamental and the higher, inharmonic modes
 *      of a round drumhead, each dying away at its own rate, the higher
 *      ones sooner, all settling a few percent in pitch as the struck skin
 *      relaxes
 *   2. the goatskin's own slap, a short burst in its middle register
 *   3. a noise transient — the tipper itself striking goatskin
 * Down strokes, up strokes and ghost notes all use the same model with
 * different stroke settings, because they are all the same skin.
 */
(function (TRAD) {
  'use strict';

  function makeNoiseBuffer(ctx) {
    var len = Math.floor(ctx.sampleRate * 2);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  /* A cheap synthetic room: exponentially decaying noise as an impulse response. */
  function makeRoomImpulse(ctx, seconds, decay) {
    var len = Math.floor(ctx.sampleRate * seconds);
    var buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (var ch = 0; ch < 2; ch++) {
      var data = buf.getChannelData(ch);
      for (var i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  function Bodhran(ctx, destination) {
    this.ctx = ctx;
    this.noise = makeNoiseBuffer(ctx);

    this.tuning = 78;   // Hz, fundamental of the skin
    this.tone = 0.5;    // 0 = dull/damped, 1 = bright and open

    var master = ctx.createGain();
    master.gain.value = 0.9;

    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 24;
    comp.ratio.value = 3;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;

    var dry = ctx.createGain();
    var wet = ctx.createGain();
    wet.gain.value = 0.16;

    var room = ctx.createConvolver();
    room.buffer = makeRoomImpulse(ctx, 1.1, 2.6);

    master.connect(comp);
    comp.connect(dry);
    comp.connect(room);
    room.connect(wet);
    dry.connect(destination);
    wet.connect(destination);

    this.master = master;
    this.roomSend = wet;
    this._pending = [];   // strokes scheduled but not yet sounded: {time, out}
  }

  /* Every stroke gets its own little output, so one that is scheduled but has
   * not sounded yet can be dropped. The transport schedules about a tenth of a
   * second ahead, so without this a stroke could still be heard after Stop. */
  Bodhran.prototype._strokeOut = function (time) {
    var out = this.ctx.createGain();
    out.connect(this.master);
    var now = this.ctx.currentTime;
    this._pending = this._pending.filter(function (p) { return p.time > now; });
    this._pending.push({ time: time, out: out });
    return out;
  };

  /* Drop every stroke due at or after `time`. Strokes already sounding ring
   * on, and so does the room. */
  Bodhran.prototype.cancelFrom = function (time) {
    this._pending = this._pending.filter(function (p) {
      if (p.time < time) return true;
      p.out.disconnect();
      return false;
    });
  };

  Bodhran.prototype.setLevel = function (v) {
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  };

  Bodhran.prototype.setRoom = function (v) {
    this.roomSend.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  };

  Bodhran.prototype._noiseBurst = function (time, dur, freq, q, peak, dest) {
    var ctx = this.ctx;
    var src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;

    var band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = freq;
    band.Q.value = q;

    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), time + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    src.connect(band);
    band.connect(g);
    g.connect(dest);

    // Offset into the noise buffer so repeated hits never sound identical.
    src.start(time, Math.random() * 1.5, dur + 0.05);
    src.stop(time + dur + 0.05);
  };

  /* Both strokes land on the same goatskin, so they share one model and only
   * the stroke differs. The up stroke used to be a separate, brighter drum
   * pitched 1.66 octaves above the down stroke, which made the pair sound like
   * a kick and a snare. On a real bodhrán the up stroke is the same skin hit
   * more lightly and at a glance: less fundamental, less of the pitch bend a
   * hard strike gives the skin, a shorter ring, and relatively more click from
   * the stick. Changes of pitch come from the back hand, not the stroke.
   *
   * Until 1.10.0 each dum swooped down almost an octave in its first 55 ms
   * (from 148 Hz to 78), a pure tone with a triangle wave swooping under it:
   * the recipe of an electronic kick drum, nearly all of it under 120 Hz, so
   * a phone's speaker heard little but the click. A struck goatskin settles
   * a few percent at most, and its sound is in its modes and its slap as
   * much as its fundamental. */
  // The skin's modes, as multiples of its fundamental: those of a round
  // drumhead (open at the back, the bodhrán's air hardly moves them).
  var MODES = [1, 1.59, 2.14, 2.30, 2.65, 2.92];
  // Which way each starts, as the skin moves under the tipper. All starting
  // together and at once, they piled up into a peak 4 dB over the old
  // drum's, at no gain in loudness, and at full volume pushed the output
  // limiter into clipping. The higher ones swell in over a few milliseconds
  // (the fundamental, the slap and the stick still strike at once), and of
  // the ways they can start, this one, with that swell, peaks least.
  var SIGNS = [1, 1, 1, -1, -1, 1];
  var DOWN = {
    pitch: 1.00,             // multiple of the skin's tuning
    bend: 0.045, bendTime: 0.03,     // settling: 4.5% sharp at the strike, at full force
    body: 0.9,               // fundamental
    swell: 0.008,            // the higher modes coming in
    modes: [1, 0.8, 0.65, 0.55, 0.4, 0.3],   // each mode's share of it...
    rings: [1, 0.5, 0.4, 0.35, 0.3, 0.25],   // ...and how long it rings, against it
    len: 0.30, lenVel: 0.16, // ring length, and how much velocity adds
    slapAt: 5, slapQ: 0.7, slap: 2, slapLen: 0.25,   // the skin's slap, at a multiple of the tuning (dies 80 dB in slapLen)
    stickHz: 1500, stickQ: 1.0, stick: 0.30, stickLen: 0.014,
    lpBase: 900
  };
  var UP = {
    pitch: 1.02,
    bend: 0.03, bendTime: 0.02,
    body: 0.55,
    swell: 0.006,
    modes: [1, 0.6, 0.45, 0.32, 0.22],
    rings: [1, 0.5, 0.36, 0.3, 0.24],
    len: 0.14, lenVel: 0.10,
    slapAt: 6, slapQ: 0.7, slap: 1.6, slapLen: 0.12,
    stickHz: 2000, stickQ: 1.1, stick: 0.45, stickLen: 0.012,
    lpBase: 1300,
    level: 0.9               // keeps it where the old tak sat, ~11dB under a dum
  };
  /* A ghost is the tipper barely touching the same skin: felt more than
   * heard. It used to be a burst of high hiss with no skin in it at all. Now
   * it is a faint thump with almost no pitch bend and a soft tick, at the
   * same overall loudness the old ghost had. */
  var GHOST = {
    pitch: 1.00,
    bend: 0.01, bendTime: 0.015,
    body: 0.45,
    swell: 0.004,
    modes: [1, 0.5, 0.35],
    rings: [1, 0.55, 0.4],
    len: 0.07, lenVel: 0.04,
    slapAt: 6, slapQ: 0.7, slap: 0.8, slapLen: 0.06,
    stickHz: 2200, stickQ: 1.2, stick: 0.50, stickLen: 0.008,
    lpBase: 1300,
    level: 0.78              // puts it where the old ghost sat, ~22dB under a dum
  };

  /* The back hand pressing on the skin from inside: at full pressure the
   * pitch rises about a fourth, and the skin, held, rings shorter and with
   * less boom. Every stroke feels it, because it is one skin under one hand. */
  var PRESS_SEMITONES = 5;

  /* Every stroke's level. The skin's modes and slap carry more of a stroke
   * in its first moments than the old swooping tone did, so at the same
   * loudness its peaks stand higher. Trimmed to 0.8 it measures as loud as
   * the old drum (K-weighted, a reel at 112), its peaks about 1 dB higher, so
   * the output limiter, which the drone shares in the app, is pushed little
   * harder than before; on a phone's speaker, which passes little under
   * 300 Hz, it is about 4 dB louder. */
  Bodhran.prototype.skinLevel = 0.8;

  Bodhran.prototype._skin = function (time, vel, s, press) {
    var ctx = this.ctx;
    var p = press > 0 ? Math.min(1, press) : 0;
    var f0 = this.tuning * s.pitch * (0.985 + Math.random() * 0.03) *
             Math.pow(2, p * PRESS_SEMITONES / 12);
    var dur = (s.len + s.lenVel * vel) * (1 - 0.45 * p);
    var out = this._strokeOut(time);
    out.gain.value = this.skinLevel;

    var amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, time);
    amp.gain.exponentialRampToValueAtTime(vel * (s.level || 1), time + 0.003);
    amp.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = s.lpBase + this.tone * 2600;
    lp.Q.value = 0.7;

    amp.connect(lp);
    lp.connect(out);

    // The skin's modes: the fundamental (less boom under the hand), then the
    // higher ones, each a little different from stroke to stroke as the
    // tipper never lands in quite the same place, and dying away sooner.
    // All of them settle together, a few percent, as the struck skin relaxes.
    // (Each mode dies away inside the stroke's own fade, so a mode meant to
    // ring for a share r of it fades on its own over dur·r/(1−r).)
    var sharp = 1 + s.bend * Math.min(1, vel);
    for (var k = 0; k < s.modes.length; k++) {
      var fk = f0 * MODES[k], r = s.rings[k];
      var share = s.body * s.modes[k] * (k ? 0.8 + Math.random() * 0.4 : 1 - 0.2 * p) * SIGNS[k];
      var o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(fk * sharp, time);
      o.frequency.setTargetAtTime(fk, time, s.bendTime);
      var g = ctx.createGain();
      if (k) {
        g.gain.setValueAtTime(0, time);
        g.gain.linearRampToValueAtTime(share, time + s.swell);
      } else g.gain.setValueAtTime(share, time);
      if (r < 1) g.gain.exponentialRampToValueAtTime(share * 0.0001, time + dur * r / (1 - r));
      o.connect(g); g.connect(amp);
      o.start(time); o.stop(time + dur + 0.02);
    }

    // The goatskin's slap: the dense higher modes, too close together to
    // hear one by one, through the same tone as the skin so it is no hiss.
    // Then the stick meeting it.
    this._noiseBurst(time, s.slapLen, f0 * s.slapAt, s.slapQ,
                     vel * (s.level || 1) * s.slap, lp);
    this._noiseBurst(time, s.stickLen, s.stickHz, s.stickQ,
                     vel * (s.level || 1) * s.stick, out);
  };

  /* The "dum" — down stroke, on the beat. */
  Bodhran.prototype._bass = function (time, vel, press) { this._skin(time, vel, DOWN, press); };

  /* The "tak" — up stroke, between the beats. Same skin, lighter stroke.
   * (The voice is still called 'treble' internally: it is the name the MIDI
   * note settings and saved preferences are keyed on.) */
  Bodhran.prototype._treble = function (time, vel, press) { this._skin(time, vel, UP, press); };

  /* Ghost note — the tipper barely touching the skin between strokes, the
   * thing that keeps the rhythm breathing. Same skin as the other two. */
  Bodhran.prototype._ghost = function (time, vel, press) { this._skin(time, vel, GHOST, press); };

  /* Count-in click — deliberately not a bodhrán, so it stands apart. */
  Bodhran.prototype.click = function (time, vel) {
    var ctx = this.ctx;
    var amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, time);
    amp.gain.exponentialRampToValueAtTime(vel * 0.4, time + 0.001);
    amp.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    amp.connect(this._strokeOut(time));
    var o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = vel > 0.7 ? 1600 : 1050;
    o.connect(amp);
    o.start(time); o.stop(time + 0.06);
  };

  /* press: how hard the back hand is pressing, 0 (open skin) to 1. */
  Bodhran.prototype.hit = function (voice, time, vel, press) {
    if (vel <= 0) return;
    if (voice === 'bass') this._bass(time, vel, press);
    else if (voice === 'treble') this._treble(time, vel, press);
    else if (voice === 'ghost') this._ghost(time, vel, press);
    else if (voice === 'click') this.click(time, vel);
  };

  /* The master output everything feeds: drum, room and drone. It ends in a
   * limiter on the sum, because the drum's own compressor sits before the room
   * send and cannot see the total — without it, volume at maximum clipped.
   * Shared by the app and by tests/, so the tests check the real chain. */
  TRAD.makeOutput = function (ctx) {
    var out = ctx.createGain();
    out.gain.value = 1;
    var limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.1;
    out.connect(limiter);
    // The limiter follows a smoothed level, so single samples run about
    // 0.8 dB over where it aims; at full volume and room the old drum came
    // within 0.2 dB of clipping, and the 1.10.0 drum, a touch more lively at
    // the strike, went over. A fixed trim after it keeps that clear of full
    // scale. Everything is 0.6 dB quieter, and the balance is unchanged.
    var trim = ctx.createGain();
    trim.gain.value = 0.93;
    limiter.connect(trim);
    // The speaker: in Safari on a Mac, by way of an audio element (js/wake.js).
    trim.connect(TRAD.speaker ? TRAD.speaker(ctx) : ctx.destination);
    out.last = trim;        // what the speaker gets, for TRAD.soundCheck
    return out;
  };

  // The three strokes' settings, for the checks (and for tuning by ear).
  Bodhran.STROKES = { bass: DOWN, treble: UP, ghost: GHOST };
  TRAD.Bodhran = Bodhran;
})(window.TRAD = window.TRAD || {});
