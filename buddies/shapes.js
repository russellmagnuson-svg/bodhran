/* shapes.js — guitar shapes for any chord a tune asks for, in standard tuning
 * and DADGAD, low string first, -1 for a string not played.
 *
 * The chords Irish tunes mostly use have shapes chosen by hand, the way
 * backers play them: in DADGAD the open strings left ringing (the demo's
 * G/D, Cadd9/D and Em7/D, the open-fifth D5 and A5). Anything else gets a
 * shape found by search: chord tones only, the root in the bass, open
 * strings where they fit, within a four-fret stretch.
 */
(function (P) {
  'use strict';

  P.TUNINGS = {
    standard: { name: 'Standard', strings: [40, 45, 50, 55, 59, 64], letters: 'E A D G B E' },
    dadgad:   { name: 'DADGAD',   strings: [38, 45, 50, 55, 57, 62], letters: 'D A D G A D' }
  };

  // name: what the diagram is labelled; frets low to high.
  var HAND = {
    standard: {
      G:    { name: 'G',     frets: [3, 2, 0, 0, 3, 3] },
      C:    { name: 'Cadd9', frets: [-1, 3, 2, 0, 3, 3] },
      D:    { name: 'D',     frets: [-1, -1, 0, 2, 3, 2] },
      Em:   { name: 'Em7',   frets: [0, 2, 2, 0, 3, 3] },
      Am:   { name: 'Am',    frets: [-1, 0, 2, 2, 1, 0] },
      A:    { name: 'A',     frets: [-1, 0, 2, 2, 2, 0] },
      E:    { name: 'E',     frets: [0, 2, 2, 1, 0, 0] },
      Bm:   { name: 'Bm7',   frets: [-1, 2, 0, 2, 0, 2] },
      'F#m':{ name: 'F#m',   frets: [2, 4, 4, 2, 2, 2] },
      Dm:   { name: 'Dm',    frets: [-1, -1, 0, 2, 3, 1] },
      F:    { name: 'F',     frets: [1, 3, 3, 2, 1, 1] },
      Gm:   { name: 'Gm',    frets: [3, 5, 5, 3, 3, 3] },
      Bb:   { name: 'Bb',    frets: [-1, 1, 3, 3, 3, 1] },
      B:    { name: 'B',     frets: [-1, 2, 4, 4, 4, 2] },
      'C#m':{ name: 'C#m',   frets: [-1, 4, 6, 6, 5, 4] },
      Cm:   { name: 'Cm',    frets: [-1, 3, 5, 5, 4, 3] }
    },
    dadgad: {
      D:    { name: 'D5',      frets: [0, 0, 0, 2, 0, 0] },
      G:    { name: 'G/D',     frets: [0, 2, 0, 0, 0, 0] },
      C:    { name: 'Cadd9/D', frets: [0, 3, 2, 0, 3, 0] },
      Em:   { name: 'Em7/D',   frets: [0, 2, 2, 0, 2, 0] },
      A:    { name: 'A5',      frets: [-1, 0, 2, 2, 0, -1] },
      Am:   { name: 'Am',      frets: [-1, 0, 2, 2, 3, -1] },
      Bm:   { name: 'Bm7',     frets: [-1, 2, 0, 4, 0, 0] },
      E:    { name: 'E',       frets: [2, 2, 2, 1, 2, 2] },
      'F#m':{ name: 'F#m',     frets: [4, 4, 4, 2, 4, 4] },
      Dm:   { name: 'Dm',      frets: [0, 0, 3, 2, 0, 0] },
      F:    { name: 'F',       frets: [3, 3, 3, 2, 3, 3] },
      Gm:   { name: 'Gm/D',    frets: [0, 1, 0, 0, 1, 0] }
    }
  };
  P.HAND = HAND;

  /* Which strings ring open in a shape: highlighted as the drone. */
  function drones(frets) {
    var d = [];
    frets.forEach(function (f, s) { if (f === 0) d.push(s); });
    return d;
  }

  /* Find a shape by search: every string muted or fretted on a chord tone
   * (open strings anywhere, fretted ones within four frets of each other),
   * mutes only from the bass side, the lowest note the root, all of the
   * chord's notes present, at least four strings sounding, no more than four
   * fingers (a barre across the lowest fret counts as one). The best has the
   * most open and sounding strings and the lowest frets. */
  P.findShape = function (tuning, chordName) {
    var t = P.TUNINGS[tuning], ch = P.chord(chordName);
    if (!t || !ch) return null;
    var tones = P.tones(ch), best = null, bestScore = -Infinity;
    for (var lo = 1; lo <= 8; lo++) {
      var choices = t.strings.map(function (open, s) {
        var opts = [];
        if (s < 2) opts.push(-1);
        for (var f = 0; f <= lo + 3; f++) {
          if (f > 0 && f < lo) continue;
          if (tones.indexOf((open + f) % 12) !== -1) opts.push(f);
        }
        return opts;
      });
      (function walk(s, frets) {
        if (s === 6) {
          var sc = rate(t, frets, ch, tones);
          if (sc > bestScore) { bestScore = sc; best = frets.slice(); }
          return;
        }
        choices[s].forEach(function (f) {
          if (f === -1 && frets.some(function (x) { return x !== -1; })) return;   // mutes only below
          frets.push(f); walk(s + 1, frets); frets.pop();
        });
      })(0, []);
    }
    return best ? { name: ch.name, frets: best, drone: drones(best), found: true } : null;
  };

  function rate(t, frets, ch, tones) {
    var sounding = [], fretted = [];
    frets.forEach(function (f, s) {
      if (f < 0) return;
      sounding.push(t.strings[s] + f);
      if (f > 0) fretted.push(f);
    });
    if (sounding.length < 4) return -Infinity;
    if (sounding[0] % 12 !== ch.root) return -Infinity;
    var have = {};
    sounding.forEach(function (m) { have[m % 12] = 1; });
    if (tones.some(function (pc) { return !have[pc]; })) return -Infinity;
    var min = fretted.length ? Math.min.apply(null, fretted) : 0;
    var max = fretted.length ? Math.max.apply(null, fretted) : 0;
    if (max - min > 3) return -Infinity;
    var atMin = fretted.filter(function (f) { return f === min; }).length;
    var fingers = fretted.length - (atMin > 1 ? atMin - 1 : 0);
    if (fingers > 4) return -Infinity;
    var open = frets.filter(function (f) { return f === 0; }).length;
    return open * 2 + sounding.length - max * 0.35;
  }

  /* The shape to play for a chord in a tuning: { name, frets, drone }. */
  var cache = {};
  P.shape = function (tuning, chordName) {
    var ch = P.chord(chordName);
    if (!ch) return null;
    var k = tuning + ':' + ch.name;
    if (cache[k]) return cache[k];
    var h = HAND[tuning] && HAND[tuning][ch.name];
    var sh = h ? { name: h.name, frets: h.frets, drone: drones(h.frets) } : P.findShape(tuning, ch.name);
    cache[k] = sh;
    return sh;
  };

  /* The notes a shape sounds, string by string (null where silent). */
  P.voicing = function (tuning, chordName) {
    var t = P.TUNINGS[tuning], sh = P.shape(tuning, chordName);
    if (!sh) return [null, null, null, null, null, null];
    return sh.frets.map(function (f, s) { return f < 0 ? null : t.strings[s] + f; });
  };
})(window.BUDDIES = window.BUDDIES || {});
