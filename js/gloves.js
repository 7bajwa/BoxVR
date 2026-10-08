// BOXFLOW — low-poly gloves, themed per scene (scene.json → "gloves").
//   { "type": "boxing" | "mitten" | "astro" | "rubber", "main": "#hex" | "hand", "cuff": "#hex" | "hand", "trim": "#hex" | "hand" }
// "hand" = the hand colour (left blue / right pink-red) so you always know which glove is which.
// Local space: punching face toward -Z, cuff toward +Z, +Y = back of the hand.
import * as THREE from 'three';
import { HAND_COLORS } from './config.js';
import { glowSprite } from './kit.js';

const DEFAULT = { type: 'boxing', main: 'hand', cuff: '#f2f2f2', trim: '#1a1a1a' };

export function buildGlove(hand, style = DEFAULT) {
  const s = { ...DEFAULT, ...style };
  const handCol = new THREE.Color(HAND_COLORS[hand]);
  const col = (v) => (v === 'hand' ? handCol.clone() : new THREE.Color(v));
  const mat = (c, extra = {}) => new THREE.MeshLambertMaterial({ color: c, emissive: c.clone().multiplyScalar(0.22), ...extra });
  const g = new THREE.Group();
  const side = hand === 'left' ? 1 : -1;        // thumb sits on the inner side

  const mainC = col(s.main), cuffC = col(s.cuff), trimC = col(s.trim);
  const mainM = mat(mainC, { flatShading: s.type === 'mitten' });

  if (s.type === 'mitten') {
    const mitt = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), mainM);
    mitt.scale.set(1.05, 0.85, 1.35); mitt.position.z = -0.01; g.add(mitt);
    const thumb = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), mainM);
    thumb.scale.set(1, 1, 1.6); thumb.position.set(0.043 * side, -0.012, 0.005); thumb.rotation.y = 0.4 * side; g.add(thumb);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.047, 0.05, 0.06, 12), mat(cuffC, { flatShading: true }));
    cuff.rotation.x = Math.PI / 2; cuff.position.z = 0.07; g.add(cuff);
    for (const z of [0.045, 0.095]) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.049, 0.006, 6, 18), mat(trimC));
      band.position.z = z; g.add(band);
    }
  } else {
    const mitt = new THREE.Mesh(new THREE.SphereGeometry(0.056, 18, 14), mainM);
    mitt.scale.set(1.0, 0.88, 1.28); mitt.position.z = -0.012; g.add(mitt);
    const thumb = new THREE.Mesh(new THREE.SphereGeometry(0.024, 10, 8), mainM);
    thumb.scale.set(0.9, 0.9, 1.7); thumb.position.set(0.046 * side, -0.016, 0.0); thumb.rotation.y = 0.35 * side; g.add(thumb);
    const cuffLen = s.type === 'astro' ? 0.09 : 0.07;
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.04, s.type === 'astro' ? 0.052 : 0.045, cuffLen, 16), mat(cuffC));
    cuff.rotation.x = Math.PI / 2; cuff.position.z = 0.04 + cuffLen / 2; g.add(cuff);
    const trim = new THREE.Mesh(new THREE.TorusGeometry(0.043, 0.007, 8, 20), mat(trimC));
    trim.position.z = 0.045; g.add(trim);
    if (s.type === 'boxing') {           // laces/strap on the back of the hand
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.012, 0.03), mat(trimC));
      strap.position.set(0, 0.04, 0.035); g.add(strap);
    }
    if (s.type === 'astro') {            // knuckle pads + wrist ring
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.008, 8, 20), mat(new THREE.Color(0x9aa0aa)));
      ring.position.z = 0.125; g.add(ring);
      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.014, 0.03), mat(new THREE.Color(0xbfc5cf)));
      pad.position.set(0, 0.045, -0.03); g.add(pad);
    }
  }
  const halo = glowSprite(handCol, 0.22, 0.35);
  halo.position.z = 0.02;
  g.add(halo);
  g.userData.halo = halo;
  g.traverse((o) => { o.renderOrder = 2; });
  return g;
}
