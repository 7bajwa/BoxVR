// BOXFLOW — Quest 3 VR rig. Works with hand-tracking AND Touch controllers.
// Each hand is a "Fist": world position + orientation, smoothed velocity, peak speed (power),
// swing tracking, a themed glove, a UI pointer ray, and haptics when a controller is held.
// Short tracking dropouts (common on fast uppercuts with hand-tracking) are bridged instead of
// resetting the velocity, and the previous position is kept for a swept hit test.
import * as THREE from 'three';
import { buildGlove } from './gloves.js';

const HAND_JOINT = 'middle-finger-metacarpal'; // centre of the knuckles ≈ punch contact point
const GAP_BRIDGE = 0.3;                        // s — re-acquired within this, keep the motion
const _tmp = new THREE.Vector3(), _q = new THREE.Quaternion(), _off = new THREE.Vector3();

class Fist {
  constructor(handedness, scene) {
    this.handedness = handedness;
    this.position = new THREE.Vector3();
    this.from = new THREE.Vector3();      // where the fist was on the previous sample (swept test)
    this.quaternion = new THREE.Quaternion();
    this.velocity = new THREE.Vector3();
    this.speed = 0;
    this.tracked = false;
    this.lastSeen = -1;
    this.source = null;                   // 'hand' | 'controller'
    this.gamepad = null;
    this.history = [];                    // [{ t, speed, p, v }] — last ~0.7 s
    this.scene = scene;
    this.mesh = new THREE.Group();
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.setGloves();
  }

  setGloves(style) {
    for (const c of [...this.mesh.children]) this.mesh.remove(c);
    this.glove = buildGlove(this.handedness, style);
    this.glove.position.z = 0.035;        // the knuckle point is the glove's front face
    this.mesh.add(this.glove);
  }

  // Peak speed in the last ~90 ms: what the punch "had" when it landed.
  peakSpeed(now) {
    let m = this.speed;
    for (const h of this.history) if (now - h.t < 0.09) m = Math.max(m, h.speed);
    return m;
  }

  // Direction of the punch = velocity at its fastest moment in the last ~120 ms
  // (an uppercut curves: forward, then up — its fastest part is the one that counts).
  peakVelocity(now, out) {
    let best = this.speed; out.copy(this.velocity);
    for (const h of this.history) if (now - h.t < 0.12 && h.speed > best) { best = h.speed; out.copy(h.v); }
    return out;
  }

  // How far the fist travelled along `dir` during this punch. Tap ≈ 0.05 m, full ≈ 0.4–0.5 m.
  swingAlong(dir, now) {
    const cur = this.position.dot(dir);
    let min = cur;
    for (const h of this.history) if (now - h.t < 0.6) min = Math.min(min, h.p.dot(dir));
    return Math.max(0, cur - min);
  }

  punchFx() { this.punchT = 0.12; }

  pulse(intensity = 0.35, ms = 60) {
    const gp = this.gamepad;
    if (!gp) return;
    try {
      intensity = Math.min(1, Math.max(0, intensity));
      if (gp.vibrationActuator && gp.vibrationActuator.playEffect) {
        gp.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: intensity, weakMagnitude: intensity });
      }
      if (gp.hapticActuators && gp.hapticActuators[0]) gp.hapticActuators[0].pulse(intensity, ms);
    } catch { /* haptics optional */ }
  }
}

export class VRRig {
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.scene = scene;
    this.fists = { left: new Fist('left', scene), right: new Fist('right', scene) };
    this.slots = [];
    this.onSelectStart = null;
    this.onSelectEnd = null;
    this.onBack = null;

