# Changelog

What changed in each version of Bodhrán, newest first. The version shows next
to the title in the app; bump it at the top of `js/app.js` with every change
that gets pushed (the last number for a fix, the middle one for a feature).

## 1.10.1 — 2026-10-03

- The **Sound check** line under Play is hidden, as in Session Buddies. It was
  there to find out why Safari once went silent, not for every day. It still
  measures, and `?soundcheck` at the end of the app's address shows it again.

## 1.10.0 — 2026-10-02 — A less electronic drum

- **The dum no longer swoops.** Each down stroke used to drop almost an
  octave in its first 55 ms (from 148 Hz to the skin's 78), a pure tone with
  a triangle wave swooping under it: the recipe of an electronic kick drum,
  nearly all of it under 120 Hz, so a phone's speaker heard little but the
  click. A struck goatskin settles a few percent at most; now it settles 4.5%
  on a full stroke, less on lighter ones.
- **It rings like a drumhead.** Under the fundamental, the next five modes of
  a round skin ring and die away, the higher ones sooner, each a little
  different from stroke to stroke as the tipper never lands in quite the same
  place; and the goatskin's own slap sits in its middle register, through the
  Tone control like the rest. The tak and the ghost are the same skin,
  lighter, as before. Listen for woodier, less zip.
- Same loudness as before (measured on a reel at 112), the same balance of
  dum, tak and ghost, and about 4 dB more of it through a phone's speaker.
- **No clipping at full volume.** The output limiter follows a smoothed level,
  so single samples ran about 0.8 dB over where it aims: at full volume and
  room the old drum came within 0.2 dB of clipping, and the new one, a touch
  more lively at the strike, went over. A fixed trim after the limiter keeps
  it clear; everything is 0.6 dB quieter, the balance unchanged.
- Session Buddies (1.15.0) and the guitar demo (1.12.0) have the new drum
  too.

## 1.9.2 — 2026-10-02

The offline copy made safe on bad wifi (from the audit):
- **A slow page no longer mixes old and new files.** Session Buddies or the
  guitar demo taking more than 2.5 s to load (pub wifi) was treated as
  offline, so it got its own files new and the shared ones (the drum, the
  patterns, the sound helpers) old from the app's offline copy: the very mix
  the offline copy is built to prevent, and a page that showed Stop with no
  sound. Now a page counts as offline only if it actually came from the
  offline copy. It is no longer fetched twice either.
- **The offline copy can't be lost to two refreshes at once.** Two quick
  reloads could start two refreshes that deleted each other's copy, leaving
  none for the pub. Now they take turns, and each deletes only older copies.
- **Opening the app offline by an old link works.** The saved index.html was
  the host's redirect, which can't answer a page load. Now the app's page is
  found with or without "index.html" or a ?query on the end.
- **No copy saved mid-deploy.** The copy used to refresh the moment the app
  started, often seconds after an update, when the site can still serve old
  and new files side by side. Now the app asks for it 30 seconds after a
  clean start, and a new version of the offline code keeps the complete copy
  it finds.

## 1.9.1 — 2026-10-02

- Your sliders are remembered again: volume, tuning, tone, back hand, room,
  drone level, busyness, humanise and fills every. Each one was saved at its
  starting value as the page set it up, just before your saved value was read
  back, so every visit started from the defaults. Found by the audit.
- The drone on its own now keeps the phone's screen on, as the drum does. A
  screen that locked itself took the sound with it.
- Keeping the screen on is now shared by all three pages (`TRAD.keepAwake` in
  js/wake.js). Coming back to the page takes the screen back and wakes the
  sound after a call or Siri, for the drone too.

## 1.9.0 — 2026-10-01 — Swing you can set by ear

- The Swing slider now reads as a player says it: the first of a pair of
  quavers against the second, from 50:50 (straight) to 70:30. It used to show
  a percentage of the engine's own measure ("62%").
- Hornpipes now start at 64:36, a little more swing than the 60:40 they had.
  In Session Buddies 60:40 sounded "devoid of the swing a hornpipe normally
  has", and 2:1 "almost slightly too much". Barndances stay at 57:43.
- Each tune type keeps the swing you set for it. Before, it went back to the
  tune's own whenever you changed tune.
- For a type that swings (the hornpipe and the barndance), the slider shows in
  Basic too. For the others it stays in Advanced, so you can still swing a
  reel if you want to.

## 1.8.1 — 2026-10-01

- Session Players is now called Session Buddies, at `/buddies/`. The foot of
  the page links there.

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

The page at `/guitar/` had its own version number, shown next to its title.

### Guitar demo retired — 2026-10-03

- The demo is retired: Session Buddies does all it did, with any tune, and The
  Kesh opens there on a first visit. The old address says so and links to
  Session Buddies and the Bodhrán app. The demo's own code is gone; its guitar
  stays, as Session Buddies plays it, and so do the checks that try it.

### Guitar demo 1.12.0 — 2026-10-02

- The app's new bodhrán (1.10.0): no swoop, a skin that rings like a
  drumhead.

### Guitar demo 1.11.1 — 2026-10-02

- The phone's screen stays on while the demo plays (it could lock itself and
  stop the sound), using the app's shared helper.

