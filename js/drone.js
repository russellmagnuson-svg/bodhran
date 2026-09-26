/* drone.js — a sustained root-and-fifth pad.
 *
 * Not chords yet (see the roadmap), but a drone under the bodhrán gives you
 * something to tune against and hear the mode of the tune against.
 */
(function (TRAD) {
  'use strict';

  var NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  function midiToHz(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  function Drone(ctx, destination) {
    this.ctx = ctx;
    this.destination = destination;
    this.voices = [];
    this.group = null;   // the gain node the current voices feed
    this.level = 0.18;
    // `out` carries only the level control. Fading a drone in or out happens
    // on each voice group's own gain, so an outgoing group can fade while an
    // incoming one rises, without the two fighting over one parameter.
    this.out = ctx.createGain();
    this.out.gain.value = this.level;

    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1100;
    lp.Q.value = 0.6;

    // Slow filter drift so the pad never sits perfectly still.
    var lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    var lfoGain = ctx.createGain();
    lfoGain.gain.value = 240;
    lfo.connect(lfoGain);
    lfoGain.connect(lp.frequency);
    lfo.start();

    this.out.connect(lp);
    lp.connect(destination);
  }

  Drone.prototype.setLevel = function (v) {
    this.level = v;
    this.out.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1);
  };

  /* Fade the current voices out on their own gain, then stop them once they
   * are silent. Previously this faded the shared output instead — and the
   * start() that follows a root change immediately faded it back up, so the
   * old drone kept sounding at full strength under the new one for 1.5s and
   * then cut off with a click. */
  Drone.prototype.stop = function () {
    var group = this.group;
    if (!group) return;
    var t = this.ctx.currentTime;
    group.gain.cancelScheduledValues(t);
    group.gain.setValueAtTime(group.gain.value, t);
    group.gain.setTargetAtTime(0, t, 0.12);
    // A 0.12s time constant is ~70dB down after 1s: silent before the stop.
    this.voices.forEach(function (o) { o.stop(t + 1.0); });
    this.voices = [];
    this.group = null;
  };

  /* rootMidi: MIDI note number for the root, e.g. 50 = D3. */
  Drone.prototype.start = function (rootMidi) {
    this.stop();
    var ctx = this.ctx;
    var self = this;
    var group = ctx.createGain();
    group.gain.value = 0;
    group.connect(this.out);
    // Root an octave down, the root, and the fifth above it.
    var intervals = [-12, 0, 7];
    intervals.forEach(function (semis, i) {
      // Two slightly detuned saws per pitch gives a reedy, bouzouki-ish beat.
      [-4, 4].forEach(function (cents) {
        var o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = midiToHz(rootMidi + semis) * Math.pow(2, cents / 1200);
        var g = ctx.createGain();
        g.gain.value = (i === 2 ? 0.12 : 0.2) / 2;
        o.connect(g);
        g.connect(group);
        o.start();
        self.voices.push(o);
      });
    });
    group.gain.setTargetAtTime(1, ctx.currentTime, 0.4);
    this.group = group;
  };

  TRAD.Drone = Drone;
  TRAD.midiToHz = midiToHz;
  TRAD.noteName = function (m) {
    return NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
  };
})(window.TRAD = window.TRAD || {});
