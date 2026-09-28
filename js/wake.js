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

  /* A twentieth of a second of silence as a WAV file, made on the spot. */
  function silentWav() {
    var sr = 8000, n = sr / 20, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    function str(o, s) { for (var i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); }
    str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true);
    v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true);
    return buf;
  }
  var silence = null;

  /* Call on every press of Play (or anything else that starts sound), from
   * the press itself: the moment Safari lets a page start sound.
   *
   * After the Mac sleeps, Safari can report the audio as 'running' while
   * holding it back, and the tab stays silent however often it is reloaded.
   * Two things together bring it back: asking the audio to resume anyway
   * (elsewhere, resuming a running clock does nothing), and — in Mac Safari
   * only — playing a moment of silence the way a video plays, which in a
   * stuck tab still came through. The demo, with only the first, stayed
   * silent, so it is the second that does the waking. */
  TRAD.startSound = function (ctx) {
    if (ctx && ctx.state !== 'closed') ctx.resume().catch(function () {});
    if (!TRAD.isMacSafari()) return;
    try {
      if (!silence) silence = URL.createObjectURL(new Blob([silentWav()], { type: 'audio/wav' }));
      var a = new Audio(silence);
      var p = a.play();
      if (p && p.catch) p.catch(function () {});
    } catch (e) { /* only ever a nudge */ }
  };
})(window.TRAD = window.TRAD || {});