### Guitar demo 1.11.0 — 2026-10-01 — A smoother guitar

- The strings no longer start from a burst of random noise, the source of
  a metallic, "wire fence" edge, nor keep their top as they ring. Each now
  starts from a soft pick and loses its top as a real string does, set
  against a real steel-string G chord (Silcon, Wikimedia Commons; measured,
  not used): a third of a second after the strum its top (above 2 kHz
  against below 1 kHz) is -14.7 dB where the real chord's is -16.5 (the old
  strings: -9.6), and at 0.8 s -21.5, the same as the real chord's. At the
  strum it is 5 dB softer than before. The level is unchanged.

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

## Session Buddies

The page at `/buddies/` has its own version number, shown next to its title.
It was called Session Players, at `/players/`, until 1.8.0; the entries
before that keep the old name.

### Session Buddies 1.21.1 — 2026-10-03

- **No more slowing down like a tape on a Mac.** Playing Sí Bheag Sí Mhór in
  Safari, after a while the whole sound slowed and dropped in pitch while
  the chords on the page kept time, until Stop. In Mac Safari the sound went
  out through a hidden audio player (added in app 1.6.6, when a Safari tab
  went silent after sleep); with four instruments and the room playing,
  Safari's audio can falter for a moment, and that player made up the gap
  by playing slower, and stayed behind. Session Buddies now sends its sound
  straight to the speaker, as every other browser does. Each press of Play
  still makes the short near-silent sound that woke a stuck tab before. The
  Bodhrán app, lighter and not affected, keeps the hidden player.

### Session Buddies 1.21.0 — 2026-10-03 — A tidier top, and choices that fold away

- **The top of the page is laid out as the app's:** its own icon beside the
  name and version, a one-line tagline under them, and an About button on
  the right. The icon is drawn in the bodhrán icon's style (the same dark
  ground, gold ring and wooden face) with a guitar's soundhole and strings;
  it is also the icon a phone shows for the page on its home screen. The
  paragraph of explanation that sat at the top is in About now, with a few
  steps for getting going.
- **What you hear folds away.** Once you are happy with the choices, Hide (at
  the top of the panel) or Done (at its foot) folds them into a few lines
  saying how each is set: who is playing (and their level, if not 100%), the
  melody, the guitar's strum, tuning and ringing strings, the bodhrán's
  style, busyness and back hand, and the backing's feel. Tap the summary or
  Change to open them again. Open or folded is kept, through a reload too;
  it starts open, and Reset settings opens it. Folded, the page on a phone
  is about a third shorter.

