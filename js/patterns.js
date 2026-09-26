/* patterns.js — tune types and bodhrán rhythm banks.
 *
 * THE RULE THAT SHAPES ALL OF THESE: a bodhrán tipper oscillates. Down strokes
 * land on the beats and produce the low "dum"; up strokes land between the
 * beats and produce the brighter "tak". So the bright sound belongs OFF the
 * pulse. Putting it on beats 2 and 4 gives you a rock backbeat played on a
 * bodhrán, which is what these banks used to do. Irish music has no backbeat:
 * the weight follows the dance — 1 and 3 in a reel, 1 and 4 in a jig, 1 in a
 * waltz, 2 in a mazurka — and it is carried by a harder down stroke, not by
 * switching to a different sound.
 *
 * A "grid" is a string. Each character is one evenly-spaced slot in a bar, so
 * the string's length sets the resolution:
 *   6  chars in 6/8  -> quaver grid
 *   12 chars in 6/8  -> semiquaver grid, room for rolls
 * Grid length must divide evenly by beatsPerBar.
 *
 * Characters:
 *   D  accented bass  "dum"  – butt of the tipper into the middle of the skin
 *   d  bass, unaccented
 *   T  accented treble "tak" – tip of the tipper up near the rim
 *   t  treble, unaccented
 *   g  ghost                 – a brush, felt more than heard
 *   -  rest
 */
