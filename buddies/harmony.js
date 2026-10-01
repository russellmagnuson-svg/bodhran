/* harmony.js — the chords for a tune: from its setting if it has them, or
 * chosen from the melody if not (almost all settings on the Session have
 * none: 2 of 75 surveyed).
 *
 * Choosing them: each half bar's melody notes are scored against the
 * chords a backer reaches for in that key and mode, notes on the beat
 * counting for more; then a path through the whole tune is picked that
 * changes chord only when the tune asks for it, starts on the home chord,
 * and comes home at the end of each part. It knows the shape of a part, too:
 * eight bars in two phrases, the fourth bar resting on the cadence chord
 * (D, in G) and the eighth going from it to home. Without that it heard
 * only notes, and missed most of what a backer would play at bars 4 and 8.
 * A first pass, to be put right by ear: any bar can be changed on the page.
 */
(function (P) {
  'use strict';

  var NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  var NAMES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  var PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

  /* "F#m7/A", "Em", "D", "G5": what a chord is, as a backer plays it. The
   * name is kept to root and major or minor (sevenths and slash basses are
   * left to the shape). */
  P.chord = function (name) {
    var m = /^([A-G])([#b]?)(m(?!aj)|min|-)?(5)?/.exec(String(name || '').trim());
    if (!m) return null;
    var root = (PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
    var minor = !!m[3], power = !!m[4] && !minor;
    return { root: root, minor: minor, power: power, name: m[1] + m[2] + (minor ? 'm' : '') };
  };

  /* The notes of a chord, by pitch class, and how well a melody note sits on
   * it: root, third and fifth fully; the ninth (an open-string colour a
   * backer happily lets ring, D over C) in part; anything else counts
   * against. */
  P.tones = function (ch) {
    var t = [ch.root, (ch.root + 7) % 12];
    if (!ch.power) t.splice(1, 0, (ch.root + (ch.minor ? 3 : 4)) % 12);
    return t;
  };
  function fit(pc, ch) {
    var i = (pc - ch.root + 12) % 12;
    if (i === 0) return 1;
    if (i === 7) return 0.8;
    if (!ch.power && i === (ch.minor ? 3 : 4)) return 0.85;
    if (i === 2) return 0.4;            // the ninth: the colour the shapes themselves carry (Cadd9, G/D's A)
    return -0.5;
  }

  /* The chords a backer reaches for in a key, by scale degree, with how
   * strongly each is favoured before the melody has its say. */
  var USUAL = {
    major:      [[0, 0.15], [4, 0.1], [3, 0.08], [5, 0.02], [1, -0.05]],         // I V IV vi ii
    mixolydian: [[0, 0.15], [6, 0.1], [3, 0.06], [4, -0.02], [1, -0.06]],        // I bVII IV v ii
    dorian:     [[0, 0.15], [6, 0.1], [3, 0.06], [2, 0.02], [4, -0.04]],         // i bVII IV bIII v
    minor:      [[0, 0.15], [6, 0.1], [2, 0.05], [3, 0.02], [4, 0], [5, 0]]      // i bVII bIII iv v bVI
  };
  /* The chord a phrase comes to rest on before home: the dominant in a major
   * key; in the modes the chord a step below home (G to Am in A dorian, C to
   * D in D mixolydian, D to Em in E minor), as the music goes. */
  var CADENCE = { major: 4, lydian: 4, mixolydian: 6, dorian: 6, minor: 6, phrygian: 6, locrian: 6 };

  P.candidates = function (key) {
    var list = USUAL[key.mode] || (key.mode === 'lydian' ? USUAL.major : USUAL.minor);
    var flat = key.fifths < 0;
    return list.map(function (d) {
      var deg = d[0], s = key.scale;
      var root = s[deg].pc, third = (s[(deg + 2) % 7].pc - root + 12) % 12;
      var name = s[deg].name || (flat ? NAMES_FLAT : NAMES_SHARP)[root];
      return { name: name + (third === 3 ? 'm' : ''), prior: d[1], degree: deg };
    });
  };

  /* Score one half bar's notes against a chord. */
  function score(notes, ch, beat) {
    var sum = 0, weight = 0;
    notes.forEach(function (n, i) {
      // The note on the beat carries the harmony: in "edd gdd" the E says C,
      // and the repeated Ds that follow are passing.
      var w = n.dur / P.TPQ * (n.tick % beat === 0 ? 2.5 : 1) * (i === 0 ? 1.3 : 1);
      sum += w * fit(n.midi % 12, ch); weight += w;
    });
    return weight ? sum / weight : 0;
  }

  /* Chords for each slot of a laid-out tune: { slotId: ['G'] or ['C', 'D'] }.
   * From the setting's own chord symbols if it has any, else chosen. */
  P.chords = function (lay) {
    return lay.symbols.length ? fromSymbols(lay) : choose(lay);
  };
  P.chordSource = function (lay) { return lay.symbols.length ? 'setting' : 'auto'; };

  function choose(lay) {
    var key = lay.key, cands = P.candidates(key), L = lay.meter.bar, H = lay.meter.half, beat = lay.meter.beat;
    var chs = cands.map(function (c) { return P.chord(c.name); });
    var tonic = 0, cadence = CADENCE[key.mode] != null ? CADENCE[key.mode] : 4;
    // Where each bar sits in its part, as first heard: a second ending, first
    // heard in bar 16, is the part's bar 8 again.
    var firstK = {}, partStart = {};
    lay.timeline.forEach(function (tb) { if (firstK[tb.slot] == null) firstK[tb.slot] = tb.k; });
    lay.slots.forEach(function (sl) {
      if (partStart[sl.part] == null || firstK[sl.id] < partStart[sl.part]) partStart[sl.part] = firstK[sl.id];
    });
    // The halves to choose for: two per slot, in the order first heard.
    var first = {};
    lay.timeline.forEach(function (tb) { if (!first[tb.slot]) first[tb.slot] = tb; });
    var halves = [];
    lay.slots.forEach(function (sl, si) {
      var tb = first[sl.id], next = lay.slots[si + 1];
      var endOfPart = !next || next.part !== sl.part;
      var PH = lay.meter.phrase || 8;
      var pos = (firstK[sl.id] - partStart[sl.part]) % PH;  // 0 to 7: bar 1 to bar 8 of the phrase pair
      [0, 1].forEach(function (h) {
        var notes = tb.notes.filter(function (n) { return n.tick >= h * H && n.tick < (h + 1) * H; })
                            .map(function (n) { return { tick: n.tick - h * H, dur: Math.min(n.dur, (h + 1) * H - n.tick), midi: n.midi }; });
        halves.push({ slot: sl.id, half: h, notes: notes, first: si === 0 && h === 0,
                      home: (endOfPart || pos === PH - 1) && h === 1,
                      rest: pos === PH / 2 - 1,          // bar 4: the half-way rest
                      lead: pos === PH - 1 && h === 0,   // bar 8: the cadence chord, then home
                      cadenceBar: pos === PH - 1,
                      end: si === lay.slots.length - 1 && h === 1 });
      });
    });
    // Best path: Viterbi over the halves.
    var best = [], from = [];
    halves.forEach(function (hv, x) {
      best.push([]); from.push([]);
      chs.forEach(function (ch, c) {
        var own = score(hv.notes, ch, beat) + cands[c].prior;
        if ((hv.first || hv.home) && c === tonic) own += hv.first ? 0.4 : 0.25;
        // A trad tune ends on its home chord, whatever its last notes.
        if (hv.end && c === tonic) own += 1;
        // The phrase shape: bar 4 rests on the cadence chord; bar 8 opens on
        // it and goes home ("BAF G3" is D to G).
        if ((hv.rest || hv.lead) && cands[c].degree === cadence) own += 0.2;
        if (x === 0) { best[x][c] = own; from[x][c] = -1; return; }
        var top = -Infinity, arg = 0;
        chs.forEach(function (pch, p) {
          // Changing mid-bar costs more, except in the cadence bar, where it is the point.
          var change = p === c ? 0 : (hv.half === 1 ? (hv.cadenceBar ? 0.1 : 0.4) : 0.05);
          var v = best[x - 1][p] - change;
          if (v > top) { top = v; arg = p; }
        });
        best[x][c] = top + own; from[x][c] = arg;
      });
    });
    var x = halves.length - 1, c = 0, pick = [];
    if (x < 0) return {};
    best[x].forEach(function (v, k) { if (v > best[x][c]) c = k; });
    for (; x >= 0; x--) { pick[x] = c; c = from[x][c]; }
    var out = {};
    for (var k = 0; k < halves.length; k += 2) {
      var a = cands[pick[k]].name, b = cands[pick[k + 1]].name;
      out[halves[k].slot] = a === b ? [a] : [a, b];
    }
    return out;
  }

  function fromSymbols(lay) {
    var L = lay.meter.bar, H = lay.meter.half;
    var syms = lay.symbols.filter(function (s) { return P.chord(s.name); })
                          .sort(function (a, b) { return a.tick - b.tick; });
    if (!syms.length) return choose(lay);
    var out = {}, curName = P.chord(syms[0].name).name;
    function at(tick) {
      for (var i = 0; i < syms.length; i++) if (syms[i].tick <= tick) curName = P.chord(syms[i].name).name;
      return curName;
    }
    lay.timeline.forEach(function (tb) {
      if (out[tb.slot]) return;
      var a = at(tb.k * L), b = at(tb.k * L + H);
      out[tb.slot] = a === b ? [a] : [a, b];
    });
    return out;
  }
})(window.BUDDIES = window.BUDDIES || {});