### Session Buddies 1.20.0 — 2026-10-03 — Back hand, and a waltz bass that walks

- **The bodhrán's back hand**, as in the app: a Back hand slider in the
  Bodhrán section (off, light, moderate, a lot; off to begin with, kept).
  The other hand presses the skin from inside, the pitch rising (up to a
  fourth) and the ring shortening, in one slow arc over each four bars of
  the tune: open at the top, pressed hardest about 70% through, let go
  across the fourth bar, so a fill falls in pitch into the next phrase. In
  Full each arc goes a little deeper or shallower, as a hand never quite
  repeats; in Simple it is the same every time; not in Pulse, and not on the
  closing stroke.
- **A waltz's bass walks between the root and the fifth.** The oom of the
  waltz's oom-pa-pa was always the shape's lowest string; now it is the
  chord's root on one bar and its fifth on the next, from the first bar of
  each time through, each on the lowest string of the shape that has it.

### Session Buddies 1.19.2 — 2026-10-03

- The setting you were on could still say "[object Object]": chosen from the
  faulty menu while 1.18.3 to 1.19.0 were live, it had been saved that way
  (and so might a favourite or a tune played lately). Every tune is now
  tidied as it opens, and saved tidy from then on.

### Session Buddies 1.19.1 — 2026-10-03

- The Setting menu, filled in from thesession.org after a reload (1.18.3),
  named each setting's poster "[object Object]": the Session's answer went
  in untidied. Now it names them, as a search does, and so does the credit
  line for a setting chosen from it.

### Session Buddies 1.19.0 — 2026-10-03 — Ornaments on the flute

- **The flute plays the rolls and cuts a setting writes.** The tune reader
  used to read past them (about one popular setting in five writes rolls,
  one in twenty grace notes) and play the plain note. Now, under one breath
  and in the tune's lilt:
  - a **long roll** (~ on a dotted crotchet, mostly jigs): the note, a cut
    (a flick to two steps above) on its second quaver and a tap (a softer
    dip to the step below) on its third, the note again after each;
  - a **short roll** (~ on a crotchet, mostly reels): the cut on its first
    quaver and the tap on its second;
  - a **grace note** ({g}, the way a cut is written): a 26 ms flick on the
    note's time, taking its time from the start of the note.
  Every note still starts where it did. A roll too short to fit at a fast
  tempo is played plain.
- **Ornaments: As written or Off**, under Melody, kept with your settings;
  the line under it says what the setting writes ("This setting writes 4
  rolls"). The concertina keeps to the plain notes, as two players seldom
  ornament alike.

### Session Buddies 1.18.4 — 2026-10-03

- The **Sound check** line under Play is hidden. It was there to find out
  why Safari once went silent, not for every day. It still measures, and
  `?soundcheck` at the end of the page's address shows it again.

### Session Buddies 1.18.3 — 2026-10-03

- **My tunes stays as you left it.** It opened at every load if you had any
  tunes; now it is open or closed as you last left it (closed to begin
  with), and Reset settings closes it.
- **The Setting menu after a reload.** A tune brought back from this
  browser's storage (the one left on the page, one of your tunes, or The
  Kesh on a first visit) held only its own setting, so the menu could not
  switch until you searched for the tune again. Now its other settings are
  fetched from thesession.org once it has opened and added to the menu; the
  setting on the page, with your chord changes, stays as it is. Offline the
  menu stays as it was. A tune opened from a saved file keeps to the file.

### Session Buddies 1.18.2 — 2026-10-03 — Your settings kept, and a clean reset

- **Every choice comes back after a reload.** Which instruments are ticked
  went back to guitar, flute and bodhrán (the concertina unticked) at every
  reload; now they are kept like the rest. Ticked from last time, the
  concertina's recordings start loading at your first tap on the page.
  (Tested by setting every control away from its start and reloading:
  nothing else was lost.)
