// BOXFLOW — game bootstrap: renderer, XR session, game state machine, main loop, web UI.
// States: 'menu' → play() → 'playing' ⇄ pause()/resume() 'paused' → toMenu() → 'menu'
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
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.03, 600);
const DESKTOP_CAM = { pos: new THREE.Vector3(0, 1.72, 0.85), look: new THREE.Vector3(0, 1.4, -2.6) };
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

// ---------------------------------------------------------------- game state
const RESUME_LEAD = 0.8; // seconds of breathing room added when resuming

const game = {
  state: 'menu',
  speed: Math.min(SPEED.max, Math.max(SPEED.min, store.get('speed', SPEED.default))),
  musicOn: store.get('music', true),
  sceneCfg: { theme: 'city', haze: 1, reflections: true, ...store.get('scene', {}) },
  best: store.get('best', { score: 0, chain: 0 }),
  anchor: new THREE.Vector3(0, 1.6, 0),
  recenterPending: false,
  pausedAt: 0,
  scoring, spawner, audio,

  get running() { return this.state !== 'menu'; },

  async play() {
    if (this.state !== 'menu') return;
    await audio.resume();
    audio.setMusic(this.musicOn);
    const now = clock.now();
    scoring.start(now);
    spawner.anchor.copy(this.anchor);
    this.syncMusic(spawner.start(now, this.speed));
    audio.start();
    this.setState('playing');
  },

  pause() {
    if (this.state !== 'playing') return;
    this.pausedAt = clock.now();
    audio.stop();
    spawner.setVisible(false);
    this.setState('paused');
  },

  async resume() {
    if (this.state !== 'paused') return;
    await audio.resume();
    const d = clock.now() - this.pausedAt + RESUME_LEAD;
    spawner.shift(d);
    scoring.startTime += d;
    spawner.setVisible(true);
    this.syncMusic(spawner.nextHit);
    audio.start();
    this.setState('playing');
  },

  toMenu() {
    if (this.state === 'menu') return;
    const now = this.state === 'paused' ? this.pausedAt : clock.now();
    spawner.stop();
    scoring.stop(now);
    audio.stop();
    if (scoring.score > this.best.score || scoring.longest > this.best.chain) {
      this.best = { score: Math.max(scoring.score, this.best.score), chain: Math.max(scoring.longest, this.best.chain) };
      store.set('best', this.best);
    }
    this.setState('menu');
  },

  setState(s) {
    this.state = s;
    ui.syncPage();
    this.changed();
  },

  // Session clock for the HUD (frozen while paused).
  sessionTime(now) { return this.state === 'paused' ? this.pausedAt - scoring.startTime : scoring.duration(now); },
  multiplier() { return (1 + Math.min(scoring.streak, 20) * 0.05).toFixed(2).replace(/\.?0+$/, ''); },

  setSpeed(s) {
    this.speed = Math.min(SPEED.max, Math.max(SPEED.min, Math.round(s * 10) / 10));
    store.set('speed', this.speed);
    const anchorBeat = spawner.setSpeed(this.speed, clock.now());
    if (this.state === 'playing') this.syncMusic(anchorBeat);
    this.changed();
  },

  syncMusic(anchorBeat) {
    const interval = intervalFor(this.speed);
    const { beatsPerTarget } = bpmForInterval(interval);
    audio.setGrid(anchorBeat, interval / beatsPerTarget);
  },

  setMusic(on) { this.musicOn = on; store.set('music', on); audio.setMusic(on); this.changed(); },
  setTheme(t) { this.sceneCfg.theme = t; env.setTheme(t); this.saveScene(); },
  setHaze(h) { this.sceneCfg.haze = h; env.setHaze(h); this.saveScene(); },
  setReflections(on) { this.sceneCfg.reflections = on; env.setReflections(on); this.saveScene(); },
  saveScene() { store.set('scene', this.sceneCfg); this.changed(); },

  recenter() { this.recenterPending = true; },
  exitVR() { const s = renderer.xr.getSession(); if (s) s.end(); },

  changed() { ui.dirty = true; htmlUI.refresh(); },
};

const ui = new VRUI(scene, game);
spawner.setSpeed(game.speed, 0);
env.setTheme(game.sceneCfg.theme); env.setHaze(game.sceneCfg.haze); env.setReflections(game.sceneCfg.reflections);
env.setAnchor(game.anchor);
ui.placeFor(game.anchor);

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
rig.onBack = () => (game.state === 'playing' ? game.pause() : game.state === 'paused' ? game.resume() : null);

