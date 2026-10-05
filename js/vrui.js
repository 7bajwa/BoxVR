// BOXFLOW — in-VR UI: paged menu (main / settings / pause), Beat-Saber-style HUD strip low in
// front of the player, and a small pause button. Canvas-rendered planes; controller ray or pinch.
import * as THREE from 'three';
import { ACTIONS, SEQUENCE, SPEED, hex } from './config.js';
import { fmtTime } from './scoring.js';

const FONT = '"Segoe UI", system-ui, sans-serif';

// Speed slider uses a log scale so 0.1×–1× and 1×–10× each get half the track.
export const speedToT = (s) => (Math.log10(s) + 1) / 2;
export const tToSpeed = (t) => {
  const s = Math.pow(10, t * 2 - 1);
  return Math.min(SPEED.max, Math.max(SPEED.min, Math.round(s * 10) / 10));
};

function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

class CanvasPanel {
  constructor(pxW, pxH, mW) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = pxW; this.canvas.height = pxH;
    this.g = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    const mH = mW * (pxH / pxW);
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(mW, mH),
      new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    );
    this.mesh.renderOrder = 10;
    this.buttons = [];
  }
  hitTest(uv) {
    const x = uv.x * this.canvas.width, y = (1 - uv.y) * this.canvas.height;
    return this.buttons.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) || null;
  }
  uvToPx(uv) { return { x: uv.x * this.canvas.width, y: (1 - uv.y) * this.canvas.height }; }
}

const B = (id, x, y, w, h, onClick) => ({ id, x, y, w, h, onClick });

export class VRUI {
  constructor(scene, game) {
    this.game = game;
    this.menu = new CanvasPanel(1024, 1100, 0.74);
    this.hud = new CanvasPanel(2048, 230, 1.7);
    this.mini = new CanvasPanel(300, 120, 0.2);
    scene.add(this.menu.mesh, this.hud.mesh, this.mini.mesh);
    this.raycaster = new THREE.Raycaster();
    this.drag = null;
    this.dirty = true;
    this.lastHudKey = '';
    this.page = 'main';
    this.settingsReturn = 'main';

    const step = (d) => () => game.setSpeed(Math.round((game.speed + d) * 10) / 10);
    this.slider = { x: 130, y: 250, w: 764, h: 70 };
    this.pages = {
      main: [
        B('play', 112, 300, 800, 190, () => game.play()),
        B('settings', 112, 520, 800, 120, () => this.openSettings('main')),
        B('exit', 112, 670, 800, 120, () => game.exitVR()),
      ],
      settings: [
        B('minus', 40, 240, 76, 90, step(-0.1)),
        B('slider', this.slider.x, this.slider.y - 20, this.slider.w, this.slider.h + 40, null),
        B('plus', 908, 240, 76, 90, step(0.1)),
        B('reset', 412, 360, 200, 56, () => game.setSpeed(1)),
        B('music', 60, 450, 440, 100, () => game.setMusic(!game.musicOn)),
        B('refl', 524, 450, 440, 100, () => game.setReflections(!game.sceneCfg.reflections)),
        B('city', 60, 620, 440, 90, () => game.setTheme('city')),
        B('minimal', 524, 620, 440, 90, () => game.setTheme('minimal')),
        B('haze0', 60, 780, 288, 90, () => game.setHaze(0)),
        B('haze1', 368, 780, 288, 90, () => game.setHaze(1)),
        B('haze2', 676, 780, 288, 90, () => game.setHaze(2)),
        B('recenter', 60, 920, 440, 90, () => game.recenter()),
        B('done', 524, 920, 440, 90, () => this.show(this.settingsReturn)),
      ],
      pause: [
        B('continue', 112, 330, 800, 190, () => game.resume()),
        B('settings', 112, 550, 800, 120, () => this.openSettings('pause')),
        B('menu', 112, 700, 800, 120, () => game.toMenu()),
        B('recenter', 112, 850, 800, 100, () => game.recenter()),
      ],
    };
    this.menu.buttons = this.pages.main;
    this.mini.buttons = [B('pause', 0, 0, 300, 120, () => game.pause())];
  }