- **Another setting of the same tune keeps your tempo.** It went back to the
  type's starting tempo (from the audit, B39).
- **Reset settings**, at the end of What you hear: every choice back to how
  it starts, from the tempo, "Play it" and count-in to the instruments,
  their volumes, melody, strum, backing feel, bodhrán, swing, tuning and
  sympathy. The tune on the page, your tunes and your chord changes are
  kept, and Undo brings it all back (until the next reload).
- A reload always runs the newest code: the site asks the browser to check
  every Session Buddies file each time, as it did before.

### Session Buddies 1.18.1 — 2026-10-03

- **The bodhrán no longer leans toward a snare drum.** It went through a
  9 dB lift around 2.5 kHz, from the guitar demo, added when the drum was
  nearly all low thump and could hardly be picked out against the guitar.
  On the new drum (1.15.0) the lift only tipped it toward a snare: five times
  the share of its sound above 1.5 kHz, for 0.4 dB more loudness, and more
  of a snare than the app, which has none. Now it has none either; its
  level is raised 0.5 dB to keep its place against the guitar, and its stick
  still sits 10 dB under the guitar in its own band, easily heard (the old
  drum's sat 34 dB under).

### Session Buddies 1.18.0 — 2026-10-03 — Choose how the bodhrán plays

- **Full, Simple or Pulse**, as in the app, under Backing feel while the
  Bodhrán is ticked. It always played Simple, one plain bar for the tune
  type. The choice is kept.
- **Full** (where it starts) phrases like a player, as the app's Full does:
  the pattern changes from bar to bar, weighted by **Busyness** (sparse,
  through steady, to busy), with a player's small scatter in timing and
  weight. Session Buddies knows where the tune's phrases fall, which the app
  cannot, so a fill comes most often at the end of each phrase of the tune
  and sometimes half way through it; a fill's triplets stay even.
- **Simple** is the one plain bar it played before; **Pulse** one low stroke
  per beat, weighted where the dance falls.

### Session Buddies 1.17.0 — 2026-10-03 — A flute player, not a keyboard

The flute sounded "a bit like it's coming from a keyboard". Three reasons,
each changed, with every note still starting exactly when it did (the
timing, the lilt and playing together with the concertina are untouched):
- **Slurred, not every note tongued.** Every note was tongued and let go at
  82% of its length: in a reel, about 50 ms of silence between every two
  notes, as a keyboard player lifts each key. Now, as an Irish flute player
  mostly does, it tongues the note on each beat (and a repeated note, or one
  after a rest) and slurs the rest into it under one breath: a jig's
  DUM-da-da, a reel's pairs. A slurred change keeps the breath going (the
  level dips 3–5 dB as the fingers change the note) and the new note is
  heard on its time; a tongued note stops the air for a moment.
- **A wooden flute's tone.** It was nearly a pure tone, the same on every
  note. Now the low octave has a reedy edge (the second harmonic about
  7 dB under the note at low D) and the second octave is near pure, as on a
  wooden flute; and the breath is part of the sound, a fluff of air around
  the note and a little hiss, under every note (about 30 dB under it, more in
  the low octave), not only a puff at the start.
- **A note that lives.** A tongued note scoops up into pitch from just
  under, its overtones blooming in over a few hundredths of a second; the
  breath wanders a little in level; a long note swells and eases. The pitch
  stays put, so it stays in tune with the concertina; the light, late
  vibrato is as before.
- Trimmed so it plays as loud as before in the mix (measured on The Kesh).
  The guitar demo's own flute is unchanged.

### Session Buddies 1.16.0 — 2026-10-03 — Waltzes

- **Waltzes can be played.** Search for one as for any tune; it counts three
  crotchets to the bar, starting at 116 (60–180).
