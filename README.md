# Bodhrán — Irish trad accompaniment

Rhythmic bodhrán accompaniment for practising traditional Irish tunes. Pick a
tune type, set the tempo, and play along. Reels, jigs, slip jigs, polkas,
hornpipes, slides, waltzes, marches, barndances and mazurkas.

## Run it

From this folder:

```bash
python3 serve.py
```

Then open <http://localhost:8777>. No build step, no dependencies, no npm.

Use `serve.py` rather than plain `python3 -m http.server`. The plain server
sends no cache headers, so the browser guesses how long to keep each file and
can go on running an old copy of a script you have just edited — an edit to
`js/patterns.js` then appears to do nothing. `serve.py` tells the browser not
to cache. If you ran the app with the plain server before, do one reload that
bypasses the cache to clear what it already kept: **⌘⇧R** in Chrome or Edge,
**⌥⌘R** in Safari (in Safari ⌘⇧R opens Reader instead). Otherwise the browser
can mix old and new files, which can stop the app starting at all.

You can also just double-click `index.html` — the scripts are plain
`<script>` tags rather than ES modules precisely so that works.

**Basic and Advanced.** A switch under the title picks how much is on screen.
Basic (the default) has tempo, tune type, rhythm, the bar display, count-in,
volume and the drone. Advanced adds the feel sliders, the drum's tuning, tone,
back hand and room, the drone level and GarageBand. In Basic each panel says
what it keeps back ("More in Advanced: …"), and tapping that line opens
Advanced without moving the page. Settings kept back still count, so any that
have been changed from where they started are flagged in that line. Mark a
control as advanced with `class="adv" data-adv="its name"` in `index.html`; the
panel's line is built from those names.

**Keys:** `Space` play/stop · `F` finish · `←`/`→` tempo · `T` tap tempo. On a
tune type or a rhythm, the arrow keys move the choice instead. A tempo outside
a tune type's range is brought inside it, and the range shows under **bpm**.

The drone roots are D, G, A, E, B, C, F and B♭.

## Checks

Open <http://localhost:8777/tests/> (or `/tests/` on the live site) and press
**Run checks**. In about ten seconds it checks the rules the app has settled on,
against the real code:

- **Patterns** — every pattern fits its meter; no tak on a main beat; accents
  fall on the quavers; every style has more than one fill; Pulse is the low
  drum only; every style reaches 60 bpm; triplet fills are well formed
- **Choosing patterns** — fills only on the last bar of a phrase; Busyness
  behaves at both ends
- **Timing** — a tab left playing behind another keeps every stroke; quavers
  and triplets land exactly; tempo changes wait for the
  next bar, and so do tune changes and the swing that goes with them; phrases count from the first bar the drum
  plays, not the count-in; a frozen page never stacks strokes; Pulse is dead straight; Simple
  never wanders; a one-bar count-in is one bar of clicks
- **Sound** — dum, tak and ghost are the same skin; stroke levels; the back
  hand raises the pitch and shortens the ring; no clipping
  at maximum volume and room; taks audible at the fastest tempos; nothing
  sounds after Stop; changing the drone's root leaves nothing behind
- **Back hand** — one smooth arc through each phrase, open at the top and
  letting go across the last bar; off means off, and never in Pulse, the
  count-in or the last stroke of a Finish
- **Finish** — played N times, it ends on the last bar of the last time, and
  lowered part-way it ends at the end of that time; the last stroke lands on
  beat 1 of the phrase's last bar;
  pressed in that bar it waits for the next phrase; it can be taken back, and
  a stall cannot lose it
- **MIDI** — one drum note; velocity tracks how hard the stroke is; the
  count-in goes to a note of its own
- **The app** — version shown; each tune keeps its tempo; Space after a slider;
  modes grey out the right controls; Finish ends the tune and puts Play back;
  length and times through are on show, counted, and kept per tune;
  the silent-switch setting is for phones only; every Play asks the sound to
  start; the count-in starts at two bars, goes to four, and is counted on
  screen; text and buttons stay easy to read in the green-and-gold colours; while playing it says whether it is making sound; stopped and
  quiet, it lets go of the speaker; your settings come back after a reload; the screen stays on while
  anything plays, on all three pages; in Mac Safari the sound goes out through
  an audio element, and nowhere else; the fallback nudge is a second long and
  far below hearing; every drone root plays the
  note it names; a tempo outside the range says so;
  arrow keys move the choice of tune type and rhythm;
  the About names the panels as they are;
  Space ignored while About is open
