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
    this._nextTune = null;   // a tune picked mid-bar, waiting for the next bar
    this._nextSwing = null;  // and the swing that goes with it
    this.bpm = this.tune.defaultBpm;
    this.complexity = 0.5;
    this.mode = 'full';    // 'full' | 'simple' | 'pulse'
    this.humanize = 0.4;
    this.backHand = 0;      // 0 = open skin throughout, 1 = the most pressure
    this._phrasePeak = 1;   // how far this phrase's back hand presses in
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
    this.finishing = false;   // Finish pressed: end at the phrase's last bar
    this.ending = false;     // this bar is the ending: one stroke, then stop
    this._endSent = false;
    this._endTime = 0;

    this.events = [];   // {time, slot, len, char, bar, countIn} for the UI
    this.onBar = null;  // called when a new bar's grid is chosen
    this.onEnd = null;  // called when a Finish has played its last stroke
  }

  Transport.prototype._swing = function () {
    return this.swingOverride == null ? this.tune.swing : this.swingOverride;
  };

  Transport.prototype._barDuration = function () {
    // bpm is always "pulses per minute" where a pulse is the tune's beat unit
    // (crotchet in 4/4, dotted crotchet in 6/8), which is what a player taps.
    return (60 / this.bpm) * this.tune.beatsPerBar;
  };

  /* Change tune type. While playing, the change waits for the next bar, like a
   * tempo change: the bar under way was laid out for the old tune's beats and
   * swing, and switching part-way through played the rest of it wrong. */
  Transport.prototype.setTune = function (tune) {
    // A new tune starts on its own swing. The swing that goes with it waits
    // too: resetting it at once played the rest of the old tune's bar with
    // the old tune's default instead of the swing you had set.
    if (this.running) { this._nextTune = tune; this._nextSwing = null; }
    else { this.tune = tune; this._nextTune = null; this.swingOverride = null; }
  };

  /* Set the swing (null = the tune's own). Moved while a tune change is
   * waiting, it belongs to the new tune, so it waits with it. */
  Transport.prototype.setSwing = function (v) {
    if (this._nextTune) this._nextSwing = v; else this.swingOverride = v;
  };

  Transport.prototype._startBar = function () {
    if (this._nextTune) {
      this.tune = this._nextTune;
      this._nextTune = null;
      this.swingOverride = this._nextSwing;
      this._nextSwing = null;
      // The last bar's pattern belongs to the old tune. Left in place, the
      // picker could repeat it: a reel bar played as a jig.
      this._lastGrid = null;
    }
    var L = this.phraseLength;
    // Each phrase in Full mode presses in a little differently, the way a
    // player's hand never quite repeats. Simple keeps one steady shape.
    var Lh = L > 0 ? L : 4;
    if (this._bar >= 0 && this._bar % Lh === 0) {
      this._phrasePeak = this.mode === 'full' && this.humanize > 0
        ? 0.65 + 0.35 * Math.random() : 1;
    }
    if (this._countInLeft > 0) {
      // One slot per beat: an accented click on 1, then plain ones.
      this._grid = 'C' + 'c'.repeat(this.tune.beatsPerBar - 1);
      this._countIn = true;
      this._countInLeft--;
    } else if (this.finishing && (L <= 0 || this._bar % L === L - 1)) {
      // The ending. A tune's last note arrives at the start of its last bar,
      // so the drum lands one hard down stroke there, with it, lets it ring,
      // and stops. With no phrases set, it lands on the next bar.
      this._grid = 'D' + '-'.repeat(this.tune.beatsPerBar - 1);
      this.ending = true;
      this._endSent = false;
      this._countIn = false;
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
        L > 0 && (this._bar % L) === L - 1,
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

    if (ch === '-' ) return time;

    if (ch === 'C' || ch === 'c') {
      var cv = ch === 'C' ? 0.9 : 0.55;
      this.bodhran.hit('click', time, cv);
      if (this.midi) this.midi.send(this.ctx, 'click', time, cv);
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

    this.bodhran.hit(voice, time, vel, this._press(slot / grid.length));
    if (this.midi) this.midi.send(this.ctx, voice, time, vel);
    this._pushEvent({ time: time, slot: slot, len: grid.length, char: ch,
                       bar: this._bar, countIn: false });
    return time;
  };

  /* How hard the back hand presses for a stroke this far through the bar.
   * Never in Pulse, which is a plain reference; and the last stroke of a
   * Finish is played open, so it rings out full. */
  Transport.prototype._press = function (fractionOfBar) {
    if (!(this.backHand > 0) || this.mode === 'pulse' || this.ending || this._bar < 0) return 0;
    var L = this.phraseLength > 0 ? this.phraseLength : 4;
    var x = ((this._bar % L) + fractionOfBar) / L;
    return this.backHand * this._phrasePeak * TRAD.backHandShape(x);
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
    while (this.running && !this.ending && this._slotTime() < now - LATE && skipped++ < 4096) {
      this._advance();
    }
    if (!this.ending && this._slotTime() < now - LATE) {
      // Absurdly far behind; stop counting and start a fresh bar.
      this._barStart = now + 0.05;
      this._slot = 0;
      this._startBar();
    }

    var horizon = now + SCHEDULE_AHEAD;
    var guard = 0;
    while (this.running && !this.ending && guard++ < 256) {
      if (this._slotTime() >= horizon) break;
      this._scheduleSlot(this._slot);
      this._advance();
    }

    // The ending bar has one stroke and nothing after it. Once that stroke has
    // sounded, stop — it rings on by itself. (If the page stalled through it,
    // it is skipped like any late stroke, and the drum still stops.)
    if (this.running && this.ending) {
      if (!this._endSent && this._barStart < horizon) {
        this._endSent = true;
        this._endTime = this._barStart >= now - LATE ? this._scheduleSlot(0) : this._barStart;
      }
      if (this._endSent && now >= this._endTime + 0.02) {
        this.stop();
        if (this.onEnd) this.onEnd();
      }
    }
  };

  /* Finish: play on to the last bar of the phrase and end there. Pressing it
   * again changes your mind and carries on. */
  Transport.prototype.finish = function () {
    if (this.running && !this.ending) this.finishing = true;
  };
  Transport.prototype.keepGoing = function () {
    if (!this.ending) this.finishing = false;
  };

  Transport.prototype.start = function () {
    if (this.running) return;
    var self = this;
    // Any state but running: iOS uses 'interrupted' after a call or Siri.
    if (this.ctx.state !== 'running' && this.ctx.state !== 'closed') {
      this.ctx.resume().catch(function () {});
    }

    this.running = true;
    // Count-in bars are numbered below zero, so bar 0 is the first bar the
    // drum plays: the first bar of the tune. They used to count as bars of the
    // first phrase, which put every fill a bar early (on bars 3 and 7).
    this._bar = -this.countInBars;
    this._slot = 0;
    this.finishing = false;
    this.ending = false;
    this._lastGrid = null;
    this._countInLeft = this.countInBars;
    this._barStart = this.ctx.currentTime + 0.08;
    this._startBar();

    this._tick();
    this._timer = setInterval(function () { self._tick(); }, LOOKAHEAD_MS);
  };

  Transport.prototype.stop = function () {
    this.running = false;
    this.finishing = false;
    this.ending = false;
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
    this.events.length = 0;
    if (this._nextTune) {
      this.tune = this._nextTune; this._nextTune = null;
      this.swingOverride = this._nextSwing; this._nextSwing = null;
    }
    // Strokes are scheduled a little ahead, so some are always queued. Drop
    // them, or one can still sound after Stop.
    if (this.bodhran.cancelFrom) this.bodhran.cancelFrom(this.ctx.currentTime);
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
