# BOXFLOW

A VR boxing rhythm trainer for **Meta Quest 3**, built with WebXR and three.js. It runs free in the Quest Browser through GitHub Pages, and also works on a desktop browser (keyboard) or a phone (touch pads). There's no build step.

It has two modes:

- **Endless Trainer** loops the boxing combo forever: Right Uppercut → Jab → Right Hook → Left Uppercut → Right Cross → Left Hook. You can turn on a speed ramp.
- **Song Levels** are charted levels on upbeat songs, with Easy, Normal, Hard and Expert charts.

There are four scenes, each with its own targets, effects, music and ambient sound:

| Scene | Targets | Effect | Music | Ambience |
|---|---|---|---|---|
| Neon City | holo cores | neon burst | Neon Drive (124 BPM) | rain |
| Haunted Hollow (Halloween) | jack-o'-lanterns | pumpkin embers | Pumpkin Stomp (128) | wind + thunder |
| Foghorn Point (lighthouse) | yellow light orbs | lantern mist | Tidal Light (116) | ocean + foghorn |
| Deep Space | star crystals | neon burst | Hyper Jab (140) | space drone |

## Playing

**Quest 3:** open the GitHub Pages URL in the Meta Quest Browser and tap **ENTER VR**. You can use hand-tracking (make fists) or Touch controllers.

- **Menu hub.** Level select is in the middle, **Options** on the left and your local **Top 10** on the right. Point and pinch, or pull the trigger, to choose.
- **Scenes.** Use the **‹ ›** arrows to change scene. In Song Levels, picking a level also loads its scene.
- **Punching.** Hit each target with the matching hand as it reaches the gate.
  - The arrows show the direction: chevrons on the side mean a hook coming across, chevrons below mean an uppercut, and a dot means a straight punch.
  - With **Strict direction** on, a punch in the wrong direction counts as a mistake.
- **Scoring.** Each hit is worth `35·timing + 35·power + 30·swing`, multiplied by your streak (up to ×2).
  - **Power** is peak fist speed; **swing** is how far the fist travelled along the punch. A lazy tap scores about 40 points; a full, fast, on-beat punch scores about 100.
- **Haptics.** Rumble scales with how hard and far you punched, up to the **Haptics** strength you set.
- **Game over.** Three misses (or wrong punches) in a row end the run. Turn this off in Options.
- **Speed ramp** (Endless). Starts at your chosen speed and adds 1× every minute until you break.
- **Pause.** Press **B / Y**, use the ❚❚ button low on your left, or press the Meta button. Coming back to VR always shows **Continue / Restart / Main Menu**.
- **Target height** (Options). Straight punches hit at this height, 160 cm by default, in 5 cm steps. Hooks and uppercuts are placed relative to it.

**Browser:** `S` `D` `F` throw left uppercut, hook and jab; `J` `K` `L` throw right cross, hook and uppercut. `Enter` plays, `Esc` pauses, and `←` `→` change scene. On phones, tap the pads.

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
| `js/rig.js` | Quest rig: hands/controllers → fists, velocity, swing tracking, haptics, B/Y pause |
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
