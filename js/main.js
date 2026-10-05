// BOXFLOW — game bootstrap: renderer, XR session, game state, main loop, desktop fallback.
import * as THREE from 'three';
import { ACTIONS, SEQUENCE, SPEED, TUNING, hex, intervalFor } from './config.js';
import { AudioEngine, bpmForInterval } from './audio.js';
import { Scoring, grade, fmtTime } from './scoring.js';
import { Environment } from './env.js';
import { Spawner } from './spawner.js';
import { FX } from './fx.js';
import { VRRig } from './rig.js';
import { VRUI, speedToT, tToSpeed } from './vrui.js';

// ---------------------------------------------------------------- renderer / scene
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFoveation(0.5);
document.getElementById('stage').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.03, 120);
const DESKTOP_CAM = { pos: new THREE.Vector3(0, 1.72, 0.85), look: new THREE.Vector3(0, 1.42, -0.9) };
camera.position.copy(DESKTOP_CAM.pos); camera.lookAt(DESKTOP_CAM.look);
scene.add(camera);

const env = new Environment(scene);
const spawner = new Spawner(scene);
const fx = new FX(scene);
const rig = new VRRig(renderer, scene);
const audio = new AudioEngine();
const scoring = new Scoring();

// ---------------------------------------------------------------- persisted settings
const store = {
  get(k, d) { try { const v = localStorage.getItem('boxflow.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('boxflow.' + k, JSON.stringify(v)); } catch { /* private mode */ } },
};

// ---------------------------------------------------------------- game state
const game = {
  speed: Math.min(SPEED.max, Math.max(SPEED.min, store.get('speed', SPEED.default))),
  musicOn: store.get('music', true),
  running: false,
  best: store.get('best', { score: 0, chain: 0 }),
  anchor: new THREE.Vector3(0, 1.6, 0),
  recenterPending: false,
  scoring, spawner, audio,

  async start() {
    await audio.resume();
    audio.setMusic(this.musicOn);
    const now = clock.now();
    scoring.start(now);
    spawner.anchor.copy(this.anchor);
    const anchorBeat = spawner.start(now, this.speed);
    this.syncMusic(anchorBeat);
    audio.start();
    this.running = true;
    ui.placeFor(this.anchor, true);
    this.changed();
  },

  stop() {
    if (!this.running) return;
    const now = clock.now();
    spawner.stop();
    scoring.stop(now);
    audio.stop();
    this.running = false;
    if (scoring.score > this.best.score || scoring.longest > this.best.chain) {
      this.best = { score: Math.max(scoring.score, this.best.score), chain: Math.max(scoring.longest, this.best.chain) };
      store.set('best', this.best);
    }
    ui.placeFor(this.anchor, false);
    this.changed();
  },

  setSpeed(s) {
    this.speed = Math.min(SPEED.max, Math.max(SPEED.min, Math.round(s * 10) / 10));
    store.set('speed', this.speed);
    const anchorBeat = spawner.setSpeed(this.speed, clock.now());
    if (this.running) this.syncMusic(anchorBeat);
    this.changed();
  },

  syncMusic(anchorBeat) {
    const interval = intervalFor(this.speed);
    const { beatsPerTarget } = bpmForInterval(interval);
    audio.setGrid(anchorBeat, interval / beatsPerTarget);
  },

  setMusic(on) {
    this.musicOn = on; store.set('music', on);
    audio.setMusic(on);
    this.changed();
  },

  recenter() { this.recenterPending = true; },
  exitVR() { const s = renderer.xr.getSession(); if (s) s.end(); },

  changed() { ui.dirty = true; htmlUI.refresh(); },
};

const ui = new VRUI(scene, game);
spawner.setSpeed(game.speed, 0);
env.setAnchor(game.anchor);
ui.placeFor(game.anchor, false);

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

// ---------------------------------------------------------------- gameplay events
spawner.onHit = (t, { accuracy, power, form, fist }) => {
  scoring.hit(accuracy, power, form);
  fx.burst(t.zone, t.action.color, power);
  fx.word(grade(accuracy), t.zone);
  env.flashGate(t.action.color);
  audio.sfxHit(power, SEQUENCE.indexOf(t.action.id));
  if (fist) fist.pulse(0.2 + 0.3 * power, 45); // soft haptic pulse
  htmlUI.flash(t.action.color);
};
spawner.onMiss = (t) => {
  scoring.miss();
  fx.word('MISS', t.zone);
  audio.sfxMiss();
  htmlUI.flash(0xff4d6a, true);
};
spawner.onWrong = (t, fist) => {
  scoring.mistake();
  fx.word('WRONG', t.zone);
  audio.sfxWrong();
  if (fist) fist.pulse(0.6, 110);
  htmlUI.flash(0xff9a3c, true);
};

// ---------------------------------------------------------------- XR session
rig.onSelectStart = (slot) => ui.selectStart(slot);
rig.onSelectEnd = (slot) => ui.selectEnd(slot);

async function enterVR() {
  if (!navigator.xr) return;
  await audio.resume();
  const session = await navigator.xr.requestSession('immersive-vr', {
    optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'],
  });
  await renderer.xr.setSession(session);
  game.recenterPending = true;
  document.body.classList.add('in-vr');
  session.addEventListener('end', () => {
    document.body.classList.remove('in-vr');
    game.stop();
    camera.position.copy(DESKTOP_CAM.pos); camera.lookAt(DESKTOP_CAM.look);
    game.anchor.set(0, 1.6, 0); spawner.anchor.copy(game.anchor); env.setAnchor(game.anchor);
    ui.placeFor(game.anchor, false);
  });
}

function applyRecenter(xrCam) {
  const p = new THREE.Vector3(); xrCam.getWorldPosition(p);
  if (p.y < 0.4) return false; // pose not ready yet
  game.anchor.copy(p);
  spawner.anchor.copy(p);
  env.setAnchor(p);
  ui.placeFor(p, game.running);
  return true;
}

// ---------------------------------------------------------------- main loop
let lastPerf = performance.now();
function frame() {
  const perf = performance.now();
  const dt = Math.min(0.05, (perf - lastPerf) / 1000); lastPerf = perf;
  const now = clock.now();
  const xr = renderer.xr.isPresenting;
  const viewCam = xr ? renderer.xr.getCamera() : camera;

  if (xr) {
    if (game.recenterPending && applyRecenter(viewCam)) game.recenterPending = false;
    rig.update(now, dt);
    ui.pointerUpdate(rig);
  }

  spawner.update(now, dt, xr ? rig.fists : null, viewCam);
  fx.update(dt, viewCam);
  env.update(dt, game.running ? TUNING.spawnDistance / spawner.travel : 0.6);
  ui.menu.mesh.visible = xr;
  ui.hud.mesh.visible = xr;
  ui.update(now);
  htmlUI.tick(now);

  renderer.render(scene, camera);
}
renderer.setAnimationLoop(frame);

function fitDesktopCamera() {
  DESKTOP_CAM.pos.z = camera.aspect < 1 ? 1.7 : 0.85; // pull back on portrait phones
  if (!renderer.xr.isPresenting) { camera.position.copy(DESKTOP_CAM.pos); camera.lookAt(DESKTOP_CAM.look); }
}
fitDesktopCamera();
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  fitDesktopCamera();
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------- HTML UI (desktop / phone / pre-VR)
const $ = (id) => document.getElementById(id);
const htmlUI = {
  init() {
    const slider = $('speed');
    slider.addEventListener('input', () => game.setSpeed(tToSpeed(slider.value / 1000)));
    $('speedMinus').onclick = () => game.setSpeed(game.speed - 0.1);
    $('speedPlus').onclick = () => game.setSpeed(game.speed + 0.1);
    $('speedReset').onclick = () => game.setSpeed(1);
    $('music').onclick = () => game.setMusic(!game.musicOn);
    $('startStop').onclick = () => (game.running ? game.stop() : game.start());

    // Action pads (keyboard legend + touch input)
    const pads = $('pads');
    const order = ['L_UPPER', 'L_HOOK', 'JAB', 'CROSS', 'R_HOOK', 'R_UPPER'];
    for (const id of order) {
      const a = ACTIONS[id];
      const b = document.createElement('button');
      b.className = 'pad'; b.style.setProperty('--c', hex(a.color));
      b.innerHTML = `<b>${a.label}</b><kbd>${a.key}</kbd>`;
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); punch(id); });
      pads.appendChild(b);
      a.pad = b;
    }
    const seq = $('sequence');
    SEQUENCE.forEach((id, i) => {
      const a = ACTIONS[id]; const s = document.createElement('span');
      s.className = 'chip'; s.style.setProperty('--c', hex(a.color)); s.textContent = a.label; s.dataset.i = i;
      seq.appendChild(s);
    });

    if (navigator.xr) {
      navigator.xr.isSessionSupported('immersive-vr').then((ok) => {
        const b = $('enterVR');
        if (ok) { b.disabled = false; b.textContent = 'ENTER VR'; b.onclick = () => enterVR().catch((e) => alert('Could not start VR: ' + e.message)); }
        else b.textContent = 'VR not available on this device';
      });
    } else $('enterVR').textContent = 'WebXR not supported — use Quest Browser';
    this.refresh();
  },

  refresh() {
    $('speed').value = Math.round(speedToT(game.speed) * 1000);
    $('speedVal').textContent = `${game.speed.toFixed(1)}×`;
    $('speedSub').textContent = `${(3 / game.speed).toFixed(2)} s per target`;
    $('music').textContent = `♪ Music: ${game.musicOn ? 'ON' : 'OFF'}`;
    $('music').classList.toggle('on', game.musicOn);
    $('startStop').textContent = game.running ? '■ STOP SESSION' : '▶ START SESSION';
    $('startStop').classList.toggle('stop', game.running);
    document.body.classList.toggle('running', game.running);
    $('best').textContent = `Best: ${game.best.score} pts · chain ${game.best.chain}`;
    const sc = scoring;
    $('summary').textContent = !game.running && sc.hits + sc.misses + sc.mistakes > 0
      ? `Last session — ${sc.score} pts · longest chain ${sc.longest} · ${sc.hitRatePct}% hits · accuracy ${sc.accuracyPct}% · power ${sc.powerPct}% · ${fmtTime(sc.elapsed)}`
      : '';
  },

  lastKey: '',
  tick(now) {
    const key = `${scoring.score}|${scoring.streak}|${scoring.longest}|${Math.floor(scoring.duration(now))}|${spawner.nextIndex()}|${game.running}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    $('hScore').textContent = scoring.score;
    $('hStreak').textContent = scoring.streak;
    $('hLongest').textContent = scoring.longest;
    $('hTime').textContent = fmtTime(scoring.duration(now));
    document.querySelectorAll('#sequence .chip').forEach((c) =>
      c.classList.toggle('next', game.running && Number(c.dataset.i) === spawner.nextIndex()));
  },

  flash(color, bad = false) {
    const f = $('flash');
    f.style.setProperty('--c', hex(color));
    f.classList.remove('go', 'bad'); void f.offsetWidth;
    f.classList.add('go'); if (bad) f.classList.add('bad');
  },
};

function punch(actionId) {
  if (!game.running) return;
  const a = ACTIONS[actionId];
  if (a.pad) { a.pad.classList.remove('hit'); void a.pad.offsetWidth; a.pad.classList.add('hit'); }
  spawner.keyPunch(actionId, clock.now());
}

const KEYMAP = Object.fromEntries(Object.values(ACTIONS).map((a) => [a.key.toLowerCase(), a.id]));
window.addEventListener('keydown', (e) => {
  if (e.repeat || e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  if (k === ' ') { e.preventDefault(); game.running ? game.stop() : game.start(); return; }
  if (KEYMAP[k]) punch(KEYMAP[k]);
});

htmlUI.init();
window.boxflow = { game, spawner, scoring, clock, frame, ui }; // handy for debugging in the console

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
