// BOXFLOW — game orchestrator.
// States: menu → loading → playing ⇄ paused → results → menu
// Modes:  ENDLESS (fixed combo forever, optional speed ramp) · SONGS (charted levels)
import * as THREE from 'three';
import { ACTIONS, SEQUENCE, SPEED, TUNING, DIFFICULTIES, DIFF_TRAVEL, hex, intervalFor } from './config.js';
import { AudioEngine, bpmForInterval, songDuration } from './audio.js';
import { Scoring, grade, fmtTime } from './scoring.js';
import { Spawner } from './spawner.js';
import { FXCore } from './fx.js';
import { VRRig } from './rig.js';
import { MenuUI } from './ui/menus.js';
import { buildChart } from './charts.js';
import * as kit from './kit.js';
import { loadPrefs, savePrefs, boardKey, topScores, addScore } from './storage.js';
import {
  loadRegistry, loadScene, loadTarget, loadEffect, loadSong, listLevels, loadLevel, songForLevel, pluginContext, glbObject,
} from './content.js';

// ---------------------------------------------------------------- renderer / scene
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFoveation(0.6);
document.getElementById('stage').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070d);
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.03, 1200);
camera.position.set(0, 1.62, 0.6);
scene.add(camera);
scene.add(new THREE.HemisphereLight(0xc8dcff, 0x1a1a2a, 0.55)); // keeps any target style readable in any scene

const spawner = new Spawner(scene);
const fx = new FXCore(scene);
const rig = new VRRig(renderer, scene);
const audio = new AudioEngine();
const scoring = new Scoring();

// Gate frame at the hit plane (framework-level, coloured per scene).
const gateMat = new THREE.LineBasicMaterial({ color: 0x8ff6ff, transparent: true, opacity: 0.22, fog: false });
const gate = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(
  [[-0.55, -0.4], [0.55, -0.4], [0.55, 0.32], [-0.55, 0.32]].map(([x, y]) => new THREE.Vector3(x, y, 0))), gateMat);
gate.renderOrder = 3;
scene.add(gate);
const gateBase = new THREE.Color(0x8ff6ff);

// ---------------------------------------------------------------- clock (audio-locked, smoothed)
const clock = {
  offset: null,
  now() {
    const perf = performance.now() / 1000;
    if (!audio.ctx || audio.ctx.state !== 'running') return perf + (this.offset ?? 0);
    const target = audio.ctx.currentTime - perf;
    if (this.offset === null || Math.abs(target - this.offset) > 0.1) this.offset = target;
    else this.offset += (target - this.offset) * 0.02;
    return perf + this.offset;
  },
};

// ---------------------------------------------------------------- game
const RESUME_LEAD = 0.8;
const prefs = loadPrefs();