- **Basic and Advanced** — Basic keeps the advanced controls back and says so
  in every panel; Advanced shows everything and is remembered; a changed
  setting kept back is flagged; a panel's line opens Advanced right there
- **Phone layout** (in a phone-sized copy of the app) — the rhythm choice is on
  the first screen; Play sits beside the tempo; the pinned Play/Stop bar appears
  when scrolled down, works, and never covers the page; without MIDI (an
  iPhone) the GarageBand panel is one line
- **Offline copy** — its file list covers everything the page loads, and every
  file on it exists; run against a stand-in network, a slow page never mixes
  old and new files, the copy survives two refreshes at once and answers an
  old link offline, and the app asks for a refresh a while after starting
- **Guitar** (the retired demo's checks that try the guitar Session Buddies plays; its old address points on) — every bar of The Kesh is a full 6/8 bar; every chord has
  a shape and the drone rings through; the guitar is in tune and strums
  smoothly, near a real steel-string chord; the page builds;
  each sound's volume is heard straight away and remembered; DADGAD is
  D A D G A D with the low D and top D open in every shape, and the low D
  drones under every chord (standard has none); the tuning switch changes the
  shapes and is remembered; the bodhrán is not buried under the guitar; it
  wakes a silent Safari tab the way the app does; it says whether it is making
  sound, or not; stopped, it lets go of the
  speaker; hidden, it plans ahead and
  Stop drops the lot; open strings ring in sympathy, DADGAD more, and the
  switch works and is remembered; a fretted string the next chord leaves out
  stops; the page plays no bass
  runs, for now; the parked bass-run
  engine still walks up into the next chord, settles like a guitar string, and
  starts from a thumb pluck; it shows its own version and the notes cover it
- **Session Buddies** — The Kesh read from the Session matches the demo note
  for note; repeats, endings and pickups come out as played; keys and
  accidentals; triplets, halves, dotted pairs and ties keep the bar; six real
  tunes lay out in whole bars; chosen chords come from the key, start and end
  at home, and have shapes; every shape plays its chord; the page builds a
  tune and plays it; a changed chord holds through repeats and through save and
  open; flute and concertina are heard on time, together, on every note;
  the concertina plays recordings of a real one, credited; together the
  flute and concertina start each note as one and don't clash at the changes; the flute's
  vibrato is light, late, and left out with the concertina; the concertina holds
  a long note steady, without a waver each time round its loop; the tune lilts, leaning on the beat with a jig's first quaver held
  long, the concertina more than the flute; the concertina's notes carry over and a repeated note is struck again;
  the concertina sounds like a reed, plays in tune and sits with the
  flute, and ticking it plays the tune on it; the chosen tune and setting are
  shown where you found it; a first visit opens with a tune ready to play; your tunes are a tap away; your work is kept when you search a tune you have; settings the audit found misread read right; the last time through ends on the tune's own last note; a chord you change is kept, played or not, and a reset can be undone; Finish ends at the end of this time through, and so does lowering “Play it”; your turn drops the melody where you choose; the backing rides the tune’s lilt as you choose, and triplets stay even; hornpipes, polkas,
  slides, slip jigs and waltzes play, each in its own time (a waltz's guitar
  oom-pa-pa: the bass note alone, then the chord on the top strings); the app and
  Session Buddies link to each other at the foot; chords follow the shape of a part; the matches fold away once one is picked; reopening keeps your chords and
  chooses the rest afresh; finding a tune asks the Session and offers only
  the types it can play; it
  shows its own version and the notes cover it; its top is the app's (own
  icon, tagline, About) and What you hear folds into a summary
- **Release notes** (under The app) — `CHANGELOG.md` and `release-notes/` both
  have an entry for the current version, so bumping the version means adding
  the notes in the same change

Your saved settings are put back afterwards. Each check says which rule it
protects and why, so a failure tells you what broke. Most of these rules were
broken at some point and only noticed because somebody measured.

Some checks pin a deliberate choice — how loud a ghost is, which MIDI note the
drum uses. Change one of those on purpose and its check will fail; update the
number in `tests/tests.js` as part of the same change.

## Why a web app first

Three reasons, and the third is the one that decided it:

1. The hard part of this project is *musical*, not technical — which patterns
   sound like a real bodhrán player rather than a drum machine. A web app lets
   you change a pattern and hear it a second later.
2. It runs on your Mac and on your phone (add it to the home screen from
   Safari) from the same code.
