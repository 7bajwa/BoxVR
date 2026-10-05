// BOXFLOW — in-VR UI panels (canvas-rendered planes) driven by controller rays / hand pinch.
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
      new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.mesh.renderOrder = 10;
    this.buttons = [];
    this.hover = null;
  }
  hitTest(uv) {
    const x = uv.x * this.canvas.width, y = (1 - uv.y) * this.canvas.height;
    return this.buttons.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) || null;
  }
  uvToPx(uv) { return { x: uv.x * this.canvas.width, y: (1 - uv.y) * this.canvas.height }; }
}

export class VRUI {
  constructor(scene, game) {
    this.game = game;
    this.menu = new CanvasPanel(1024, 1180, 0.78);
    this.hud = new CanvasPanel(1400, 360, 1.25);
    scene.add(this.menu.mesh, this.hud.mesh);
    this.raycaster = new THREE.Raycaster();
    this.drag = null; // { slot }
    this.dirty = true;
    this.lastHudKey = '';

    const B = (id, x, y, w, h, onClick) => ({ id, x, y, w, h, onClick });
    this.slider = { x: 120, y: 330, w: 784, h: 70 };
    this.menu.buttons = [
      B('minus', 40, 320, 70, 90, () => game.setSpeed(Math.max(SPEED.min, Math.round((game.speed - 0.1) * 10) / 10))),
      B('slider', this.slider.x, this.slider.y - 20, this.slider.w, this.slider.h + 40, null),
      B('plus', 914, 320, 70, 90, () => game.setSpeed(Math.min(SPEED.max, Math.round((game.speed + 0.1) * 10) / 10))),
      B('reset', 412, 448, 200, 58, () => game.setSpeed(1)),
      B('music', 60, 530, 904, 110, () => game.setMusic(!game.musicOn)),
      B('start', 60, 670, 904, 150, () => (game.running ? game.stop() : game.start())),
      B('recenter', 60, 840, 440, 90, () => game.recenter()),
      B('exit', 524, 840, 440, 90, () => game.exitVR()),
    ];
  }

  placeFor(anchor, running) {
    const m = this.menu.mesh;
    if (running) {
      m.position.set(anchor.x - 0.95, anchor.y - 0.25, anchor.z - 0.55);
      m.rotation.set(-0.25, Math.PI / 3.2, 0, 'YXZ');
      m.scale.setScalar(0.8);
    } else {
      m.position.set(anchor.x, anchor.y - 0.15, anchor.z - 0.85);
      m.rotation.set(-0.15, 0, 0, 'YXZ');
      m.scale.setScalar(1);
    }
    this.hud.mesh.position.set(anchor.x, anchor.y + 0.55, anchor.z - 1.7);
    this.hud.mesh.rotation.set(0.12, 0, 0);
  }

