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
    this.out = ctx.createGain();
    this.out.gain.value = 0;

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
    this.level = 0.18;
  }

  Drone.prototype.setLevel = function (v) {
    this.level = v;
    if (this.voices.length) {
      this.out.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1);
    }
  };

  Drone.prototype.stop = function () {
    var ctx = this.ctx;
    var voices = this.voices;
    this.voices = [];
    this.out.gain.setTargetAtTime(0, ctx.currentTime, 0.25);
    voices.forEach(function (o) { o.stop(ctx.currentTime + 1.5); });
  };

  /* rootMidi: MIDI note number for the root, e.g. 50 = D3. */
  Drone.prototype.start = function (rootMidi) {
    this.stop();
    var ctx = this.ctx;
    var self = this;
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
        g.connect(self.out);
        o.start();
        self.voices.push(o);
      });
    });
    this.out.gain.setTargetAtTime(this.level, ctx.currentTime, 0.4);
  };

  TRAD.Drone = Drone;
  TRAD.midiToHz = midiToHz;
  TRAD.noteName = function (m) {
    return NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
  };
})(window.TRAD = window.TRAD || {});
