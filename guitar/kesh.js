/* kesh.js — The Kesh, as data: the melody, the chords, and the guitar shapes.
 *
 * Melody: setting 1 of The Kesh on thesession.org (tune 55), note for note.
 * Chords: chosen for this demonstration, one or two to a bar, in the drone
 * shapes Irish guitarists favour in G: in standard tuning the top two strings
 * held at the third fret (D and G) under G, C and Em; in DADGAD the open top
 * D and G strings left ringing.
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

  /* Guitar shapes in two tunings, low string first; -1 = not played.
   * `drone` lists the strings that ring through the changes in that tuning. */
  KESH.tunings = {
    standard: {
      name: 'Standard', strings: [40, 45, 50, 55, 59, 64], letters: 'E A D G B E',
      note: 'Standard tuning. G, Cadd9 and Em7 keep the top two strings at the third fret, ' +
            'so a D and a G ring through every change: the open, droning sound of a lot of ' +
            'Irish guitar. D lets them go for its F sharp.',
      shapes: {
        G:  { name: 'G',     frets: [3, 2, 0, 0, 3, 3],  drone: [4, 5] },
        C:  { name: 'Cadd9', frets: [-1, 3, 2, 0, 3, 3], drone: [4, 5] },
        D:  { name: 'D',     frets: [-1, 0, 0, 2, 3, 2], drone: [] },
        Em: { name: 'Em7',   frets: [0, 2, 2, 0, 3, 3],  drone: [4, 5] }
      }
    },
    /* DADGAD: D A D G A D, low to high, the tuning a great deal of Irish guitar
     * backing is played in. The shapes leave strings open: the top D rings
     * through every chord, and the open G through three of them. G and C carry
     * an added ninth, D is an open fifth with no third at all, so the chords
     * sit under the melody without pinning it down. */
    dadgad: {
      name: 'DADGAD', strings: [38, 45, 50, 55, 57, 62], letters: 'D A D G A D',
      note: 'DADGAD tuning: D A D G A D, low to high. The shapes leave strings open, so the ' +
            'top D rings through every chord and the open G through three of them. G and C ' +
            'carry an added ninth and D is an open fifth, with no third: chords that sit ' +
            'under the tune without pinning it down.',
      shapes: {
        G:  { name: 'Gadd9', frets: [5, 2, 0, 0, 0, 0],  drone: [3, 5] },
        C:  { name: 'Cadd9', frets: [-1, 3, 2, 0, 3, 0], drone: [3, 5] },
        D:  { name: 'D5',    frets: [0, 0, 0, 2, 0, 0],  drone: [5] },
        Em: { name: 'Em7',   frets: [2, 2, 2, 0, 2, 0],  drone: [3, 5] }
      }
    }
  };
  // Standard tuning, under the names the first version used.
  KESH.shapes = KESH.tunings.standard.shapes;
  KESH.tuning = KESH.tunings.standard.strings;

  /* The notes of a shape, string by string (null where a string is silent). */
  KESH.voicing = function (chord, tuning) {
    var t = KESH.tunings[tuning || 'standard'];
    return t.shapes[chord].frets.map(function (f, i) {
      return f < 0 ? null : t.strings[i] + f;
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

  /* ---- bass runs ----
   * On the last beat before a chord change, three single bass notes walking
   * up into the new chord, in place of that beat's strum. Into bars 2 and 5 of
   * each part: enough to hear, not so many that they crowd the backing. The
   * notes sit where each tuning plays them: in DADGAD the walk into G starts
   * on the open low D; in standard it climbs the D string to the open G. */
  KESH.runBars = { A: [0, 3], B: [0, 3] };     // the bar whose last beat walks on
  KESH.runs = {
    standard: { G: [50, 52, 54], C: [43, 45, 47], D: [45, 47, 49] },   // D E F#, G A B, A B C#
    dadgad:   { G: [38, 40, 42], C: [43, 45, 47], D: [45, 47, 49] }
  };
  /* The run out of this bar, or null: { to, notes, strings }. `strings` says
   * which string plays each note: the one with the lowest fret for it. */
  KESH.runFrom = function (part, index, tuning) {
    if (KESH.runBars[part].indexOf(index) === -1) return null;
    var next = KESH.parts[part][index + 1];
    if (!next) return null;
    var to = next.chords[0], notes = KESH.runs[tuning || 'standard'][to];
    if (!notes) return null;
    var open = KESH.tunings[tuning || 'standard'].strings;
    var strings = notes.map(function (m) {
      var best = -1;
      for (var s = 0; s < 6; s++) {
        var f = m - open[s];
        if (f >= 0 && f <= 5 && (best < 0 || f < m - open[best])) best = s;
      }
      return best;
    });
    return { to: to, notes: notes, strings: strings };
  };

  /* One time through, as played: AABB. */
  KESH.form = function () {
    var A = KESH.parts.A, B = KESH.parts.B;
    return A.concat(A, B, B);
  };
})(window.KESH = window.KESH || {});
