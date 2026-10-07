# BOXFLOW content guide

Every scene, target, effect, song and level is a folder (or file) in `/content`. Static hosting can't list folders, so **every id must also be added to [`registry.json`](registry.json)**.

```
content/
  registry.json
  scenes/<id>/scene.json   + scene.js and/or model.glb
  targets/<id>/target.json + target.js and/or model.glb
  effects/<id>/effect.json + effect.js
  songs/<id>/song.json     + optional audio file (mp3/ogg/wav)
  levels/<id>.json         + optional audio file for Level Creator exports
```

Modules can `import * as THREE from 'three'`. They also receive `ctx.kit` (see `js/kit.js`), which includes glow sprites, text sprites, a sky dome, low-poly materials, mesh merging, a particle system, shockwave rings, `loadGLB(url)` and `disposeTree(root)`.

---

## Scenes

`scenes/<id>/scene.json`:

```json
{
  "name": "Neon City",
  "description": "Shown under the name in the scene picker",
  "module": "scene.js",
  "target": "holo",          // default target style for Endless in this scene
  "effect": "neon-burst",    // default hit effect
  "music": "neon-drive",     // song whose loop section plays in Endless + menu
  "ambient": "rain",         // rain | wind | ocean | space | null
  "gateColor": "#8ff6ff",
  "colors": ["#1b4b8a", "#3b1b6b"]   // scene-picker gradient
}
```

`scene.js` exports `create(ctx)`, which returns the scene:

```js
export default {
  async create({ THREE, kit, scene, renderer, camera, prefs, meta }) {
    const root = new THREE.Group();
    const fog = new THREE.FogExp2(0x14385e, 0.024);
    // ...build things into root. The player stands at the origin facing -Z.
    //    Targets fly down a straight lane at x≈0 from z=-14 to the gate at z≈-0.45.
    return {
      root, fog, background: new THREE.Color(0x14385e),
      update(dt, t, { flow, camera, playing }) {},   // flow = lane speed (m/s)
      setHaze(level) {},          // 0 low, 1 medium, 2 high
      setReflections(on) {},
      setAnchor(anchor, targetHeight) { root.position.set(anchor.x, 0, anchor.z); },
      dispose() { kit.disposeTree(root); },
    };
  },
};
```

### A GLB-only scene (no code)

Skip `module` and point at a model. The game adds a sky dome and fog for you:

```json
{
  "name": "My Island",
  "glb": "island.glb",
  "scale": 1, "position": [0, 0, 0], "rotationY": 0,
  "sky": { "top": "#02040a", "horizon": "#14385e", "glow": "#66ddff" },
  "fog": { "color": "#14385e", "density": 0.02 },
  "target": "orb", "effect": "mist", "music": "tidal-light", "ambient": "ocean"
}
```

Model tips:

- 1 unit = 1 m, floor at y = 0, keep the lane (x −1.5…1.5, z 0…−16) clear.
- Use baked lighting or unlit/emissive materials.
- Keep it light for the Quest: about 100k triangles and a few textures.

## Targets

`targets/<id>/target.json`:

```json
{ "name": "Light Orb", "module": "target.js", "sfx": "chime",
  "glow": 0.7, "glowScale": 0.95, "ring": true, "ringScale": 1, "backplate": 0.75, "labelY": 0.27 }
```

`sfx` is one of `zap`, `thud` or `chime`.

The framework always adds these around your body:

- the dark contrast backplate
- the action-coloured glow and ring
- the direction chevrons
- the label and approach ring

So `target.js` only needs the body, about 0.24 m across, facing +Z:

```js
export default {
  create({ THREE, kit, action, color, meta }) {
    const mat = new THREE.MeshBasicMaterial({ color });     // create materials PER INSTANCE
    const object = new THREE.Mesh(new THREE.SphereGeometry(0.12, 20, 14), mat);
    return {
      object,
      update(t, dt) {},
      flash(v) {},          // 0..1 when hit
      tint(gray) {},        // true when missed
    };
  },
};
```

