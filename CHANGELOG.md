# Changelog

What changed in each version of Bodhrán, newest first. The version shows next
to the title in the app; bump it at the top of `js/app.js` with every change
that gets pushed (the last number for a fix, the middle one for a feature).

## 1.6.2 — 2026-09-28

- Fixed: in Safari, a tab left playing behind another tab in the same window
  stumbled. Safari slows a background tab's timers to about once a second,
  even while it plays, and the drum planned only a tenth of a second ahead.
  Hidden, it now plans five seconds ahead, straight away; back on screen, a
  tenth again. Stop still stops at once.
- The bar display and counter now show the bar being heard, not the bar
  planned, so they don't run ahead of the music after coming back to the tab.

## 1.6.1 — 2026-09-28

- The fix for Mac Safari going silent after sleep now lives in one file,
  `js/wake.js`, shared with the guitar demo, so the two cannot drift apart.
  Nothing changes in how the app sounds.

## 1.6.0 — 2026-09-28 — Guitar backing demonstration

- A separate page, `/guitar/`, plays The Kesh (setting 1 from thesession.org)
  with a synthesised guitar backing. It isn't part of the app.
- Turn the guitar, the tune (a flute) and the bodhrán on and off; choose a
  lilting or a driving strum; set the tempo and how many times through.
- The chord chart lights the bar being played, and each chord's shape is
  drawn, in drone voicings that keep D and G ringing on the top strings.

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

## Guitar demo

The page at `/guitar/` has its own version number, shown next to its title.

### Guitar demo 1.9.0 — 2026-09-29 — DADGAD drones on D

- In DADGAD, the open low D and the open top D now drone under every chord,
  the way DADGAD backing is known for: G, C and Em are played over the open
  low D (G/D 020000, Cadd9/D 032030, Em7/D 022020; D5 as before). The first
  shapes started G and C on their own roots, as in standard tuning, which is
  why the two tunings sounded alike. Measured across the A part, the low D now
  sits 5 to 11 dB under the whole guitar in every bar; before, it was 35 to
  44 dB under in the G and C bars (standard: 35 to 56 dB under). The chord
  chart is unchanged.
- The "Open strings ring through changes" switch is gone. It was heard in only
  two bars of the tune, and striking an open string again while it rang put
  two copies of the note on top of each other, which cancelled part of the
  sound (dips of up to 8 or 9 dB). The drone shapes do its job in every bar.
  "Open strings ring in sympathy" stays.

### Guitar demo 1.8.1 — 2026-09-28

- Ringing through made easy to hear: it was barely audible, because the
  left-out open string only faded (measured: 2.5 to 4.7 dB more of the low D
  over the C bar). Unmuted, an open string is still under the pick, so the
  down strums now sound it along with the new chord, a little more lightly:
  in DADGAD the open low D drones through the C in A-part bars 3 and 7, about
  9 dB under the whole guitar. A fretted string is still muted at a change.

### Guitar demo 1.8.0 — 2026-09-28

- Open strings ring through chord changes, with a switch to compare (on to
  begin with; remembered). A string the next chord leaves out is only
  stopped if it was fretted; ringing open, nothing holds it, so it carries
  on under the new chord, its sympathetic hum with it. In DADGAD, as D goes
  to C in the A part, the open low D rings on under the C (measured: 7 dB
  down over the C's first beat, where before it was cut by 39 dB). An open
  string struck again at the same note now carries on into the new stroke
  instead of being cut off and restarted.

### Guitar demo 1.7.0 — 2026-09-28

- Open strings ring in sympathy, with a switch to compare (on to begin
  with; remembered). On a real guitar the open strings hum along with the
  notes they share, and that is much of DADGAD's sound; without it, the two
  tunings differed only in which notes were played. Each open string is fed
  by how many of the other sounding notes it is in tune with, so neither
  tuning is favoured, and DADGAD, with more strings open, all D, A and G,
  comes out ringing about 4 dB more than standard across the tune, most of
  all on its open-fifth D. Chords now hang on 3-4 dB longer after a strum.

### Guitar demo 1.6.0 — 2026-09-28

- Bass runs taken off the page for now: no runs, no switch, no marks in the
  chart. The run data and the thumb-plucked string behind them are kept, with
  their checks, so they can come back.

### Guitar demo 1.5.0 — 2026-09-28

- Bass runs rebuilt as a thumb-plucked low string. The earlier run notes
  started from a burst of random noise, which gave them jagged overtones
  that jumped about from one to the next, part of why they sounded
  synthesised. Now each starts from the bend a thumb puts in the string,
  heard as its slope at the bridge, so its overtones step down in order; the
  string vibrates two ways at once, a shade apart, for a natural shimmer and a
  long tail; its pitch settles as a plucked string's does; and the guitar
  body's own resonances ring with it. Every run note is within a tenth of a
  cent of true pitch, and the runs sit a few dB above the strums.

### Guitar demo 1.4.2 — 2026-09-28

- Bass runs heavier and darker. They still read bright and a bit weak for a
  bass line. The string model itself was the cause: on a low note it takes
  almost nothing off the top as it rings (measured: the raw A string had
  more energy above 800 Hz than below 400). Run notes now come from a string
  with a damping filter inside it, so each trip round the string takes more
  of the top off, as a real one does, with its tuning worked out exactly. The
  attack is rounder, more thumb than pick tip, and the runs sit 2 to 5 dB
  above the strums instead of level with them.

### Guitar demo 1.4.1 — 2026-09-28

- The bass runs sounded like a piano. Picked alone, the soft strum voice kept
  its overtones as strong half a second in as at the pick (measured: no
  change at all), which is how a piano behaves; a guitar string starts bright
  and settles warm. The run notes now have a voice of their own: a firm,
  bright pick near the bridge that darkens as the note rings, a knock from
  the guitar's top, more low end, and more level (from 5 dB under the strums
  around them to about level).