const game = {
  state: 'menu',
  prefs,
  scoring, spawner, audio,
  anchor: new THREE.Vector3(0, 1.6, 0),
  recenterPending: false,
  sceneList: [], sceneIdx: 0, sceneMetas: {},
  levelList: [],
  sceneInst: null,
  results: null,
  lastScoreDate: 0,
  run: null,            // { mode, level, song, difficulty, startSpeed, speed, maxSpeed, songStart, songEnd, ended }

  get targetH() { return prefs.targetHeight / 100; },
  get running() { return this.state === 'playing' || this.state === 'paused'; },

  // ---------- selection / prefs ----------
  setPref(key, val) {
    if (key === 'speed') val = Math.min(SPEED.max, Math.max(SPEED.min, Math.round(val * 10) / 10));
    prefs[key] = val;
    savePrefs(prefs);
    switch (key) {
      case 'music': audio.setMusic(val); break;
      case 'haze': this.sceneInst && this.sceneInst.setHaze && this.sceneInst.setHaze(val); break;
      case 'reflections': this.sceneInst && this.sceneInst.setReflections && this.sceneInst.setReflections(val); break;
      case 'targetHeight': applyAnchor(); break;
      case 'strictDir': spawner.strictDir = val; break;
      case 'speed': if (this.state === 'playing' && this.run.mode === 'endless' && !prefs.ramp) applySpeed(val); break;
      case 'mode': case 'level': menuMusic(); break;
      default: break;
    }
    this.changed();
  },

  sceneMeta(id = prefs.scene) { return this.sceneMetas[id]; },
  sceneName(id) { return (this.sceneMetas[id] && this.sceneMetas[id].name) || ''; },
  sceneSongName() { const m = this.sceneMeta(); return (m && m.musicName) || 'Scene music'; },
  cycleScene(dir) {
    const n = this.sceneList.length; if (!n) return;
    this.sceneIdx = (this.sceneIdx + dir + n) % n;
    this.setPref('scene', this.sceneList[this.sceneIdx]);
    activateScene(prefs.scene);
  },
  selectLevel(id) {
    const lvl = this.levelList.find((l) => l.id === id);
    ui.songPage = Math.max(0, Math.floor(this.levelList.indexOf(lvl) / 4));
    prefs.level = id; savePrefs(prefs);
    if (lvl && lvl.scene && this.sceneMetas[lvl.scene] && lvl.scene !== prefs.scene) {
      this.sceneIdx = this.sceneList.indexOf(lvl.scene);
      this.setPref('scene', lvl.scene);
      activateScene(lvl.scene);
    }
    menuMusic();
    this.changed();
  },
  selectedLevel() { return this.levelList.find((l) => l.id === prefs.level) || this.levelList[0]; },
  chartCounts() {
    const lvl = this.selectedLevel();
    return (lvl && lvl.counts) || {};
  },

  // ---------- leaderboards ----------
  boardKey() { return boardKey(prefs); },
  boardLabel() {
    if (prefs.mode === 'songs') { const l = this.selectedLevel(); return `${l ? l.name : '—'}  ·  ${prefs.difficulty.toUpperCase()}`; }
    return prefs.ramp ? 'Endless Trainer  ·  Speed Ramp' : 'Endless Trainer';
  },
  topScores() {
    if (this.state === 'results' && this.run) return topScores(this.run.board);
    return topScores(this.boardKey());
  },
  bestFor(levelId, diff) { const t = topScores(`song:${levelId}:${diff}`); return t.length ? t[0].score : 0; },

  // ---------- flow ----------
  async play() {
    if (this.state === 'loading' || this.running) return;
    this.state = 'loading'; this.changed();
    try {
      await audio.resume();
      await startRun();
    } catch (e) {
      console.error(e);
      alert('Could not start: ' + e.message);
      this.state = 'menu'; this.changed();
    }
  },

  pause() {
    if (this.state !== 'playing') return;
    this.pausedAt = clock.now();
    audio.pauseSong();
    spawner.setVisible(false);
    this.state = 'paused'; this.changed();
  },

  async resume() {
    if (this.state !== 'paused') return;
    await audio.resume();
    const d = clock.now() - this.pausedAt + RESUME_LEAD;
    spawner.shift(d);
    scoring.startTime += d;
    if (this.run.songStart != null) { this.run.songStart += d; this.run.songEnd += d; }
    audio.resumeSong(d);
    spawner.setVisible(true);
    this.state = 'playing'; this.changed();
  },

  async restart() {
    stopRun();
    this.state = 'menu';
    await this.play();
  },

  toMenu() {
    if (this.state === 'menu') return;
    if (this.running && this.run && this.run.mode === 'endless' && scoring.hits > 0) {
      finishRun('ended', false);   // endless runs count when you stop them
    }
    stopRun();
    this.state = 'menu';
    menuMusic();
    this.changed();
  },

  recenter() { this.recenterPending = true; },
  exitVR() { const s = renderer.xr.getSession(); if (s) s.end(); },
  openEditor() { window.open('editor.html', '_blank'); },

  sessionTime(now) { return this.state === 'paused' ? this.pausedAt - scoring.startTime : scoring.duration(now); },

  hudInfo(now) {
    const id = spawner.nextAction() || SEQUENCE[0];
    const a = ACTIONS[id];
    const r = this.run || {};
    let time = fmtTime(this.sessionTime(now)), timeLabel = 'TIME', progress = null;
    if (r.mode === 'songs' && r.songEnd) {
      const tNow = this.state === 'paused' ? this.pausedAt : now;
      const left = Math.max(0, r.songEnd - tNow);
      time = fmtTime(left); timeLabel = 'REMAINING';
      progress = Math.min(1, Math.max(0, 1 - left / (r.songEnd - r.songStart)));
    }
    return {
      score: scoring.score.toLocaleString(), streak: scoring.streak, mult: `×${scoring.multiplier.toFixed(2).replace(/\.?0+$/, '')}`,
      next: { label: a.label, color: hex(a.color) }, longest: scoring.longest, time, timeLabel, progress,
      speed: r.mode === 'endless' ? `${(r.speed || prefs.speed).toFixed(1)}×` : null,
      missRun: prefs.gameOver ? Math.min(3, scoring.missRun) : null,
    };
  },
  hudKey(now) {
    const h = this.hudInfo(now);
    return [h.score, h.streak, h.longest, h.time, h.next.label, h.speed, h.missRun, h.progress && h.progress.toFixed(2), this.state].join('|');
  },

  changed() { ui.markAll(); htmlUI.refresh(); },
};

