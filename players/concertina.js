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
  Concertina.prototype.note = function (t, dur, midi, vel) {
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
  Concertina.prototype.cancelFrom = function (t) {
    this.queued = this.queued.filter(function (q) {
      if (q.t < t) return true;
      q.nodes.forEach(function (x) { x.disconnect(); });
      return false;
    });
  };

  P.Concertina = Concertina;
})(window.PLAYERS = window.PLAYERS || {});