- **The guitar backs it oom-pa-pa** (Lilt, where it starts): the bass note
  alone on the first beat and the chord on the second and third, as a
  session guitarist backs a waltz, the chord changing at most on the third
  beat. Driving plays the whole chord on every beat with an up-strum after
  the second and third, fuller, for the dancers. The bass note stands 1–4 dB
  over the chord after it, a waltz's lean on 1.
- The flute and concertina lean on the first beat and lilt their quavers a
  little (53:47 on the flute, 54:46 on the concertina); the bodhrán plays the
  app's plain waltz, and the count-in counts three.

### Session Buddies 1.15.0 — 2026-10-02 — A less electronic drum; the concertina loads safely

- **The app's new bodhrán** (1.10.0): no swoop, a skin that rings like a
  drumhead. Listen for woodier, less zip.
- **One lost recording no longer loses the concertina.** Its 34 recordings
  loaded as one bundle: one lost on patchy wifi lost them all, and the old
  synthesised "keyboard" concertina played for the rest of the visit, with
  nothing said. Now each loads on its own and is tried a second time; what
  arrives is kept; a note whose recording is missing is borrowed from a
  neighbour (as unrecorded notes already were) or, if none is near, played by
  the stand-in; and the missing ones are tried again when you next press
  Play. A line under the mixer says when the stand-in is playing.
- **The stand-in is no longer 12 dB too loud.** While the recordings load on
  a slow first visit, the synthesised concertina stands in. It played at its
  own old level, 12 dB over the recordings (the concertina was turned up to
  suit them), so the first bars came in loud and buzzy over everything, then
  dropped and changed sound. It now plays at the recordings' level.

### Session Buddies 1.14.0 — 2026-10-02 — Backing feel

- **Backing feel**, under the strums: Straight, A little, or With the tune
  (where it starts). Since 1.6.0 the flute and concertina lilted over a
  guitar and bodhrán playing dead-even quavers, so their off-beats did not
  meet: in a reel at 100 the melody's landed 30–42 ms after the up-strum and
  the tak, in a jig 12–16 ms (the audit; the jitter you heard in 1.7.2 was
  27 ms). With the tune, the guitar and bodhrán ride the melody's own lilt
  (the concertina's when it is ticked, else the flute's, and still so when
  you untick both to play the tune yourself). A little goes half way, a touch
  steadier than the tune; Straight is as before. The beats themselves stay
  put. In a hornpipe the backing already swung with the Swing control; with
  the tune it now also takes the concertina's slightly harder swing. The
  choice is kept. Try them on the same tune and keep what sounds right.
- **Even triplets in every tune.** The lilt bent triplets in reels and jigs:
  The Silver Spear's "(3AAA" came out 0.73, 0.67 and 0.60 of a quaver, the
  last note rushed. Now they play even, as players keep them, as hornpipes
  already did. Ordinary quavers keep their lilt.

### Session Buddies 1.13.0 — 2026-10-02 — Finish, and your turn

- **Finish** (the button under Play, or F). While a tune plays, one press
  plays on to the end of this time through and closes the tune there, with
  the closing strokes and the last note held. If that time's last bar is
  already on its way, it goes round once more. Press again to carry on. With
  "Play it" on "until I stop", it is how to end a tune properly instead of
  cutting it off.
- **Lowering "Play it" mid-tune now ends it properly.** Set to "once through"
  during the second time, the music stopped dead with no closing chord and
  the page stayed "playing", showing Stop, until you pressed it (audit B5).
  Now it ends at the end of the time through it is in, like Finish.
- **Your turn.** A new Melody choice: Every time (as before); Taking turns
  (they play the tune once, you the next time, and so on); You play B (they
  play the A part, you the B part and any others); You play A (the other way
  round). The guitar and bodhrán carry on throughout. The lead-in at the end
  of their bar is still played, so they bring you in. On your turn the
  melody is silent, or plays along quietly (about 10 dB down) as a guide: you
  choose. Now shows "your turn" when it is. Both choices are kept.

### Session Buddies 1.12.3 — 2026-10-02

