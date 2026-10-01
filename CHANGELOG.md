# Changelog

What changed in each version of Bodhrán, newest first. The version shows next
to the title in the app; bump it at the top of `js/app.js` with every change
that gets pushed (the last number for a fix, the middle one for a feature).

## 1.8.0 — 2026-10-01 — Green and gold

- A new colour scheme, Irish without overdoing it: the amber and goatskin
  browns give way to deep green for what you press and what is playing, gold
  (from the bodhrán's rim) for names, and dark grounds with a hint of green.
  In the bar display, the dum strokes are green and the taks gold. The
  guitar demo, Session Players and the release notes share it. The icon
  stays the bodhrán it always was.
- Every pairing of text on its ground reads at 4.5 to 1 or better, the usual
  standard; a check keeps it so.

## 1.7.1 — 2026-09-30

- The foot of the page now switches between the app and Session Players:
  "Bodhrán · Session Players", the page you're on shown in bold.

## 1.7.0 — 2026-09-30 — A longer count-in

- The count-in now starts at **2 bars** (it was 1), time to start the drum and
  then pick up an instrument and a pick. A new **4 bars** choice gives more;
  none and 1 bar are still there, under **Count-in** in the Feel panel.
- The bar counter counts the lead-in: "count-in 1 of 2", "count-in 2 of 2",
  then "bar 1 of 32", so you can see when the drum is about to come in.
- If you had chosen a count-in yourself before, the app keeps your choice.

## 1.6.6 — 2026-09-29 — Safari's other way to the speaker

- In Safari on a Mac, the app's sound now reaches the speaker through an
  audio element, the way a song or video plays, instead of straight out.
  With the sound check in place, a silent Safari tab said it was making
  sound, so Safari was losing it on the way. In that stuck tab the sound
  test's direct beep (A) was silent and the same beep through an audio
  element (C) played, and brought A back; a plain audio file (B) had done the
  same the two times before. Chrome and the iPhone are unchanged.
- Tested in Safari's own engine: the sound reaches the speaker this way, the
  app still lets go of the speaker after Stop, and Play takes it back.

## 1.6.5 — 2026-09-29

- A **Sound check** line under Play, while it plays, says whether the app
  itself is making sound and how loud ("the page is making sound (−18 dB)"),
  or that it is making none, or that its sound has broken, or that the audio
  has stopped running. If it says it is making sound and you hear nothing,
  the sound is being lost in Safari, not in the app. Twice a Safari tab went
  silent while the Mac was playing its stream, and until now that couldn't be
  told apart.

## 1.6.4 — 2026-09-29

- In Safari on a Mac, the wake-up that each Play sends is now a second of
  sound, far too quiet to hear, in place of a twentieth of a second of pure
  silence. A Safari tab went silent again with 1.6.3; the sound test's plain
  one-second audio file got it going, as it had the first time, and the old
  wake-up didn't. Whether the new one does is not yet known.
- The sound test page (`/tests/sound.html`) has a new button, F, that plays
  just the wake-up, and says what to press, in what order, when the app has
  gone silent.

## 1.6.3 — 2026-09-29

- Stopped, with the drone off, the app now lets go of the speaker a few
  seconds after the last stroke, and takes it back on the next Play, so each
  Play starts Safari's sound afresh. Left running, a stopped tab kept its
  audio open, and the Mac from going to sleep on its own, for as long as it
  stayed open. (The half hour of Safari holding the speaker seen in the Mac's
  log that day turned out to be mostly an open YouTube tab, which holds it
  whenever a player is loaded.) It didn't cure the silent tab.

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

### Guitar demo 1.10.0 — 2026-10-01

- The green-and-gold colours of the app (1.8.0).

### Guitar demo 1.9.4 — 2026-09-29

- The same route to the speaker as the app (1.6.6): in Safari on a Mac,
  through an audio element.

### Guitar demo 1.9.3 — 2026-09-29

- The same **Sound check** line as the app (1.6.5), under Play.

### Guitar demo 1.9.2 — 2026-09-29

- The same Safari wake-up as the app (1.6.4): a second of sound too quiet to
  hear, in place of a twentieth of a second of silence.

### Guitar demo 1.9.1 — 2026-09-29

- Stopped, the demo now lets go of the speaker once the last notes have rung
  out, and takes it back on the next Play, the same as the app (1.6.3). Left
  running, it held the speaker, and kept the Mac awake, for as long as the tab
  stayed open.

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

## Session Players

The page at `/players/` has its own version number, shown next to its title.

### Session Players 1.6.0 — 2026-10-01 — The tune lilts

- The melody, on the flute and the concertina alike, is now phrased the way
  a player phrases it rather than dead even. In a jig the first quaver of
  each group of three is held 8% long and the other two share the
  difference; in a reel each pair of quavers goes a little long-short
  (53:47); the beat itself still lands on time. Beat notes are leant on,
  the first of the bar most, the notes between lighter, the last of a jig's
  three lifting into the next beat, with a gentle swell over each two-bar
  phrase and a little of a real player's unevenness, so no two times
  through are quite the same. The guitar and drum stay steady under it.
- The flute's line in the mixer reads "Flute (the tune)", like the
  concertina's.

### Session Players 1.5.1 — 2026-10-01

- The concertina's notes now carry over into each other, as they do when the
  bellows keep the air up through a phrase. Each note is held a touch past
  the next one's start and dies away over a twentieth of a second, with a
  trace of bellows air under it. Before, the short notes were detached and
  every note cut off: measured, the sound fell to silence (85 dB down)
  between every two notes; now it dips about 1.5 dB. A repeated note, like
  the two Ds of "edd", is still struck twice (a 13 dB break).
- It sounds less like a machine: the reed wanders slightly in pitch and
  level as bellows pressure does (randomly, about a cent and a third of a
  decibel, not a vibrato), bends up into pitch as it speaks, and speaks
  brighter when pushed harder. A held note's level used to sit dead still
  (0.11 dB); now it moves 0.2 to 0.3 dB.
- Fuller for carrying over, its level comes down to stay just under the
  flute.

### Session Players 1.5.0 — 2026-10-01 — A concertina

- A concertina for the tune: a fourth line in the mixer, with its own tick
  and level, off to begin with. Tick it with the flute for the two in
  unison, as at a session, or untick the flute to hear it alone; untick
  both to play the tune yourself.
- It is a free reed, synthesised: a rich, reedy tone (its overtones up to
  the fifth within about 10 dB of the note, where the flute's are 58 dB down), one
  reed to a note tuned dry, a few cents off true at random as a real reed
  is, quick but not clicky, with a breath of air as each note opens, and the
  short notes bouncing. It sits just under the flute.

### Session Players 1.4.0 — 2026-10-01

- The green-and-gold colours of the app (1.8.0).

### Session Players 1.3.1 — 2026-10-01

- A tune the page brings back by itself on reopening no longer says it came
  "from a saved file"; only a file you open does.
- Fixed: saving again a tune opened from a file recorded it as setting 1,
  whatever its setting; the number shown and the file's name were wrong too.

### Session Players 1.3.0 — 2026-10-01

- The tune you pick is shown clearly where you found it: its name fills the
  search box and stands out large under it, with its type, key and which
  setting is playing ("Jig · 6/8 · G major · Setting 1 of 44 by Jeremy"),
  the setting chooser and the link to it on thesession.org beside it. A tune
  opened from a file says so. Clicking the search box selects the name, so a
  new search is just typing.

### Session Players 1.2.1 — 2026-09-30

- The foot of the page switches to the bodhrán app ("Bodhrán · Session
  Players"), as the app's now switches here. The link to the Kesh demo is
  gone from it.

### Session Players 1.2.0 — 2026-09-30

- Once you pick a tune, the other matches fold away under one line ("19
  other matches for “kesh”"), which opens them again. Left open, a long list
  pushed the tune, the Play button and the chords far down the page. A new
  search opens the list fresh.

### Session Players 1.1.0 — 2026-09-30 — Chords that know the shape of a part

- The chords chosen from the melody now follow the shape of a part: two
  four-bar phrases, the fourth bar resting on the cadence chord (the dominant
  in a major key, the chord a step below home in dorian, mixolydian and minor
  tunes), and the eighth going from it to home. Hearing only the notes, the
  page had put Em and Am under The Kesh's bar 4s, where a backer plays D. Now
  6 of 8 bars of the A part match the guitar demo's hand-chosen chords (5
  before) and 5 of 8 of the B part (4 before). Across six popular tunes only
  bar 4s changed: the Silver Spear's B part now rests on A, Banish
  Misfortune's on C.
- Reopening the page brings back the last tune with the chords you changed,
  and the rest chosen afresh, so it hears improvements like this one. A saved
  file still comes back exactly as saved.

### Session Players 1.0.0 — 2026-09-30 — The first version

- Name a tune and it is found on thesession.org, fetched, and given a backing:
  the guitar (standard or DADGAD), the bodhrán, and the melody on the flute.
  Untick the flute to play the tune yourself. Jigs and reels for now; other
  types are listed but can't be picked yet.
- Choose any of the tune's settings. Repeats, first and second endings,
  pickups, triplets, rolls and dotted notes are all read as written.
- Chords come from the setting if it has them (few do), otherwise they're
  chosen from the melody, bar by bar, from the chords usual in the tune's key
  and mode. Tap any bar to change its chord, for the whole bar or each half;
  the change holds every time that bar comes round, and is marked with a dot.
- **Save to a file** keeps the tune, the setting and your chords; **Open a
  saved tune** brings it all back with nothing fetched. The last tune is also
  kept on the page between visits.
- A two-bar count-in by default (one, two or four), tempo, times through,
  strum, tuning, sympathetic ringing, a level for each sound, and the sound
  check, all as in the guitar demo.

Behind the scenes, the automated checks at `/tests/` grew from 36 at 1.1.0 to
71 at 1.6.0, and each new one was shown to catch the fault it guards against.
Earlier history is in the git log.
