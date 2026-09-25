/* patterns.js — tune types and bodhrán rhythm banks.
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
      blurb: 'Driving quavers, weight on 1 and 3. The session workhorse.',
      grids: {
        // The extra tak on the and-of-4 is the lift that throws a reel into the
        // next bar. It also breaks the two halves apart, where four flat
        // crotchets just ticked. Being an offbeat, it answers the swing slider.
        simple: ['D-t-D-tt'],
        sparse: ['D-t-D-t-', 'D-t-D-tt', 'D-t-d-t-'],
        core:   ['DtdtDtdt', 'DtdtDt-t', 'DtdtDttt', 'D-dtDtdt'],
        busy:   ['Dgt-dgt-Dgt-dtdt', 'Dtdgdtd-Dtdgdtdt', 'DtdtDtdtDtdgdtdt'],
        fills:  ['D-t-dgt-D-t-dtDt', 'DtdtDtdtD-t-dtTt', 'Dgt-dgt-DtdtdtDt']
      }
    },
    {
      id: 'jig', name: 'Jig', meter: '6/8', beatsPerBar: 2,
      beatUnit: 'dotted crotchet', defaultBpm: 120, bpmRange: [60, 160], swing: 0,
      blurb: 'Two lilting groups of three. Down on 1, up on 3.',
      grids: {
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
      blurb: 'A jig with a third group tacked on — three lots of three.',
      grids: {
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
      blurb: 'Short, punchy bars. Sliabh Luachra bounce — hit 1 hard.',
      grids: {
        simple: ['D-t-'],
        sparse: ['D-t-', 'D-Dt'],
        core:   ['DtDt', 'DtD-', 'DtdT'],
        busy:   ['D-t-Dgtt', 'DtdtD-tt', 'DgttD-tt'],
        fills:  ['D-t-DtDt', 'DtdtDttt', 'D-ttDtdt']
      }
    },
    {
      id: 'hornpipe', name: 'Hornpipe', meter: '4/4', beatsPerBar: 4,
      beatUnit: 'crotchet', defaultBpm: 88, bpmRange: [60, 130], swing: 0.62,
      blurb: 'Swung quavers and a bit of swagger. Slower than a reel.',
      grids: {
        simple: ['D-t-D-t-'],
        sparse: ['D-t-D-t-'],
        core:   ['DtdtDtdt', 'DtdtDt-t', 'DtDtDtdt'],
        busy:   ['DtdtDtdtDtdtDt-t'],
        fills:  ['D-t-d-t-D-t-dtDt', 'DtdtDtdtDtdtDtTt']
      }
    },
    {
      id: 'slide', name: 'Slide', meter: '12/8', beatsPerBar: 4,
      beatUnit: 'dotted crotchet', defaultBpm: 128, bpmRange: [60, 175], swing: 0,
      blurb: 'Long rolling 12/8 bars — a jig that keeps going.',
      grids: {
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
      blurb: 'Bass on 1, two lighter taps after it.',
      grids: {
        simple: ['D-t-t-'],
        sparse: ['D-t-t-'],
        core:   ['D-tdt-', 'D-t-tt', 'Ddtdtd'],
        busy:   ['D-t-d-t-d-t-', 'D-t-dtd-t-dt'],
        fills:  ['D--t--t-dtdt', 'D-t-d-t-dtDt']
      }
    },
    {
      id: 'march', name: 'March', meter: '4/4', beatsPerBar: 4,
      beatUnit: 'crotchet', defaultBpm: 100, bpmRange: [60, 150], swing: 0,
      blurb: 'Square and stepping. Good for slow practice too.',
      grids: {
        // DUM, rest, ta-ta: the drum-corps figure, square and stepping.
        simple: ['D-ttD-tt'],
        sparse: ['D-t-D-t-'],
        core:   ['D-ttD-tt', 'DtdtD-tt', 'D-ttDtdt'],
        busy:   ['D-t-dtd-D-t-dtd-'],
        fills:  ['D-t-d-t-D-t-dtdt', 'D-ttD-ttD-t-dtDt']
      }
    },
    {
      id: 'barndance', name: 'Barndance', meter: '4/4', beatsPerBar: 4,
      beatUnit: 'crotchet', defaultBpm: 92, bpmRange: [60, 130], swing: 0.45,
      blurb: 'Lightly swung and relaxed — cousin to the hornpipe.',
      grids: {
        // Taks sit on the offbeats, so the tune's 45% swing drags them late.
        // Beat 3 is a soft dum: the pulse is there, it just is not pushing.
        simple: ['D--td--t'],
        sparse: ['D-t-D-t-'],
        core:   ['DtdtDt-t', 'DtdtDtdt'],
        busy:   ['DtdtDtdtDtd-dtdt'],
        fills:  ['D-t-d-t-D-t-dtDt']
      }
    },
    {
      id: 'mazurka', name: 'Mazurka', meter: '3/4', beatsPerBar: 3,
      beatUnit: 'crotchet', defaultBpm: 120, bpmRange: [60, 170], swing: 0,
      blurb: 'Three-time with the weight thrown onto beat 2.',
      grids: {
        simple: ['d-T-t-'],
        sparse: ['d-T-t-'],
        core:   ['ddT-td', 'd-T-tt', 'dtT-t-'],
        busy:   ['d-t-T-t-d-t-'],
        fills:  ['d-T-t-d-tdtd']
      }
    }
  ];

  /* Relative loudness of each grid character. */
  var VELOCITY = { D: 1.0, d: 0.58, T: 0.86, t: 0.46, g: 0.27, '-': 0 };

  /* Which synth voice each character uses. */
  var VOICE = { D: 'bass', d: 'bass', T: 'treble', t: 'treble', g: 'ghost' };

  /* One bass hit per beat, every one identical: no tak, no accent pattern,
   * nothing to follow but the pulse. The grid has exactly one slot per beat,
   * so it lands on the same beat the tempo is counted in. */
  function pulseGrid(tune) {
    return new Array(tune.beatsPerBar + 1).join('D');
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