### Guitar demo 1.4.0 — 2026-09-28

- Bass runs between chords, with a switch to turn them off (on to begin
  with; remembered). On the last beat before a change, three single bass
  notes walk up into the new chord in place of that beat's strum: G A B into
  C, D E F♯ into G, A B C♯ into D. They lead into bars 2 and 5 of each part,
  are marked "run" in the chord chart, and the Now panel names each one as
  it plays. Each sits where the tuning plays it: in DADGAD the walk into G
  starts on the open low D, in standard it climbs the D string to the open G.

### Guitar demo 1.3.3 — 2026-09-28

- Fixed: in Safari, the demo stumbled when left playing behind another tab in
  the same window, the same as the app. Hidden, it now hands the audio notes
  five seconds ahead, and Stop drops everything queued, guitar and flute as
  well as the drum.

### Guitar demo 1.3.2 — 2026-09-28

- Fixed: in Safari on a Mac, after the Mac slept, the demo could go silent
  while looking as if it played — the problem the app had in 1.3.3. The demo
  now wakes the sound the same way, from the same shared code. It already
  asked the audio to resume on each Play, and stayed silent, so it is the
  moment of silence played like a video that does the waking.

### Guitar demo 1.3.1 — 2026-09-28

- The bodhrán was buried under the bassier guitar: 4 dB under it overall,
  and its stick click, the part the ear picks a drum out by, 34 dB under the
  guitar in its band. Now it sits level with the guitar, with its click lifted
  (it came up to 20 dB under, plainly heard for a sound that short). The
  count-in clicks stay as loud as before. The app's own drum is unchanged.

### Guitar demo 1.3.0 — 2026-09-28

- DADGAD tuning (D A D G A D), now the starting tuning, with a switch back to
  standard to compare. The DADGAD shapes leave strings open: the top D rings
  through every chord and the open G through three. G and C carry an added
  ninth (Gadd9, Cadd9), D is an open fifth (D5), Em is Em7.
- The shape diagrams follow the tuning, with each string's note under it and
  the strings that ring through highlighted. The switch takes effect at the
  next bar, so you can compare while it plays.

### Guitar demo 1.2.0 — 2026-09-28

- A volume slider for each sound — guitar, flute and bodhrán — beside its
  on/off tick. 100% is the measured balance with the guitar leading; each goes
  up to 200%. Changes are heard straight away, and the page remembers them.

### Guitar demo 1.1.0 — 2026-09-28

- A bigger, bassier guitar, more like a Martin dreadnought: a deeper body
  resonance and fuller low end, the mids scooped a little, a softer pick on
  the bass strings, and bass notes that ring on. Measured, the bass below
  150 Hz came up by 9 dB against the rest; the guitar used to be loudest
  between 1.5 and 5 kHz.
- The demo's own version number, next to its title and at the foot.

### Guitar demo 1.0.0 — 2026-09-28

- The first version: The Kesh with a guitar backing (released with app 1.6.0).

Behind the scenes, the automated checks at `/tests/` grew from 36 at 1.1.0 to
71 at 1.6.0, and each new one was shown to catch the fault it guards against.
Earlier history is in the git log.
