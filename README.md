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
to cache. If you ran the app with the plain server before, do one hard reload
(**⌘⇧R**) to clear what it already kept.

You can also just double-click `index.html` — the scripts are plain
`<script>` tags rather than ES modules precisely so that works.

**Keys:** `Space` play/stop · `←`/`→` tempo · `T` tap tempo.

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
[`js/bodhran.js`](js/bodhran.js) from oscillators and filtered noise — a
pitched membrane thump that drops in pitch as the skin relaxes, an inharmonic
second mode, and a noise transient for the tipper striking the skin. Down and
up strokes share that one skin model and differ only in the stroke: the up
stroke is lighter, with less fundamental, less pitch bend, a shorter ring and
relatively more stick. That means
nothing to download or license, and the drum can be re-tuned live.

Rhythms live in [`js/patterns.js`](js/patterns.js) as **grid strings**. Each
character is one evenly-spaced slot in a bar, so the string's length sets the
resolution:

| Char | Meaning |
|------|---------|
| `D`  | accented "dum" — a down stroke, on the beat |
| `d`  | dum, unaccented |
| `T`  | accented "tak" — an up stroke, between the beats |
| `t`  | tak, unaccented |
| `g`  | ghost — a brush, felt more than heard |
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
reel 8 or 16. Every style runs from 60 bpm up, so slow practice works anywhere. `TRAD.validatePatterns()` runs on page load and reports any grid
that breaks the rule in the browser console.

### Timing

Scheduling uses the standard Web Audio lookahead pattern (`js/transport.js`): a
coarse 25 ms timer schedules notes *ahead* of the clock against
`ctx.currentTime`, which is sample-accurate. Firing notes straight from a timer
callback drifts audibly within a few bars. Measured drift here is about 0.1%
over 17 seconds, which is the measurement noise floor rather than real drift.

Tempo, tune type and busyness changes land on the **next bar boundary**, which
is where a musician expects them to land.

Swing is a piecewise-linear remap of position-within-beat, so it works at any
grid resolution: at 100% the quaver offbeat sits exactly on the triplet (0.667).
Hornpipes default to 62%, barndances to 45%, everything else straight.

## Sending it to GarageBand

The app can drive a software instrument in GarageBand (or Logic, Ableton,
Reaper) over a virtual MIDI bus:

1. Open **Audio MIDI Setup** (in `/Applications/Utilities`).
2. **Window → Show MIDI Studio**, double-click **IAC Driver**, tick
   **Device is online**, and make sure there is at least one bus.
3. Reload this app in **Chrome or Edge** and allow MIDI when prompted.
4. Pick the IAC bus under *Send to GarageBand*, tick **Send MIDI**, hit play.
5. In GarageBand, make a **Software Instrument** track with a drum kit. Adjust
   the dum/tak note numbers until they land on sounds you like.

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
- On your phone, open the site in Safari and **Share → Add to Home Screen**. It
  launches full-screen with its own icon.
- It works with no signal at all. `sw.js` caches the app on first visit and
  serves from cache whenever the network is slow or absent — which is most pub
  basements. Online you still always get the current deploy.
- Deleting `sw.js`, the `icons/` folder, `manifest.webmanifest` and the two
  tags that reference them in `index.html` removes all of that cleanly if you
  would rather not have it.

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
| `js/app.js`       | UI wiring |
| `sw.js`           | offline caching |
| `_headers`        | Cloudflare cache rules |
| `manifest.webmanifest` | home-screen app metadata |
| `serve.py`        | local server that turns caching off, for editing |
