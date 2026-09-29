/* wake.js — getting a browser to actually make sound, shared by the app and
 * the guitar demo so the two can never drift apart. (They did: the demo had
 * only half of this, and went silent in Safari the way the app used to.)
 */
(function (TRAD) {
  'use strict';

  /* Before the audio is first built. On iPhone, web audio follows the
   * ring/silent switch by default, so a phone on silent — which is most
   * phones at a session — plays nothing. Declaring the page as playback
   * audio (Safari 17+) makes it ignore the switch. Phones and tablets only
   * (they have touch; no Mac does): a Mac has no silent switch. */
  TRAD.prepareAudio = function () {
    if (navigator.audioSession && navigator.maxTouchPoints > 0) {
      try { navigator.audioSession.type = 'playback'; } catch (e) {}
    }
  };

  /* How far ahead, in seconds, to hand sound to the audio clock.
   *
   * A visible page plans a tenth of a second or so ahead, so a change of
   * tempo or a press of Stop is heard at once. But a hidden page — a tab in
   * the background — has its timers slowed by the browser, and Safari slows
   * them to about once a second even while the tab is playing (Chrome leaves
   * a sounding tab alone). Planning a tenth of a second ahead, a tab left
   * playing behind another stumbled: strokes came due between the slowed
   * timers and were skipped. Hidden, plan well past that instead. */
  TRAD.HIDDEN_AHEAD = 5;
  TRAD.lookahead = function (visible) {
    return document.hidden ? TRAD.HIDDEN_AHEAD : visible;
  };

  /* Safari on a Mac, the one browser that needs the nudge below. */
  TRAD.isMacSafari = function () {
    var ua = navigator.userAgent || '';
    return /Safari\//.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|Edg|OPR|Android/.test(ua) &&
           !(navigator.maxTouchPoints > 0);
  };

  /* The nudge, as a WAV file made on the spot: a second of sound at 44.1 kHz,
   * the length and format of the sound test's plain audio file (B), which
   * got a stuck Safari tab sounding again both times it happened, but a
   * hiss of one step either way (about 90 dB down: far below hearing, on
   * any speaker) rather than a beep. Until 1.6.4 the nudge was a twentieth
   * of a second of pure silence, and a tab stayed stuck with it. */
  TRAD.nudgeWav = function () {
    var sr = 44100, n = sr, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    function str(o, s) { for (var i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); }
    str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true);
    v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true);
    for (var i = 0, r = 1; i < n; i++) {
      r = (r * 16807) % 2147483647;               // the same hiss every time
      v.setInt16(44 + i * 2, (r & 1) ? 1 : -1, true);
    }
    return buf;
  };
  var nudge = null;

  /* Call on every press of Play (or anything else that starts sound), from
   * the press itself: the moment Safari lets a page start sound.
   *
   * After the Mac sleeps, Safari can report the audio as 'running' while
   * holding it back, and the tab stays silent however often it is reloaded.
   * Two things together bring it back: asking the audio to resume anyway
   * (elsewhere, resuming a running clock does nothing), and — in Mac Safari
   * only — playing a second of near-silence the way a video plays, which in
   * a stuck tab still came through. The demo, with only the first, stayed
   * silent, so it is the second that does the waking. */
  TRAD.startSound = function (ctx) {
    if (ctx) clearTimeout(ctx.__rest);
    if (ctx && ctx.state !== 'closed') ctx.resume().catch(function () {});
    if (!TRAD.isMacSafari()) return;
    try {
      if (!nudge) nudge = URL.createObjectURL(new Blob([TRAD.nudgeWav()], { type: 'audio/wav' }));
      var a = new Audio(nudge);
      var p = a.play();
      if (p && p.catch) p.catch(function () {});
    } catch (e) { /* only ever a nudge */ }
  };

  /* A line on the page, while it plays, saying whether the page itself is
   * making sound, measured where it leaves for the speaker (`last`, the
   * limiter at the end of TRAD.makeOutput).
   *
   * Twice a Safari tab went silent while the Mac's own audio service was
   * playing its stream, and it could not be told from outside whether the
   * page was sending silence (a fault here) or Safari was losing sound the
   * page had made. This tells them apart, from the page, with no tools:
   * "making sound" while nothing is heard is Safari losing it. */
  TRAD.soundCheck = function (ctx, last, el, playing) {
    var an = ctx.createAnalyser();
    an.fftSize = 2048;
    last.connect(an);
    var buf = new Float32Array(an.fftSize), quiet = 0, heard = -Infinity;
    var clock = ctx.currentTime, at = Date.now();
    function show(text) { if (el.textContent !== text) el.textContent = text; }
    return setInterval(function () {
      var now = Date.now(), moved = (ctx.currentTime - clock) / Math.max(0.001, (now - at) / 1000);
      clock = ctx.currentTime; at = now;
      if (!playing()) { show(''); quiet = 0; heard = -Infinity; return; }
      an.getFloatTimeDomainData(buf);
      var peak = 0, broken = false;
      for (var i = 0; i < buf.length; i++) {
        var x = buf[i];
        if (x !== x || x === Infinity || x === -Infinity) broken = true;
        else if (Math.abs(x) > peak) peak = Math.abs(x);
      }
      var db = peak > 0 ? 20 * Math.log10(peak) : -Infinity;
      quiet = db < -80 ? quiet + 1 : 0;
      if (db >= -80) heard = Math.max(db, heard - 3);   // the loudest lately, easing down
      var msg;
      if (ctx.state !== 'running') msg = 'the audio is ' + ctx.state + ', not running';
      else if (moved < 0.5) msg = 'the audio clock has stopped';
      else if (broken) msg = 'the page’s sound has broken (NaN)';
      else if (quiet >= 3) msg = 'the page is making no sound';
      else if (heard > -Infinity) msg = 'the page is making sound (' + Math.round(heard) + ' dB)';
      else return;
      show('Sound check: ' + msg);
    }, 500);
  };

  /* Call when the page goes quiet (Stop, or the drone turned off). Once the
   * last notes have rung out, and if nothing has started again (`busy`),
   * the audio is suspended: the page lets go of the speaker until the next
   * Play, whose TRAD.startSound resumes it.
   *
   * Left running, a stopped page keeps its audio open, and the Mac from idle
   * sleep, for as long as the tab stays open. (The half hour of it seen in
   * the Mac's log on 29 September turned out to be mostly an open YouTube
   * tab: Safari keeps the speaker open for any page with a player loaded.)
   * And each Play then starts the audio afresh. */
  TRAD.REST_AFTER = 5;   // seconds: longer than any note, drone or room tail
  TRAD.restAudio = function (ctx, busy) {
    if (!ctx) return;
    clearTimeout(ctx.__rest);
    ctx.__rest = setTimeout(function () {
      if (ctx.state === 'running' && !busy()) ctx.suspend().catch(function () {});
    }, TRAD.REST_AFTER * 1000);
  };
})(window.TRAD = window.TRAD || {});
