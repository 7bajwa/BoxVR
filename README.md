# BOXFLOW

A VR boxing rhythm trainer for **Meta Quest 3**, built with WebXR and three.js. It runs free in the Quest Browser through GitHub Pages, and also works on a desktop browser (keyboard) or a phone (touch pads). There's no build step.

It has two modes:

- **Endless Trainer** loops the boxing combo forever: Right Uppercut → Jab → Right Hook → Left Uppercut → Right Cross → Left Hook. You can turn on a speed ramp.
- **Song Levels** are charted levels on upbeat songs, with Easy, Normal, Hard and Expert charts.

There are four scenes, each with its own targets, effects, music and ambient sound:

| Scene | Targets | Effect | Music | Gloves | Hurdles |
|---|---|---|---|---|---|
| Neon City | holo cores | neon burst | Neon Drive (124 BPM) | boxing gloves | laser beams |
| Haunted Hollow (Halloween) | jack-o'-lanterns | pumpkin embers | Pumpkin Stomp (128) | orange gloves | witch's brooms |
| Foghorn Point (lighthouse) | yellow light orbs | lantern mist | Tidal Light (116) | yellow rain gloves | oars |
| Deep Space | asteroids (gold + gem variants) | rubble | Hyper Jab (140) | astronaut gloves | metal trusses |
| Jingle Street (Christmas night) | glass ornaments | glass & glitter | Jingle Rush (132) | Santa mittens | candy canes |
| Snow Park (winter day) | snowballs | snow puff | Snow Day (122) | knitted mittens | snowy branches |

## Playing

**Quest 3:** open the GitHub Pages URL in the Meta Quest Browser and tap **ENTER VR**. You can use hand-tracking (make fists) or Touch controllers. Your hands become gloves that match the scene.

- **Menu hub:** level select in the middle, **Options** on the left and your local **Top 10** on the right. Point and pinch, or pull the trigger, to choose. Use **‹ ›** to change scene.
- **Two colours = which hand:** blue targets are for the left hand, pink-red targets for the right.
- **Arrows = which direction:**
  - a dot means a straight punch
  - chevrons on the side mean a hook coming across
  - chevrons below mean an uppercut
  - Some targets also show the direction themselves: jack-o'-lanterns *look* toward the side the punch comes from, and ornaments carry a snowflake on that side.
- **Hit volumes are forgiving:**
  - straights can be met a little early
  - uppercuts have a tall zone and are judged on the fastest, upward part of the punch
  - short hand-tracking dropouts mid-punch are bridged
- **Strict direction** (on by default): punching the wrong way counts as a mistake.
- **Scoring:** each hit is worth `35·timing + 35·power + 30·swing`, multiplied by your streak (up to ×2). A lazy tap scores about 40 points; a full, fast punch about 100.
- **Haptics:** rumble scales with how hard and far you punched, up to the **Haptics** strength you set.
- **Hurdles** (on by default): bars and walls fly down the lane.
  - **Duck** under a bar (lower your head by about 26 cm).
  - **Lean or step** away from a wall (move your head about 15 cm past the centre).
  - A clean dodge earns a bonus and keeps your streak. Getting hit counts as a mistake.
- **Game over:** 3 mistakes or misses in a row (can be turned off).
- **Speed ramp** (Endless): starts at your chosen speed and adds **+0.1× every 6 s**, which is smooth rather than a jump every minute.
- **Pause:** press **B / Y**, use the ❚❚ button low on your left, or press the Meta button. Coming back always shows Continue / Restart / Main Menu.
- **Target height** (Options): straight punches hit at this height, 160 cm by default.

**Browser:** `S` `D` `F` throw left uppercut, hook and jab; `J` `K` `L` throw right cross, hook and uppercut. Hold `C`/`↓` to duck, and `Q`/`←` or `E`/`→` to lean. `Enter` plays and `Esc` pauses. On phones, tap the pads (hurdles are off on phones).

## Where scores are stored

Everything is stored **on the device, in that browser only**:

- Top-10 scores (one board per song and difficulty, plus Endless and Endless + Ramp) and settings live in `localStorage`.
- Custom-level audio lives in IndexedDB.

There's no account and no server. Clearing the browser's site data clears your scores. Different browsers or headsets keep separate scores.

## Level Creator (`editor.html`)

Open it from **Options → Level Creator** on desktop, or go to `/editor.html`.

1. Pick one of the built-in songs, or **load your own CC0 audio file**. For your own file, set the BPM (use **Tap**) and the **offset** (when beat 1 starts in the file). Turn on the metronome to check the alignment.
2. Choose the scene, target style and effect.
3. For each difficulty, add targets in one of three ways:
   - **Click** cells on the beat grid.
   - **Record** live: press Record, then `S D F J K L` while the song plays, or `Enter` for the next move in the combo.
   - **Auto-fill**: every N beats, or following the song's energy.
4. **Save & Test in game** stores the level on this device and opens it straight away.
5. **Export JSON** downloads the level file. To ship it to everyone, see [content/README.md](content/README.md).

## Adding scenes, targets, effects, songs and levels

All content lives in `/content`, one folder per item. It can be a JS module or a `.glb` model, plus a small JSON file, and it's listed in `content/registry.json`. Mix any of them into levels. Full guide: **[content/README.md](content/README.md)**.

## Project layout

| Path | Role |
|---|---|
| `index.html`, `css/style.css` | Game page (3D menus, HUD strip, VR button, touch pads) |
| `editor.html`, `css/editor.css`, `js/editor.js` | Level Creator |
| `js/main.js` | Game orchestrator: states, endless/songs runs, ramp, game over, scores, XR, input |
| `js/ui/panel.js`, `js/ui/menus.js` | Canvas panel toolkit + menu hub, pause, results, VR HUD |
| `js/spawner.js`, `js/target.js` | Beat-clock spawner, hit judging (hand, direction, timing, power, swing), target framework |
| `js/rig.js`, `js/gloves.js` | Quest rig: hands/controllers → fists (gap bridging, peak velocity, swing), themed gloves, haptics, B/Y pause |
| `js/hurdles.js` | Hurdle visuals (duck bars, side walls) per theme |
| `js/audio.js` | Data-driven synth sequencer, audio-file songs, ambience, SFX |
| `js/charts.js` | Chart builder (explicit notes or auto by song energy) |
| `js/content.js`, `js/kit.js` | Content loader (JS modules + GLB) and the toolkit plugins receive |
| `js/scoring.js`, `js/storage.js`, `js/config.js` | Scoring, on-device storage, actions/tuning |
| `content/` | Scenes, targets, effects, songs, levels |
| `vendor/` | three.js r170 + GLTFLoader (vendored for offline use) |

## Run locally

```bash
python tools/serve.py
```

This opens at http://localhost:8765. It's a no-cache server, so your edits show up on reload.

## Publish on GitHub Pages

Push to `main`. The workflow in `.github/workflows/pages.yml` deploys automatically. The repo's **Settings → Pages → Source** must be set to **GitHub Actions**.

## APK (optional)

`tools/build-apk.ps1` wraps the hosted site with Meta's PWA packager (`ovr-platform-util`) for sideloading. It needs the Android SDK and a JDK. See the comments in the script.