3. This machine has Xcode Command Line Tools but not full Xcode, so a Swift app
   cannot currently be compiled here at all. See the roadmap below.

## How the rhythm works

There are no audio samples. Every bodhrán hit is synthesised in
[`js/bodhran.js`](js/bodhran.js) from oscillators and filtered noise — the
skin ringing (its fundamental and the next five modes of a round drumhead, at
1.59, 2.14, 2.30, 2.65 and 2.92 times it, each a little different from stroke
to stroke and dying away sooner the higher it is, all settling a few percent
in pitch as the struck skin relaxes), the goatskin's slap (band-passed noise
in its middle register, through the same tone filter), and a noise transient
for the tipper striking the skin. Down strokes, up strokes and ghost notes all
share that one skin model and differ only in the stroke (`Bodhran.STROKES`):
the up stroke is lighter, with less fundamental, less pitch bend, a shorter
ring and relatively more stick; a ghost is lighter again, a faint thump and a
soft tick about 22dB under a down stroke. Until 1.10.0 a dum swooped down
almost an octave in 55 ms, the electronic kick drum's recipe, nearly all of it
under 120 Hz. That means nothing to download or license, and the drum can be
re-tuned live.

**Back hand** brings in the player's other hand, pressing on the skin from
inside: at full pressure the pitch rises about a fourth (5 semitones) and the
skin rings shorter, with less boom. The hand moves slowly while the tipper does
the fast work, so it follows one arc per phrase (`TRAD.backHandShape` in
`js/patterns.js`): open at the top, pressing in through the middle, letting go
across the last bar so the fill falls in pitch into the next phrase. In Full
mode each phrase presses in a little differently. It is off in Pulse, the last
stroke of a Finish is played open, and it defaults to off. MIDI carries only the
strokes, not the pitch.

Rhythms live in [`js/patterns.js`](js/patterns.js) as **grid strings**. Each
character is one evenly-spaced slot in a bar, so the string's length sets the
resolution:

| Char | Meaning |
|------|---------|
| `D`  | accented "dum" — a down stroke, on the beat |
| `d`  | dum, unaccented |
| `T`  | accented "tak" — an up stroke, between the beats |
| `t`  | tak, unaccented |
| `g`  | ghost — the tipper barely touching the skin, felt more than heard |
| `-`  | rest |

So the classic jig figure "down (skip) up, down (skip) up" is `D-tD-t`: six
slots for 6/8, hits on 1, 3, 4 and 6.

**The rule that shapes every pattern here:** the tipper oscillates, so down
strokes land on the beats and up strokes land between them — the bright `tak`
belongs *off* the pulse. Putting it on beats 2 and 4 gives a rock backbeat
played on a bodhrán, and Irish music has no backbeat. Weight follows the dance
(1 and 3 in a reel, 1 and 4 in a jig, 1 in a waltz, 2 in a mazurka) and is
carried by a harder down stroke, not by switching sound. If you add patterns,
keep `T`/`t` off the main beats.

There are three rhythm modes. **Full** uses the weighted banks below.
**Simple** locks to the tune's `simple` bank, which holds exactly one grid —
the plain steady figure for that style — never chosen by the weighting; the
transport reaches for it directly. **Pulse** uses the `pulse`
bank, one character per beat: low drum only, no tak, with humanising and swing
suppressed so it stays a dead-straight reference — but weighted where the dance
falls (1 and 3 in a reel, 1 in a waltz, 2 in a mazurka) rather than four
identical thuds a bar, which is a disco kick.

The other four banks — `sparse`, `core`, `busy` and `fills` — drive the
varying mode. The
**Busyness** slider shifts the weighting between the first three; a `fills`
pattern gets thrown in at the end of each phrase. A bar also has a decent
chance of repeating the previous one, because a player who changed pattern
every single bar would be exhausting to play along with.

### Adding your own pattern

Add a string to the right bank. The only rule is that its length must divide
evenly by the tune's `beatsPerBar`, so a jig pattern is 6 or 12 characters, a
reel 8 or 16. `TRAD.validatePatterns()` runs on page load and reports any grid
that breaks the rule in the browser console. Every style runs from 60 bpm up,
so slow practice works anywhere.

To mix quavers and triplets in one bar, give each beat 6 slots — in 4/4 that is
24 characters. A quaver then falls every 3 slots (`D--t--`) and a triplet note
every 2 (`D-t-d-`). The reel's triplet fills are built this way; the same trick
works for any duple-time style.

