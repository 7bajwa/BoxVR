// BOXFLOW — feedback core: grade words, mistake labels, big announcements and the hit flash.
// Particle bursts come from the active EFFECT plugin (content/effects/<id>).
import * as THREE from 'three';
import * as kit from './kit.js';

const WORDS = {
  PERFECT: ['PERFECT', '#ffd84a'], GREAT: ['GREAT', '#4ee8ff'], GOOD: ['GOOD', '#ffffff'],
  MISS: ['MISS', '#ff4d6a'], DODGE: ['DODGE!', '#5fffb0'], OUCH: ['OUCH!', '#ff4d6a'], WRONG: ['WRONG HAND', '#ff9a3c'], WRONGDIR: ['WRONG DIRECTION', '#ff9a3c'],
};

export class FXCore {
  constructor(scene) {
    this.scene = scene;
    this.effect = null;
    this.words = [];
    for (const [key, [text, col]] of Object.entries(WORDS)) {
      for (let i = 0; i < 3; i++) {
        const s = kit.textSprite(text, col, { scale: key === 'WRONGDIR' ? 0.07 : 0.085, width: key === 'WRONGDIR' ? 768 : 512 });
        s.visible = false; s.renderOrder = 9; s.userData = { word: key, life: 0 };
        scene.add(s); this.words.push(s);
      }
    }
    this.flashSprite = kit.glowSprite(0xffffff, 1.6, 0);
    scene.add(this.flashSprite);
    this.flashLife = 0;
    this.announces = new Map();
    this.announceActive = null;
  }

  setEffect(effect) {
    if (this.effect && this.effect.dispose) this.effect.dispose();
    this.effect = effect;
  }

  burst(pos, color, power = 0.6) {
    if (this.effect) this.effect.burst(pos, color, power);
    this.flashSprite.position.copy(pos);
    this.flashSprite.material.color.set(color);
    this.flashLife = 0.18;
  }

  word(w, pos, yOff = 0.2) {
    const s = this.words.find((x) => x.userData.word === w && x.userData.life <= 0) || this.words.find((x) => x.userData.word === w);
    s.position.copy(pos); s.position.y += yOff;
    s.userData.life = 0.8; s.visible = true;
  }

  // Big centred text, e.g. "SPEED 3×", "GO!"
  announce(text, pos, color = '#5fe8ff') {
    if (!this.announces.has(text)) {
      const s = kit.textSprite(text, color, { scale: 0.22, width: 1024, height: 192, size: 120, weight: 900 });
      s.renderOrder = 9; this.scene.add(s); this.announces.set(text, s);
    }
    if (this.announceActive) this.announceActive.visible = false;
    const s = this.announces.get(text);
    s.position.copy(pos); s.visible = true; s.userData.life = 1.6;
    this.announceActive = s;
  }

  update(dt, camera) {
    if (this.effect) this.effect.update(dt, camera);
    for (const s of this.words) if (s.userData.life > 0) {
      s.userData.life -= dt;
      s.position.y += dt * 0.25;
      s.material.opacity = Math.min(1, s.userData.life / 0.3);
      if (s.userData.life <= 0) s.visible = false;
    }
    const a = this.announceActive;
    if (a && a.userData.life > 0) {
      a.userData.life -= dt;
      const k = a.userData.life;
      a.material.opacity = Math.min(1, k / 0.4);
      a.scale.setScalar(1);
      a.scale.set(0.22 * (1024 / 192) * (1 + Math.max(0, k - 1.4) * 2), 0.22 * (1 + Math.max(0, k - 1.4) * 2), 1);
      if (k <= 0) a.visible = false;
    }
    if (this.flashLife > 0) {
      this.flashLife -= dt;
      this.flashSprite.material.opacity = Math.max(0, this.flashLife / 0.18) * 0.9;
    }
  }
}
