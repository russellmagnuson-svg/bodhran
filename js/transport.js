/* transport.js — the clock.
 *
 * Timing uses the standard Web Audio lookahead pattern: a coarse setInterval
 * wakes up often enough to schedule the next slice of notes *ahead* of time
 * against ctx.currentTime, which is sample-accurate. Scheduling notes directly
 * from a timer callback would drift badly within a few bars.
 *
 * Tempo, tune and complexity changes land on the next bar boundary, which is
 * where a musician would expect them to land anyway.
 */
(function (TRAD) {
  'use strict';

  var LOOKAHEAD_MS = 25;      // how often the scheduler wakes up
  var SCHEDULE_AHEAD = 0.12;  // how far ahead of the clock it schedules
  var LATE = 0.05;            // a slot this far in the past is skipped, not played

  function Transport(ctx, bodhran, midi) {
    this.ctx = ctx;
    this.bodhran = bodhran;
    this.midi = midi;

    this.tune = TRAD.tunes[0];
    this.bpm = this.tune.defaultBpm;
    this.complexity = 0.5;
    this.mode = 'full';    // 'full' | 'simple' | 'pulse'
    this.humanize = 0.4;
    this.phraseLength = 4;
    this.countInBars = 1;
    this.swingOverride = null;  // null = use the tune's own swing

    this.running = false;
    this._timer = null;
    this._grid = null;
    this._lastGrid = null;
    this._slot = 0;
    this._barStart = 0;
    this._barDur = 0;
    this._bar = 0;
    this._countInLeft = 0;
    this._countIn = false;

    this.events = [];   // {time, slot, len, char, bar, countIn} for the UI
    this.onBar = null;  // called when a new bar's grid is chosen
  }

  Transport.prototype._swing = function () {
    return this.swingOverride == null ? this.tune.swing : this.swingOverride;
  };

  Transport.prototype._barDuration = function () {
    // bpm is always "pulses per minute" where a pulse is the tune's beat unit
    // (crotchet in 4/4, dotted crotchet in 6/8), which is what a player taps.
    return (60 / this.bpm) * this.tune.beatsPerBar;
  };

  Transport.prototype._startBar = function () {
    if (this._countInLeft > 0) {
      // One slot per beat: an accented click on 1, then plain ones.
      this._grid = 'C' + 'c'.repeat(this.tune.beatsPerBar - 1);
      this._countIn = true;
      this._countInLeft--;
    } else if (this.mode === 'pulse') {
      this._grid = TRAD.pulseGrid(this.tune);
      this._lastGrid = this._grid;
      this._countIn = false;
    } else if (this.mode === 'simple') {
      // One figure, every bar, so a learner has something steady to lean on.
      this._grid = this.tune.grids.simple[0];
      this._lastGrid = this._grid;
      this._countIn = false;
    } else {
      this._grid = TRAD.pickGrid(
        this.tune, this.complexity,
        this.phraseLength > 0 && (this._bar % this.phraseLength) === this.phraseLength - 1,
        this._lastGrid, Math.random
      );
      this._lastGrid = this._grid;
      this._countIn = false;
    }
    this._barDur = this._barDuration();
    if (this.onBar) this.onBar(this._grid, this._bar, this._countIn);
  };

  Transport.prototype._scheduleSlot = function (slot) {
    var grid = this._grid;
    var ch = grid[slot];
    var slotsPerBeat = grid.length / this.tune.beatsPerBar;
    var beatDur = this._barDur / this.tune.beatsPerBar;
    var fractionOfBeat = (slot % slotsPerBeat) / slotsPerBeat;

    var time = this._barStart + (slot / grid.length) * this._barDur;
    time += TRAD.swingShift(fractionOfBeat, this._swing()) * beatDur;

    if (ch === '-' ) return;

    if (ch === 'C' || ch === 'c') {
      var cv = ch === 'C' ? 0.9 : 0.55;
      this.bodhran.hit('click', time, cv);
      this._pushEvent({ time: time, slot: slot, len: grid.length, char: ch,
                        bar: this._bar, countIn: true });
      return;
    }

    var vel = TRAD.VELOCITY[ch] || 0;
    var voice = TRAD.VOICE[ch];
    if (!voice || vel <= 0) return;

    // Humanise: a player is never metronomic, and never hits twice the same.
    // Pulse mode is the exception — it is asked for precisely when someone
    // wants a dead-straight reference, so every hit stays identical.
    if (this.humanize > 0 && this.mode !== 'pulse') {
      time += (Math.random() * 2 - 1) * this.humanize * 0.009;
      vel *= 1 + (Math.random() * 2 - 1) * this.humanize * 0.18;
    }
    vel = Math.max(0.03, Math.min(1.2, vel));
    if (time < this.ctx.currentTime) time = this.ctx.currentTime;

    this.bodhran.hit(voice, time, vel);
    if (this.midi) this.midi.send(this.ctx, voice, time, vel);
    this._pushEvent({ time: time, slot: slot, len: grid.length, char: ch,
                       bar: this._bar, countIn: false });
  };

  Transport.prototype._slotTime = function () {
    return this._barStart + (this._slot / this._grid.length) * this._barDur;
  };

  Transport.prototype._advance = function () {
    this._slot++;
    if (this._slot >= this._grid.length) {
      this._barStart += this._barDur;
      this._slot = 0;
      this._bar++;
      this._startBar();
    }
  };

  Transport.prototype._tick = function () {
    var now = this.ctx.currentTime;

    // If the main thread stalled — a GC pause, a slow phone, a busy tab — slots
    // will have gone by unplayed. Scheduling them now would clamp every one to
    // the same instant and stack them into a single loud crash (a 3s stall
    // piled 10 hits together). Skip them silently instead and rejoin in time:
    // the audio clock kept running, so the beat carries on where it would be.
    var skipped = 0;
    while (this.running && this._slotTime() < now - LATE && skipped++ < 4096) {
      this._advance();
    }
    if (this._slotTime() < now - LATE) {
      // Absurdly far behind; stop counting and start a fresh bar.
      this._barStart = now + 0.05;
      this._slot = 0;
      this._startBar();
    }

    var horizon = now + SCHEDULE_AHEAD;
    var guard = 0;
    while (this.running && guard++ < 256) {
      if (this._slotTime() >= horizon) break;
      this._scheduleSlot(this._slot);
      this._advance();
    }
  };

  Transport.prototype.start = function () {
    if (this.running) return;
    var self = this;
    // Any state but running: iOS uses 'interrupted' after a call or Siri.
    if (this.ctx.state !== 'running' && this.ctx.state !== 'closed') {
      this.ctx.resume().catch(function () {});
    }

    this.running = true;
    this._bar = 0;
    this._slot = 0;
    this._lastGrid = null;
    this._countInLeft = this.countInBars;
    this._barStart = this.ctx.currentTime + 0.08;
    this._startBar();

    this._tick();
    this._timer = setInterval(function () { self._tick(); }, LOOKAHEAD_MS);
  };

  Transport.prototype.stop = function () {
    this.running = false;
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
    this.events.length = 0;
    if (this.midi) this.midi.allNotesOff();
  };

  Transport.prototype.toggle = function () {
    if (this.running) this.stop(); else this.start();
  };

  Transport.prototype._pushEvent = function (ev) {
    this.events.push(ev);
    if (this.events.length > 512) this.events.splice(0, this.events.length - 512);
  };

  /* Drain events whose time has arrived, for the UI to draw. */
  Transport.prototype.due = function () {
    var now = this.ctx.currentTime;
    var out = [];
    while (this.events.length && this.events[0].time <= now) {
      out.push(this.events.shift());
    }
    return out;
  };

  TRAD.Transport = Transport;
})(window.TRAD = window.TRAD || {});