Fills are only ever played on the last bar of a phrase. Phrases count from
the first bar the drum plays, so if the tune starts as the drum comes in, the
bar counter follows the tune. The picker repeats the
previous bar's pattern some of the time so the drum does not change every bar,
but it never repeats a fill, so a fill cannot spill onto the next phrase.

### Timing

Scheduling uses the standard Web Audio lookahead pattern (`js/transport.js`): a
coarse 25 ms timer schedules notes *ahead* of the clock against
`ctx.currentTime`, which is sample-accurate. Firing notes straight from a timer
callback drifts audibly within a few bars. Measured drift here is about 0.1%
over 17 seconds, which is the measurement noise floor rather than real drift.

**Length** and **Play it** (under the bar display) end the tune by
themselves: choose, say, 32 bars (AABB) and 3 times, start the tune as the
drum comes in, and on the last time through the drum lands the same ending as
Finish on beat 1 of bar 32. The counter shows the bar and the time through.
Each tune type keeps its own length, starting at 64 bars for waltzes (16-bar parts) and 32 for the rest. Lowering the number
part-way through ends at the end of the time through you are on.

**Finish** plays on to the last bar of the phrase and lands one hard down
stroke on its first beat, where a tune's final note falls, then stops and lets
it ring. Pressed during that last bar, it goes round to the next phrase's last
bar instead; pressed again, it is taken back.

While the page is hidden behind another tab, the scheduler plans five seconds
ahead instead of a tenth of a second (Safari slows a background tab's timers to
about once a second, even while it plays). The bar display and counter show
the bar being heard, not the one planned.

Tempo, tune type and busyness changes land on the **next bar boundary**, which
is where a musician expects them to land. Stop drops any strokes already
queued, so nothing sounds after it.

Swing is a piecewise-linear remap of position-within-beat, so it works at any
grid resolution: at 1.0 the quaver offbeat sits exactly on the triplet (0.667).
The Swing slider speaks a player's terms instead, the long quaver against the
short, 50:50 to 70:30 (`TRAD.swingShare`, `swingFromShare` and `swingLabel` in
patterns.js convert). Hornpipes start at 64:36 (0.84; it was 0.62, 60:40, until
1.9.0), barndances at 57:43 (0.45), everything else straight. Each type keeps
the swing you set for it (`swing_<type>` in the saved settings), and a type
that swings shows the slider in Basic.

## Sending it to GarageBand

The app can drive a software instrument in GarageBand (or Logic, Ableton,
Reaper) over a virtual MIDI bus:

1. Open **Audio MIDI Setup** (in `/Applications/Utilities`).
2. **Window → Show MIDI Studio**, double-click **IAC Driver**, tick
   **Device is online**, and make sure there is at least one bus.
3. Reload this app in **Chrome or Edge** and allow MIDI when prompted.
4. Pick the IAC bus under *Send to GarageBand*, tick **Send MIDI**, hit play.
5. In GarageBand, make a **Software Instrument** track with a drum kit.

Every stroke goes to one drum note (default 41, the low floor tom in a General
MIDI kit), because every stroke on a bodhrán lands on one skin. The count-in
clicks go to their own note (default 37, the side stick), so a recording has
them to line up by without them sounding like the drum. Dum, tak and
ghost are told apart only by velocity — and since sampled kits change timbre
with velocity, a light stroke sounds lighter rather than just quieter. If your
kit has a frame drum or a deeper tom, set **Drum note** to that.

Safari does not implement Web MIDI, so that panel stays disabled there. The
synthesised drum still works fine in Safari.

## Putting it on the web

The whole app is static — no server, no build step, no dependencies — so any
static host will serve it as-is. **This folder is the site root**, which is why
it is its own git repo: the parent folder contains unrelated files.

HTTPS matters here beyond the usual reasons: Web MIDI and service workers both
require a secure context. Cloudflare gives you that automatically.

### Option A — GitHub → Cloudflare Pages (recommended)

Best if you expect to keep tweaking patterns, because every `git push`
redeploys. Same shape as a Pages project connected to a repo.

```bash
gh repo create bodhran --public --source=. --remote=origin --push
```

Then in the Cloudflare dashboard: **Workers & Pages → Create → Pages →
Connect to Git**, pick the repo, and leave the build settings empty —

| Setting | Value |
|---|---|
| Framework preset | None |
| Build command | *(leave blank)* |
| Build output directory | `/` |

There is nothing to build; Cloudflare just uploads the folder.

### Option B — drag and drop