const ui = new MenuUI(scene, game);

// ---------------------------------------------------------------- scenes
let sceneToken = 0;
async function activateScene(id) {
  const token = ++sceneToken;
  let loaded;
  try { loaded = await loadScene(id); } catch (e) { console.error(e); return; }
  if (token !== sceneToken) return;
  const { meta, mod } = loaded;
  const ctx = pluginContext({ scene, renderer, meta, prefs, camera });
  let inst;
  try {
    inst = mod && mod.create ? await mod.create(ctx) : await glbScene(ctx, meta);
  } catch (e) { console.error('scene', id, e); return; }
  if (token !== sceneToken) { inst.dispose && inst.dispose(); return; }
  if (game.sceneInst) {
    game.sceneInst.root && scene.remove(game.sceneInst.root);
    game.sceneInst.dispose && game.sceneInst.dispose();
  }
  game.sceneInst = inst;
  scene.add(inst.root);
  scene.fog = inst.fog || null;
  scene.background = inst.background || new THREE.Color(0x05070d);
  inst.setHaze && inst.setHaze(prefs.haze);
  inst.setReflections && inst.setReflections(prefs.reflections);
  gateBase.set(meta.gateColor || '#8ff6ff');
  applyAnchor();
  audio.setAmbient(meta.ambient || null);
  if (game.state === 'menu') menuMusic();
  game.changed();
}

// A scene folder with only a .glb (no JS): model + sky + fog from scene.json.
async function glbScene(ctx, meta) {
  const root = new THREE.Group();
  const s = meta.sky || {};
  root.add(kit.skyDome({ top: s.top || 0x02040a, horizon: s.horizon || 0x14385e, glow: s.glow || 0x66ddff }));
  if (meta.glbUrl) { const { obj } = await glbObject(meta); root.add(obj); }
  const f = meta.fog || {};
  const fog = new THREE.FogExp2(f.color || s.horizon || 0x14385e, f.density ?? 0.02);
  const base = fog.density;
  return { root, fog, background: new THREE.Color(fog.color), setHaze: (h) => { fog.density = base * [0.6, 1, 1.7][h]; } };
}

function applyAnchor() {
  spawner.anchor.copy(game.anchor);
  spawner.targetHeight = game.targetH;
  gate.position.set(game.anchor.x, game.targetH, game.anchor.z - 0.45);
  if (game.sceneInst && game.sceneInst.setAnchor) game.sceneInst.setAnchor(game.anchor, game.targetH);
  ui.layout(game.anchor, game.targetH);
}

