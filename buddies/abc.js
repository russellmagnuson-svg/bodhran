/* abc.js — reads a tune the way thesession.org publishes it, in ABC notation,
 * and lays it out as it is played.
 *
 * The Session gives only the body of the tune: no M:, L: or K: lines. The
 * meter comes from the tune type, the key from the setting, and the note
 * length is a quaver (L:1/8). What its settings actually use, surveyed over
 * the three most popular settings of the 25 most popular jigs and reels:
 * "!" for line breaks (nearly all), repeats (most), first and second endings
 * (a third), rolls (~), triplets, halved notes (A/), and now and then grace
 * notes, ties, rests, dotted pairs (A>B) and chord symbols ("G").
 *
 * Time is counted in ticks, 24 to the quaver, so triplets and halves stay
 * whole numbers.
 */
(function (P) {
  'use strict';

  var TPQ = P.TPQ = 24;                       // ticks per quaver
  var STEPS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  var FIFTHS = { F: -1, C: 0, G: 1, D: 2, A: 3, E: 4, B: 5 };
  var SHARPS = 'FCGDAEB', FLATS = 'BEADGCF';
  // Each mode against its major: how many fifths flatter its signature is.
  var MODE_SHIFT = { major: 0, lydian: 1, mixolydian: -1, dorian: -2, minor: -3, phrygian: -4, locrian: -5 };
  var MODE_NAMES = { major: 'major', minor: 'minor', dorian: 'dorian', mixolydian: 'mixolydian',
                     lydian: 'lydian', phrygian: 'phrygian', locrian: 'locrian' };

  function modeOf(raw) {
    raw = (raw || '').toLowerCase();
    if (!raw || raw.indexOf('maj') === 0 || raw.indexOf('ion') === 0) return 'major';
    if (raw.indexOf('mix') === 0) return 'mixolydian';
    if (raw.indexOf('dor') === 0) return 'dorian';
    if (raw.indexOf('phr') === 0) return 'phrygian';
    if (raw.indexOf('lyd') === 0) return 'lydian';
    if (raw.indexOf('loc') === 0) return 'locrian';
    if (raw.indexOf('m') === 0 || raw.indexOf('aeo') === 0) return 'minor';
    return 'major';
  }

  /* A key, from the Session's "Gmajor", "Adorian", or ABC's "Ador", "Em",
   * "F#m", "Bb": its tonic, mode, signature and scale. */
  P.parseKey = function (s) {
    var m = /^\s*([A-Ga-g])([#b]?)\s*([A-Za-z]*)/.exec(s || 'C') || ['', 'C', '', ''];
    var letter = m[1].toUpperCase(), acc = m[2], mode = modeOf(m[3]);
    var fifths = FIFTHS[letter] + (acc === '#' ? 7 : acc === 'b' ? -7 : 0) + MODE_SHIFT[mode];
    var sig = {};
    for (var i = 0; i < Math.min(7, Math.abs(fifths)); i++) {
      sig[(fifths > 0 ? SHARPS : FLATS)[i]] = fifths > 0 ? 1 : -1;
    }
    var tonic = (STEPS[letter] + (acc === '#' ? 1 : acc === 'b' ? -1 : 0) + 12) % 12;
    // The scale, as letter names with the signature applied: G A B C D E F#.
    var order = 'CDEFGAB', start = order.indexOf(letter), scale = [];
    for (var d = 0; d < 7; d++) {
      var L = order[(start + d) % 7], a = sig[L] || 0;
      scale.push({ name: L + (a > 0 ? '#' : a < 0 ? 'b' : ''), pc: (STEPS[L] + a + 12) % 12 });
    }
    return { tonic: tonic, tonicName: letter + acc, mode: mode, sig: sig, fifths: fifths,
             scale: scale, name: letter + acc + ' ' + MODE_NAMES[mode] };
  };

  /* Is quoted text a chord symbol? A whole chord name only ("G", "Em7",
   * "D/F#", "Bm7b5", "Asus4", "C (2nd time)"), not a part label ("A'"). Until Session Buddies 1.12.3
   * any text starting A-G was: "Ending" became an E chord, "Chorus" a C,
   * and with a setting's chords taken as given, The Star of Munster #19 was
   * strummed on E major throughout. */
  P.isChordName = function (txt) {
    var t = String(txt || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
    return /^[A-G][#b]?(?:maj|M|min|m|dim|aug|\+|-|°|ø)?\d*(?:(?:sus|add|maj|[#b])\d*)*(?:\/[A-H][#b]?)?$/.test(t);   // H: B, as German players write it ("D/H")
  };

  /* "6/8", "4/4", "C": ticks in a bar, and in a beat as the dance counts it;
   * and where a bar's second chord can come in. That is half way, except in
   * a bar of three beats (a slip jig's 9/8), where half way is mid-beat: the
   * change comes on the third beat. phrase: bars to a pair of phrases, the
   * shape the chords follow: eight, but four of a slide's 12/8, each of which
   * holds two of a jig's bars. */
  P.meter = function (s) {
    if (s === 'C' || s === 'C|') s = '4/4';
    var m = /^(\d+)\/(\d+)$/.exec(s || '4/4'), n = +m[1], d = +m[2];
    var bar = n * 8 / d * TPQ;
    var compound = d === 8 && n % 3 === 0;
    var beat = compound ? 3 * TPQ : 8 / d * TPQ, beats = bar / beat;
    return { text: s, num: n, den: d, bar: bar, beat: beat,
             half: beats % 2 ? (beats - 1) * beat : bar / 2, phrase: bar >= 12 * TPQ ? 4 : 8 };
  };

  /* Take the Session's line breaks and decorations out of the way. */
  function clean(abc) {
    return String(abc || '')
      .replace(/%[^\n]*/g, ' ')                       // comments
      .replace(/![A-Za-z0-9<>().+\-]+!/g, ' ')         // !trill! style decorations
      .replace(/\+[A-Za-z0-9<>().]+\+/g, ' ')          // old +trill+ style
      .replace(/!/g, ' ')                              // the Session's line breaks
      .replace(/\r?\n/g, ' ');
  }

  /* Read the body of a tune into written bars.
   * opts: { key: 'Gmajor', meter: '6/8', unit: '1/8' }.
   * Each bar: { id, notes: [{ tick, dur, midi }], chords: [{ tick, name }],
   *   text, len, startRepeat, endRepeat, section, sectionEnd, ending }. */
  P.readBars = function (abc, opts) {
    opts = opts || {};
    var key = P.parseKey(opts.key), unit = 8 * fraction(opts.unit || '1/8') * TPQ;
    var s = clean(abc), i = 0, n = s.length;
    var bars = [], cur = null, barAcc = {};
    var pend = { start: false, section: true, ending: 0 }, activeEnding = 0;
    var tuplet = null, broken = 1, tie = false, lastNote = null, warnings = [];

    function bar() {
      if (!cur) {
        if (pend.ending) activeEnding = pend.ending;
        cur = { id: bars.length, notes: [], chords: [], text: '', len: 0,
                startRepeat: pend.start, section: pend.section, endRepeat: false,
                sectionEnd: false, ending: activeEnding };
        pend = { start: false, section: false, ending: 0 };
        barAcc = {};
      }
      return cur;
    }
    function close() { if (cur) { cur.text = cur.text.trim(); bars.push(cur); cur = null; } }

    function pitch(accTxt, letter, octs) {
      var up = letter.toUpperCase(), oct = letter === up ? 0 : 1;
      for (var k = 0; k < octs.length; k++) oct += octs[k] === "'" ? 1 : -1;
      var where = up + oct, off;
      if (accTxt) {
        off = { '^': 1, '^^': 2, '_': -1, '__': -2, '=': 0 }[accTxt];
        barAcc[where] = off;                     // lasts to the end of the bar
      } else if (barAcc[where] != null) {
        off = barAcc[where];
      } else {
        off = key.sig[up] || 0;
      }
      return 60 + STEPS[up] + 12 * oct + off;
    }

    function length(d1, slashes, d2) {
      var num = d1 ? +d1 : 1, den = 1;
      if (slashes) den = d2 ? +d2 : Math.pow(2, slashes.length);
      var dur = unit * num / den;
      if (tuplet) { dur *= tuplet.q / tuplet.p; if (--tuplet.left <= 0) tuplet = null; }
      dur *= broken; broken = 1;
      return dur;
    }

    // After a note: a dotted pair (A>B, A<B) changes this note and the next.
    function brokenAfter(note) {
      var m = /^\s*(>+|<+)/.exec(s.slice(i));
      if (!m) return;
      var k = m[1].length, short = 1 / Math.pow(2, k);
      if (m[1][0] === '>') { note.dur = note.dur / 1 * (2 - short); broken = short; }
      else { note.dur = note.dur * short; broken = 2 - short; }
      // the shift changes where the next note falls
      var b = bar(); b.len = note.tick + note.dur;
      i += m[0].length;
    }

    function addNote(midi, dur, raw) {
      var b = bar();
      b.text += raw;
      if (tie && lastNote && lastNote.midi === midi) {       // tied: one longer note
        lastNote.dur += dur; b.len += dur; tie = false;
        return null;
      }
      tie = false;
      var note = { tick: b.len, dur: dur, midi: midi };
      b.notes.push(note); b.len += dur; lastNote = note;
      return note;
    }

    while (i < n) {
      var c = s[i], rest = s.slice(i), m;

      if (c === ' ' || c === '\t' || c === '`' || c === '\\') { if (cur) cur.text += ' '; i++; continue; }

      if (c === '"') {                                     // "G" chord symbol, or a note to the player
        var j = s.indexOf('"', i + 1); if (j < 0) j = n;
        var txt = s.slice(i + 1, j).trim();
        if (P.isChordName(txt)) bar().chords.push({ tick: bar().len, name: txt });
        i = j + 1; continue;
      }
      if (c === '{') { var g = s.indexOf('}', i); i = g < 0 ? n : g + 1; continue; }   // grace notes: left out

      // Bar lines: | || |] [| |: :| :: and endings |1 :|2 [1
      m = /^(:*)(\[\||\|\]|\|\||\|)(:*)\s*(?:\[?([1-9])(?:[,\-][1-9])*)?/.exec(rest) ||
          /^(::+)()()/.exec(rest);
      if (m && (m[2] || m[1].length >= 2)) {
        var last = cur || bars[bars.length - 1];
        var thick = m[2] === '||' || m[2] === '|]' || m[2] === '[|';
        var endRep = m[1].length > 0, startRep = m[3].length > 0 || (!m[2] && m[1].length >= 2);
        if (endRep && last) last.endRepeat = true;
        if (thick && last) last.sectionEnd = true;
        close();
        // A new repeat ends an ending too. Until Session Buddies 1.12.3 only an
        // end-repeat or a thick line did, so a second ending closed by a plain
        // bar line before |: marked the whole next part "ending 2", and it was
        // never played (Off To California #17, The Swallowtail #23).
        if (endRep || thick || startRep) activeEnding = 0;
        if (startRep) pend.start = true;
        if (thick) pend.section = true;
        if (m[4]) pend.ending = +m[4];
        i += m[0].length; continue;
      }
      // [1 written after a bar line, an inline field [K:Ador], or a chord [CEG]
      if (c === '[') {
        if ((m = /^\[([1-9])/.exec(rest))) { pend.ending = +m[1]; i += m[0].length; continue; }
        if ((m = /^\[([KLM]):([^\]]*)\]/.exec(rest))) {
          if (m[1] === 'K') key = P.parseKey(m[2]);
          else if (m[1] === 'L') unit = 8 * fraction(m[2]) * TPQ;
          else warnings.push('meter change ignored: ' + m[2]);
          i += m[0].length; continue;
        }
        var close2 = s.indexOf(']', i);
        if (close2 > i) {                                  // play the top note of a chord
          bar();
          var inner = s.slice(i + 1, close2), re = /([\^=_]{0,2})([A-Ga-g])([',]*)(\d*)(\/*)(\d*)/g, nm, top = null, first = null;
          while ((nm = re.exec(inner))) {
            var p = pitch(nm[1], nm[2], nm[3]);
            if (top == null || p > top) top = p;
            if (!first) first = nm;
          }
          i = close2 + 1;
          var after = /^(\d*)(\/*)(\d*)/.exec(s.slice(i)); i += after[0].length;
          if (top != null) {
            var dd = length(first[4], first[5], first[6]) * (after[0] ? lengthFactor(after) : 1);
            var nn = addNote(top, dd, '[' + inner + ']' + after[0]);
            if (s[i] === '-') { tie = true; i++; }
            if (nn) brokenAfter(nn);
          }
          continue;
        }
        i++; continue;
      }
      // (3 triplets, (p:q:r tuplets; a plain ( or ) is a slur
      if ((m = /^\((\d)(?::(\d)?)?(?::(\d))?/.exec(rest))) {
        var pp = +m[1], q = m[2] ? +m[2] : ({ 2: 3, 3: 2, 4: 3, 6: 2, 8: 3 }[pp] || 2);
        tuplet = { p: pp, q: q, left: m[3] ? +m[3] : pp };
        i += m[0].length; continue;
      }
      // A note or a rest
      if ((m = /^([\^=_]{0,2})([A-Ga-gzxZ])([',]*)(\d*)(\/*)(\d*)/.exec(rest)) && (m[2] || m[1])) {
        i += m[0].length;
        bar();                     // a new bar first: its accidentals start afresh
        if (m[2] === 'Z') { var bz = bar(); bz.len += P.meter(opts.meter).bar * (m[4] ? +m[4] : 1); continue; }
        var dur = length(m[4], m[5], m[6]);
        if (m[2] === 'z' || m[2] === 'x') {
          var br = bar(); br.text += m[0]; br.len += dur; lastNote = null; tie = false;
          continue;
        }
        var note = addNote(pitch(m[1], m[2], m[3]), dur, m[0]);
        if (s[i] === '-') { tie = true; i++; }
        if (note) brokenAfter(note);
        continue;
      }
      // Decorations (~ roll, . staccato, letters like T for trill) and slurs: left out.
      if ('~.()HLMOPSTuv-'.indexOf(c) !== -1) { if (cur && c === '~') cur.text += c; i++; continue; }
      i++;                                                 // anything else: skip it
    }
    close();
    bars = bars.filter(function (b, k) {                    // drop bars with nothing in them
      if (b.len > 0) return true;
      var next = bars[k + 1];
      if (next) {                                          // but keep what they marked
        next.startRepeat = next.startRepeat || b.startRepeat;
        next.section = next.section || b.section;
      }
      if (b.endRepeat && bars[k - 1]) bars[k - 1].endRepeat = true;
      return false;
    });
    bars.forEach(function (b, k) { b.id = k; });
    bars.warnings = warnings;
    return bars;
  };

  function fraction(t) {
    var m = /^\s*(\d+)\s*\/\s*(\d+)/.exec(t || '1/8');
    return m ? +m[1] / +m[2] : 1 / 8;
  }
  function lengthFactor(m) {
    var num = m[1] ? +m[1] : 1, den = 1;
    if (m[2]) den = m[3] ? +m[3] : Math.pow(2, m[2].length);
    return num / den;
  }

  /* The order the written bars are played in, repeats and endings taken. A
   * :| with no |: before it goes back to wherever the last repeat ended, or
   * the last double bar, or the top: the Swallowtail's B part is written
   * "…:| efg a2b|…|cBA A2d:|" and repeats from its own first bar. */
  P.unroll = function (bars) {
    var order = [], i = 0, repStart = 0, pass = 1, back = false, guard = 0;
    while (i < bars.length && guard++ < bars.length * 4) {
      var b = bars[i];
      if (!back && (b.startRepeat || b.section)) { repStart = i; pass = 1; }
      back = false;
      if (b.ending && b.ending !== pass) { i++; continue; }
      order.push(i);
      if (b.endRepeat && pass === 1) { pass = 2; i = repStart; back = true; continue; }
      if (b.endRepeat) { pass = 1; repStart = i + 1; }
      i++;
    }
    return order;
  };

  /* The tune as played once through, bar by bar against the meter.
   * A tune that starts on a pickup has its first downbeat at tick 0 and the
   * pickup before it. Each played bar is tied to a "slot": the written bar
   * its downbeat falls in, so a bar that comes round again in a repeat is the
   * same slot, and a chord set for it is set for every time it is played.
   *
   * Returns { bars (written), order, meter, key, pickup: [notes], length,
   *   timeline: [{ k, slot, written, notes: [{ tick, dur, midi }] }],
   *   slots: [{ id, written, part, ending, text }] } in first-heard order. */
  P.layout = function (abc, opts) {
    var bars = P.readBars(abc, opts), order = P.unroll(bars), meter = P.meter(opts.meter);
    var L = meter.bar, t = 0;
    if (order.length > 1 && bars[order[0]].len < L) t = -bars[order[0]].len;   // a pickup
    var notes = [], downs = [];
    order.forEach(function (idx) {
      var b = bars[idx];
      b.notes.forEach(function (nt) { notes.push({ tick: t + nt.tick, dur: nt.dur, midi: nt.midi, written: idx }); });
      b.chords.forEach(function (ch) { downs.push({ chordAt: t + ch.tick, name: ch.name }); });
      for (var k = Math.ceil(t / L); k * L < t + b.len; k++) {
        if (k >= 0) downs.push({ k: k, slot: idx + '@' + (k * L - t), written: idx });
      }
      t += b.len;
    });
    var count = Math.ceil(t / L), timeline = [];
    for (var k = 0; k < count; k++) timeline.push({ k: k, slot: null, written: null, notes: [], marks: [] });
    downs.forEach(function (d) {
      if (d.k != null && timeline[d.k] && timeline[d.k].slot == null) {
        timeline[d.k].slot = d.slot; timeline[d.k].written = d.written;
      }
    });
    timeline.forEach(function (tb, k) {                    // a bar with no downbeat of its own
      if (tb.slot == null) { tb.slot = 'end@' + k; tb.written = timeline[k - 1] ? timeline[k - 1].written : 0; }
    });
    var pickup = [];
    notes.forEach(function (nt) {
      if (nt.tick < 0) { pickup.push({ tick: nt.tick, dur: nt.dur, midi: nt.midi }); return; }
      var k = Math.floor(nt.tick / L);
      if (timeline[k]) timeline[k].notes.push({ tick: nt.tick - k * L, dur: nt.dur, midi: nt.midi });
    });
    // Chord symbols in the setting, if it has any: where each one starts.
    var symbols = downs.filter(function (d) { return d.chordAt != null; })
                       .map(function (d) { return { tick: d.chordAt, name: d.name }; });

    // Parts: a new part where a written bar opens a repeat or follows a
    // double bar. The pickup into a part belongs to it.
    var partOf = [], part = -1;
    bars.forEach(function (b, k) {
      if (k === 0 || b.startRepeat || b.section) part++;
      partOf.push(Math.max(0, part));
    });
    var seen = {}, slots = [], firstPart = {}, nParts = 0;
    timeline.forEach(function (tb) {
      var pt = partOf[tb.written] || 0;            // parts lettered in the order heard
      if (firstPart[pt] == null) firstPart[pt] = nParts++;
    });
    timeline.forEach(function (tb) {
      if (seen[tb.slot]) return;
      seen[tb.slot] = true;
      var wb = bars[tb.written] || {}, prev = bars[tb.written - 1];
      slots.push({ id: tb.slot, written: tb.written, part: firstPart[partOf[tb.written] || 0],
                   ending: wb.ending && (!prev || prev.ending !== wb.ending) ? wb.ending : 0,
                   text: wb.text || '' });
    });
    return { bars: bars, order: order, meter: meter, key: P.parseKey(opts.key), length: t,
             pickup: pickup, timeline: timeline, slots: slots, symbols: symbols,
             warnings: bars.warnings };
  };
})(window.BUDDIES = window.BUDDIES || {});