  show(page) { this.page = page; this.menu.buttons = this.pages[page]; this.drag = null; this.dirty = true; }
  openSettings(from) { this.settingsReturn = from; this.show('settings'); }

  // Called whenever the game state changes.
  syncPage() {
    const st = this.game.state;
    if (this.page === 'settings' && st !== 'playing') {
      this.settingsReturn = st === 'paused' ? 'pause' : 'main';
    } else this.show(st === 'paused' ? 'pause' : 'main');
    this.dirty = true;
  }

  placeFor(anchor) {
    const m = this.menu.mesh;
    m.position.set(anchor.x, anchor.y - 0.12, anchor.z - 0.9);
    m.rotation.set(-0.12, 0, 0);
    const h = this.hud.mesh;
    h.position.set(anchor.x, anchor.y - 0.98, anchor.z - 1.3);
    h.rotation.set(-Math.atan2(0.98, 1.3), 0, 0);
    const mini = this.mini.mesh;
    mini.position.set(anchor.x - 0.62, anchor.y - 0.72, anchor.z - 0.55);
    mini.rotation.set(-0.85, 0.5, 0, 'YXZ');
  }

  // ---------------- drawing ----------------
  frame(g, W, H) {
    g.clearRect(0, 0, W, H);
    roundRect(g, 4, 4, W - 8, H - 8, 44);
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, 'rgba(10,18,38,0.92)'); bg.addColorStop(1, 'rgba(5,9,22,0.92)');
    g.fillStyle = bg; g.fill();
    g.lineWidth = 3; g.strokeStyle = 'rgba(120,220,255,0.35)'; g.stroke();
  }

  title(g, W, text, y, size = 120) {
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `900 ${size}px ${FONT}`;
    const grd = g.createLinearGradient(W * 0.2, 0, W * 0.8, 0);
    grd.addColorStop(0, '#5fe8ff'); grd.addColorStop(0.5, '#a98bff'); grd.addColorStop(1, '#5fe8ff');
    g.fillStyle = grd; g.shadowColor = '#22d3ff'; g.shadowBlur = 28;
    g.fillText(text, W / 2, y); g.shadowBlur = 0;
  }

  label(g, text, x, y, align = 'left') {
    g.textAlign = align; g.textBaseline = 'middle';
    g.font = `700 28px ${FONT}`; g.fillStyle = '#7f93bb';
    g.fillText(text.split('').join(String.fromCharCode(8202)), x, y);
  }

  drawMenu() {
    const { g, canvas } = this.menu; const game = this.game;
    const W = canvas.width, H = canvas.height;
    this.frame(g, W, H);
    const btn = (id) => this.menu.buttons.find((b) => b.id === id);

    if (this.page === 'main') {
      this.title(g, W, 'BOXFLOW', 140, 140);
      g.font = `500 32px ${FONT}`; g.fillStyle = '#8fa3c8';
      g.fillText('infinite boxing-sequence rhythm trainer', W / 2, 225);
      this.drawButton(g, btn('play'), '▶  PLAY', true, 76, '#22ff99');
      this.drawButton(g, btn('settings'), '⚙  SETTINGS', false, 42);
      this.drawButton(g, btn('exit'), 'EXIT VR', false, 42);
      this.drawChips(g, W, 850);
      const sc = game.scoring;
      g.font = `500 28px ${FONT}`; g.fillStyle = '#8fa3c8'; g.textAlign = 'center';
      if (sc.hits + sc.misses + sc.mistakes > 0) g.fillText(`Last: ${sc.score} pts · chain ${sc.longest} · ${sc.hitRatePct}% hits · ${fmtTime(sc.elapsed)}`, W / 2, 960);
      g.fillStyle = '#62759c'; g.fillText(`Best: ${game.best.score} pts · chain ${game.best.chain}  ·  Speed ${game.speed.toFixed(1)}×`, W / 2, 1010);
    } else if (this.page === 'pause') {
      this.title(g, W, 'PAUSED', 150, 120);
      const sc = game.scoring;
      g.font = `600 34px ${FONT}`; g.fillStyle = '#c9d6f5'; g.textAlign = 'center';
      g.fillText(`${sc.score} pts  ·  streak ${sc.streak}  ·  chain ${sc.longest}`, W / 2, 250);
      this.drawButton(g, btn('continue'), '▶  CONTINUE', true, 70, '#22ff99');
      this.drawButton(g, btn('settings'), '⚙  SETTINGS', false, 42);
      this.drawButton(g, btn('menu'), '⌂  MAIN MENU', true, 42, '#ff4d6a');
      this.drawButton(g, btn('recenter'), '⟲  Recenter', false, 34);
      g.font = `500 26px ${FONT}`; g.fillStyle = '#62759c';
      g.fillText('Press B / Y anytime to pause', W / 2, 1020);
    } else {
      this.title(g, W, 'SETTINGS', 100, 80);
      this.label(g, 'SPEED', 60, 200);
      g.textAlign = 'right'; g.fillStyle = '#5fe8ff'; g.font = `800 50px ${FONT}`;
      g.fillText(`${game.speed.toFixed(1)}×`, W - 60, 200);
      g.font = `500 26px ${FONT}`; g.fillStyle = '#7f93bb';
      g.fillText(`${(3 / game.speed).toFixed(2)} s / target`, W - 200, 202);
      this.drawButton(g, btn('minus'), '−', false, 52);
      this.drawButton(g, btn('plus'), '+', false, 52);
      const s = this.slider, t = speedToT(game.speed);
      roundRect(g, s.x, s.y + s.h / 2 - 7, s.w, 14, 7); g.fillStyle = '#1b2646'; g.fill();
      roundRect(g, s.x, s.y + s.h / 2 - 7, s.w * t, 14, 7); g.fillStyle = '#5fe8ff'; g.fill();
      const one = s.x + s.w * speedToT(1);
      g.fillStyle = '#ffffff44'; g.fillRect(one - 2, s.y + 12, 4, s.h - 24);
      g.beginPath(); g.arc(s.x + s.w * t, s.y + s.h / 2, 28, 0, Math.PI * 2);
      g.fillStyle = '#eafcff'; g.shadowColor = '#22d3ff'; g.shadowBlur = 20; g.fill(); g.shadowBlur = 0;
      g.font = `500 24px ${FONT}`; g.fillStyle = '#62759c'; g.textAlign = 'center';
      g.fillText('0.1×', s.x + 18, s.y + s.h + 18); g.fillText('10×', s.x + s.w - 18, s.y + s.h + 18);
      this.drawButton(g, btn('reset'), 'Reset 1×', false, 28);

      this.drawButton(g, btn('music'), `♪  Music ${game.musicOn ? 'ON' : 'OFF'}`, game.musicOn, 38);
      this.drawButton(g, btn('refl'), `Reflections ${game.sceneCfg.reflections ? 'ON' : 'OFF'}`, game.sceneCfg.reflections, 38);
      this.label(g, 'SCENE', 60, 590);
      this.drawButton(g, btn('city'), 'Neon City', game.sceneCfg.theme === 'city', 36);
      this.drawButton(g, btn('minimal'), 'Minimal', game.sceneCfg.theme === 'minimal', 36);
      this.label(g, 'HAZE', 60, 750);
      ['Low', 'Medium', 'High'].forEach((n, i) => this.drawButton(g, btn('haze' + i), n, game.sceneCfg.haze === i, 34));
      this.drawButton(g, btn('recenter'), '⟲  Recenter', false, 34);
      this.drawButton(g, btn('done'), 'DONE', true, 40);
    }
    this.menu.tex.needsUpdate = true;
  }

  drawChips(g, W, y) {
    const chipW = 145, gap = 6, total = SEQUENCE.length * chipW + (SEQUENCE.length - 1) * gap;
    let x = (W - total) / 2;
    for (const id of SEQUENCE) {
      const a = ACTIONS[id];
      roundRect(g, x, y, chipW, 58, 14); g.fillStyle = hex(a.color) + '26'; g.fill();
      g.lineWidth = 2; g.strokeStyle = hex(a.color) + 'aa'; g.stroke();
      g.fillStyle = hex(a.color); g.font = `800 24px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(a.label, x + chipW / 2, y + 30);
      x += chipW + gap;
    }
  }

  drawButton(g, b, label, on, size, accent = '#5fe8ff') {
    const hov = this.hoverId === b.id;
    roundRect(g, b.x, b.y, b.w, b.h, 22);
    g.fillStyle = on ? accent + (hov ? '50' : '2a') : hov ? '#24345e' : '#111a33'; g.fill();
    g.lineWidth = hov ? 4 : 2.5; g.strokeStyle = on || hov ? accent : '#2c3a64'; g.stroke();
    g.fillStyle = on ? '#ffffff' : '#c9d6f5'; g.font = `800 ${size}px ${FONT}`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(label, b.x + b.w / 2, b.y + b.h / 2 + 2);
  }

  drawMini() {
    const { g, canvas } = this.mini;
    g.clearRect(0, 0, canvas.width, canvas.height);
    const hov = this.hoverId === 'pause';
    roundRect(g, 4, 4, canvas.width - 8, canvas.height - 8, 56);
    g.fillStyle = hov ? 'rgba(40,60,110,0.9)' : 'rgba(10,18,38,0.75)'; g.fill();
    g.lineWidth = 3; g.strokeStyle = hov ? '#5fe8ff' : 'rgba(120,220,255,0.4)'; g.stroke();
    g.fillStyle = '#e6eeff'; g.font = `800 44px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('❚❚  PAUSE', canvas.width / 2, canvas.height / 2 + 2);
    this.mini.tex.needsUpdate = true;
  }

  // Beat-Saber-style horizontal strip: SCORE · STREAK ×mult · NEXT · LONGEST CHAIN · TIME
  drawHud(now) {
    const game = this.game, sc = game.scoring;
    const dur = fmtTime(game.sessionTime(now));
    const nextIdx = game.spawner.running ? game.spawner.nextIndex() : 0;
    const key = `${sc.score}|${sc.streak}|${sc.longest}|${dur}|${nextIdx}|${game.state}`;
    if (key === this.lastHudKey) return;
    this.lastHudKey = key;
    const { g, canvas } = this.hud; const W = canvas.width, H = canvas.height;
    g.clearRect(0, 0, W, H);
    const bg = g.createLinearGradient(0, 0, W, 0);
    bg.addColorStop(0, 'rgba(6,12,28,0)'); bg.addColorStop(0.15, 'rgba(6,12,28,0.55)');
    bg.addColorStop(0.85, 'rgba(6,12,28,0.55)'); bg.addColorStop(1, 'rgba(6,12,28,0)');
    g.fillStyle = bg; g.fillRect(0, 20, W, H - 40);
    const line = g.createLinearGradient(0, 0, W, 0);
    line.addColorStop(0, 'rgba(95,232,255,0)'); line.addColorStop(0.5, 'rgba(95,232,255,0.8)'); line.addColorStop(1, 'rgba(95,232,255,0)');
    g.fillStyle = line; g.fillRect(0, 20, W, 2); g.fillRect(0, H - 22, W, 2);

    const a = ACTIONS[SEQUENCE[nextIdx]];
    const mult = game.multiplier();
    const cells = [
      ['SCORE', sc.score.toLocaleString(), '#ffffff', 1.25],
      ['STREAK', `${sc.streak}`, '#5fffb0', 1, `×${mult}`],
      ['NEXT', a.label, hex(a.color), 1.1],
      ['LONGEST CHAIN', `${sc.longest}`, '#ffd84a', 1],
      ['TIME', dur, '#5fe8ff', 1],
    ];
    const totalW = cells.reduce((s, c) => s + c[3], 0);
    let x = 140; const usable = W - 280;
    g.textBaseline = 'middle';
    cells.forEach(([lab, val, col, wgt, extra], i) => {
      const cw = usable * (wgt / totalW), cx = x + cw / 2;
      if (i > 0) { g.fillStyle = 'rgba(140,170,220,0.25)'; g.fillRect(x, 60, 2, H - 120); }
      g.textAlign = 'center';
      g.font = `700 30px ${FONT}`; g.fillStyle = '#7f93bb';
      g.fillText(lab.split('').join(String.fromCharCode(8202)), cx, 66);
      g.font = `${i === 0 ? 800 : 700} ${i === 0 ? 96 : 84}px ${FONT}`; g.fillStyle = col;
      g.shadowColor = col; g.shadowBlur = 18;
      const vx = extra ? cx - 30 : cx;
      g.fillText(val, vx, 145); g.shadowBlur = 0;
      if (extra) {
        const vw = g.measureText(val).width;
        g.font = `700 36px ${FONT}`; g.fillStyle = '#5fffb0aa'; g.textAlign = 'left';
        g.fillText(extra, vx + vw / 2 + 14, 152);
      }
      x += cw;
    });
    this.hud.tex.needsUpdate = true;
  }

  // ---------------- interaction ----------------
  pointerUpdate(rig) {
    let anyHover = null;
    const menuOpen = this.menu.mesh.visible;
    for (const slot of rig.slots) {
      if (!slot.inputSource) { slot.line.visible = false; slot.dot.visible = false; continue; }
      rig.getRay(slot, this.raycaster);
      let hit = null, panel = null;
      for (const p of [this.menu, this.mini]) {
        if (!p.mesh.visible) continue;
        const h = this.raycaster.intersectObject(p.mesh, false)[0];
        if (h && (!hit || h.distance < hit.distance)) { hit = h; panel = p; }
      }
      slot.hit = hit; slot.hitPanel = panel;
      // Rays show whenever a menu is open; while playing only when aiming at the pause button.
      slot.line.visible = menuOpen || !!hit;
      slot.line.scale.z = hit ? hit.distance : 1.2;
      slot.dot.visible = !!hit;
      if (hit) {
        slot.dot.position.copy(hit.point);
        const b = panel.hitTest(hit.uv);
        if (b) anyHover = b.id;
      }
      if (this.drag && this.drag.slot === slot && hit && panel === this.menu) this.applySlider(hit.uv);
    }
    if (anyHover !== this.hoverId) { this.hoverId = anyHover; this.dirty = true; }
  }

  applySlider(uv) {
    const p = this.menu.uvToPx(uv);
    const t = Math.min(1, Math.max(0, (p.x - this.slider.x) / this.slider.w));
    const s = tToSpeed(t);
    if (s !== this.game.speed) this.game.setSpeed(s);
  }

  selectStart(slot) {
    if (!slot.hit || !slot.hitPanel) return false;
    const b = slot.hitPanel.hitTest(slot.hit.uv);
    if (!b) return true;
    if (b.id === 'slider') { this.drag = { slot }; this.applySlider(slot.hit.uv); }
    else { this.game.audio.sfxClick(); b.onClick(); }
    this.dirty = true;
    return true;
  }

  selectEnd(slot) { if (this.drag && this.drag.slot === slot) { this.drag = null; this.dirty = true; } }

  update(now) {
    if (this.dirty) { this.drawMenu(); this.drawMini(); this.dirty = false; }
    if (this.hud.mesh.visible) this.drawHud(now);
  }
}