async function enterVR() {
  if (!navigator.xr) return;
  await audio.resume();
  const session = await navigator.xr.requestSession('immersive-vr', {
    optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'],
  });
  await renderer.xr.setSession(session);
  game.recenterPending = true;
  document.body.classList.add('in-vr');
  // Meta button / system menu / headset off → pause; the pause menu is waiting on return.
  session.addEventListener('visibilitychange', () => {
    if (session.visibilityState !== 'visible') game.pause();
  });
  session.addEventListener('end', () => {
    document.body.classList.remove('in-vr');
    game.pause();
    game.anchor.set(0, 1.6, 0); spawner.anchor.copy(game.anchor); env.setAnchor(game.anchor);
    ui.placeFor(game.anchor);
    fitDesktopCamera();
  });
}

function applyRecenter(xrCam) {
  const p = new THREE.Vector3(); xrCam.getWorldPosition(p);
  if (p.y < 0.4) return false; // pose not ready yet
  game.anchor.copy(p);
  spawner.anchor.copy(p);
  env.setAnchor(p);
  ui.placeFor(p);
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
  const playing = game.state === 'playing';

  if (xr) {
    if (game.recenterPending && applyRecenter(viewCam)) game.recenterPending = false;
    rig.update(now, dt);
  }
  ui.menu.mesh.visible = xr && !playing;
  ui.mini.mesh.visible = xr && playing;
  ui.hud.mesh.visible = xr && game.running;
  if (xr) ui.pointerUpdate(rig);

  if (playing) spawner.update(now, dt, xr ? rig.fists : null, viewCam);
  fx.update(dt, viewCam);
  env.update(dt, playing ? TUNING.spawnDistance / spawner.travel : game.state === 'menu' ? 1.2 : 0);
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
  camera.updateProjectionMatrix();
  fitDesktopCamera();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
document.addEventListener('visibilitychange', () => { if (document.hidden) game.pause(); });

// ---------------------------------------------------------------- web UI (desktop / phone / pre-VR)
const $ = (id) => document.getElementById(id);
const htmlUI = {
  page: 'main',
  settingsReturn: 'main',

  init() {
    const slider = $('speed');
    slider.addEventListener('input', () => game.setSpeed(tToSpeed(slider.value / 1000)));
    $('speedMinus').onclick = () => game.setSpeed(game.speed - 0.1);
    $('speedPlus').onclick = () => game.setSpeed(game.speed + 0.1);
    $('speedReset').onclick = () => game.setSpeed(1);
    $('music').onclick = () => game.setMusic(!game.musicOn);
    $('refl').onclick = () => game.setReflections(!game.sceneCfg.reflections);
    document.querySelectorAll('[data-theme]').forEach((b) => (b.onclick = () => game.setTheme(b.dataset.theme)));
    document.querySelectorAll('[data-haze]').forEach((b) => (b.onclick = () => game.setHaze(Number(b.dataset.haze))));

    $('playBtn').onclick = () => game.play();
    $('mainSettings').onclick = () => this.show('settings', 'main');
    $('pauseSettings').onclick = () => this.show('settings', 'pause');
    $('settingsDone').onclick = () => this.show(this.settingsReturn);
    $('continueBtn').onclick = () => game.resume();
    $('menuBtn').onclick = () => game.toMenu();
    $('pauseBtn').onclick = () => game.pause();

    // Touch pads (phones/tablets only)
    const pads = $('pads');
    for (const id of ['L_UPPER', 'L_HOOK', 'JAB', 'CROSS', 'R_HOOK', 'R_UPPER']) {
      const a = ACTIONS[id];
      const b = document.createElement('button');
      b.className = 'pad'; b.style.setProperty('--c', hex(a.color));
      b.innerHTML = `<b>${a.label}</b>`;
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); punch(id); });
      pads.appendChild(b);
      a.pad = b;
    }
    SEQUENCE.forEach((id) => {
      const a = ACTIONS[id]; const s = document.createElement('span');
      s.className = 'chip'; s.style.setProperty('--c', hex(a.color)); s.textContent = a.label;
      $('startSeq').appendChild(s);
    });

    // VR availability: show ENTER VR only where an immersive session is possible.
    const tryVR = () => enterVR().catch((e) => alert('Could not start VR: ' + e.message));
    $('enterVR').onclick = tryVR;
    const note = $('vrNote');
    if (!window.isSecureContext) {
      note.textContent = 'VR needs HTTPS — open the GitHub Pages link in the Meta Quest Browser.';
    } else if (!navigator.xr) {
      note.textContent = 'To play in VR, open this page in the Meta Quest Browser on your headset.';
    } else {
      navigator.xr.isSessionSupported('immersive-vr').then((ok) => {
        $('enterVR').hidden = !ok;
        document.body.classList.toggle('vr-ready', ok);
        if (ok) { $('playBtn').textContent = 'PLAY ON SCREEN'; note.textContent = 'Stand in a clear space · hand-tracking or controllers'; }
        else note.textContent = 'No VR headset detected — play with the keyboard or touch, or open this page in the Meta Quest Browser.';
      }).catch(() => {});
    }
    this.refresh();
  },

  show(page, from) {
    if (from) this.settingsReturn = from;
    this.page = page;
    $('overlay').dataset.page = page;
  },

  refresh() {
    const st = game.state;
    document.body.dataset.state = st;
    if (st === 'playing') this.page = 'none';
    else if (this.page === 'settings') this.settingsReturn = st === 'paused' ? 'pause' : 'main';
    else this.page = st === 'paused' ? 'pause' : 'main';
    $('overlay').dataset.page = this.page;

    $('speed').value = Math.round(speedToT(game.speed) * 1000);
    $('speedVal').textContent = `${game.speed.toFixed(1)}×`;
    $('speedSub').textContent = `${(3 / game.speed).toFixed(2)} s per target`;
    $('music').textContent = `♪ Music ${game.musicOn ? 'ON' : 'OFF'}`;
    $('music').classList.toggle('on', game.musicOn);
    $('refl').textContent = `Reflections ${game.sceneCfg.reflections ? 'ON' : 'OFF'}`;
    $('refl').classList.toggle('on', game.sceneCfg.reflections);
    document.querySelectorAll('[data-theme]').forEach((b) => b.classList.toggle('on', b.dataset.theme === game.sceneCfg.theme));
    document.querySelectorAll('[data-haze]').forEach((b) => b.classList.toggle('on', Number(b.dataset.haze) === game.sceneCfg.haze));
    $('best').textContent = `Best ${game.best.score} pts · chain ${game.best.chain} · Speed ${game.speed.toFixed(1)}×`;
    const sc = scoring;
    $('summary').textContent = st === 'menu' && sc.hits + sc.misses + sc.mistakes > 0
      ? `Last session — ${sc.score} pts · longest chain ${sc.longest} · ${sc.hitRatePct}% hits · ${fmtTime(sc.elapsed)}`
      : '';
    $('pauseStats').textContent = `${sc.score} pts · streak ${sc.streak} · chain ${sc.longest}`;
    this.lastKey = '';
  },

  lastKey: '',
  tick(now) {
    if (!game.running) return;
    const nextIdx = spawner.running ? spawner.nextIndex() : 0;
    const t = fmtTime(game.sessionTime(now));
    const key = `${scoring.score}|${scoring.streak}|${scoring.longest}|${t}|${nextIdx}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    $('hScore').textContent = scoring.score.toLocaleString();
    $('hStreak').textContent = scoring.streak;
    $('hMult').textContent = `×${game.multiplier()}`;
    $('hLongest').textContent = scoring.longest;
    $('hTime').textContent = t;
    const a = ACTIONS[SEQUENCE[nextIdx]];
    $('hNext').textContent = a.label;
    $('hNext').style.color = hex(a.color);
  },

  flash(color, bad = false) {
    const f = $('flash');
    f.style.setProperty('--c', hex(color));
    f.classList.remove('go', 'bad'); void f.offsetWidth;
    f.classList.add('go'); if (bad) f.classList.add('bad');
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
  if (k === ' ' || k === 'enter') {
    if (game.state === 'menu' && htmlUI.page === 'main') { e.preventDefault(); game.play(); }
    else if (game.state === 'paused' && htmlUI.page === 'pause') { e.preventDefault(); game.resume(); }
    return;
  }
  if (k === 'escape' || k === 'p') {
    if (game.state === 'playing') game.pause();
    else if (htmlUI.page === 'settings') htmlUI.show(htmlUI.settingsReturn);
    else if (game.state === 'paused') game.resume();
    return;
  }
  if (KEYMAP[k]) punch(KEYMAP[k]);
});

htmlUI.init();
window.boxflow = { game, spawner, scoring, clock, frame, ui, env }; // handy for debugging in the console

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
