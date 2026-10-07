// BOXFLOW — immediate-mode canvas panels rendered onto planes in the 3D scene.
// The same panels serve VR (controller rays / pinch) and desktop/phone (mouse / touch rays).
import * as THREE from 'three';

export const FONT = '"Rajdhani", "Segoe UI", system-ui, sans-serif';
export const C = {
  text: '#e6eeff', muted: '#8ea2c9', dim: '#5d6f96', cyan: '#5fe8ff', green: '#5fffb0', red: '#ff4d6a', yellow: '#ffd84a',
  line: 'rgba(150,190,255,0.22)', fill: 'rgba(255,255,255,0.045)',
};

export function roundRect(g, x, y, w, h, r) {
  r = Math.min(r, h / 2, w / 2);
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

export class Panel {
  constructor(name, pxW, pxH, widthM) {
    this.name = name;
    this.canvas = document.createElement('canvas');
    this.canvas.width = pxW; this.canvas.height = pxH;
    this.W = pxW; this.H = pxH;
    this.g = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 8;
    this.tex.generateMipmaps = true;
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(widthM, widthM * (pxH / pxW)),
      new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false }),
    );
    this.mesh.renderOrder = 20;
    this.mesh.userData.panel = this;
    this.buttons = [];
    this.hover = null;
    this.dirty = true;
    this.drawFn = null;
  }

  set visible(v) { this.mesh.visible = v; }
  get visible() { return this.mesh.visible; }

  redraw() {
    if (!this.drawFn) return;
    this.buttons = [];
    this.g.clearRect(0, 0, this.W, this.H);
    this.g.textBaseline = 'middle';
    this.drawFn(this, this.g);
    this.tex.needsUpdate = true;
    this.dirty = false;
  }

  hitTest(uv) {
    const x = uv.x * this.W, y = (1 - uv.y) * this.H;
    for (let i = this.buttons.length - 1; i >= 0; i--) {
      const b = this.buttons[i];
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return { ...b, px: x, py: y };
    }
    return null;
  }

  // ---------------- drawing helpers ----------------
  glass(r = 46, alpha = 0.86) {
    const g = this.g;
    roundRect(g, 3, 3, this.W - 6, this.H - 6, r);
    const bg = g.createLinearGradient(0, 0, 0, this.H);
    bg.addColorStop(0, `rgba(16,30,62,${alpha})`); bg.addColorStop(1, `rgba(7,13,32,${alpha})`);
    g.fillStyle = bg; g.fill();
    g.lineWidth = 3; g.strokeStyle = 'rgba(120,190,255,0.28)'; g.stroke();
    // inner top highlight
    roundRect(g, 10, 10, this.W - 20, this.H - 20, r - 8);
    g.lineWidth = 1.5; g.strokeStyle = 'rgba(255,255,255,0.05)'; g.stroke();
  }

  text(str, x, y, { size = 32, weight = 700, color = C.text, align = 'left', glow = 0, spacing = 0, maxW } = {}) {
    const g = this.g;
    g.font = `${weight} ${size}px ${FONT}`;
    g.textAlign = align; g.fillStyle = color;
    if ('letterSpacing' in g) g.letterSpacing = `${spacing}px`;
    if (glow) { g.shadowColor = color; g.shadowBlur = glow; }
    g.fillText(str, x, y, maxW);
    g.shadowBlur = 0;
    if ('letterSpacing' in g) g.letterSpacing = '0px';
  }

  title(str, y, size = 64) {
    this.text(str, this.W / 2, y, { size, weight: 700, align: 'center', glow: 18, spacing: 4, color: '#f2f7ff' });
  }

  hit(id, x, y, w, h, onClick, extra = {}) { this.buttons.push({ id, x, y, w, h, onClick, ...extra }); }

  button(id, x, y, w, h, label, { on = false, accent = C.cyan, size = 34, onClick, kind = 'normal', disabled = false, sub } = {}) {
    const g = this.g;
    const hov = this.hover === id && !disabled;
    const r = kind === 'primary' ? h / 2 : 18;
    roundRect(g, x, y, w, h, r);
    if (kind === 'primary') {
      g.fillStyle = hov ? 'rgba(95,232,255,0.22)' : 'rgba(95,232,255,0.08)'; g.fill();
      g.shadowColor = accent; g.shadowBlur = hov ? 34 : 22;
      g.lineWidth = 5; g.strokeStyle = accent; g.stroke(); g.shadowBlur = 0;
    } else {
      g.fillStyle = on ? hexA(accent, 0.2) : hov ? 'rgba(95,232,255,0.1)' : C.fill; g.fill();
      g.lineWidth = on || hov ? 3 : 2; g.strokeStyle = on ? accent : hov ? hexA(accent, 0.8) : kind === 'danger' ? hexA(C.red, 0.5) : C.line; g.stroke();
    }
    const col = disabled ? C.dim : kind === 'danger' ? '#ffb3c0' : on || kind === 'primary' ? '#ffffff' : '#d5e0fb';
    this.text(label, x + w / 2, y + h / 2 + (sub ? -12 : 2), { size, weight: 700, align: 'center', color: col, spacing: kind === 'primary' ? 6 : 1.5, glow: on ? 10 : 0, maxW: w - 16 });
    if (sub) this.text(sub, x + w / 2, y + h / 2 + 22, { size: Math.round(size * 0.55), weight: 600, align: 'center', color: C.muted, maxW: w - 16 });
    if (!disabled && onClick) this.hit(id, x, y, w, h, onClick);
  }

  toggle(id, x, y, on, onClick) {
    const g = this.g, w = 110, h = 54;
    const hov = this.hover === id;
    roundRect(g, x, y, w, h, h / 2);
    g.fillStyle = on ? 'rgba(95,232,255,0.35)' : 'rgba(255,255,255,0.06)'; g.fill();
    g.lineWidth = 2.5; g.strokeStyle = on ? C.cyan : hov ? C.cyan : C.line; g.stroke();
    g.beginPath(); g.arc(on ? x + w - h / 2 : x + h / 2, y + h / 2, h / 2 - 7, 0, Math.PI * 2);
    g.fillStyle = on ? '#ffffff' : '#7d8db0';
    if (on) { g.shadowColor = C.cyan; g.shadowBlur = 16; }
    g.fill(); g.shadowBlur = 0;
    this.hit(id, x - 10, y - 10, w + 20, h + 20, onClick);
  }

  stepper(id, x, y, w, value, onMinus, onPlus) {
    const h = 58;
    this.button(id + '-', x, y, 64, h, '−', { size: 40, onClick: onMinus });
    this.text(value, x + w / 2, y + h / 2 + 2, { size: 36, weight: 700, align: 'center', color: C.cyan });
    this.button(id + '+', x + w - 64, y, 64, h, '+', { size: 40, onClick: onPlus });
  }

  slider(id, x, y, w, t, onDrag) {
    const g = this.g, h = 70;
    roundRect(g, x, y + h / 2 - 7, w, 14, 7); g.fillStyle = 'rgba(255,255,255,0.08)'; g.fill();
    roundRect(g, x, y + h / 2 - 7, Math.max(14, w * t), 14, 7); g.fillStyle = C.cyan; g.fill();
    g.beginPath(); g.arc(x + w * t, y + h / 2, 26, 0, Math.PI * 2);
    g.fillStyle = '#eafcff'; g.shadowColor = C.cyan; g.shadowBlur = this.hover === id ? 30 : 16; g.fill(); g.shadowBlur = 0;
    this.hit(id, x - 20, y - 10, w + 40, h + 20, null, { drag: (px) => onDrag(Math.min(1, Math.max(0, (px - x) / w))) });
  }
}

export function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