  // ---------------- drawing ----------------
  drawMenu() {
    const { g, canvas } = this.menu; const game = this.game;
    const W = canvas.width, H = canvas.height;
    g.clearRect(0, 0, W, H);
    roundRect(g, 4, 4, W - 8, H - 8, 40);
    g.fillStyle = 'rgba(8,12,28,0.88)'; g.fill();
    g.lineWidth = 4; g.strokeStyle = 'rgba(80,220,255,0.7)'; g.stroke();

    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `900 110px ${FONT}`;
    const grd = g.createLinearGradient(200, 0, 820, 0);
    grd.addColorStop(0, '#22d3ff'); grd.addColorStop(0.5, '#b36bff'); grd.addColorStop(1, '#ff3355');
    g.fillStyle = grd; g.shadowColor = '#22d3ff'; g.shadowBlur = 24;
    g.fillText('BOXFLOW', W / 2, 110); g.shadowBlur = 0;
    g.font = `500 34px ${FONT}`; g.fillStyle = '#9fb4d8';
    g.fillText('infinite boxing-sequence rhythm trainer', W / 2, 185);

    // Speed
    g.textAlign = 'left'; g.font = `700 40px ${FONT}`; g.fillStyle = '#ffffff';
    g.fillText('SPEED', 60, 265);
    g.textAlign = 'right'; g.fillStyle = '#22d3ff'; g.font = `800 48px ${FONT}`;
    g.fillText(`${game.speed.toFixed(1)}×`, W - 60, 265);
    g.textAlign = 'right'; g.font = `500 28px ${FONT}`; g.fillStyle = '#8899bb';
    g.fillText(`${(3 / game.speed).toFixed(2)} s / target`, W - 200, 268);

    this.drawButton(g, this.btn('minus'), '−', false, 52);
    this.drawButton(g, this.btn('plus'), '+', false, 52);
    const s = this.slider, t = speedToT(game.speed);
    roundRect(g, s.x, s.y + s.h / 2 - 8, s.w, 16, 8); g.fillStyle = '#1d2747'; g.fill();
    roundRect(g, s.x, s.y + s.h / 2 - 8, s.w * t, 16, 8); g.fillStyle = '#22d3ff'; g.fill();
    const one = s.x + s.w * speedToT(1);
    g.fillStyle = '#ffffff55'; g.fillRect(one - 2, s.y + 10, 4, s.h - 20);
    g.beginPath(); g.arc(s.x + s.w * t, s.y + s.h / 2, 30, 0, Math.PI * 2);
    g.fillStyle = this.hoverId === 'slider' || this.drag ? '#ffffff' : '#dff8ff'; g.shadowColor = '#22d3ff'; g.shadowBlur = 20; g.fill(); g.shadowBlur = 0;
    g.font = `500 26px ${FONT}`; g.fillStyle = '#7d8db0'; g.textAlign = 'center';
    g.fillText('0.1×', s.x + 20, s.y + s.h + 22); g.fillText('1×', one, s.y + s.h + 22); g.fillText('10×', s.x + s.w - 20, s.y + s.h + 22);
    this.drawButton(g, this.btn('reset'), 'Reset 1×', false, 30);

    this.drawButton(g, this.btn('music'), `♪  Music: ${game.musicOn ? 'ON' : 'OFF'}`, game.musicOn, 46);
    this.drawButton(g, this.btn('start'), game.running ? '■  STOP SESSION' : '▶  START SESSION', !game.running, 60, game.running ? '#ff3355' : '#22ff99');
    this.drawButton(g, this.btn('recenter'), '⟲ Recenter', false, 36);
    this.drawButton(g, this.btn('exit'), 'Exit VR', false, 36);

    // Sequence legend
    g.textAlign = 'left'; g.font = `700 30px ${FONT}`; g.fillStyle = '#ffffff';
    g.fillText('SEQUENCE (loops forever)', 60, 975);
    const chipW = 145;
    SEQUENCE.forEach((id, i) => {
      const a = ACTIONS[id]; const x = 60 + i * (chipW + 6), y = 1000;
      roundRect(g, x, y, chipW, 64, 14); g.fillStyle = hex(a.color) + '33'; g.fill();
      g.lineWidth = 3; g.strokeStyle = hex(a.color); g.stroke();
      g.fillStyle = hex(a.color); g.font = `800 25px ${FONT}`; g.textAlign = 'center';
      g.fillText(a.label, x + chipW / 2, y + 33);
    });
    g.font = `500 24px ${FONT}`; g.fillStyle = '#7d8db0'; g.textAlign = 'center';
    const sc = game.scoring;
    g.fillText(game.running || sc.hits + sc.misses + sc.mistakes === 0
      ? 'Punch each target with the matching hand as it reaches the gate'
      : `Last: ${sc.score} pts · chain ${sc.longest} · ${sc.hitRatePct}% hits · ${fmtTime(sc.elapsed)}`, W / 2, 1120);
    this.menu.tex.needsUpdate = true;
  }

  btn(id) { return this.menu.buttons.find((b) => b.id === id); }

  drawButton(g, b, label, on, size, accent = '#22d3ff') {
    const hov = this.hoverId === b.id;
    roundRect(g, b.x, b.y, b.w, b.h, 20);
    g.fillStyle = on ? accent + (hov ? '55' : '33') : hov ? '#2a3760' : '#151d38'; g.fill();
    g.lineWidth = 3; g.strokeStyle = on || hov ? accent : '#33406a'; g.stroke();
    g.fillStyle = on ? '#ffffff' : '#c9d6f5'; g.font = `800 ${size}px ${FONT}`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(label, b.x + b.w / 2, b.y + b.h / 2 + 2);
  }