// ---------------------------------------------------------------- music
async function menuMusic() {
  if (!audio.ctx || game.running || game.state === 'loading') return;
  audio.setMusicLevel(0.55);
  try {
    let song;
    if (prefs.mode === 'songs') {
      const lvl = game.selectedLevel();
      if (lvl) song = await songForLevel(lvl);
    }
    if (!song || song.type !== 'synth') {
      const m = game.sceneMeta();
      if (m && m.music) song = await loadSong(m.music);
    }
    if (!song || song.type !== 'synth' || game.running || game.state === 'loading') return;
    if (audio.song === song && audio.playing && audio.mode === 'loop') return;
    audio.playSynth(song, { mode: 'loop', spb: 60 / song.bpm });
  } catch (e) { console.warn(e); }
}

// ---------------------------------------------------------------- runs
async function loadStyles(targetId, effectId) {
  let style;
  try {
    style = await loadTarget(targetId);
    if (style.meta.glbUrl && !style.glb) style.glb = await kit.loadGLB(style.meta.glbUrl);
  } catch (e) { console.warn(e); style = await loadTarget('holo'); }
  if (spawner.style !== style) spawner.setStyle(style);
  let eff;
  try { eff = await loadEffect(effectId); } catch (e) { console.warn(e); eff = await loadEffect('neon-burst'); }
  fx.setEffect(eff.mod.create(pluginContext({ scene })));
}

async function startRun() {
  const sm = game.sceneMeta() || {};
  const board = boardKey(prefs);
  if (prefs.mode === 'endless') {
    await loadStyles(sm.target || 'holo', sm.effect || 'neon-burst');
    let song = sm.music ? await loadSong(sm.music).catch(() => null) : null;
    if (song && song.type !== 'synth') song = null; // endless loops need a synth song (tempo follows speed)
    const now = clock.now();
    scoring.start(now);
    applyAnchor();
    spawner.strictDir = prefs.strictDir;
    const startSpeed = prefs.speed;
    game.run = { mode: 'endless', song, board, startSpeed, speed: startSpeed, maxSpeed: startSpeed };
    const anchorBeat = spawner.startEndless(now, startSpeed);
    if (song) {
      const { beatsPerTarget } = bpmForInterval(intervalFor(startSpeed));
      audio.playSynth(song, { mode: 'loop', t0: anchorBeat, spb: intervalFor(startSpeed) / beatsPerTarget });
    } else audio.stopSong();
  } else {
    const lvl = await loadLevel(prefs.level);
    await loadStyles(lvl.target || sm.target || 'holo', lvl.effect || sm.effect || 'neon-burst');
    const song = { ...(await songForLevel(lvl)) };
    let buffer = null;
    if (song.type === 'audio') { buffer = await audio.loadBuffer(song.audioUrl); song.duration = buffer.duration; }
    const chart = buildChart(lvl, song, prefs.difficulty);
    const travel = DIFF_TRAVEL[prefs.difficulty] || 2.2;
    const now = clock.now();
    scoring.start(now);
    applyAnchor();
    spawner.strictDir = prefs.strictDir;
    const songStart = now + Math.max(2.5, travel + 0.8);
    const spb = 60 / song.bpm;
    const offset = song.offset || 0;
    const notes = chart.map((n) => ({ time: songStart + offset + n.beat * spb, action: n.action }));
    const dur = song.type === 'audio' ? song.duration : songDuration(song);
    game.run = { mode: 'songs', level: lvl, song, board, difficulty: prefs.difficulty, songStart, songEnd: songStart + dur, ended: false };
    spawner.startChart(notes, travel);
    audio.onSongEnd = () => { if (game.run) game.run.ended = true; };
    if (buffer) audio.playBuffer(buffer, songStart, 0);
    else audio.playSynth(song, { mode: 'song', t0: songStart, spb });
  }
  audio.setMusicLevel(1);
  fx.announce('GO!', new THREE.Vector3(game.anchor.x, game.targetH + 0.35, game.anchor.z - 2.2), '#5fffb0');
  game.state = 'playing';
  game.changed();
}

function stopRun() {
  spawner.stop();
  audio.stopSong();
  audio.onSongEnd = null;
}