(function (TRAD) {
  'use strict';

  var TUNES = [
    {
      id: 'reel', name: 'Reel', meter: '4/4', beatsPerBar: 4,
      beatUnit: 'crotchet', defaultBpm: 112, bpmRange: [60, 160], swing: 0,
      blurb: 'Continuous down-up quavers, leaning on 1 and 3.',
      grids: {
        pulse:  ['DdDd'],
        simple: ['DtdtDtdt'],
        sparse: ['D-d-D-d-', 'Dtdtdtdt'],
        core:   ['DtdtDtdt', 'DtdtDtd-', 'D-dtDtdt', 'Dtd-Dtdt'],
        busy:   ['Dgt-dgt-Dgt-dtdt', 'Dtdgdtd-Dtdgdtdt', 'DtdtDtdtDtdgdtdt'],
        fills:  ['D-t-dgt-D-t-dtDt', 'DtdtDtdtD-t-dtTt', 'Dgt-dgt-DtdtdtDt']
      }
    },
    {
      id: 'jig', name: 'Jig', meter: '6/8', beatsPerBar: 2,
      beatUnit: 'dotted crotchet', defaultBpm: 120, bpmRange: [60, 160], swing: 0,
      blurb: 'Two lilting groups of three. Down on 1, up on 3.',
      grids: {
        pulse:  ['Dd'],
        simple: ['D-tD-t'],
        sparse: ['D-tD-t', 'D--D-t'],
        core:   ['DtdDtd', 'D-tDtd', 'DttDtt', 'DtdD-t'],
        busy:   ['Dgtdt-Dgtdt-', 'Dt-td-Dt-tdg', 'D-t-d-Dt-tdt'],
        fills:  ['Dgt-d-D-tdtd', 'D-t-d-Dtdtdt', 'Dt-td-D-tdDt']
      }
    },
    {
      id: 'slipjig', name: 'Slip jig', meter: '9/8', beatsPerBar: 3,
      beatUnit: 'dotted crotchet', defaultBpm: 118, bpmRange: [60, 160], swing: 0,
      blurb: 'A jig with a third group tacked on \u2014 three lots of three.',
      grids: {
        pulse:  ['Ddd'],
        simple: ['D-tD-tD-t'],
        sparse: ['D-tD-tD-t'],
        core:   ['DtdDtdDtd', 'D-tDtdD-t', 'DttD-tDtt'],
        busy:   ['D-t-d-D-t-d-D-tdtd', 'Dt-td-Dt-td-Dt-td-'],
        fills:  ['D-t-d-D-t-d-D-tdtd', 'D-t-d-D-tdtdD-tdtd']
      }
    },
    {
      id: 'polka', name: 'Polka', meter: '2/4', beatsPerBar: 2,
      beatUnit: 'crotchet', defaultBpm: 132, bpmRange: [60, 190], swing: 0,
      blurb: 'Short, punchy bars. Sliabh Luachra bounce \u2014 hit 1 hard.',
      grids: {
        pulse:  ['Dd'],
        simple: ['Dtdt'],
        sparse: ['D-d-', 'Dtd-'],
        core:   ['DtDt', 'Dtdt', 'DtdT'],
        busy:   ['D-t-D-tt', 'DtdtD-tt', 'D-ttD-tt'],
        fills:  ['D-t-DtDt', 'DtdtDttt', 'D-ttDtdt']
      }
    },
    {
      id: 'hornpipe', name: 'Hornpipe', meter: '4/4', beatsPerBar: 4,
      beatUnit: 'crotchet', defaultBpm: 88, bpmRange: [60, 130], swing: 0.62,
      blurb: 'Swung quavers and a bit of swagger. Slower than a reel.',
      grids: {
        pulse:  ['DdDd'],
        simple: ['DtdtDtdt'],
        sparse: ['D-d-D-d-', 'Dtdtdtdt'],
        core:   ['DtdtDtdt', 'DtdtDtd-', 'DtDtDtdt'],
        busy:   ['DtdtDtdtDtdtDtd-'],
        fills:  ['D-t-d-t-D-t-dtDt', 'DtdtDtdtDtdtDtdt']
      }
    },
    {
      id: 'slide', name: 'Slide', meter: '12/8', beatsPerBar: 4,
      beatUnit: 'dotted crotchet', defaultBpm: 128, bpmRange: [60, 175], swing: 0,
      blurb: 'Long rolling 12/8 bars \u2014 a jig that keeps going.',
      grids: {
        pulse:  ['DdDd'],
        simple: ['D-tD-tD-tD-t'],
        sparse: ['D-tD-tD-tD-t'],
        core:   ['DtdD-tDtdD-t', 'DtdDtdDtdDtd', 'DttD-tDttD-t'],
        busy:   ['D-t-d-D-tdtdD-t-d-D-tdtd'],
        fills:  ['DtdD-tDtdD-tD-t-d-D-tdtd']
      }
    },
    {
      id: 'waltz', name: 'Waltz', meter: '3/4', beatsPerBar: 3,
      beatUnit: 'crotchet', defaultBpm: 116, bpmRange: [60, 180], swing: 0,
      blurb: 'Three even beats, the weight sitting on the first.',
      grids: {
        pulse:  ['Ddd'],
        simple: ['Dtdtdt'],
        sparse: ['D-d-d-', 'Dtd-d-'],
        core:   ['Dtdtdt', 'Dtd-dt', 'DtdtdT'],
        busy:   ['D-t-d-t-d-t-', 'Dtd-dtd-dtd-'],
        fills:  ['D--t--t-dtdt', 'D-t-d-t-dtDt']
      }
    },
    {
      id: 'march', name: 'March', meter: '4/4', beatsPerBar: 4,
      beatUnit: 'crotchet', defaultBpm: 100, bpmRange: [60, 150], swing: 0,
      blurb: 'Every beat weighted. Square and stepping.',
      grids: {
        pulse:  ['DdDd'],
        simple: ['DtDtDtDt'],
        sparse: ['D-D-D-D-', 'DtD-DtD-'],
        core:   ['DtDtDtDt', 'DtdtDtDt', 'DtD-DtDt'],
        busy:   ['D-t-dtd-D-t-dtd-'],
        fills:  ['D-t-d-t-D-t-dtdt', 'DtDtDtDtD-t-dtDt']
      }
    },
    {
      id: 'barndance', name: 'Barndance', meter: '4/4', beatsPerBar: 4,
      beatUnit: 'crotchet', defaultBpm: 92, bpmRange: [60, 130], swing: 0.45,
      blurb: 'Lightly swung and in no hurry \u2014 cousin to the hornpipe.',
      grids: {
        pulse:  ['DdDd'],
        simple: ['Dtdtdtdt'],
        sparse: ['D-d-d-d-', 'Dtd-dtd-'],
        core:   ['Dtdtdtdt', 'Dtdtdtd-', 'Dtd-dtdt'],
        busy:   ['DtdtDtdtDtd-dtdt'],
        fills:  ['D-t-d-t-D-t-dtDt']
      }
    },
    {
      id: 'mazurka', name: 'Mazurka', meter: '3/4', beatsPerBar: 3,
      beatUnit: 'crotchet', defaultBpm: 120, bpmRange: [60, 170], swing: 0,
      blurb: 'Three-time with the weight thrown onto beat 2.',
      grids: {
        pulse:  ['dDd'],
        simple: ['dtDtdt'],
        sparse: ['d-D-d-', 'dtD-d-'],
        core:   ['dtDtdt', 'dtDtd-', 'ddDtdt'],
        busy:   ['d-t-D-t-d-t-', 'dtd-Dtd-dtd-'],
        fills:  ['d-t-D-t-dtdt', 'dtd-Dtd-dtdt']
      }
    }
  ];

  /* Relative loudness of each grid character. */
  var VELOCITY = { D: 1.0, d: 0.58, T: 0.86, t: 0.46, g: 0.27, '-': 0 };

  /* Which synth voice each character uses. */
  var VOICE = { D: 'bass', d: 'bass', T: 'treble', t: 'treble', g: 'ghost' };

  /* The bare pulse: one hit per beat, all of them down strokes on the low
   * drum, no tak anywhere. One character per beat, so it lands on the beat the
   * tempo is counted in. What it is not is four identical thuds a bar — that
   * is a disco kick. Even stripped this far, a trad bar has a shape, so the
   * weight sits where the dance puts it: 1 and 3 in a reel, 1 in a waltz,
   * 2 in a mazurka. */
  function pulseGrid(tune) {
    return tune.grids.pulse[0];
  }

  function byId(id) {
    for (var i = 0; i < TUNES.length; i++) if (TUNES[i].id === id) return TUNES[i];
    return TUNES[0];
  }

  /* Warn loudly in the console if a grid does not line up with the meter. */
  function validate() {
    var problems = [];
    TUNES.forEach(function (tune) {
      Object.keys(tune.grids).forEach(function (bank) {
        tune.grids[bank].forEach(function (grid) {
          if (grid.length % tune.beatsPerBar !== 0) {
            problems.push(tune.id + '/' + bank + ': "' + grid + '" is ' + grid.length +
                          ' slots, not divisible by ' + tune.beatsPerBar + ' beats');
          }
          for (var i = 0; i < grid.length; i++) {
            if (!(grid[i] in VELOCITY)) {
              problems.push(tune.id + '/' + bank + ': unknown character "' + grid[i] + '"');
            }
          }
        });
      });
    });
    if (problems.length) console.error('[patterns] ' + problems.join('\n[patterns] '));
    return problems;
  }

  /* The `simple` bank holds exactly one grid per tune: the plain, steady
   * figure for that style. It is never picked by the weighting below — the
   * transport reaches for it directly when simple mode is on. */

  /* Choose a bar's grid.
   * complexity 0..1 slides the weighting from sparse -> core -> busy.
   * Sticking with lastGrid some of the time keeps it from twitching every bar. */
  function pickGrid(tune, complexity, phraseEnd, lastGrid, rng) {
    var g = tune.grids;
    if (phraseEnd && g.fills.length && rng() < 0.2 + 0.55 * complexity) {
      return g.fills[(rng() * g.fills.length) | 0];
    }
    if (lastGrid && !phraseEnd && rng() < 0.45) return lastGrid;

    var weights = [
      { bank: g.sparse, w: Math.max(0, 1 - 2 * complexity) },
      { bank: g.core,   w: Math.max(0.25, 1 - Math.abs(complexity - 0.5)) },
      { bank: g.busy,   w: Math.max(0, 2 * complexity - 1) }
    ].filter(function (x) { return x.bank.length && x.w > 0; });

    var total = weights.reduce(function (s, x) { return s + x.w; }, 0);
    var roll = rng() * total;
    for (var i = 0; i < weights.length; i++) {
      roll -= weights[i].w;
      if (roll <= 0) return weights[i].bank[(rng() * weights[i].bank.length) | 0];
    }
    return g.core[0];
  }

  /* Swing as a piecewise-linear remap of position-within-beat.
   * Works at any grid resolution: the quaver offbeat lands on `pivot`,
   * everything either side is stretched to match. */
  function swingShift(fractionOfBeat, swing) {
    if (!swing) return 0;
    var pivot = 0.5 + swing / 6;      // swing 1.0 -> 0.667, a full triplet feel
    var moved = fractionOfBeat < 0.5
      ? fractionOfBeat * (pivot / 0.5)
      : pivot + (fractionOfBeat - 0.5) * ((1 - pivot) / 0.5);
    return moved - fractionOfBeat;
  }

  TRAD.tunes = TUNES;
  TRAD.tuneById = byId;
  TRAD.pickGrid = pickGrid;
  TRAD.pulseGrid = pulseGrid;
  TRAD.swingShift = swingShift;
  TRAD.VELOCITY = VELOCITY;
  TRAD.VOICE = VOICE;
  TRAD.validatePatterns = validate;
})(window.TRAD = window.TRAD || {});