  drawHud(now) {
    const game = this.game, sc = game.scoring;
    const dur = fmtTime(sc.duration(now));
    const next = game.spawner.running ? game.spawner.nextIndex() : -1;
    const key = `${sc.score}|${sc.streak}|${sc.longest}|${dur}|${game.running}|${next}|${game.speed}`;
    if (key === this.lastHudKey) return;
    this.lastHudKey = key;
    const { g, canvas } = this.hud; const W = canvas.width, H = canvas.height;
    g.clearRect(0, 0, W, H);
    roundRect(g, 4, 4, W - 8, H - 8, 36); g.fillStyle = 'rgba(6,10,24,0.72)'; g.fill();
    g.lineWidth = 3; g.strokeStyle = 'rgba(120,90,255,0.6)'; g.stroke();
    const cells = [
      ['SCORE', String(sc.score), '#ffffff'],
      ['STREAK', String(sc.streak), '#22ff99'],
      ['LONGEST CHAIN', String(sc.longest), '#ffd84a'],
      ['TIME', dur, '#22d3ff'],
    ];
    const cw = (W - 40) / cells.length;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    cells.forEach(([label, val, col], i) => {
      const cx = 20 + cw * i + cw / 2;
      g.font = `700 34px ${FONT}`; g.fillStyle = '#8899bb'; g.fillText(label, cx, 70);
      g.font = `900 104px ${FONT}`; g.fillStyle = col; g.shadowColor = col; g.shadowBlur = 16;
      g.fillText(val, cx, 165); g.shadowBlur = 0;
    });
    // Sequence strip with the next action highlighted
    const chipW = 200, gap = 12, total = SEQUENCE.length * chipW + (SEQUENCE.length - 1) * gap;
    let x = (W - total) / 2;
    const nextIdx = next;
    SEQUENCE.forEach((id, i) => {
      const a = ACTIONS[id], isNext = i === nextIdx && game.running;
      roundRect(g, x, 250, chipW, 72, 16);
      g.fillStyle = hex(a.color) + (isNext ? 'aa' : '26'); g.fill();
      g.lineWidth = isNext ? 5 : 2; g.strokeStyle = hex(a.color); g.stroke();
      g.font = `800 30px ${FONT}`; g.fillStyle = isNext ? '#ffffff' : hex(a.color);
      g.fillText(a.label, x + chipW / 2, 288);
      x += chipW + gap;
    });
    g.textAlign = 'right'; g.font = `700 28px ${FONT}`; g.fillStyle = '#7d8db0';
    g.fillText(`${game.speed.toFixed(1)}×`, W - 34, 34);
    this.hud.tex.needsUpdate = true;
  }

  // ---------------- interaction ----------------
  pointerUpdate(rig) {
    let anyHover = null;
    for (const slot of rig.slots) {
      if (!slot.inputSource) { slot.line.visible = false; slot.dot.visible = false; continue; }
      rig.getRay(slot, this.raycaster);
      const hit = this.raycaster.intersectObject(this.menu.mesh, false)[0];
      slot.hit = hit || null;
      slot.line.visible = !!hit || (this.drag && this.drag.slot === slot);
      slot.dot.visible = !!hit;
      if (hit) {
        slot.line.scale.z = hit.distance;
        slot.dot.position.copy(hit.point);
        const b = this.menu.hitTest(hit.uv);
        if (b) anyHover = b.id;
      }
      if (this.drag && this.drag.slot === slot && hit) this.applySlider(hit.uv);
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
    if (!slot.hit) return false;
    const b = this.menu.hitTest(slot.hit.uv);
    if (!b) return true;
    if (b.id === 'slider') { this.drag = { slot }; this.applySlider(slot.hit.uv); }
    else { b.onClick(); this.game.audio.sfxClick(); }
    this.dirty = true;
    return true;
  }

  selectEnd(slot) { if (this.drag && this.drag.slot === slot) { this.drag = null; this.dirty = true; } }

  update(now) {
    if (this.dirty) { this.drawMenu(); this.dirty = false; }
    this.drawHud(now);
  }
}
