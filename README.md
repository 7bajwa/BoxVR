# BOXFLOW

An infinite boxing-sequence rhythm trainer for **Meta Quest 3**, built with WebXR + three.js.
It plays one fixed combo on a loop: you stand in place and punch holographic targets as they reach the gate.
It runs in the Quest Browser, any desktop browser (keyboard), and on phones (touch pads).
There is no build step and no dependencies to install.

## The sequence (from the reference videos)

| # | Action | Hand | Motion | Color |
|---|--------|------|--------|-------|
| 1 | Right Uppercut | right | upward | orange |
| 2 | Jab | left | straight forward | cyan |
| 3 | Right Hook | right | sweep right → left | yellow |
| 4 | Left Uppercut | left | upward | purple |
| 5 | Right Cross | right | straight forward | red |
| 6 | Left Hook | left | sweep left → right | green |

After the Left Hook the loop restarts at the Right Uppercut, and keeps going until you press Stop.
To change the combo, edit `SEQUENCE` in [js/config.js](js/config.js).

## Playing

**Quest 3:** open the GitHub Pages URL in the Meta Quest Browser and tap **ENTER VR**.
The button appears only when a headset is detected, which needs HTTPS (GitHub Pages provides it).
- **Main menu** (floats in front of you): **Play**, **Settings**, **Exit VR**. Point and pinch, or pull the trigger.
- Punch each target with the matching hand as it reaches the gate. Shrinking approach rings show the timing.
  Chevrons on a target show the direction: sideways for hooks, upward for uppercuts. A dot means a straight punch.
- The **HUD** is a thin strip low in front of you: score, streak with multiplier, next move, longest chain and time.
- **Pause:** press **B / Y**, aim at the small ❚❚ button low on your left, or press the Meta button.
  Leaving VR or opening the system menu always pauses, so the **Continue / Settings / Main Menu** panel is waiting when you come back.
- **Recenter** is in Settings and the pause menu. It moves the lane to where you're standing.

**Browser / phone:** keys `S` `D` `F` throw left uppercut, hook and jab. `J` `K` `L` throw right cross, hook and uppercut.
`Esc` pauses, and `Space` plays or continues. On phones, tap the colored pads.

## Settings

- **Speed** goes from 0.1× to 10×. At 1×, one target arrives every 3 s; at N×, one arrives every 3/N s.
  The slider is logarithmic, and the −/+ buttons step by 0.1.
- **Music** turns the background track on or off. The track is generated in the browser and locks its tempo to the target beat at every speed.
- **Scene:** *Neon City* (a hazy skyline that fades into a glowing horizon) or *Minimal* (a few distant monoliths).
- **Haze:** Low / Medium / High. **Reflections:** wet-floor mirror, on or off (turn it off for extra performance).

All settings are saved on the device.

## Scoring

- **Score:** each hit is worth `60 × accuracy + 40 × power`, scaled by punch form. A streak multiplier adds up to 2× at a 20-hit streak.
  - *Accuracy* is how close to the beat you hit.
  - *Power* is fist speed at contact; 4 m/s or faster counts as 100%.
- **Current Streak** and **Longest Chain**. A missed target or a punch with the wrong hand breaks the streak.
- **Session Duration** is shown live, and you get a summary when the session stops. Your best score and chain are saved.

Feedback: a colored particle burst, shockwave and gate flash on every hit, a PERFECT / GREAT / GOOD word, and a soft haptic pulse when you're using controllers.

## Project layout

| File | Role |
|------|------|
| `index.html`, `css/style.css` | Page, desktop/phone UI, importmap |
| `js/main.js` | Bootstrap, renderer, XR session, game state, main loop |
| `js/config.js` | Sequence, action definitions (hand, direction, hit-zone offset, color), tuning |
| `js/rig.js` | Quest 3 VR rig: hands + controllers → fists with velocity/power, pointer rays, haptics |
| `js/spawner.js` | Beat-clock target spawner, straight-lane movement, hit detection & judging |
| `js/target.js` | Holographic target prefab (fresnel/scanline shader, rings, chevrons, glow, label) |
| `js/fx.js` | Particle bursts, shockwaves, floating grade text |
| `js/scoring.js` | Score / streak / longest chain / duration |
| `js/vrui.js` | In-VR settings menu and scoreboard HUD (canvas panels, ray + pinch interaction) |
| `js/env.js` | Arena: sky, stars, scrolling grid, lane rails, gate, flowing arches |
| `js/audio.js` | Procedural looping music + SFX; the AudioContext clock is the game clock |
| `vendor/three.module.js` | three.js r170 (vendored so the app works offline) |
| `sw.js`, `manifest.webmanifest`, `icons/` | PWA: installable and runs offline |

## Run locally

```bash
python -m http.server 8765
```

Then open http://localhost:8765. WebXR needs HTTPS on the headset, so test on Quest through GitHub Pages, or use
`adb reverse tcp:8765 tcp:8765` and open `http://localhost:8765` in the Quest Browser.

## Publish on GitHub Pages (free)

1. Create a GitHub repo (e.g. `boxflow`) and push this folder to the `main` branch.
2. In the repo, go to **Settings → Pages → Source** and pick **GitHub Actions**.
3. The included workflow (`.github/workflows/pages.yml`) deploys on every push.
   The game will be at `https://<user>.github.io/boxflow/`.

## APK for sideloading (optional)

You don't need this. The web version is the full game, and you can install it as an app from the Quest Browser.
If you want a real APK, Meta's PWA packager wraps the hosted site:

1. Install Android Studio (for the SDK + build-tools), a JDK 17+, and Meta's `ovr-platform-util`.
2. Run:
   ```powershell
   ./tools/build-apk.ps1 -SiteUrl https://<user>.github.io/boxflow/ -AndroidSdk "$env:LOCALAPPDATA\Android\Sdk"
   ```
3. Turn on Developer Mode on the Quest (Meta Horizon app), connect USB, then run `adb install -r build/boxflow.apk`.
   The app appears under *Unknown Sources*.

The APK loads the hosted site. After the first launch the service worker caches it, so it also works offline.
