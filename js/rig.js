// BOXFLOW — Quest 3 VR rig. Works with hand-tracking AND Touch controllers.
// Each hand is a "Fist": world position, smoothed velocity, peak speed (power),
// a glowing glove visual, a UI pointer ray, and haptics when a controller is held.
import * as THREE from 'three';
import { getGlowTexture } from './target.js';

const HAND_JOINT = 'middle-finger-metacarpal'; // center of the knuckles ≈ punch contact point
const _tmp = new THREE.Vector3();

class Fist {
  constructor(handedness, scene) {
    this.handedness = handedness;
    this.position = new THREE.Vector3();
    this.prev = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.speed = 0;
    this.tracked = false;
    this.source = null;     // 'hand' | 'controller'
    this.gamepad = null;
    this.history = [];      // [{t, speed}]
    this.wasTracked = false;

    const col = handedness === 'left' ? 0x9be7ff : 0xffb3c4;
    this.mesh = new THREE.Group();
    const glove = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 20, 14),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    glove.scale.set(1, 0.85, 1.2);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: getGlowTexture(), color: col, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    halo.scale.setScalar(0.28);
    this.halo = halo;
    this.mesh.add(glove, halo);
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  // Peak speed in the last ~90 ms: what the punch "had" when it landed.
  peakSpeed(now) {
    let m = this.speed;
    for (const h of this.history) if (now - h.t < 0.09) m = Math.max(m, h.speed);
    return m;
  }

  pulse(intensity = 0.35, ms = 60) {
    const gp = this.gamepad;
    if (!gp) return;
    try {
      if (gp.hapticActuators && gp.hapticActuators[0]) gp.hapticActuators[0].pulse(intensity, ms);
      else if (gp.vibrationActuator) gp.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: intensity, weakMagnitude: intensity });
    } catch { /* haptics optional */ }
  }
}

export class VRRig {
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.scene = scene;
    this.fists = { left: new Fist('left', scene), right: new Fist('right', scene) };
    this.slots = [];
    this.onSelectStart = null; // (slot) => void
    this.onSelectEnd = null;
    this.onBack = null;        // B / Y pressed (controllers)

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

      const slot = { index: i, ray, grip, hand, line, dot, inputSource: null, handedness: null, selecting: false };
      this.slots.push(slot);
      scene.add(ray, grip, hand);

      ray.addEventListener('connected', (e) => {
        slot.inputSource = e.data;
        slot.handedness = e.data.handedness;
      });
      ray.addEventListener('disconnected', () => {
        const f = this.fists[slot.handedness];
        if (f) { f.tracked = false; f.mesh.visible = false; f.gamepad = null; }
        slot.inputSource = null; slot.handedness = null;
      });
      ray.addEventListener('selectstart', () => { slot.selecting = true; this.onSelectStart && this.onSelectStart(slot); });
      ray.addEventListener('selectend', () => { slot.selecting = false; this.onSelectEnd && this.onSelectEnd(slot); });
    }
  }

  update(now, dt) {
    for (const f of Object.values(this.fists)) f.tracked = false;

    for (const slot of this.slots) {
      const src = slot.inputSource;
      const fist = src && this.fists[src.handedness];
      if (!fist) continue;

      // B (right) / Y (left) = back / pause. xr-standard mapping: buttons[5].
      const gp = src.gamepad;
      const back = !!(gp && gp.buttons && gp.buttons[5] && gp.buttons[5].pressed);
      if (back && !slot.backDown && this.onBack) this.onBack();
      slot.backDown = back;

      let ok = false;
      if (src.hand) {
        const j = slot.hand.joints && slot.hand.joints[HAND_JOINT];
        if (j && j.visible) { j.getWorldPosition(_tmp); ok = true; fist.source = 'hand'; fist.gamepad = null; }
      } else if (slot.grip.visible) {
        slot.grip.getWorldPosition(_tmp);
        // Push the contact point slightly forward from the grip to the knuckles.
        const fwd = new THREE.Vector3(0, -0.02, -0.05).applyQuaternion(slot.grip.getWorldQuaternion(new THREE.Quaternion()));
        _tmp.add(fwd);
        ok = true; fist.source = 'controller'; fist.gamepad = src.gamepad || null;
      }
      if (!ok) continue;

      fist.tracked = true;
      fist.position.copy(_tmp);
      if (!fist.wasTracked || dt <= 0) {
        fist.prev.copy(fist.position); fist.velocity.set(0, 0, 0);
      } else {
        const inst = _tmp.clone().sub(fist.prev).divideScalar(Math.max(dt, 1e-3));
        fist.velocity.lerp(inst, 0.55);
        fist.prev.copy(fist.position);
      }
      fist.speed = fist.velocity.length();
      fist.history.push({ t: now, speed: fist.speed });
      while (fist.history.length && now - fist.history[0].t > 0.2) fist.history.shift();

      fist.mesh.position.copy(fist.position);
      fist.halo.material.opacity = 0.35 + Math.min(0.6, fist.speed / 6);
    }

    for (const f of Object.values(this.fists)) {
      f.mesh.visible = f.tracked;
      f.wasTracked = f.tracked;
    }
  }

  // Ray (origin + direction) for UI pointing, per slot.
  getRay(slot, raycaster) {
    const m = slot.ray.matrixWorld;
    raycaster.ray.origin.setFromMatrixPosition(m);
    raycaster.ray.direction.set(0, 0, -1).transformDirection(m);
    return raycaster;
  }

  setPointersVisible(v) { for (const s of this.slots) { s.line.visible = v && !!s.inputSource; if (!v) s.dot.visible = false; } }
}