function finishRun(kind, show = true) {
  const now = clock.now();
  const r = game.run;
  scoring.stop(game.state === 'paused' ? game.pausedAt : now);
  const summary = scoring.summary();
  let newRank = 0;
  if (scoring.hits > 0) {
    newRank = addScore(r.board, { score: summary.score, chain: summary.chain, acc: summary.acc, rank: summary.rank, speed: r.maxSpeed || null });
    const list = topScores(r.board);
    game.lastScoreDate = newRank ? list[newRank - 1].date : 0;
  }
  if (!show) return;
  stopRun();
  if (kind === 'gameover') audio.sfxGameOver(); else audio.sfxComplete();
  game.results = {
    kind, summary, newRank, maxSpeed: r.mode === 'endless' ? r.maxSpeed : null,
    title: kind === 'complete' ? 'LEVEL COMPLETE' : kind === 'gameover' ? 'GAME OVER' : 'RUN ENDED',
    board: r.mode === 'songs' ? `${r.level.name}  ·  ${r.difficulty.toUpperCase()}` : (prefs.ramp ? 'Endless · Speed Ramp' : 'Endless Trainer'),
    scene: game.sceneName(prefs.scene),
  };
  game.state = 'results';
  game.changed();
  setTimeout(() => { if (game.state === 'results') menuMusic(); }, 2500);
}

function applySpeed(s) {
  const r = game.run;
  r.speed = s; r.maxSpeed = Math.max(r.maxSpeed, s);
  const anchorBeat = spawner.setSpeed(s, clock.now());
  if (r.song) {
    const iv = intervalFor(s);
    audio.setGrid(anchorBeat, iv / bpmForInterval(iv).beatsPerTarget);
  }
}

// ---------------------------------------------------------------- gameplay events
spawner.onHit = (t, { accuracy, power, swing, form, fist }) => {
  const pts = scoring.hit(accuracy, power, swing, form);
  fx.burst(t.zone, t.action.color, power);
  fx.word(grade(accuracy), t.zone);
  flashGate(t.action.color);
  audio.sfxHit(power, SEQUENCE.indexOf(t.action.id), t.sfx);
  if (fist && prefs.haptics > 0) {
    const strength = prefs.haptics / 100;
    const impact = 0.3 * power + 0.3 * swing + 0.4 * Math.max(power, swing);
    fist.pulse(strength * (0.35 + 0.65 * impact), Math.round(45 + 110 * impact));
  }
  htmlUI.flash(t.action.color, false, pts);
};
spawner.onMiss = (t) => {
  scoring.miss();
  if (t) fx.word('MISS', t.zone);
  audio.sfxMiss();
  htmlUI.flash(0xff4d6a, true);
  checkGameOver();
};
spawner.onWrong = (t, fist, why) => {
  scoring.mistake();
  fx.word(why === 'dir' ? 'WRONGDIR' : 'WRONG', t.zone);
  audio.sfxWrong();
  if (fist && prefs.haptics > 0) fist.pulse(prefs.haptics / 100 * 0.5, 140);
  htmlUI.flash(0xff9a3c, true);
  checkGameOver();
};
function checkGameOver() {
  if (prefs.gameOver && scoring.missRun >= TUNING.missesForGameOver && game.state === 'playing') finishRun('gameover');
}
function flashGate(c) { gateMat.color.set(c); gateMat.opacity = 0.9; }

// ---------------------------------------------------------------- XR
rig.onSelectStart = (slot) => ui.press('vr' + slot.index);
rig.onSelectEnd = (slot) => ui.release('vr' + slot.index);
rig.onBack = () => (game.state === 'playing' ? game.pause() : game.state === 'paused' ? game.resume() : null);

async function enterVR() {
  if (!navigator.xr) return;
  await audio.resume();
  const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
  await renderer.xr.setSession(session);
  ui.vr = true; ui.markAll();
  game.recenterPending = true;
  document.body.classList.add('in-vr');
  session.addEventListener('visibilitychange', () => { if (session.visibilityState !== 'visible') game.pause(); });
  session.addEventListener('end', () => {
    document.body.classList.remove('in-vr');
    ui.vr = false; for (let i = 0; i < 2; i++) ui.clearPointer('vr' + i);
    game.pause();
    game.anchor.set(0, 1.6, 0); applyAnchor();
    game.changed();
  });
}

