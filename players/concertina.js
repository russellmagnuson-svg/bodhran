/* concertina.js — a concertina for the melody, synthesised as it plays.
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
 * start. The player passes the note's length already detached: concertina
 * players cross the rows and change bellows between notes, so the short
 * ones bounce.
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

  function Concertina(ctx, dest) {
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
  }

  /* One note: t start, dur seconds sounding, midi, vel 0-1. */
  Concertina.prototype.note = function (t, dur, midi, vel) {
    var ctx = this.ctx, f = 440 * Math.pow(2, (midi - 69) / 12), end = t + dur;
    var reed = ctx.createOscillator(), bright = ctx.createBiquadFilter(), amp = ctx.createGain();
    reed.setPeriodicWave(wave(ctx));
    reed.frequency.value = f;
    reed.detune.value = (Math.random() * 2 - 1) * 3;            // a real reed's tuning, a few cents either way
    // The overtones build up as the reed starts to swing.
    bright.type = 'lowpass'; bright.Q.value = 0.7;
    bright.frequency.setValueAtTime(Math.min(f * 3, 2500), t);
    bright.frequency.exponentialRampToValueAtTime(Math.min(f * 24, 16000), t + 0.03);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(vel, t + 0.016);      // the bellows: quick, not a click
    amp.gain.setValueAtTime(vel, Math.max(t + 0.017, end - 0.03));
    amp.gain.exponentialRampToValueAtTime(0.0001, end);
    reed.connect(bright); bright.connect(amp); amp.connect(this.out);
    reed.start(t); reed.stop(end + 0.02);
    // A breath of air as the pallet opens.
    var b = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), bg = ctx.createGain();
    b.buffer = this.air; bp.type = 'bandpass'; bp.frequency.value = Math.min(f * 6, 5000); bp.Q.value = 1.5;
    bg.gain.setValueAtTime(0.0001, t);
    bg.gain.exponentialRampToValueAtTime(vel * 0.05, t + 0.008);
    bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    b.connect(bp); bp.connect(bg); bg.connect(this.out);
    b.start(t, Math.random() * 0.15, 0.08);
    this.queued = this.queued.filter(function (q) { return q.t > ctx.currentTime - 1; });
    this.queued.push({ t: t, nodes: [amp, bg] });
  };

  /* Stop: drop every note handed over but not yet begun. */
  Concertina.prototype.cancelFrom = function (t) {
    this.queued = this.queued.filter(function (q) {
      if (q.t < t) return true;
      q.nodes.forEach(function (x) { x.disconnect(); });
      return false;
    });
  };

  P.Concertina = Concertina;
})(window.PLAYERS = window.PLAYERS || {});