Reading the Session's tunes right (from the audit; each fix tried on all
1,249 settings of 56 popular tunes before and after):
- **No more lost parts.** A second ending closed by a plain bar line before
  the next part's `|:` marked that whole part "ending 2", so it was never
  played. Off To California #17, The Swallowtail #23, The Lark in the Morning
  #21 and The Musical Priest #19 played only their A part; nine settings in
  all get their missing bars back.
- **Only real chords count as chords.** Quoted text was taken as a chord if
  it started with A–G, so "Ending" became an E chord and "Chorus" a C. Now
  only a whole chord name counts ("Em7", "D/F#", German "D/H"), not a word
  or a part label ("A'"). And a setting's own chords are used only when
  they cover the tune (a chord in at least a quarter of its bars, and in
  each part of four bars or more); otherwise the chords are chosen from the
  melody. The Star of Munster #19 was strummed on E major throughout, and
  The Silver Spear #9 on D for all 32 bars, from one stray "D". Bars before
  a setting's first chord are now chosen from the melody too.
- **The last time through ends on the tune's own last note.** Many settings
  write a lead-in back to the top at the end of the last bar, and on the
  last time it became the final note, held for a bar over the home chord:
  The Silver Spear ended on a G over a D chord. Now that written lead-in is
  left off: a quaver or two at the very end in the pickup's place, never a
  held note, and not if the tune ends better with it. Over the popular
  settings, the endings landing on the home chord go from 32 of 100 to 85,
  and none is worse.
- **Between times, a bar is played as written.** Its written lead-in was cut
  and the pickup added on top, so The Silver Spear's "B2 AG" came out
  "B2 A A". Now the pickup replaces it only when it is the same notes.

Your chord changes kept:
- **A chord you change is kept, played or not.** A tune went into "Played
  lately" only when you pressed Play, so chords changed and then a search
  were lost. Now changing a chord puts it there.
- **"Back to the chosen chords" can be undone.** Afterwards the button reads
  "Undo: put my chord changes back", until you change a chord or the tune.

### Session Buddies 1.12.2 — 2026-10-02

Your work kept safe (found by the audit):
- **Searching a tune you have opens your copy.** Before, it was fetched
  fresh and stored over your copy in My tunes, so a favourite's chord
  changes were lost. Now a match you have is marked "★ in your favourites"
  (or "in played lately"), and opening it brings back your setting, your
  chord changes and your tempo. "Back to the chosen chords" still starts
  afresh. The same goes for choosing another setting you have a copy of.
- **The setting number sticks.** A tune reopened on setting 3 (by a reload,
  from My tunes or a file) was stored as setting 1, and after another reload
  said "Setting 1"; the file name and credit followed it.
- **Opening one of your tunes keeps your page settings.** It brought back the
  guitar tuning, strum, count-in and "Play it" from when it was starred, so
  an old favourite switched DADGAD back on without a word. Now only what
  belongs to the tune comes back: its chords and tempo. A saved file still
  comes back exactly as saved.

### Session Buddies 1.12.1 — 2026-10-02

