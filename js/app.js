/* app.js — UI wiring. */
(function (TRAD) {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  /* The app's version, shown in the header and at the foot of the About.
   * Bump it with every change that gets pushed: the last number for a fix,
   * the middle one for a new feature. It is also the quickest way to tell
   * whether a phone is running the latest deploy or an older copy. */
  var VERSION = '1.0.3';
  TRAD.VERSION = VERSION;

  TRAD.validatePatterns();

  var ctx = null, bodhran = null, drone = null, transport = null;
  var midi = new TRAD.MidiOut();
  var tune = TRAD.tunes[0];
  var cells = [];
  var settings = load();

  /* ---------- persistence ---------- */
  function load() {
    try { return JSON.parse(localStorage.getItem('bodhran.settings') || '{}'); }
    catch (e) { return {}; }
  }
  function save() {
    try {
      localStorage.setItem('bodhran.settings', JSON.stringify(settings));
    } catch (e) { /* private window, or storage blocked — not worth reporting */ }
  }
  function remember(key, value) { settings[key] = value; save(); }

  /* ---------- audio graph, built on first interaction ---------- */

  /* Get the audio running again if it has stopped. iOS parks it as
   * 'interrupted' — not 'suspended' — after a phone call, Siri or an alarm,
   * and it stays silent until something asks for it back. This used to check
   * for 'suspended' only, so after an interruption Play could stay silent
   * until the page was reloaded. */
  function wakeAudio() {
    if (ctx && ctx.state !== 'running' && ctx.state !== 'closed') {
      ctx.resume().catch(function () { /* needs a tap; Play will do it */ });
    }
  }

  function ensureAudio() {
    if (ctx) { wakeAudio(); return; }

    // On iPhone, web audio follows the ring/silent switch by default, so a
    // phone on silent — which is most phones at a session — plays nothing.
    // Declaring this as playback audio (Safari 17+) makes it ignore the switch.
    if (navigator.audioSession) {
      try { navigator.audioSession.type = 'playback'; } catch (e) {}
    }
    var AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC({ latencyHint: 'interactive' });

    var out = TRAD.makeOutput(ctx);   // ends in the limiter that stops clipping

    bodhran = new TRAD.Bodhran(ctx, out);
    drone = new TRAD.Drone(ctx, out);
    transport = new TRAD.Transport(ctx, bodhran, midi);
    transport.onBar = onBar;

    applyAll();
    requestAnimationFrame(frame);
  }

  /* Push every control value into the audio side. */
  function applyAll() {
    if (!transport) return;
    transport.tune = tune;
    transport.bpm = +$('bpm').value;
    transport.complexity = +$('complexity').value;
    transport.mode = mode;
    transport.humanize = +$('humanize').value;
    transport.phraseLength = +$('phrase').value;
    transport.countInBars = +$('countin').value;
    transport.swingOverride = swingOverride();
    bodhran.setLevel(+$('level').value);
    bodhran.setRoom(+$('room').value);
    bodhran.tuning = +$('tuning').value;
    bodhran.tone = +$('tone').value;
    drone.setLevel(+$('drone-level').value);
  }

  // The swing slider sits at 0 by default, meaning "whatever the tune wants".
  // Only once it's moved does it take over.
  var swingTouched = false;
  function swingOverride() { return swingTouched ? +$('swing').value : null; }

  /* ---------- tune chips ---------- */
  function buildChips() {
    var host = $('tunes');
    TRAD.tunes.forEach(function (t) {
      var b = document.createElement('button');
      b.className = 'chip';
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(t.id === tune.id));
      b.dataset.id = t.id;
      b.innerHTML = t.name + '<span class="meter">' + t.meter + '</span>';
      b.addEventListener('click', function () { selectTune(t.id); });
      host.appendChild(b);
    });
  }

  function selectTune(id) {
    tune = TRAD.tuneById(id);
    remember('tune', id);

    Array.prototype.forEach.call($('tunes').children, function (c) {
      c.setAttribute('aria-checked', String(c.dataset.id === id));
    });
    $('tune-blurb').textContent = tune.blurb;
    $('beat-unit').textContent = 'per ' + tune.beatUnit;

    var bpmEl = $('bpm');
    bpmEl.min = tune.bpmRange[0];
    bpmEl.max = tune.bpmRange[1];
    // Come back to the tempo you last used for this tune type; the default is
    // only for the first visit. (setBpm saves as it goes, so going straight to
    // the default here used to overwrite the tempo it should have restored.)
    var saved = settings['bpm_' + id];
    setBpm(saved != null ? saved : tune.defaultBpm);

    swingTouched = false;
    $('swing').value = tune.swing;
    $('swing-out').textContent = tune.swing
      ? 'tune default (' + Math.round(tune.swing * 100) + '%)'
      : 'tune default (straight)';

    if (transport) { transport.tune = tune; transport.swingOverride = null; }
    renderGrid(idleGrid());
  }

  /* What to show in the bar display when nothing is playing. */
  function idleGrid() {
    if (mode === 'pulse') return TRAD.pulseGrid(tune);
    if (mode === 'simple') return tune.grids.simple[0];
    return tune.grids.core[0];
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  /* ---------- tempo ---------- */
  function setBpm(v) {
    v = clamp(Math.round(v), +$('bpm').min, +$('bpm').max);
    $('bpm').value = v;
    $('bpm-num').value = v;
    if (transport) transport.bpm = v;
    remember('bpm_' + tune.id, v);
  }

  var taps = [];
  function tapTempo() {
    var now = performance.now();
    // More than two seconds since the last tap means you've started over.
    if (taps.length && now - taps[taps.length - 1] > 2000) taps = [];
    taps.push(now);
    if (taps.length > 5) taps.shift();
    if (taps.length < 2) return;
    var span = taps[taps.length - 1] - taps[0];
    setBpm(60000 / (span / (taps.length - 1)));
  }

  /* ---------- bar visualiser ---------- */
  function renderGrid(grid) {
    var host = $('grid');
    host.innerHTML = '';
    cells = [];
    var slotsPerBeat = grid.length / tune.beatsPerBar;
    for (var i = 0; i < grid.length; i++) {
      var ch = grid[i];
      var el = document.createElement('div');
      var kind = ch === '-' ? 'rest' : (ch === 'g' ? 'ghost' : ch);
      el.className = 'cell ' + kind + (i % slotsPerBeat === 0 ? ' beat' : '');
      host.appendChild(el);
      cells.push(el);
    }
  }

  function onBar(grid, bar, countIn) {
    renderGrid(grid);
    // The bar counter is absolute; show it as a position within the phrase.
    var n = transport.phraseLength;
    $('bar-count').textContent = countIn ? 'count-in'
      : n ? 'bar ' + ((bar % n) + 1) + ' of ' + n
          : 'bar ' + (bar + 1);
  }

  function frame() {
    requestAnimationFrame(frame);
    if (!transport || !transport.running) return;
    var due = transport.due();
    for (var i = 0; i < due.length; i++) {
      var ev = due[i];
      var cell = cells[ev.slot];
      if (cell && cells.length === ev.len) {
        cell.classList.add('on');
        (function (c) { setTimeout(function () { c.classList.remove('on'); }, 90); })(cell);
      }
      if (ev.char === 'D' || ev.char === 'C') flashPlay();
    }
  }

  var flashTimer = null;
  function flashPlay() {
    var b = $('play');
    b.classList.add('hit');
    clearTimeout(flashTimer);
    flashTimer = setTimeout(function () { b.classList.remove('hit'); }, 110);
  }

  /* ---------- screen wake lock ---------- */
  // A locked phone screen stops the audio, so hold the screen on while playing.
  var wakeLock = null;
  function holdScreen() {
    if (wakeLock || !navigator.wakeLock) return;
    navigator.wakeLock.request('screen').then(function (lock) {
      wakeLock = lock;
      lock.addEventListener('release', function () { wakeLock = null; });
    }).catch(function () { /* refused or unsupported; nothing to do */ });
  }
  function releaseScreen() {
    if (wakeLock) wakeLock.release();
    wakeLock = null;
  }
  // The browser drops the lock whenever the page is hidden; take it back when
  // the page comes back if the drum is still going.
  // Coming back to the page is also when to wake audio an interruption parked.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && transport && transport.running) {
      wakeAudio();
      holdScreen();
    }
  });

  /* ---------- play / stop ---------- */
  function toggle() {
    ensureAudio();
    transport.toggle();
    if (transport.running) holdScreen(); else releaseScreen();
    var b = $('play');
    b.classList.toggle('playing', transport.running);
    b.setAttribute('aria-pressed', String(transport.running));
    b.querySelector('.play-label').textContent = transport.running ? 'Stop' : 'Play';
    if (!transport.running) {
      $('bar-count').textContent = '—';
      renderGrid(idleGrid());
    }
  }



  var mode = 'full';

  var MODE_TEXT = {
    full:   'Patterns change bar to bar, with a fill at the end of each phrase.',
    simple: 'One steady figure for the style. Same bar every bar, no fills.',
    pulse:  'Low drum only, one hit per beat, weighted where the dance falls. ' +
            'No tak, nothing to follow but the pulse.'
  };

  /* A mode that overrides a control should grey it out rather than leave a
   * slider on screen doing nothing. Pulse puts every hit on a beat, and swing
   * only shifts offbeats, so swing is dead there too. */
  function applyMode(next) {
    mode = next;
    if (transport) transport.mode = mode;

    Array.prototype.forEach.call($('modes').children, function (b) {
      b.setAttribute('aria-checked', String(b.dataset.mode === mode));
    });
    $('mode-desc').textContent = MODE_TEXT[mode];

    var off = { complexity: mode !== 'full', phrase: mode !== 'full',
                swing: mode === 'pulse', humanize: mode === 'pulse' };
    Object.keys(off).forEach(function (id) {
      $(id).disabled = off[id];
      $(id).closest('label').classList.toggle('is-off', off[id]);
    });

    remember('mode', mode);
    if (!transport || !transport.running) renderGrid(idleGrid());
  }

  /* ---------- about ---------- */
  // The tune list is generated from the pattern data rather than written out
  // by hand, so it cannot drift when a tune type is added or re-tuned.
  function buildAbout() {
    var host = $('about-tunes');
    if (host.childElementCount) return;   // build once

    var patterns = 0;
    TRAD.tunes.forEach(function (t) {
      Object.keys(t.grids).forEach(function (bank) { patterns += t.grids[bank].length; });

      var row = document.createElement('div');
      row.className = 'tune-row';

      var n = document.createElement('span');
      n.className = 'n';
      n.textContent = t.name;

      var m = document.createElement('span');
      m.className = 'm';
      m.textContent = t.meter + ' \u00b7 ' + t.defaultBpm + ' bpm per ' + t.beatUnit +
                      ' (' + t.bpmRange[0] + '\u2013' + t.bpmRange[1] + ')';

      var b = document.createElement('span');
      b.className = 'b';
      b.textContent = t.blurb;

      row.appendChild(n); row.appendChild(m); row.appendChild(b);
      host.appendChild(row);
    });

    $('about-count').textContent = patterns + ' rhythm patterns across ' +
      TRAD.tunes.length + ' tune types. Tempos below are the defaults; each has ' +
      'its own sensible range.';
  }

  function wireAbout() {
    var dlg = $('about');
    $('about-open').addEventListener('click', function () {
      buildAbout();
      dlg.showModal();
    });
    $('about-close').addEventListener('click', function () { dlg.close(); });
    // The dialog has no padding, so a click landing on the element itself is a
    // click on the backdrop rather than on the content.
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
  }

  /* ---------- wiring ---------- */
  function bindSlider(id, outId, format, onChange) {
    var el = $(id), out = $(outId);
    function update() {
      out.textContent = format(+el.value);
      if (onChange) onChange(+el.value);
      remember(id, +el.value);
    }
    el.addEventListener('input', update);
    update();
  }

  function pct(v) { return Math.round(v * 100) + '%'; }

  function init() {
    // Only ever decoration: an old cached page with this newer script has no
    // version slots, and that must not stop the rest of init — Play included.
    if ($('version')) $('version').textContent = 'v' + VERSION;
    if ($('about-version')) $('about-version').textContent = 'Version ' + VERSION;
    buildChips();

    $('play').addEventListener('click', toggle);
    $('tap').addEventListener('click', function () { tapTempo(); });
    $('bpm-up').addEventListener('click', function () { setBpm(+$('bpm').value + 5); });
    $('bpm-down').addEventListener('click', function () { setBpm(+$('bpm').value - 5); });
    $('bpm').addEventListener('input', function () { setBpm(+this.value); });
    $('bpm-num').addEventListener('change', function () { setBpm(+this.value); });

    bindSlider('complexity', 'complexity-out', function (v) {
      return v < 0.2 ? 'sparse' : v < 0.45 ? 'steady' : v < 0.7 ? 'even'
           : v < 0.88 ? 'busy' : 'flat out';
    }, function (v) { if (transport) transport.complexity = v; });

    bindSlider('humanize', 'humanize-out', pct,
      function (v) { if (transport) transport.humanize = v; });

    bindSlider('phrase', 'phrase-out', function (v) {
      return v === 0 ? 'never' : v + ' bars';
    }, function (v) { if (transport) transport.phraseLength = v; });

    bindSlider('level', 'level-out', pct,
      function (v) { if (bodhran) bodhran.setLevel(v); });

    bindSlider('tuning', 'tuning-out', function (v) { return v + ' Hz'; },
      function (v) { if (bodhran) bodhran.tuning = v; });

    bindSlider('tone', 'tone-out', function (v) {
      return v < 0.25 ? 'damped' : v < 0.45 ? 'warm' : v < 0.7 ? 'balanced'
           : v < 0.88 ? 'open' : 'bright';
    }, function (v) { if (bodhran) bodhran.tone = v; });

    bindSlider('room', 'room-out', pct,
      function (v) { if (bodhran) bodhran.setRoom(v); });

    bindSlider('drone-level', 'drone-level-out', pct,
      function (v) { if (drone) drone.setLevel(v); });

    $('swing').addEventListener('input', function () {
      swingTouched = true;
      $('swing-out').textContent = +this.value === 0 ? 'straight' : pct(+this.value);
      if (transport) transport.swingOverride = +this.value;
    });

    Array.prototype.forEach.call($('modes').children, function (b) {
      b.addEventListener('click', function () { applyMode(b.dataset.mode); });
    });

    $('countin').addEventListener('change', function () {
      if (transport) transport.countInBars = +this.value;
      remember('countin', this.value);
    });

    $('drone-on').addEventListener('change', function () {
      ensureAudio();
      if (this.checked) drone.start(+$('drone-root').value);
      else drone.stop();
      remember('droneOn', this.checked);
    });
    $('drone-root').addEventListener('change', function () {
      remember('droneRoot', this.value);
      if ($('drone-on').checked) { ensureAudio(); drone.start(+this.value); }
    });

    document.addEventListener('keydown', function (e) {
      // Leave keys alone where they already mean something: typing in a box,
      // ticking a checkbox, choosing from a menu, arrows on a slider. But a
      // slider has no use for Space, so after nudging the tempo Space still
      // starts and stops the drum — it used to do nothing until you clicked
      // somewhere else first.
      var t = e.target;
      var slider = t.tagName === 'INPUT' && t.type === 'range';
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName) &&
          !(slider && e.code === 'Space')) return;
      if ($('about').open) return;   // dialog owns the keyboard while it is up
      if (e.code === 'Space') { e.preventDefault(); toggle(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); setBpm(+$('bpm').value + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); setBpm(+$('bpm').value - 1); }
      else if (e.key === 't' || e.key === 'T') tapTempo();
    });

    wireAbout();
    restore();
    setupMidi();

    // Started up properly. The offline copy only refreshes itself after a
    // clean start like this, so it never keeps a set of files that fails.
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'started' });
    }
  }

  function restore() {
    ['complexity', 'humanize', 'phrase', 'level', 'tuning', 'tone', 'room',
     'drone-level'].forEach(function (id) {
      if (settings[id] != null) {
        $(id).value = settings[id];
        $(id).dispatchEvent(new Event('input'));
      }
    });
    if (settings.countin != null) $('countin').value = settings.countin;
    // settings.simple predates the three modes; carry it over.
    applyMode(settings.mode ||
              (settings.simple ? 'simple' : 'full'));
    if (settings.droneRoot != null) $('drone-root').value = settings.droneRoot;

    var startTune = settings.tune && TRAD.tuneById(settings.tune).id === settings.tune
      ? settings.tune : TRAD.tunes[0].id;
    selectTune(startTune);
  }

  /* ---------- MIDI ---------- */
  function setupMidi() {
    var status = $('midi-status');
    if (!midi.available()) {
      status.innerHTML = 'This browser has no Web MIDI, so GarageBand output is ' +
        'unavailable here. <b>Chrome</b> or <b>Edge</b> on macOS support it; ' +
        'Safari does not.';
      return;
    }
    midi.init().then(function (ports) {
      var sel = $('midi-port');
      if (!ports.length) {
        status.innerHTML = 'MIDI is available, but no output ports were found. ' +
          'Turn on the <b>IAC Driver</b> in Audio MIDI Setup, then reload.';
        return;
      }
      status.textContent = 'Route bodhrán hits to GarageBand, Logic or any ' +
        'other app over a virtual MIDI bus.';
      $('midi-controls').classList.remove('hidden');
      ports.forEach(function (p) {
        var o = document.createElement('option');
        o.value = p.id;
        o.textContent = p.name;
        sel.appendChild(o);
      });
      if (settings.midiPort) sel.value = settings.midiPort;
      midi.selectPort(sel.value);

      sel.addEventListener('change', function () {
        midi.selectPort(this.value);
        remember('midiPort', this.value);
      });
      $('midi-on').addEventListener('change', function () {
        midi.enabled = this.checked;
        if (!this.checked) midi.allNotesOff();
      });
      $('midi-channel').addEventListener('change', function () {
        midi.channel = clamp(+this.value, 1, 16);
        this.value = midi.channel;
        remember('midiChannel', midi.channel);
      });
      $('midi-note').addEventListener('change', function () {
        midi.note = clamp(+this.value, 0, 127);
        this.value = midi.note;
        remember('midiNote', midi.note);
      });

      if (settings.midiChannel) {
        $('midi-channel').value = midi.channel = settings.midiChannel;
      }
      // midiBass is the old per-stroke setting; if someone picked a dum drum
      // before, keep it as the one drum rather than silently dropping it.
      var savedNote = settings.midiNote != null ? settings.midiNote : settings.midiBass;
      if (savedNote != null) { $('midi-note').value = midi.note = savedNote; }
    }).catch(function (err) {
      // Chrome gates Web MIDI behind a permission prompt; a denied or dismissed
      // prompt lands here, as does MIDI being blocked by policy.
      var denied = /denied|not granted|NotAllowed/i.test(err.name + ' ' + err.message);
      status.innerHTML = denied
        ? 'Your browser blocked MIDI access. Allow MIDI for this site (click the ' +
          'icon at the left of the address bar), then reload the page.'
        : 'MIDI could not be started: ' + err.message;
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window.TRAD = window.TRAD || {});
