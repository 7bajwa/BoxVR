// BOXFLOW — hit feedback effects: particle bursts, shockwave rings, floating grade text.
import * as THREE from 'three';
import { getGlowTexture, makeTextSprite } from './target.js';

const WORDS = {
  PERFECT: '#ffd84a', GREAT: '#4ee8ff', GOOD: '#ffffff', MISS: '#ff4d6a', WRONG: '#ff9a3c',
};

export class FX {
  constructor(scene) {
    this.scene = scene;

    // ---- Particle bursts (single Points object, CPU simulated) ----
    this.maxP = 600;
    this.pPos = new Float32Array(this.maxP * 3);
    this.pCol = new Float32Array(this.maxP * 3);
    this.pVel = new Float32Array(this.maxP * 3);
    this.pLife = new Float32Array(this.maxP);
    this.pBase = new Float32Array(this.maxP * 3);
    this.pNext = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.035, map: getGlowTexture(), vertexColors: true, transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);

    // ---- Shockwave rings ----
    this.rings = [];
    const ringGeo = new THREE.RingGeometry(0.9, 1.0, 48);
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      }));
      m.visible = false; m.userData.life = 0;
      scene.add(m); this.rings.push(m);
    }

    // ---- Floating words ----
    this.words = [];
    for (const [w, col] of Object.entries(WORDS)) {
      for (let i = 0; i < 3; i++) {
        const s = makeTextSprite(w === 'WRONG' ? 'WRONG HAND' : w, col, { scale: 0.08 });
        s.visible = false; s.userData = { word: w, life: 0 };
        scene.add(s); this.words.push(s);
      }
    }

    // ---- Hit-zone flash light (cheap: a big additive sprite) ----
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({
      map: getGlowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0,
    }));
    this.flash.scale.setScalar(1.6);
    scene.add(this.flash);
    this.flashLife = 0;
  }

  burst(pos, color, power = 0.6) {
    const c = new THREE.Color(color);
    const n = 30 + Math.round(power * 30);
    for (let k = 0; k < n; k++) {
      const i = this.pNext; this.pNext = (this.pNext + 1) % this.maxP;
      this.pPos[i * 3] = pos.x; this.pPos[i * 3 + 1] = pos.y; this.pPos[i * 3 + 2] = pos.z;
      const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      const sp = (0.8 + Math.random() * 2.2) * (0.6 + power);
      this.pVel[i * 3] = Math.sin(ph) * Math.cos(th) * sp;
      this.pVel[i * 3 + 1] = Math.sin(ph) * Math.sin(th) * sp;
      this.pVel[i * 3 + 2] = Math.cos(ph) * sp - 1.0;
      const mix = Math.random() * 0.5;
      this.pBase[i * 3] = c.r + (1 - c.r) * mix;
      this.pBase[i * 3 + 1] = c.g + (1 - c.g) * mix;
      this.pBase[i * 3 + 2] = c.b + (1 - c.b) * mix;
      this.pLife[i] = 0.5 + Math.random() * 0.4;
    }
    const r = this.rings.find((m) => m.userData.life <= 0) || this.rings[0];
    r.position.copy(pos); r.material.color.set(color); r.userData.life = 0.35; r.visible = true;

    this.flash.position.copy(pos);
    this.flash.material.color.set(color);
    this.flashLife = 0.18;
  }

  word(w, pos) {
    const s = this.words.find((x) => x.userData.word === w && x.userData.life <= 0)
      || this.words.find((x) => x.userData.word === w);
    s.position.copy(pos); s.position.y += 0.18;
    s.userData.life = 0.8; s.visible = true;
  }

  update(dt, camera) {
    for (let i = 0; i < this.maxP; i++) {
      if (this.pLife[i] > 0) {
        this.pLife[i] -= dt;
        const k = Math.max(0, this.pLife[i] / 0.9);
        this.pVel[i * 3 + 1] -= 3.0 * dt;
        for (let a = 0; a < 3; a++) {
          this.pVel[i * 3 + a] *= 1 - 2.5 * dt;
          this.pPos[i * 3 + a] += this.pVel[i * 3 + a] * dt;
          this.pCol[i * 3 + a] = this.pBase[i * 3 + a] * k;
        }
      } else if (this.pCol[i * 3] !== 0) {
        this.pCol[i * 3] = this.pCol[i * 3 + 1] = this.pCol[i * 3 + 2] = 0;
      }
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;

    for (const r of this.rings) {
      if (r.userData.life > 0) {
        r.userData.life -= dt;
        const p = 1 - r.userData.life / 0.35;
        r.scale.setScalar(0.08 + p * 0.45);
        r.material.opacity = (1 - p) * 0.9;
        r.lookAt(camera.position);
        if (r.userData.life <= 0) r.visible = false;
      }
    }
    for (const s of this.words) {
      if (s.userData.life > 0) {
        s.userData.life -= dt;
        s.position.y += dt * 0.25;
        s.material.opacity = Math.min(1, s.userData.life / 0.3);
        if (s.userData.life <= 0) s.visible = false;
      }
    }
    if (this.flashLife > 0) {
      this.flashLife -= dt;
      this.flash.material.opacity = Math.max(0, this.flashLife / 0.18) * 0.9;
    }
  }
}
