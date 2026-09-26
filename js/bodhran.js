/* bodhran.js — a synthesised bodhrán voice.
 *
 * No samples: every hit is built from oscillators and filtered noise, so the
 * app has no audio assets to ship and the drum can be re-tuned at runtime.
 *
 * A real bodhrán hit is three things layered:
 *   1. a pitched membrane thump that drops in pitch as the skin relaxes
 *   2. an inharmonic second mode, shorter and higher
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
  }

  Bodhran.prototype.setLevel = function (v) {
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  };

  Bodhran.prototype.setRoom = function (v) {
    this.roomSend.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  };

  Bodhran.prototype._noiseBurst = function (time, dur, freq, q, peak, highpass) {
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
    if (highpass) {
      var hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = highpass;
      band.connect(hp);
      hp.connect(g);
    } else {
      band.connect(g);
    }
    g.connect(this.master);

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
   * the stick. Changes of pitch come from the back hand, not the stroke. */
  var DOWN = {
    pitch: 1.00,             // multiple of the skin's tuning
    glide: 1.9, glideTime: 0.055,   // pitch bend as the struck skin relaxes
    body: 0.9,               // fundamental
    mode2: 0.34, mode2Decay: 0.11,  // inharmonic second mode
    len: 0.30, lenVel: 0.16, // ring length, and how much velocity adds
    stickHz: 1500, stickQ: 1.0, stick: 0.30, stickLen: 0.014,
    lpBase: 900
  };
  var UP = {
    pitch: 1.02,
    glide: 1.35, glideTime: 0.035,
    body: 0.55,
    mode2: 0.42, mode2Decay: 0.07,
    len: 0.14, lenVel: 0.10,
    stickHz: 2000, stickQ: 1.1, stick: 0.45, stickLen: 0.012,
    lpBase: 1300
  };
  /* A ghost is the tipper barely touching the same skin: felt more than
   * heard. It used to be a burst of high hiss with no skin in it at all. Now
   * it is a faint thump with almost no pitch bend and a soft tick, at the
   * same overall loudness the old ghost had. */
  var GHOST = {
    pitch: 1.00,
    glide: 1.15, glideTime: 0.02,
    body: 0.45,
    mode2: 0.20, mode2Decay: 0.04,
    len: 0.07, lenVel: 0.04,
    stickHz: 2200, stickQ: 1.2, stick: 0.50, stickLen: 0.008,
    lpBase: 1300,
    level: 0.78              // puts it where the old ghost sat, ~22dB under a dum
  };

  Bodhran.prototype._skin = function (time, vel, s) {
    var ctx = this.ctx;
    var f0 = this.tuning * s.pitch * (0.985 + Math.random() * 0.03);
    var dur = s.len + s.lenVel * vel;

    var amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, time);
    amp.gain.exponentialRampToValueAtTime(vel * (s.level || 1), time + 0.003);
    amp.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = s.lpBase + this.tone * 2600;
    lp.Q.value = 0.7;

    amp.connect(lp);
    lp.connect(this.master);

    // Fundamental, swooping down as the skin settles.
    var o1 = ctx.createOscillator();
    o1.type = 'sine';
    o1.frequency.setValueAtTime(f0 * s.glide, time);
    o1.frequency.exponentialRampToValueAtTime(f0, time + s.glideTime);
    var g1 = ctx.createGain();
    g1.gain.value = s.body;
    o1.connect(g1); g1.connect(amp);
    o1.start(time); o1.stop(time + dur + 0.02);

    // Inharmonic second mode — dies away much faster.
    var o2 = ctx.createOscillator();
    o2.type = 'triangle';
    o2.frequency.setValueAtTime(f0 * 2.9, time);
    o2.frequency.exponentialRampToValueAtTime(f0 * 1.55, time + 0.05);
    var g2 = ctx.createGain();
    g2.gain.setValueAtTime(s.mode2, time);
    g2.gain.exponentialRampToValueAtTime(0.001, time + s.mode2Decay);
    o2.connect(g2); g2.connect(amp);
    o2.start(time); o2.stop(time + s.mode2Decay + 0.04);

    // The stick meeting the skin.
    this._noiseBurst(time, s.stickLen, s.stickHz, s.stickQ,
                     vel * (s.level || 1) * s.stick);
  };

  /* The "dum" — down stroke, on the beat. */
  Bodhran.prototype._bass = function (time, vel) { this._skin(time, vel, DOWN); };

  /* The "tak" — up stroke, between the beats. Same skin, lighter stroke.
   * (The voice is still called 'treble' internally: it is the name the MIDI
   * note settings and saved preferences are keyed on.) */
  Bodhran.prototype._treble = function (time, vel) { this._skin(time, vel, UP); };

  /* Ghost note — the tipper barely touching the skin between strokes, the
   * thing that keeps the rhythm breathing. Same skin as the other two. */
  Bodhran.prototype._ghost = function (time, vel) { this._skin(time, vel, GHOST); };

  /* Count-in click — deliberately not a bodhrán, so it stands apart. */
  Bodhran.prototype.click = function (time, vel) {
    var ctx = this.ctx;
    var amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, time);
    amp.gain.exponentialRampToValueAtTime(vel * 0.4, time + 0.001);
    amp.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    amp.connect(this.master);
    var o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = vel > 0.7 ? 1600 : 1050;
    o.connect(amp);
    o.start(time); o.stop(time + 0.06);
  };

  Bodhran.prototype.hit = function (voice, time, vel) {
    if (vel <= 0) return;
    if (voice === 'bass') this._bass(time, vel);
    else if (voice === 'treble') this._treble(time, vel);
    else if (voice === 'ghost') this._ghost(time, vel);
    else if (voice === 'click') this.click(time, vel);
  };

  TRAD.Bodhran = Bodhran;
})(window.TRAD = window.TRAD || {});
