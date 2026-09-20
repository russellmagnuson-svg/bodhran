/* bodhran.js — a synthesised bodhrán voice.
 *
 * No samples: every hit is built from oscillators and filtered noise, so the
 * app has no audio assets to ship and the drum can be re-tuned at runtime.
 *
 * A real bodhrán hit is three things layered:
 *   1. a pitched membrane thump that drops in pitch as the skin relaxes
 *   2. an inharmonic second mode, shorter and higher
 *   3. a noise transient — the tipper itself striking goatskin
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

  /* The low "dum" — tipper butt into the centre of the skin. */
  Bodhran.prototype._bass = function (time, vel) {
    var ctx = this.ctx;
    var f0 = this.tuning * (0.985 + Math.random() * 0.03);
    var dur = 0.30 + 0.16 * vel;

    var amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, time);
    amp.gain.exponentialRampToValueAtTime(vel, time + 0.003);
    amp.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900 + this.tone * 2600;
    lp.Q.value = 0.7;

    amp.connect(lp);
    lp.connect(this.master);

    // Fundamental, swooping down as the skin settles.
    var o1 = ctx.createOscillator();
    o1.type = 'sine';
    o1.frequency.setValueAtTime(f0 * 1.9, time);
    o1.frequency.exponentialRampToValueAtTime(f0, time + 0.055);
    var g1 = ctx.createGain();
    g1.gain.value = 0.9;
    o1.connect(g1); g1.connect(amp);
    o1.start(time); o1.stop(time + dur + 0.02);

    // Inharmonic second mode — dies away much faster.
    var o2 = ctx.createOscillator();
    o2.type = 'triangle';
    o2.frequency.setValueAtTime(f0 * 2.9, time);
    o2.frequency.exponentialRampToValueAtTime(f0 * 1.55, time + 0.05);
    var g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.34, time);
    g2.gain.exponentialRampToValueAtTime(0.001, time + 0.11);
    o2.connect(g2); g2.connect(amp);
    o2.start(time); o2.stop(time + 0.15);

    this._noiseBurst(time, 0.014, 1500, 1.0, vel * 0.30);
  };

  /* The "tak" — tip of the tipper up near the rim. */
  Bodhran.prototype._treble = function (time, vel) {
    var ctx = this.ctx;
    var f0 = this.tuning * (3.2 + Math.random() * 0.45);
    var dur = 0.055 + 0.035 * vel;

    var amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, time);
    amp.gain.exponentialRampToValueAtTime(vel * 0.5, time + 0.002);
    amp.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    amp.connect(this.master);

    var o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f0 * 1.4, time);
    o.frequency.exponentialRampToValueAtTime(f0, time + 0.03);
    o.connect(amp);
    o.start(time); o.stop(time + dur + 0.02);

    this._noiseBurst(time, 0.05 + 0.03 * vel, 2400 + this.tone * 1400, 1.3,
                     vel * 0.5, 700);
  };

  /* Ghost note — the brush between strokes that makes the rhythm breathe. */
  Bodhran.prototype._ghost = function (time, vel) {
    this._noiseBurst(time, 0.022, 3200, 1.5, vel * 0.62, 1100);
  };

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
