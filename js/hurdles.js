// BOXFLOW — hurdles: things flying down the lane that you must DODGE (not punch).
//   duck  — a horizontal bar at head height → squat under it
//   left  — a barrier filling the LEFT side + centre → lean/step RIGHT
//   right — a barrier filling the RIGHT side + centre → lean/step LEFT
// Styles follow the scene (scene.json → "hurdle"): laser · broom · oar · metal · candy · branch
import * as THREE from 'three';
import { glowSprite, textSprite } from './kit.js';

let stripeTex = {};
function stripes(a, b) {
  const key = a + b;
  if (stripeTex[key]) return stripeTex[key];
  const c = document.createElement('canvas'); c.width = 64; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = a; g.fillRect(0, 0, 64, 256);
  g.fillStyle = b;
  for (let y = -64; y < 320; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(64, y + 32); g.lineTo(64, y + 64); g.lineTo(0, y + 32); g.closePath(); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 6);
  return (stripeTex[key] = t);
}

// A bar of length `len` along local +X (centred), styled.
function bar(style, len) {
  const g = new THREE.Group();
  const add = (m) => { g.add(m); return m; };
  const lam = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, emissive: new THREE.Color(c).multiplyScalar(0.25), ...o });
  const cyl = (r, l, m) => { const x = new THREE.Mesh(new THREE.CylinderGeometry(r, r, l, 12), m); x.rotation.z = Math.PI / 2; return x; };
  switch (style) {
    case 'broom': {
      add(cyl(0.025, len, lam(0x6b4a2a)));
      const br = add(new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.45, 10), lam(0xc9a14a)));
      br.rotation.z = Math.PI / 2; br.position.x = len / 2 + 0.15;
      const band = add(cyl(0.035, 0.05, lam(0x7a1f8a))); band.position.x = len / 2 - 0.05;
      break;
    }
    case 'oar': {
      add(cyl(0.028, len, lam(0x8a6236)));
      const blade = add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.03), lam(0xa8774a)));
      blade.position.x = len / 2 + 0.1;
      break;
    }
    case 'metal': {
      add(new THREE.Mesh(new THREE.BoxGeometry(len, 0.09, 0.09), new THREE.MeshLambertMaterial({ map: stripes('#f2c200', '#1a1a1a'), emissive: 0x332800 })))
        .material.map.repeat.set(len * 3, 1);
      for (const x of [-len / 2, len / 2]) { const l = add(glowSprite(0xff5533, 0.35, 0.9)); l.position.x = x; }
      break;
    }
    case 'candy': {
      const m = new THREE.MeshLambertMaterial({ map: stripes('#ffffff', '#d81e2c'), emissive: 0x331111 });
      add(cyl(0.035, len, m)).material.map.repeat.set(1, len * 4);
      break;
    }
    case 'branch': {
      add(cyl(0.035, len, lam(0x5a3d26, { flatShading: true })));
      const snow = add(new THREE.Mesh(new THREE.BoxGeometry(len * 0.9, 0.035, 0.07), lam(0xffffff)));
      snow.position.y = 0.04;
      break;
    }
    default: { // laser
      add(cyl(0.022, len, new THREE.MeshBasicMaterial({ color: 0xffffff })));
      add(cyl(0.06, len, new THREE.MeshBasicMaterial({ color: 0xff2a6d, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false })));
      for (const x of [-len / 2, len / 2]) { const l = add(glowSprite(0xff2a6d, 0.5, 0.9)); l.position.x = x; }
    }
  }
  return g;
}

export class Hurdle {
  constructor(type, style) {
    this.type = type;
    this.group = new THREE.Group();
    this.group.name = `Hurdle_${type}`;
    const warn = new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false });
    if (type === 'duck') {
      this.group.add(bar(style, 2.4));
      const label = textSprite('▼ DUCK ▼', '#ffb35f', { scale: 0.2, width: 640 });
      label.position.y = 0.26; this.group.add(label);
    } else {
      // vertical bar at the inner edge + translucent panel over the blocked side
      const b = bar(style, 2.6); b.rotation.z = Math.PI / 2; b.position.y = 1.3; this.group.add(b);
      const dir = type === 'left' ? -1 : 1;           // which side is blocked
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 2.4), warn);
      panel.position.set(dir * 0.65, 1.2, 0); this.group.add(panel);
      const label = textSprite(type === 'left' ? 'MOVE ▶' : '◀ MOVE', '#ffb35f', { scale: 0.2, width: 640 });
      label.position.set(-dir * 0.35, 1.95, 0); this.group.add(label);
    }
    this.group.traverse((o) => { o.renderOrder = 5; if (o.material) o.material.fog = false; });
    this.group.visible = false;
    this.active = false;
  }
}