    const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
    for (let i = 0; i < 2; i++) {
      const ray = renderer.xr.getController(i);
      const grip = renderer.xr.getControllerGrip(i);
      const hand = renderer.xr.getHand(i);
      const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0x88f0ff, transparent: true, opacity: 0.8 }));
      line.scale.z = 2; line.visible = false;
      ray.add(line);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.008, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      dot.visible = false; scene.add(dot);
      const slot = { index: i, ray, grip, hand, line, dot, inputSource: null, handedness: null };
      this.slots.push(slot);
      scene.add(ray, grip, hand);
      ray.addEventListener('connected', (e) => { slot.inputSource = e.data; slot.handedness = e.data.handedness; });
      ray.addEventListener('disconnected', () => {
        const f = this.fists[slot.handedness];
        if (f) { f.tracked = false; f.mesh.visible = false; f.gamepad = null; }
        slot.inputSource = null; slot.handedness = null;
      });
      ray.addEventListener('selectstart', () => this.onSelectStart && this.onSelectStart(slot));
      ray.addEventListener('selectend', () => this.onSelectEnd && this.onSelectEnd(slot));
    }
  }

  setGloves(style) { for (const f of Object.values(this.fists)) f.setGloves(style); }

  update(now, dt) {
    for (const f of Object.values(this.fists)) f.tracked = false;

    for (const slot of this.slots) {
      const src = slot.inputSource;
      const fist = src && this.fists[src.handedness];
      if (!fist) continue;

      const gp = src.gamepad; // B (right) / Y (left) = back / pause (xr-standard buttons[5])
      const back = !!(gp && gp.buttons && gp.buttons[5] && gp.buttons[5].pressed);
      if (back && !slot.backDown && this.onBack) this.onBack();
      slot.backDown = back;

      let ok = false;
      if (src.hand) {
        const j = slot.hand.joints && slot.hand.joints[HAND_JOINT];
        if (j && j.visible) {
          j.getWorldPosition(_tmp); j.getWorldQuaternion(fist.quaternion);
          ok = true; fist.source = 'hand'; fist.gamepad = null;
        }
      } else if (slot.grip.visible) {
        slot.grip.getWorldPosition(_tmp); slot.grip.getWorldQuaternion(fist.quaternion);
        _tmp.add(_off.set(0, -0.02, -0.05).applyQuaternion(fist.quaternion)); // grip → knuckles
        ok = true; fist.source = 'controller'; fist.gamepad = src.gamepad || null;
      }
      if (!ok) continue;

      fist.tracked = true;
      const gap = now - fist.lastSeen;
      if (fist.lastSeen < 0 || gap > GAP_BRIDGE || gap <= 0) {
        fist.from.copy(_tmp); fist.velocity.set(0, 0, 0);
      } else {
        fist.from.copy(fist.position);
        const inst = _off.copy(_tmp).sub(fist.position).divideScalar(Math.max(gap, 1e-3));
        if (gap > dt * 1.8) fist.velocity.copy(inst);  // re-acquired after a dropout: trust the jump
        else fist.velocity.lerp(inst, 0.6);
      }
      fist.position.copy(_tmp);
      fist.lastSeen = now;
      fist.speed = fist.velocity.length();
      fist.history.push({ t: now, speed: fist.speed, p: fist.position.clone(), v: fist.velocity.clone() });
      while (fist.history.length && now - fist.history[0].t > 0.7) fist.history.shift();

      fist.mesh.position.copy(fist.position);
      fist.mesh.quaternion.copy(fist.quaternion);
      const s = fist.punchT > 0 ? 1.18 : 1;
      fist.glove.scale.setScalar(s);
      if (fist.punchT > 0) fist.punchT -= dt;
      fist.glove.userData.halo.material.opacity = 0.25 + Math.min(0.55, fist.speed / 7);
    }
    for (const f of Object.values(this.fists)) f.mesh.visible = f.tracked;
  }

  getRay(slot, raycaster) {
    const m = slot.ray.matrixWorld;
    raycaster.ray.origin.setFromMatrixPosition(m);
    raycaster.ray.direction.set(0, 0, -1).transformDirection(m);
    return raycaster;
  }
}