A **GLB target** needs no code: `{ "name": "Robot Head", "glb": "head.glb", "scale": 0.12 }`.

## Effects

`effects/<id>/effect.json` → `{ "name": "Sparks", "module": "effect.js" }`

```js
export default {
  create({ THREE, kit, scene }) {
    const ps = kit.particleSystem(scene, { max: 600, size: 0.04 });
    return {
      burst(pos, color, power) { ps.emit(pos, 40, { color }); },
      update(dt, camera) { ps.update(dt); },
      dispose() { ps.dispose(); },
    };
  },
};
```

## Songs

### Procedural (synth) songs

These are royalty-free by construction. `songs/<id>/song.json`:

```json
{
  "name": "Neon Drive", "artist": "BOXFLOW Synth", "license": "CC0", "type": "synth", "bpm": 124,
  "progression": [[57,60,64],[53,57,60],[48,52,55],[55,59,62]],
  "tracks": {
    "kick": { "inst": "kick", "pattern": "X...x...X...x..." },
    "bass": { "inst": "bass", "pattern": "x.xxx.xxx.xxx.xx", "notes": "seq", "seq": [0,0,12,0], "octave": -1 }
  },
  "sections": [
    { "name": "intro", "bars": 4, "intensity": 0, "tracks": ["kick"] },
    { "name": "drop", "bars": 16, "intensity": 2, "tracks": ["kick", "bass"] }
  ],
  "loopSection": "drop"
}
```

- **Patterns:** one character per 16th note. `X` is an accent, `x` a hit, `o` soft, `.` a rest. A pattern longer than 16 characters spans several bars.
- **`progression`:** one chord per bar, as MIDI note numbers, cycled.
- **Instruments:**
  - drums: `kick`, `snare`, `clap`, `hat`, `openhat`, `shaker`, `tom`
  - bass: `bass`, `sub`
  - melodic: `pluck`, `lead`, `pad`, `organ`, `bell`
  - effects: `riser`
- **Track options:** `vol`, `len` (in 16ths), `octave`, `wave`, `cutoff`, `attack`.
- **`notes`:** one of `root`, `chord`, `arp`, `arpud`, `seq` (offsets from the chord root) or `fixed`.
- **`intensity`** (0–2) drives the auto charts: more targets in high-energy sections.

### Audio-file songs

Use these for your CC0 tracks:

```json
{ "name": "My Track", "artist": "Someone", "license": "CC0", "type": "audio",
  "file": "track.ogg", "bpm": 128, "offset": 0.12,
  "sections": [{ "bars": 8, "intensity": 0 }, { "bars": 32, "intensity": 2 }] }
```

`offset` is the time in seconds of beat 1. `sections` is optional; it improves the auto charts.

## Levels

`levels/<id>.json` combines a song with a scene, target and effect, plus a chart per difficulty:

```json
{
  "name": "Neon Drive",
  "song": "neon-drive",
  "scene": "neon-city", "target": "holo", "effect": "neon-burst",
  "charts": {
    "easy":   { "auto": 4 },
    "normal": { "auto": "dynamic" },
    "hard":   { "auto": "dynamic" },
    "expert": { "notes": [[8, "R_UPPER"], [9, "JAB"], [10, "R_HOOK"]] }
  }
}
```

- `auto: N` places a target every N beats. `auto: "dynamic"` follows section intensity.
- `notes` lists `[beat, action]` pairs. The actions are `JAB`, `CROSS`, `L_HOOK`, `R_HOOK`, `L_UPPER` and `R_UPPER`. If you leave the action out, the BOXFLOW combo order is used.

**Shipping a Level Creator export:**

1. Put the exported JSON in `content/levels/`.
2. If the level uses your own audio, put that file next to the JSON (the export references it as `audio.file`).
3. Add the level id (the file name without `.json`) to `registry.json → levels`.