Fastest way to get a URL. **Workers & Pages → Create → Pages → Upload assets**,
then drag this folder in. No git, no CLI. The tradeoff is that every update
means dragging it again.

### Option C — Wrangler from the terminal

```bash
npx wrangler pages deploy . --project-name=bodhran
```

### After it is live

- `_headers` is already set so HTML, CSS and JS revalidate on each load.
  Without it, a deploy would be invisible behind a stale browser cache, because
  the filenames are not content-hashed.
- The version shown next to the title (it lives at the top of `js/app.js`)
  tells you which deploy you are looking at. Bump it with each change you push;
  if a phone still shows the old number, it has an old copy — reload it.
- On your phone, open the site in Safari and **Share → Add to Home Screen**. It
  launches full-screen with its own icon.
- It works with no signal at all. `sw.js` keeps an offline copy of the app
  and uses it when the network is slow or absent — most pub basements. It
  never mixes old and new files in one page load: whether the page comes from
  the network (with a 2.5s limit) decides where *every* file for that load
  comes from; a page counts as offline only if it actually came from the
  offline copy (a slow Session Buddies is from the network, files and all).
  And the offline copy is only ever replaced as a complete set, downloaded
  fresh 30 s after a page has started up properly online (not mid-deploy),
  one refresh at a time, each deleting only older copies. A newer
  `app.js` running with an older drum file can fail on start-up, which is
  silence, so this matters more than it sounds.
- **Safari on a Mac going silent.** After the Mac sleeps, a Safari tab can go
  quiet: the app looks as if it is playing, the drone and count-in are silent
  too, reloading does not help, and a new tab works. Safari says its audio is
  running while holding it back. Every press of Play (or the drone) now asks
  it to resume anyway, and in Mac Safari also plays a second of near-silence
  (`TRAD.nudgeWav`, one step of hiss at 44.1 kHz) the way a video plays,
  since that route still worked in a stuck tab. It went silent again on
  29 September with the old nudge (a twentieth of a second of pure silence);
  the sound page's plain one-second file (B) woke it. If it happens again,
  open `/tests/sound.html` in the stuck tab and press A; if A is silent,
  press F (the nudge alone), then A again. That shows whether the nudge
  wakes it. First, though, read the **Sound check** line under Play (hidden
  since app 1.10.1 and Session Buddies 1.18.4: open the page with `?soundcheck`
  in the address to show it)
  (`TRAD.soundCheck`, an analyser on the limiter and trim at the end of
  `TRAD.makeOutput`): "making sound" while nothing is heard means Safari is
  losing it; "no sound" or "broken" means the fault is in the page. On 29
  September the stuck tab said "making sound", and in it the sound page's
  direct beep (A) was silent while the audio-element beep (C) played and
  woke A. So since 1.6.6, in Mac Safari the output chain ends in a
  MediaStream played by an audio element (`TRAD.speaker`), started from each
  Play and paused at rest. Session Buddies stopped using it in 1.21.1
  (`makeOutput(ctx, { direct: true })`): under its four instruments Safari's
  audio faltered for a moment and the element made up the gap by playing
  slower, the whole sound running down like a tape while the page's clock
  kept time, and staying behind until Stop. The element's own clock reads as
  on time throughout, so it cannot be caught from the page. It keeps the
  near-silent nudge on each Play.
- **Keeping the screen on.** While anything plays (in the app the drum or
  the drone), each page holds a screen wake lock (`TRAD.keepAwake` in
  `js/wake.js`): a phone that locks itself takes the sound with it. The
  browser lets go of it whenever the page is hidden, so it is taken back, and
  the sound woken (iOS parks it as 'interrupted' after a call or Siri), when
  the page is shown again.