function applyRecenter(xrCam) {
  const p = new THREE.Vector3(); xrCam.getWorldPosition(p);
  if (p.y < 0.4) return false;
  game.anchor.copy(p);
  applyAnchor();
  return true;
}

// ---------------------------------------------------------------- desktop camera framing
const camGoal = new THREE.Vector3(), lookGoal = new THREE.Vector3(), lookCur = new THREE.Vector3(0, 1.5, -1);
function desktopCamera(dt) {
  const a = game.anchor, aspect = camera.aspect;
  const vf = THREE.MathUtils.degToRad(camera.fov) / 2;
  const hf = Math.atan(Math.tan(vf) * aspect);
  ui.narrow = aspect < 1.15;
  if (game.state === 'playing') {
    camGoal.set(a.x, game.targetH + 0.16, a.z + (aspect < 1 ? 1.7 : 0.85));
    lookGoal.set(a.x, game.targetH - 0.1, a.z - 2.6);
  } else {
    const halfW = ui.narrow ? 0.52 : 1.2, edgeZ = ui.narrow ? 1.12 : 0.95;
    const zW = halfW / Math.tan(hf * 0.94) - edgeZ;
    const zH = 0.52 / Math.tan(vf * 0.94) - 1.12;
    camGoal.set(a.x, a.y - 0.06, a.z + Math.max(0, zW, zH));
    lookGoal.set(a.x, a.y - 0.08, a.z - 1.1);
  }
  const k = Math.min(1, dt * 4);
  camera.position.lerp(camGoal, k);
  lookCur.lerp(lookGoal, k);
  camera.lookAt(lookCur);
}

// ---------------------------------------------------------------- main loop
const raycaster = new THREE.Raycaster();
let lastPerf = performance.now();
function frame() {
  const perf = performance.now();
  const dt = Math.min(0.05, (perf - lastPerf) / 1000); lastPerf = perf;
  const now = clock.now();
  const xr = renderer.xr.isPresenting;
  const viewCam = xr ? renderer.xr.getCamera() : camera;
  const playing = game.state === 'playing';

  if (xr) {
    if (game.recenterPending && applyRecenter(viewCam)) game.recenterPending = false;
    rig.update(now, dt);
  } else desktopCamera(dt);

  ui.update(now);
  if (xr) {
    const menusOpen = [ui.levels, ui.options, ui.scores, ui.modal].some((p) => p.visible);
    for (const slot of rig.slots) {
      if (!slot.inputSource) { slot.line.visible = false; slot.dot.visible = false; continue; }
      rig.getRay(slot, raycaster);
      const hit = ui.ray('vr' + slot.index, raycaster);
      slot.line.visible = menusOpen || !!hit;
      slot.line.scale.z = hit ? hit.distance : 1.5;
      slot.dot.visible = !!hit;
      if (hit) slot.dot.position.copy(hit.point);
    }
  }

  if (playing) {
    spawner.update(now, dt, xr ? rig.fists : null, viewCam);
    const r = game.run;
    if (r.mode === 'endless' && prefs.ramp) {
      const s = Math.min(SPEED.max, r.startSpeed + Math.floor(scoring.duration(now) / 60));
      if (s !== r.speed) {
        applySpeed(s);
        fx.announce(`SPEED ${s.toFixed(0)}×`, new THREE.Vector3(game.anchor.x, game.targetH + 0.45, game.anchor.z - 2.4), '#ffb35f');
        audio.sfxSpeedUp();
      }
    }
    if (r.mode === 'songs' && spawner.done && (r.ended || now > r.songEnd + 0.5 || now > (spawner.notes.at(-1)?.time ?? 0) + 3)) finishRun('complete');
  }
  fx.update(dt, viewCam);
  gate.visible = game.running;
  gateMat.opacity += (0.22 - gateMat.opacity) * Math.min(1, dt * 6);
  gateMat.color.lerp(gateBase, Math.min(1, dt * 4));
  const flow = playing ? TUNING.spawnDistance / spawner.travel : game.state === 'menu' ? 1.2 : 0;
  if (game.sceneInst && game.sceneInst.update) game.sceneInst.update(dt, perf / 1000, { flow, camera: viewCam, playing });
  htmlUI.tick(now);
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(frame);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  ui.layout(game.anchor, game.targetH);
  ui.markAll();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) game.pause(); });

