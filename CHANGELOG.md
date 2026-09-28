# Changelog

What changed in each version of Bodhrán, newest first. The version shows next
to the title in the app; bump it at the top of `js/app.js` with every change
that gets pushed (the last number for a fix, the middle one for a feature).

## 1.5.2 — 2026-09-28

- Release notes page at `/release-notes/`, linked from **What's new** in the
  About.
- Offline, every page on the site now comes from its own saved copy. Before,
  any page other than the app itself came up as a broken copy of the app.

## 1.5.1 — 2026-09-28

- Waltzes now start at 64 bars (16-bar parts); every other tune type starts
  at 32.

## 1.5.0 — 2026-09-28 — Play it N times, then finish

- New **Length** (16, 32, 48 or 64 bars) and **Play it** (until I stop, or 1
  to 6 times) settings under the bar display. Each tune type remembers its own
  length.
- On the last time through, the drum lands one final stroke on beat 1 of the
  tune's last bar and stops.
- The counter follows the tune, for example "bar 13 of 32 · time 2 of 3".
- Lowering the number part-way through ends at the end of the current time.

## 1.4.0 — 2026-09-28 — Basic and Advanced controls

- A **Basic / Advanced** switch under the title. Basic is the default and
  shows the everyday controls: tempo, tune type, rhythm, bar display,
  count-in, volume and drone.
- In Basic, each panel lists what it keeps back ("More in Advanced: …"), and
  tapping that line opens Advanced in place.
- Hidden settings still work, and Basic flags any that have been changed from
  where they started.

## 1.3.3 — 2026-09-28 — Mac Safari silence fixed

- After the Mac slept, a Safari tab could go silent while appearing to play,
  through any number of reloads. Pressing Play now wakes the sound.
- Added a sound test page, `/tests/sound.html`, for tracking down silent
  playback.

## 1.3.2 — 2026-09-28

- The iPhone silent-switch setting no longer runs on the Mac.

## 1.3.1 — 2026-09-27 — B drone and small fixes

- Added **B** to the drone roots.
- Typing a tempo outside a tune type's range now shows the range instead of
  changing it silently.
- Arrow keys move between tune types and between rhythms.
- Count-in clicks are sent to GarageBand, on their own note (side stick, 37).
- Changing tune mid-bar no longer resets your swing until the next bar.

## 1.3.0 — 2026-09-27 — Back hand

- New **Back hand** control (off by default). Pressing raises the pitch and
  shortens the ring, following one arc across each phrase.

## 1.2.0 — 2026-09-27 — Finish

- New **Finish** button (or the **F** key) plays to the end of the phrase and
  ends with one stroke on beat 1 of the last bar. Press it again to cancel.
- Fixed: the count-in used to count as a bar of the tune, so every fill
  landed a bar early.

## 1.1.1 — 2026-09-27 — Fixes and more patterns

- Fixed the slide's only fill, which played a whole bar squashed into two
  beats.
- Added fills and busy bars for slides, barndances, hornpipes and slip jigs.
- Stop now silences strokes that were already queued.
- Changing tune waits for the next bar, and no longer plays the old tune's
  pattern under the new one.
- The About text matches the current layout; the GarageBand panel on iPhone
  is one line.

## 1.1.0 — 2026-09-26

- Phone layout: the rhythm choice on the first screen, Play beside the tempo,
  and a pinned Play/Stop bar when scrolled down.

Behind the scenes, the automated checks at `/tests/` grew from 36 at 1.1.0 to
67 at 1.5.2, and each new one was shown to catch the fault it guards against.
Earlier history is in the git log.