- The phone's screen stays on while a tune plays. Nothing held it before, so
  with the phone put down to play along, Auto-Lock could dark the screen and
  stop the backing. Coming back to the page takes the screen back and wakes
  the sound after a call or Siri. (The app's shared helper, js/wake.js.)

### Session Buddies 1.12.0 — 2026-10-01

- **My tunes**, in Find a tune, so the tunes you play are a tap away
  instead of a search:
  - **Favourites:** ☆ Favourite by a tune's name keeps it there, listed by
    name; tap again (or ✕ in the list) to take it out.
  - **Played lately:** each tune you press Play on goes to the top, the
    last twelve kept, with when ("today", "yesterday", "3 days ago").
  - A tap opens one with no search and no network: the setting you had,
    with the chords you changed. A chord you change is kept in your copy
    too. The list folds away once you pick, and opens by itself when you
    come back to the page.
  - They are kept in this browser. Safari can clear a site's storage if it
    goes unvisited for a while, so **Save my tunes to a file** writes them
    out, and **Open a saved tune** brings them back.

### Session Buddies 1.11.0 — 2026-10-01

- A hornpipe has a Swing control (under the strums): from 50:50, straight, to
  70:30, starting at 64:36. 1.10.1's 2:1 was "almost slightly too much". The
  guitar, bodhrán and tune all follow it, the concertina a shade harder as it
  leans in every tune; triplets and notes written dotted still play as
  written. It is kept for next time. The Bodhrán app's Swing slider works the
  same way (app 1.9.0).

### Session Buddies 1.10.1 — 2026-10-01

- Hornpipes swing properly. 1.10.0 swung them 60:40, as the app's bodhrán
  does, and The Boys of Bluehill sounded devoid of the swing a hornpipe
  normally has. The guitar, drum and tune now swing 2:1, the triplet feel.
- A hornpipe's triplets stay even, as players keep them. Swung, the three
  notes of Bluehill's "(3Bcd" went 0.8, 0.6 and 0.6 of a quaver; and the
  swung quaver now falls just where a triplet's third note does. Any beat a
  setting writes other than in plain quavers (a triplet, a dotted pair,
  semiquavers) is played as written, so a setting written dotted (`B>A`)
  is not dotted twice.

### Session Buddies 1.10.0 — 2026-10-01

- Hornpipes, polkas, slides and slip jigs can now be played, as well as jigs
  and reels. Each has its own meter and tempo range, count-in, closing
  strokes, two strums (Lilt and Driving) and the app's plain bodhrán
  pattern for it:
  - **Hornpipe** (4/4, from 80 bpm): swung long-short, about 60:40, in the
    guitar and drum as the app swings it, and in the tune's straight
    quavers too. Many settings write a hornpipe dotted already (`A>B`); those
    notes are played as written, not dotted twice. The last bar closes on
    three strokes, as a hornpipe ends.
  - **Polka** (2/4, from 120 bpm): oom-pa strums, the Driving one pushing
    the ups between the beats; a little lilt, dotted pairs as written.
  - **Slide** (12/8, from 115 bpm): four beats a bar, leaning on 1 and 3,
    and a lilt a touch stronger than a jig's. The chords follow a slide's
    phrase: four of its long bars, as each holds two of a jig's.
  - **Slip jig** (9/8, from 105 bpm): three beats a bar with a jig's lilt.
    A bar's second chord comes in on the third beat (half way was mid-beat).
- Tried on a real tune of each: The Boys of Bluehill, The Britches Full of
  Stitches, The Road to Lisdoonvarna and The Butterfly. The chords chosen
  for the slide match its setter's own on 11 of 16 half bars. Waltzes,
  barndances, mazurkas and the rest are still listed but not yet playable.

### Session Buddies 1.9.0 — 2026-10-01

- A first visit opens with a tune ready to play. Someone pressed Play before
  finding a tune and nothing played. Now The Kesh (the Session's setting 1,
  the tune the guitar demo plays) is on the page from the start, with a
  note saying it is there to start you off and that any other jig or reel
  can be found above. It is kept in the page, so it needs no search or
  connection. A tune left on the page last time still comes back instead.

### Session Buddies 1.8.0 — 2026-10-01

- Session Players is now **Session Buddies**, at `/buddies/` (the page's
  files, `buddies.js` and `buddies.css`, renamed with it). The old address
  says so, links to the new one and goes on there by itself after three
  seconds, so bookmarks still work. Your last tune, volumes, tuning and other
  settings carry over, and files saved before the rename open as before.
- The description at the top now mentions the concertina: the flute plays
  the melody, and the concertina can join it or play it alone.

### Session Players 1.7.4 — 2026-10-01

- The concertina's long notes are steadier. A note held longer than its
  recording is looped through its steady part. The loop began in a small dip
  just after the attack, and its join was a rough match, so held notes
  wavered with every pass, twice a second. Now the loop starts once the note
  has settled, and the join is matched more closely and blended. The level is
  evened out a little more closely too, keeping the reed's life. The
  twice-a-second waver is about a third to a half smaller in level on most
  notes, and on F♯4 it dropped from 18 cents to under 2.
- The F♯4 recording wobbles on its own, ±11 cents five or six times a
  second, as much as the flute's old vibrato. F♯ is in every D and G tune.
  It and three milder ones (A♯3, A♯4, G♯5) are now played from a steady
  recorded note a semitone away, retuned. `samples.json` records how much
  each recording wavers.

### Session Players 1.7.3 — 2026-10-01

- The concertina no longer sounds warbly beside the flute. The concertina
  itself holds steady, to a cent or two. The flute was the cause: every note
  over 0.4 s wavered ±9 cents, five times a second, from a third of a second
  in. In unison against a steady reed, that beat. With the concertina ticked,
  the flute now plays with no vibrato. Alone it has a light one (±4 cents),
  on notes of 0.6 s or more, coming in after a quarter of a second, as an
  Irish flute player would.

### Session Players 1.7.2 — 2026-10-01

- The flute and concertina together no longer sound jittery. The flute's
  notes swell in over 30 ms, so each was heard 27 ms after its time, while
  the recorded concertina's are heard right on it: a flam on every note.
  The flute's swell now starts early, and each note of both is heard within
  a few milliseconds of its time and of the other (the flute 5-6 ms, the
  concertina -1 to 5). This also puts the flute on the beat with the guitar
  and drum, where it had always sat a touch behind.

### Session Players 1.7.1 — 2026-10-01

- No more momentary clash between the flute and the concertina. Their notes
  carried over differently: the concertina's old note, held a touch past the
  next and dying slowly (tuned for the synthesised one), sat against the
  flute's new note for about 130 ms at most changes in The Sunny Banks,
  often a second or a third apart; and with their different lilts, their
  notes between the beats started up to 12 ms apart. Now the concertina's
  note ends as the next begins and its reed stops as quickly as a real one
  (20 dB down in 35 ms), and playing together the flute takes the
  concertina's lilt, so they start every note as one. On its own the
  concertina still flows (a dip of under 5 dB between notes), and its
  repeated notes are crisper.

### Session Players 1.7.0 — 2026-10-01 — A real concertina, a smoother guitar

Feedback from a mandolin teacher: the guitar "sounds like someone hitting a
wire fence with a pole", and the concertina "too much like a keyboard".

- The concertina now plays recordings of a real one: the notes of a modern
  30-key Anglo concertina with steel reeds, G3 to B6, cut from a recording by
  Alwayswonder on Wikimedia Commons (CC BY-SA 4.0, credited on the page and
  with the samples). Each is retuned to A=440 (the instrument sits up to 28
  cents sharp), starts as the reed speaks (the recording's slow swell, a
  demonstration's, is left out), and is held as long as the tune needs by
  looping through its steady part with its slow fade evened out, so long
  notes don't pulse. The lilt, weighting and carry-over still shape it. The
  recordings (596 KB) load when you tick the concertina.
- The guitar is smoother: see guitar demo 1.11.0, which it shares.

### Session Players 1.6.1 — 2026-10-01

- More lilt, and most on the concertina, whose bellows give it more bounce:
  a jig's first quaver of three is now held 12% long on the flute and 16%
  on the concertina (8% on both before), and a reel's pairs go 55:45 and
  57:43 (53:47 before). The concertina also leans harder on the beat (0.92
  on the beat against 0.60 between, where the flute has 0.89 against 0.66).
  Each follows its own lilt: playing together their beats meet, and the
  notes between sit a few thousandths of a second apart, as two players'
  would.

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