// ---------------------------------------------------------------- desktop / touch pointer on the 3D menus
const ndc = new THREE.Vector2();
function pointerRay(e) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  return ui.ray('mouse', raycaster);
}
renderer.domElement.addEventListener('pointermove', (e) => {
  if (renderer.xr.isPresenting) return;
  const hit = pointerRay(e);
  renderer.domElement.style.cursor = hit && ui.pointers.get('mouse').btn ? 'pointer' : 'default';
});
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (renderer.xr.isPresenting) return;
  pointerRay(e);
  audio.resume();
  ui.press('mouse');
});
window.addEventListener('pointerup', () => ui.release('mouse'));
renderer.domElement.addEventListener('pointerleave', () => ui.clearPointer('mouse'));

// ---------------------------------------------------------------- HTML: HUD, VR button, touch pads
const $ = (id) => document.getElementById(id);
const htmlUI = {
  init() {
    const pads = $('pads');
    for (const id of ['L_UPPER', 'L_HOOK', 'JAB', 'CROSS', 'R_HOOK', 'R_UPPER']) {
      const a = ACTIONS[id];
      const b = document.createElement('button');
      b.className = 'pad'; b.style.setProperty('--c', hex(a.color));
      b.innerHTML = `<b>${a.label}</b><kbd>${a.key}</kbd>`;
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); punch(id); });
      pads.appendChild(b); a.pad = b;
    }
    $('pauseBtn').onclick = () => game.pause();
    const vrBtn = $('enterVR');
    vrBtn.onclick = () => enterVR().catch((e) => alert('Could not start VR: ' + e.message));
    if (!window.isSecureContext) $('note').textContent = 'VR needs HTTPS — open the GitHub Pages link in the Meta Quest Browser.';
    else if (navigator.xr) navigator.xr.isSessionSupported('immersive-vr').then((ok) => { vrBtn.hidden = !ok; }).catch(() => {});
    this.refresh();
  },
  refresh() { document.body.dataset.state = game.state; },
  lastKey: '',
  tick(now) {
    if (!game.running) return;
    const key = game.hudKey(now);
    if (key === this.lastKey) return;
    this.lastKey = key;
    const h = game.hudInfo(now);
    $('hScore').textContent = h.score;
    $('hStreak').textContent = h.streak;
    $('hMult').textContent = h.mult;
    $('hLongest').textContent = h.longest;
    $('hTimeLabel').textContent = h.timeLabel;
    $('hTime').textContent = h.time;
    $('hNext').textContent = h.next.label; $('hNext').style.color = h.next.color;
    $('hSpeedCell').hidden = !h.speed; if (h.speed) $('hSpeed').textContent = h.speed;
    $('hProgress').style.width = h.progress != null ? `${h.progress * 100}%` : '0';
    $('hPips').hidden = h.missRun == null;
    if (h.missRun != null) [...$('hPips').children].forEach((p, i) => p.classList.toggle('on', i < h.missRun));
  },
  flash(color, bad = false, pts = 0) {
    const f = $('flash');
    f.style.setProperty('--c', hex(color));
    f.classList.remove('go', 'bad'); void f.offsetWidth;
    f.classList.add('go'); if (bad) f.classList.add('bad');
    if (pts) { const p = $('pts'); p.textContent = `+${pts}`; p.classList.remove('go'); void p.offsetWidth; p.classList.add('go'); }
  },
};

