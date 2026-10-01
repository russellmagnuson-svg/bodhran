/* flute.js — the guitar demo's simple flute, as an instrument of its own,
 * the same shape as the concertina (concertina.js): new Flute(ctx, dest),
 * .note(t, dur, midi, vel), .cancelFrom(t).
 *
 * Nearly a pure tone (the second and third harmonics faint), a soft
 * attack, a little vibrato on held notes, and a breath of air at the start
 * of each note with a trace of it under the note.
 */
(function (P) {
  'use strict';

  function Flute(ctx, dest) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    var soft = ctx.createBiquadFilter(); soft.type = 'lowpass'; soft.frequency.value = 5200;
    this.out.connect(soft); soft.connect(dest);
    this.queued = [];
    var buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.air = buf;
  }

  /* Heard on time: the flute's notes swell in over 30 ms, so each was heard
   * (within 6 dB of its full level) 27 ms after the time it was asked for,
   * behind the guitar and drum and, from Session Players 1.7.0, behind the
   * recorded concertina on every note: a flam that made the two together
   * sound jittery. So the swell starts LEAD seconds early, and the note is
   * heard on its time. */
  Flute.prototype.LEAD = 0.022;

  Flute.prototype.note = function (t, dur, midi, vel) {
    var ctx = this.ctx, f = 440 * Math.pow(2, (midi - 69) / 12), end = t + dur;
    t = Math.max(ctx.currentTime, t - this.LEAD);
    var amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(vel, t + 0.03);
    amp.gain.setValueAtTime(vel, Math.max(t + 0.031, end - 0.05));
    amp.gain.exponentialRampToValueAtTime(0.0001, end);
    amp.connect(this.out);
    [[1, 1], [2, 0.16], [3, 0.05]].forEach(function (h) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = f * h[0]; g.gain.value = h[1];
      if (dur > 0.4) {                     // a little vibrato on held notes
        var lfo = ctx.createOscillator(), depth = ctx.createGain();
        lfo.frequency.value = 5.2;
        depth.gain.setValueAtTime(0, t);
        depth.gain.linearRampToValueAtTime(9, t + 0.35);
        lfo.connect(depth); depth.connect(o.detune);
        lfo.start(t); lfo.stop(end + 0.02);
      }
      o.connect(g); g.connect(amp);
      o.start(t); o.stop(end + 0.02);
    });
    var b = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), bg = ctx.createGain();
    b.buffer = this.air; bp.type = 'bandpass'; bp.frequency.value = f * 4; bp.Q.value = 1.2;
    bg.gain.setValueAtTime(0.0001, t);
    bg.gain.exponentialRampToValueAtTime(vel * 0.1, t + 0.012);
    bg.gain.exponentialRampToValueAtTime(vel * 0.018, t + 0.08);
    bg.gain.exponentialRampToValueAtTime(0.0001, end);
    b.connect(bp); bp.connect(bg); bg.connect(this.out);
    b.start(t, Math.random() * 0.5, dur + 0.05);
    this.queued = this.queued.filter(function (q) { return q.t > ctx.currentTime - 1; });
    this.queued.push({ t: t, nodes: [amp, bg] });
  };

  /* Stop: drop every note handed over but not yet begun. */
  Flute.prototype.cancelFrom = function (t) {
    this.queued = this.queued.filter(function (q) {
      if (q.t < t) return true;
      q.nodes.forEach(function (x) { x.disconnect(); });
      return false;
    });
  };

  P.Flute = Flute;
})(window.PLAYERS = window.PLAYERS || {});