- **Letting go of the speaker.** Stopped (and, in the app, with the drone
  off), each page suspends its audio a few seconds after the last note
  (`TRAD.restAudio` in `js/wake.js`), and the next Play resumes it. Left
  running, a stopped tab kept its audio open, and the Mac from idle sleep,
  for as long as it stayed open. (An open YouTube tab holds Safari's speaker
  too, whenever its player is loaded, so a long hold in the log may not be
  ours.) To see what Safari's audio is really doing,
  the Mac's log is the place to look: `/usr/bin/log show --last 30m
  --predicate 'process == "coreaudiod"'` reports the speaker's level every ten
  seconds (`node=-Output ... rms`) and which process holds it (`power
  assertion ... on behalf of <pid>`).
- Deleting `sw.js`, the `icons/` folder, `manifest.webmanifest` and the two
  tags that reference them in `index.html` removes all of that cleanly if you
  would rather not have it.

## Guitar backing demonstration (retired)

`/guitar/` was a page of its own, apart from the app: The Kesh (setting 1 from
thesession.org, note for note) with a synthesised guitar backing, and the
tune on a simple flute and the app's bodhrán to play against. It was retired
on 3 October 2026, Session Buddies doing all it did with any tune: the address
now says so and links to Session Buddies and the app. Its guitar stays in
`guitar/`, as Session Buddies plays it; the notes below describe it as built.

- `tests/kesh.js` (until the demo was retired, `guitar/kesh.js`) — the tune as
  data: the ABC, the chords bar by bar, the guitar shapes, and a small ABC
  reader; now only the guitar's checks play it
- `guitar/guitar.js` — the guitar: since demo 1.11.0 each strummed string starts
  from a soft pick (noise softened to ~4 of the note's harmonics, `GTR.PICK`)
  and loses its top as it rings, set against a real steel-string G chord;
  before that, each string a Karplus–Strong plucked
  string, rendered once and pitch-corrected to within a cent, strummed down
  from the bass or up from the treble a few milliseconds apart. The bass-run
  notes are a thumb-plucked string of their own (`pluckThumb`): started from
  the slope of a rounded bend, two slightly detuned vibrations, a lowpass and
  an exactly tuned fractional delay inside each loop, a pitch settle, and
  the body's resonances by convolution
- `guitar/demo.js` — (removed with the demo) the clock, the flute, the chart
  and the shape diagrams

The demo had its own version number, last 1.12.0. The guitar's sound is shaped like a dreadnought:
by measurement, the bass below 150 Hz is its strongest band.

Chords: A part G | D | C | D | G | D | C | D G, B part G | C D | G | D |
G | C G | Em D | G, in two tunings, switchable on the page: DADGAD (the
default: G/D 020000, Cadd9/D 032030, D5 000200, Em7/D 022020, the low D and
top D open in every shape, so they drone under every chord, and the G in three) and standard (G, Cadd9 and Em7 hold D and G on
the top two strings; D takes F sharp). Open strings ring in sympathy
(switchable): each open string in a shape hums along, fed by how many of the
other sounding notes it is in tune with (`GTR.coupling`), so DADGAD, with more
open D, A and G strings, rings more than standard. (1.8 also let open strings
ring through chord changes; it was dropped in 1.9.0 for the drone shapes, as
its re-strike cancelled part of the sound.) Bass runs were tried (1.4.0-1.5.0) and
taken off the page in 1.6.0; their data (`KESH.runs`, `KESH.runFrom`) and the
thumb-plucked string (`pluckThumb`, `Guitar.pick`) are kept, with their checks,
for later. The checks cover the tune's bars, the shapes,
the guitar's tuning and the page itself.


## Session Buddies

Called Session Players, at `/players/`, until 1.8.0. `players/index.html` now
only says so and forwards to `/buddies/`, for old bookmarks. Saved settings
keep their `players.` names in local storage, so they carry over.

A first visit opens with a starter tune, The Kesh (`STARTER` in buddies.js:
the Session's setting 1, kept in the page), so Play plays before any search.

Backing feel (`backingFeel`: straight, little, tune; `players.backing`):
`backingAt(s)` places the guitar's strums and the drum's strokes, straight
(a hornpipe swung by its Swing control), half way, or on the melody's own
lilt (`warp()` for the concertina if ticked, else the flute). `asWritten()`
leaves triplet beats as written in every type, and in a swung type any beat
not in plain quavers.

Finish (under Play, or F) ends the tune at the end of the time through it is
pressed in (`finishAt`, `isLast()`); lowering "Play it" does the same. The
Melody choice (`melodyMode`: every, turns, a, b; `players.melody`) drops the
flute and concertina on your turn (`yourTurn(n)`), silent or quietly
(`players.yourturn`), the backing carrying on.

My tunes (in Find a tune): favourites (`buddies.favourites`, by name) and the
twelve played lately (`buddies.recent`, added on Play), each kept as a saved
file would be (`fileData()`), so it opens with no network, its own setting and
the chords you changed (and changing one updates the copy). Save my tunes
writes `format: "session-buddies-list"`, which Open a saved tune merges back.
A tune fresh from the Session (a search, or another setting) uses your copy if
you have one (`copyOf` in `build()`): your chords and tempo; search results
mark it and open your setting. Opening one of your tunes brings back only the
tune's own things (chords, tempo), never page settings such as the tuning; a
file comes back exactly as saved.

`/buddies/` is another page apart from the app: name a tune and it is found
on thesession.org (its API answers any site, so the page asks it directly;
there is no server of ours), fetched, and played with the guitar demo's
guitar, flute and bodhrán, and a recorded concertina. Jigs, reels, hornpipes,
polkas, slides, slip jigs and waltzes for now (rolls ~ and grace notes {g} read onto
their notes, `orn`/`grace`, and played on the flute by `ornament()` unless Ornaments
is Off; every choice kept under 'players.'
in this browser, the ticks in `players.voices`; the bodhrán's Back hand, `pressAt()`,
the app's arc over each four bars; a waltz's oom on the root and fifth by turns,
`bassString()`; Reset settings clears them all and
reloads, with Undo from sessionStorage; the bodhrán Full, Simple or Pulse
as in the app: `drumGrid()`, Full's fills at the tune's own phrase ends; `TYPES` in buddies.js, keyed by the
Session's names for them; a hornpipe swings by its Swing control, 64:36 to
start and kept in `players.swing.hornpipe`, guitar, drum and tune together; its
triplets, dotted pairs and semiquavers play as written: `asWritten`). The foot
of the app and of Session Buddies switches between the two.

The top of the page is laid out as the app's (since 1.21.0): Session Buddies'
own icon, `buddies/icons/` (`icon.svg` is the source, drawn in the bodhrán
icon's style with a flute, a bodhrán and a guitar in silhouette, chosen by
the user in 1.21.2; the PNGs are drawn from it), the name
and version, a tagline and About (`wireAbout()`). What you hear folds into a
summary (`wireHear()`, `hearRows()`): read from the panel itself, the choice
each group shows as chosen, and redrawn by a MutationObserver while folded;
open or folded kept in `players.hearopen`.

- `buddies/abc.js` — reads the Session's ABC (the body only: the meter comes
  from the tune type, the key from the setting, L:1/8): repeats, first and
  second endings, a :| with no |: (repeats from the last repeat's end),
  pickups, triplets, halves, dotted pairs, ties, rests, grace notes (left
  out), chord symbols. Lays the tune out once through against the meter:
  each played bar belongs to a "slot", the written bar its downbeat falls
  in, so a repeat is the same slot and shares its chords.
- `buddies/harmony.js` — the chords: the setting's own symbols if it has any
  (2 of 75 popular settings did), else chosen per half bar from the chords
  usual for the key and mode (I V IV vi ii; mixolydian I bVII IV v; dorian i
  bVII IV bIII v; minor i bVII bIII iv v bVI), notes on the beat weighted
  more, the ninth counted half in, then a best path (Viterbi) that dislikes
  changing chord, above all mid-bar, starts on the home chord and ends the
  tune on it. Since 1.1.0 it knows a part's shape: bar 4 of each eight leans
  to the cadence chord (V in major; bVII in dorian, mixolydian and minor),
  and bar 8 opens on it and goes home, a mid-bar change there costing little.
- `buddies/shapes.js` — shapes in both tunings: a hand-chosen table (the
  demo's DADGAD drone shapes among them) and a search for anything else
  (root in the bass, chord tones only, a four-fret stretch).
- `buddies/concertina/` — the concertina's recorded notes (`c-<MIDI>.m4a`,
  G3 to B6, 596 KB), cut from Alwayswonder's Anglo concertina recording on
  Wikimedia Commons, CC BY-SA 4.0 (see its README); `samples.json` holds
  each note's measured tuning. `Concertina` plays them: retuned, started as
  the reed speaks (25 ms before it reaches its steady level), looped through
  its steady part (`LOOP`: from 0.2 s, at most 0.7 s, its slow fade evened
  out over 60 ms, the join matched over 10 ms and blended over 100 ms) for
  long notes; recordings that waver in pitch on their own (`wobble` in
  samples.json over 1.5 cents: F♯4, A♯3, A♯4, G♯5) are played from the
  steadier neighbour a semitone away; `ConcertinaSynth`, the synthesised one, plays until they load,
  at their level (`Concertina.STAND_IN`). Each recording loads on its own, tried twice; what arrives is
  kept, a missing note is borrowed from a neighbour up to two semitones away (else the stand-in), the
  missing ones are tried again at Play (`retry()`), and `status` (loading, ready, partial, failed)
  drives the line under the mixer.
- `buddies/flute.js`, `buddies/concertina.js` — the two melody instruments,
  each `new X(ctx, dest)` with `.note(t, dur, midi, vel)` and `.cancelFrom(t)`.
  The flute (since 1.17.0 its own, no longer the demo's) is a wooden one:
  a reedy low octave and a near-pure second (`wave()`, LOW/HIGH harmonic
  tables), breath under every note (`BREATH`: a fluff at the note and a
  hiss above it), a tongued note scooping up from 18 cents flat as its
  overtones bloom in, a breath level that wanders ±0.5 dB and swells and
  eases on long notes; note()'s sixth argument `art` {slur, into}: buddies.js
  (`articulate()`) tongues the note on each beat, a repeated note and one
  after a rest, and slurs the rest, the note before a slur held OVERLAP into
  it; with a lighter vibrato (`VIBRATO`: ±4 cents on notes of 0.6 s or more,
  from 0.25 s in; note()'s fifth argument scales it, and buddies.js passes 0
  when the concertina plays too, as against its steady reed the vibrato beat); the concertina a free reed (a narrow-pulse
  spectrum, odd harmonics a shade stronger, one dry reed a few cents off at
  random, overtones building over 35 ms and brighter pushed harder, a scoop
  up into pitch, a slow random wander in pitch and level from the bellows,
  a breath of air and a trace of it under the note, a box: highpass 180 Hz,
  a lift at 1.7 kHz, lowpass 6.5 kHz). Its notes carry over: held 30 ms
  past the next one's start, dying away with a 50 ms time constant; a
  repeated note is let go 60 ms early so it is struck again
  (`concertinaLength` in buddies.js). It sits about 1 dB under the flute.
- `buddies/buddies.js` — search, settings, the chart and the chord chooser,
  saving and opening files (JSON, `format: "session-buddies"`; files saved as `"session-players"` before the rename open too), and the demo's
  clock, flute, guitar and drum. Its own version is at the top, apart from
  the app's and the demo's: bump it with every pushed change and add it to the
  "Session Buddies" sections of `CHANGELOG.md` and the release notes (a check
  makes sure).
- `tests/fixtures/thesession-*.json` — six popular tunes as the Session gives
  them, so the checks need no network.
## Roadmap

**Chords.** The drone (root + fifth) is in place as the groundwork. Real chordal
backing needs a chord progression per tune and a plucked bouzouki/guitar voice.
The honest hard part is not the synthesis — it is that chords for a trad tune
depend on the mode and the melody, so it needs either a per-tune chord sheet or
ABC-notation import to work out the harmony.

**Native macOS / iOS.** Requires the full Xcode from the App Store, not just
the Command Line Tools installed here. A SwiftUI app with `AVAudioEngine`
would buy lower latency, background audio on iOS, and no browser. The pattern
grids and the scheduler design port over almost unchanged — the grids are plain
data on purpose.

**AUv3 plugin.** The real GarageBand integration, as opposed to the MIDI bus
above: the app appears as an instrument plugin *inside* GarageBand, sharing its
transport and tempo. This is the most work by a distance — an Audio Unit
extension, a host app to contain it, and Apple's audio-thread rules (no memory
allocation, no locks in the render callback). Worth doing only once the
patterns sound the way you want.

## Files

| File | What it does |
|------|--------------|
| `js/patterns.js`  | tune types and rhythm banks — **edit this to change the music** |
| `js/bodhran.js`   | the synthesised drum |
| `js/transport.js` | the clock and pattern selection |
| `js/drone.js`     | root-and-fifth drone pad |
| `js/midiout.js`   | optional Web MIDI output |
| `js/wake.js`      | getting the browser to make sound: the iPhone silent switch, waking Mac Safari, keeping the screen on; shared by all three pages |
| `js/app.js`       | UI wiring, and the version number at the top |
| `sw.js`           | offline caching |
| `_headers`        | Cloudflare cache rules |
| `manifest.webmanifest` | home-screen app metadata |
| `serve.py`        | local server that turns caching off, for editing |
| `tests/`          | the checks page: open it and press Run |
| `CHANGELOG.md`    | what changed in each version |
| `guitar/`         | the guitar Session Buddies plays; `/guitar/` itself, the retired demo's address, points to Session Buddies and the app |
| `buddies/`        | Session Buddies: find a tune on thesession.org and play along, at `/buddies/` |
| `players/`        | Its old address: says it has moved and forwards to `/buddies/` |
| `release-notes/`  | the same, as a page to share: `/release-notes/` on the site |