function punch(actionId) {
  if (game.state !== 'playing') return;
  const a = ACTIONS[actionId];
  if (a.pad) { a.pad.classList.remove('hit'); void a.pad.offsetWidth; a.pad.classList.add('hit'); }
  spawner.keyPunch(actionId, clock.now());
}

const KEYMAP = Object.fromEntries(Object.values(ACTIONS).map((a) => [a.key.toLowerCase(), a.id]));
window.addEventListener('keydown', (e) => {
  if (e.repeat || e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  if (k === 'enter' || (k === ' ' && game.state !== 'playing')) {
    e.preventDefault();
    if (game.state === 'menu') game.play();
    else if (game.state === 'paused') game.resume();
    else if (game.state === 'results') game.restart();
    return;
  }
  if (k === 'escape' || k === 'p') {
    if (game.state === 'playing') game.pause();
    else if (game.state === 'paused') game.resume();
    else if (game.state === 'results') game.toMenu();
    return;
  }
  if (game.state === 'menu' && (k === 'arrowleft' || k === 'arrowright')) { game.cycleScene(k === 'arrowleft' ? -1 : 1); return; }
  if (KEYMAP[k]) punch(KEYMAP[k]);
});

// ---------------------------------------------------------------- boot
async function boot() {
  htmlUI.init();
  spawner.strictDir = prefs.strictDir;
  audio.setMusic(prefs.music);
  try {
    const reg = await loadRegistry();
    for (const id of reg.scenes) {
      try {
        const { meta } = await loadScene(id);
        game.sceneMetas[id] = meta;
        if (meta.music) { try { meta.musicName = (await loadSong(meta.music)).name; } catch { /* */ } }
        game.sceneList.push(id);
      } catch (e) { console.warn('scene', id, e); }
    }
    game.levelList = await listLevels();
    for (const lvl of game.levelList) {
      try {
        const song = await songForLevel(lvl);
        if (song.type === 'synth') {
          lvl.durationText = fmtTime(songDuration(song));
          lvl.counts = Object.fromEntries(DIFFICULTIES.map((d) => [d, buildChart(lvl, song, d).length]));
        } else if (song.duration) lvl.durationText = fmtTime(song.duration);
      } catch (e) { console.warn(e); }
    }
  } catch (e) {
    console.error(e);
    $('note').textContent = 'Could not load content/registry.json — serve the folder over http(s).';
  }
  const params = new URLSearchParams(location.search);
  if (params.get('level')) { prefs.mode = 'songs'; prefs.level = params.get('level'); }
  if (!game.sceneList.includes(prefs.scene)) prefs.scene = game.sceneList[0];
  if (!game.levelList.find((l) => l.id === prefs.level) && game.levelList[0]) prefs.level = game.levelList[0].id;
  game.sceneIdx = Math.max(0, game.sceneList.indexOf(prefs.scene));
  ui.songPage = Math.max(0, Math.floor(game.levelList.findIndex((l) => l.id === prefs.level) / 4));
  if (params.get('level')) { const l = game.selectedLevel(); if (l && l.scene && game.sceneMetas[l.scene]) { prefs.scene = l.scene; game.sceneIdx = game.sceneList.indexOf(l.scene); } }
  applyAnchor();
  await activateScene(prefs.scene);
  document.body.classList.add('ready');
  setTimeout(() => { const sp = $('splash'); if (sp) sp.remove(); }, 700);
  game.changed();
  // Browsers need a gesture before audio: start menu music on first interaction.
  const kick = () => { audio.resume().then(() => { audio.setMusic(prefs.music); audio.setAmbient((game.sceneMeta() || {}).ambient); menuMusic(); }); window.removeEventListener('pointerdown', kick); window.removeEventListener('keydown', kick); };
  window.addEventListener('pointerdown', kick); window.addEventListener('keydown', kick);
}
document.fonts && document.fonts.ready.then(() => ui.markAll());
boot();

window.boxflow = { game, spawner, scoring, clock, frame, ui, audio, fx }; // debugging handle

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js').catch(() => {});
