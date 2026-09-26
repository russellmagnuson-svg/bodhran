/* midiout.js — optional MIDI output, so the bodhrán can drive GarageBand.
 *
 * Route: this app -> IAC Driver bus -> GarageBand (or Logic, Ableton, ...).
 * Web MIDI is available in Chrome/Edge on macOS. Safari does not implement it,
 * so everything here degrades quietly to "off".
 */
(function (TRAD) {
  'use strict';

  function MidiOut() {
    this.access = null;
    this.port = null;
    this.enabled = false;
    this.channel = 10;          // GM percussion
    // Every stroke goes to one drum, the way every stroke on a bodhrán lands
    // on one skin; dum, tak and ghost differ only in velocity. Sampled kits
    // change timbre with velocity too, so a light stroke sounds lighter, not
    // just quieter. 41 is the low floor tom in a General MIDI kit: the
    // closest standard drum to a bodhrán in size and pitch. (This used to be
    // a kick for the dum and a side stick for the tak: two different drums.)
    this.note = 41;
  }

  MidiOut.prototype.available = function () {
    return typeof navigator !== 'undefined' && !!navigator.requestMIDIAccess;
  };

  MidiOut.prototype.init = function () {
    var self = this;
    if (!this.available()) return Promise.reject(new Error('Web MIDI not supported in this browser'));
    return navigator.requestMIDIAccess({ sysex: false }).then(function (access) {
      self.access = access;
      return self.outputs();
    });
  };

  MidiOut.prototype.outputs = function () {
    if (!this.access) return [];
    var list = [];
    this.access.outputs.forEach(function (p) { list.push({ id: p.id, name: p.name }); });
    return list;
  };

  MidiOut.prototype.selectPort = function (id) {
    this.port = (this.access && id) ? this.access.outputs.get(id) : null;
    return !!this.port;
  };

  /* Web MIDI schedules against performance.now(); Web Audio schedules against
   * ctx.currentTime. getOutputTimestamp() lets us line the two clocks up. */
  MidiOut.prototype._perfTime = function (ctx, audioTime) {
    var ts = ctx.getOutputTimestamp ? ctx.getOutputTimestamp() : null;
    if (ts && typeof ts.contextTime === 'number' && typeof ts.performanceTime === 'number') {
      return ts.performanceTime + (audioTime - ts.contextTime) * 1000;
    }
    return performance.now() + (audioTime - ctx.currentTime) * 1000;
  };

  MidiOut.prototype.send = function (ctx, voice, audioTime, vel) {
    if (!this.enabled || !this.port) return;
    var note = this.note;
    var status = 0x90 | ((this.channel - 1) & 0x0f);
    var velocity = Math.max(1, Math.min(127, Math.round(vel * 127)));
    var at = this._perfTime(ctx, audioTime);
    try {
      this.port.send([status, note, velocity], at);
      this.port.send([status, note, 0], at + 60);
    } catch (e) { /* port went away mid-send; nothing useful to do */ }
  };

  MidiOut.prototype.allNotesOff = function () {
    if (!this.port) return;
    var status = 0xb0 | ((this.channel - 1) & 0x0f);
    try { this.port.send([status, 123, 0]); } catch (e) {}
  };

  TRAD.MidiOut = MidiOut;
})(window.TRAD = window.TRAD || {});
