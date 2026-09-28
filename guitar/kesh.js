/* kesh.js — The Kesh, as data: the melody, the chords, and the guitar shapes.
 *
 * Melody: setting 1 of The Kesh on thesession.org (tune 55), note for note.
 * Chords: chosen for this demonstration, one or two to a bar, in the drone
 * shapes Irish guitarists favour in G — the top two strings held at the
 * third fret (D and G) under G, C and Em, so they ring through the changes.
 */
(function (KESH) {
  'use strict';

  KESH.title = 'The Kesh';
  KESH.meter = '6/8';
  KESH.key = 'G major';
  KESH.source = 'https://thesession.org/tunes/55';

  /* The ABC of setting 1, one string per part, as published. */
  KESH.abc = {
    A: 'G3 GAB|A3 ABd|edd gdd|edB dBA|GAG GAB|ABA ABd|edd gdd|BAF G3',
    B: 'B2B d2d|ege dBA|B2B dBG|ABA AGA|BAB d^cd|ege dBd|gfg aga|bgg g3'
  };

  /* Chords, bar by bar. Two in a bar split it at the half: one per beat. */
  KESH.chords = {
    A: ['G', 'D', 'C', 'D', 'G', 'D', 'C', 'D G'],
    B: ['G', 'C D', 'G', 'D', 'G', 'C G', 'Em D', 'G']
  };

  /* Guitar shapes in standard tuning, low string first; -1 = not played. */
  KESH.shapes = {
    G:  { name: 'G',     frets: [3, 2, 0, 0, 3, 3] },
    C:  { name: 'Cadd9', frets: [-1, 3, 2, 0, 3, 3] },
    D:  { name: 'D',     frets: [-1, 0, 0, 2, 3, 2] },
    Em: { name: 'Em7',   frets: [0, 2, 2, 0, 3, 3] }
  };
  KESH.tuning = [40, 45, 50, 55, 59, 64];   // E2 A2 D3 G3 B3 E4, as MIDI notes

  /* The notes of a shape, string by string (null where a string is silent). */
  KESH.voicing = function (chord) {
    return KESH.shapes[chord].frets.map(function (f, i) {
      return f < 0 ? null : KESH.tuning[i] + f;
    });
  };

  /* ---- a small ABC reader, enough for this tune ----
   * Key of G: every F is F sharp unless marked. ^ sharpens, = naturals.
   * Upper case is the octave from middle C (C = MIDI 60), lower case the one
   * above. Durations are in quavers (L:1/8). */
  var STEPS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  var KEY = { F: 1 };   // G major

  function readBar(text) {
    var notes = [], re = /([\^=_]?)([A-Ga-g])([',]*)(\d*)/g, m;
    while ((m = re.exec(text))) {
      var letter = m[2].toUpperCase();
      var midi = 60 + STEPS[letter] + (m[2] === letter ? 0 : 12);
      for (var i = 0; i < m[3].length; i++) midi += m[3][i] === "'" ? 12 : -12;
      if (m[1] === '^') midi += 1;
      else if (m[1] === '_') midi -= 1;
      else if (m[1] !== '=') midi += KEY[letter] || 0;
      notes.push({ midi: midi, len: m[4] ? +m[4] : 1, abc: m[0] });
    }
    return notes;
  }

  /* The bars of each part: [{ abc, notes, chords }]. */
  KESH.parts = {};
  ['A', 'B'].forEach(function (p) {
    KESH.parts[p] = KESH.abc[p].split('|').map(function (bar, i) {
      return { part: p, index: i, abc: bar.trim(), notes: readBar(bar), chords: KESH.chords[p][i].split(' ') };
    });
  });

  /* One time through, as played: AABB. */
  KESH.form = function () {
    var A = KESH.parts.A, B = KESH.parts.B;
    return A.concat(A, B, B);
  };
})(window.KESH = window.KESH || {});
