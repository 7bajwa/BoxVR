// BOXFLOW — target framework. A target style (content/targets/<id>) supplies only the BODY;
// the framework adds what every target needs: dark backplate (contrast against haze), action
// colour glow + ring, a clear direction marker, label, approach ring, fades and tints.
import * as THREE from 'three';
import { ACTIONS, hex } from './config.js';
import * as kit from './kit.js';

export { glowTexture as getGlowTexture, textSprite as makeTextSprite } from './kit.js';

const shared = {};
function sharedGeo() {
  if (shared.ring) return shared;
  shared.ring = new THREE.TorusGeometry(0.17, 0.011, 8, 48);
  const s = new THREE.Shape();
  s.moveTo(0, 0.1); s.lineTo(0.09, 0.0); s.lineTo(0.055, 0.0); s.lineTo(0, 0.055);
  s.lineTo(-0.055, 0.0); s.lineTo(-0.09, 0.0); s.closePath();
  shared.chevron = new THREE.ShapeGeometry(s);
  shared.dot = new THREE.RingGeometry(0.02, 0.045, 24);
  shared.approach = new THREE.RingGeometry(0.18, 0.196, 48);
  return shared;
}

const GRAY = new THREE.Color(0x4a505c);

export class Target {
  // style = { meta, mod, glb? } from content.loadTarget()
  constructor(actionId, style) {
    const a = ACTIONS[actionId];
    const geo = sharedGeo();
    const meta = style.meta;
    this.action = a;
    this.color = new THREE.Color(a.color);
    this.group = new THREE.Group();
    this.group.name = `Target_${a.id}`;
    this.mats = [];
    this.sfx = meta.sfx || 'zap';

    const add = (obj, order = 6) => { obj.renderOrder = order; this.group.add(obj); return obj; };
    const basic = (op, color = this.color) => this.track(new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    }));

    // Contrast backplate (normal blending, dark) so targets read against bright fog.
    this.shadow = add(new THREE.Sprite(this.track(new THREE.SpriteMaterial({
      map: kit.shadowTexture(), transparent: true, opacity: meta.backplate ?? 0.75, depthWrite: false, fog: false,
    }))), 4);
    this.shadow.scale.setScalar(0.62);
    this.shadow.position.z = -0.06;

    this.glow = add(new THREE.Sprite(this.track(new THREE.SpriteMaterial({
      map: kit.glowTexture(), color: this.color, transparent: true, opacity: meta.glow ?? 0.55,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    }))), 5);
    this.glow.scale.setScalar(meta.glowScale ?? 0.75);

    // Body from the style plugin.
    this.body = null;
    const ctx = { THREE, kit, action: a, color: this.color.clone(), colorHex: a.color, meta };
    if (style.mod && style.mod.create) this.body = style.mod.create(ctx);
    else if (style.glb) {
      const obj = style.glb.scene.clone(true);
      obj.traverse((o) => { if (o.isMesh) o.material = o.material.clone(); });
      obj.scale.setScalar(meta.scale ?? 1);
      this.body = { object: obj };
    }
    if (this.body) {
      add(this.body.object, 6);
      this.body.object.traverse((o) => {
        if (!o.material) return;
        for (const m of [].concat(o.material)) { m.fog = false; m.needsUpdate = true; this.track(m); }
        o.renderOrder = 6;
      });
    }

    if (meta.ring !== false) {
      this.ring = add(new THREE.Mesh(geo.ring, basic(0.95)));
      this.ring.scale.setScalar(meta.ringScale ?? 1);
    }

    // Direction marker — what motion the punch must have.
    this.markMat = basic(1);
    this.mark = new THREE.Group();
    if (a.arrow === 'fwd') {
      this.mark.add(new THREE.Mesh(geo.dot, this.markMat));
    } else {
      for (let i = 0; i < 3; i++) {
        const m = new THREE.Mesh(geo.chevron, this.markMat);
        m.position.y = -0.07 + i * 0.065;
        m.userData.i = i;
        this.mark.add(m);
      }
      // hooks: chevrons sit on the side the punch comes FROM, pointing across; uppercuts: below, pointing up
      if (a.arrow === 'up') { this.mark.position.set(0, -0.26, 0.02); }
      else {
        this.mark.rotation.z = a.arrow === 'left' ? Math.PI / 2 : -Math.PI / 2;
        this.mark.position.set(a.arrow === 'left' ? 0.27 : -0.27, 0, 0.02);
      }
    }
    if (a.arrow === 'fwd') this.mark.position.z = 0.14;
    this.mark.traverse((o) => { o.renderOrder = 7; });
    this.group.add(this.mark);

    this.label = add(kit.textSprite(a.label, hex(a.color), { scale: 0.085 }), 7);
    this.track(this.label.material);
    this.label.position.y = meta.labelY ?? 0.27;

    // Approach ring (lives in world space at the hit zone).
    this.ghost = new THREE.Mesh(geo.approach, new THREE.MeshBasicMaterial({
      color: this.color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    }));
    this.ghost.renderOrder = 6;
    this.ghost.visible = false;

    this.reset();
  }

  track(m) {
    m.userData.baseOpacity ??= m.opacity ?? 1;
    m.transparent = true;
    if (m.color) m.userData.baseColor ??= m.color.clone();
    this.mats.push(m);
    return m;
  }

  reset() {
    this.active = false;
    this.state = 'idle';
    this.group.visible = false;
    this.group.scale.setScalar(1);
    this.ghost.visible = false;
    this.setOpacity(1);
    this.setTint(false);
    this.flash(0);
  }

  setOpacity(o) { for (const m of this.mats) m.opacity = m.userData.baseOpacity * o; }

  setTint(gray) {
    this.gray = gray;
    if (this.body && this.body.tint) this.body.tint(gray);
    for (const m of this.mats) if (m.color && m.userData.baseColor && m !== this.shadow.material) {
      m.color.copy(m.userData.baseColor); if (gray) m.color.lerp(GRAY, 0.8);
    }
  }

  flash(v) {
    this.glow.material.opacity = this.glow.material.userData.baseOpacity * (1 + v * 2);
    if (this.body && this.body.flash) this.body.flash(v);
  }

  update(t, dt) {
    if (this.ring) this.ring.rotation.z += dt * 1.5;
    // chevrons ripple in the punch direction
    for (const c of this.mark.children) if (c.userData.i !== undefined) {
      c.material = this.markMat;
      c.scale.setScalar(0.85 + 0.25 * Math.max(0, Math.sin(t * 9 - c.userData.i * 1.2)));
    }
    if (this.body && this.body.update) this.body.update(t, dt);
  }

  dispose() {
    this.group.removeFromParent(); this.ghost.removeFromParent();
    if (this.body && this.body.dispose) this.body.dispose();
  }
}
