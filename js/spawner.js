// BOXFLOW — target spawner + hit detection.
// Targets are scheduled on a fixed beat grid (one per interval) and fly straight down the
// lane so they reach their hit zone exactly on the beat. The sequence loops forever.
import * as THREE from 'three';
import { ACTIONS, SEQUENCE, TUNING, intervalFor, travelFor, windowFor } from './config.js';
import { Target } from './target.js';

const _v = new THREE.Vector3();
const _d = new THREE.Vector3();

export class Spawner {
  constructor(scene) {
    this.scene = scene;
    this.pool = {};
    this.active = [];
    this.anchor = new THREE.Vector3(0, 1.6, 0); // player's head at session start
    this.running = false;
    this.seqIndex = 0;
    this.nextHit = 0;
    this.speed = 1;
    this.onHit = null; this.onMiss = null; this.onWrong = null; this.onSpawn = null;

    // Approach rings: shrink onto the hit zone as the target arrives (timing cue).
    this.ghostGeo = new THREE.RingGeometry(0.17, 0.185, 48);
    this.ghosts = [];
  }

  acquire(actionId) {
    const list = (this.pool[actionId] ||= []);
    let t = list.find((x) => !x.active);
    if (!t) {
      t = new Target(actionId);
      this.scene.add(t.group);
      const ghost = new THREE.Mesh(this.ghostGeo, new THREE.MeshBasicMaterial({
        color: ACTIONS[actionId].color, transparent: true, opacity: 0, depthWrite: false,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      }));
      ghost.visible = false;
      this.scene.add(ghost);
      t.ghost = ghost;
      list.push(t);
    }
    return t;
  }

  zoneFor(action, out = new THREE.Vector3()) {
    return out.set(this.anchor.x + action.offset[0], this.anchor.y + action.offset[1], this.anchor.z + action.offset[2]);
  }

  setSpeed(speed, now) {
    this.speed = speed;
    this.interval = intervalFor(speed);
    this.travel = travelFor(speed);
    this.window = windowFor(speed);
    if (this.running) {
      const lastHit = this.nextHit - this.prevInterval;
      this.nextHit = Math.max(lastHit + this.interval, now + this.travel * 0.6);
    }
    this.prevInterval = this.interval;
    return this.nextHit;
  }

  start(now, speed) {
    this.clear();
    this.running = true;
    this.seqIndex = 0;
    this.setSpeed(speed, now);
    this.nextHit = now + Math.max(TUNING.leadIn, this.travel);
    this.prevInterval = this.interval;
    return this.nextHit; // music grid anchor
  }

  stop() { this.running = false; this.clear(); }

  clear() {
    for (const t of this.active) { t.reset(); t.ghost.visible = false; }
    this.active.length = 0;
  }

  spawnDue(now) {
    if (!this.running) return;
    // After a stall (tab hidden, headset off) skip beats that can no longer be shown,
    // advancing the sequence so the loop stays aligned with the beat grid.
    while (this.nextHit < now + this.travel * 0.5) {
      this.nextHit += this.interval;
      this.seqIndex = (this.seqIndex + 1) % SEQUENCE.length;
    }
    while (this.nextHit - this.travel <= now) {
      const id = SEQUENCE[this.seqIndex];
      const t = this.acquire(id);
      t.active = true;
      t.state = 'flying';
      t.hitTime = this.nextHit;
      t.travel = this.travel;
      t.window = this.window;
      t.velocity = TUNING.spawnDistance / this.travel;
      t.seqIndex = this.seqIndex;
      t.zone = this.zoneFor(t.action, t.zone || new THREE.Vector3());
      t.setTint(false);
      t.group.visible = true;
      this.active.push(t);
      this.onSpawn && this.onSpawn(t);
      this.seqIndex = (this.seqIndex + 1) % SEQUENCE.length;
      this.nextHit += this.interval;
    }
  }

  // The single target currently inside its timing window (windows never overlap).
  current(now) {
    for (const t of this.active) if (t.state === 'flying' && Math.abs(now - t.hitTime) <= t.window) return t;
    return null;
  }

  // Sequence index of the next target the player must hit (for the HUD highlight).
  nextIndex() {
    let best = null;
    for (const t of this.active) if (t.state === 'flying' && (!best || t.hitTime < best.hitTime)) best = t;
    return best ? best.seqIndex : this.seqIndex;
  }

  update(now, dt, fists, camera) {
    this.spawnDue(now);

    // ---- Hit detection (VR fists) ----
    const cur = this.current(now);
    if (cur && fists) this.checkFists(cur, now, fists);

    // ---- Movement / lifecycle ----
    for (let i = this.active.length - 1; i >= 0; i--) {
      const t = this.active[i];
      const tt = t.hitTime - now; // seconds until the beat
      t.update(now, dt);

      if (t.state === 'flying') {
        t.group.position.set(t.zone.x, t.zone.y, t.zone.z - tt * t.velocity);
        const fadeIn = Math.min(1, (t.travel - tt) / 0.4);
        t.setOpacity(Math.max(0, fadeIn));
        t.group.lookAt(camera.position.x, t.group.position.y, camera.position.z);

        // approach ring
        const g = t.ghost;
        if (tt < t.travel * 0.6 && tt > -t.window) {
          const k = Math.max(0, tt) / (t.travel * 0.6);
          g.visible = true;
          g.position.copy(t.zone);
          g.scale.setScalar(1 + k * 1.3);
          g.material.opacity = 0.25 + (1 - k) * 0.6;
          g.lookAt(camera.position);
        } else g.visible = false;

        if (now - t.hitTime > t.window) {
          t.state = 'missed'; t.deadTime = now; t.setTint(true); g.visible = false;
          this.onMiss && this.onMiss(t);
        }
      } else if (t.state === 'missed') {
        const age = now - t.deadTime;
        t.group.position.z += t.velocity * 0.5 * dt;
        t.group.position.y -= age * 1.5 * dt * 4;
        t.setOpacity(Math.max(0, 0.6 - age / 0.5));
        if (age > 0.5) { t.reset(); this.active.splice(i, 1); }
      } else if (t.state === 'hit') {
        const age = now - t.deadTime;
        t.group.scale.setScalar(1 + age * 6);
        t.coreMat.uniforms.uFlash.value = Math.max(0, 1 - age / 0.2);
        t.setOpacity(Math.max(0, 1 - age / 0.22));
        if (age > 0.22) { t.reset(); this.active.splice(i, 1); }
      }
    }
  }

  checkFists(t, now, fists) {
    const a = t.action;
    const order = a.hand === 'left' ? [fists.left, fists.right] : [fists.right, fists.left];
    for (const fist of order) {
      if (!fist.tracked) continue;
      if (fist.position.distanceTo(t.zone) > TUNING.zoneRadius) continue;
      const peak = fist.peakSpeed(now);
      if (fist.speed < 0.3 && peak < TUNING.minHitSpeed) continue;
      _v.copy(fist.velocity).normalize();
      _d.fromArray(a.dir).normalize();
      const dot = fist.speed > 0.05 ? _v.dot(_d) : 0;

      if (fist.handedness === a.hand) {
        if (peak < TUNING.minHitSpeed || dot < -0.2) continue; // resting or pulling back through the zone
        const accuracy = Math.max(0, 1 - Math.abs(now - t.hitTime) / t.window);
        const power = Math.min(1, peak / TUNING.fullPowerSpeed);
        const form = Math.min(1, Math.max(0, (dot + 0.2) / 0.9));
        this.resolveHit(t, now, { accuracy, power, form, fist });
        return;
      } else if (peak >= TUNING.wrongHandSpeed && dot > 0.3) {
        this.resolveWrong(t, now, fist);
        return;
      }
    }
  }

  // Desktop / keyboard input: the player names the action they threw.
  keyPunch(actionId, now) {
    const t = this.current(now);
    if (!t) return false;
    if (t.action.id === actionId) {
      const accuracy = Math.max(0, 1 - Math.abs(now - t.hitTime) / t.window);
      this.resolveHit(t, now, { accuracy, power: 0.7, form: 1, fist: null });
    } else this.resolveWrong(t, now, null);
    return true;
  }

  resolveHit(t, now, info) {
    t.state = 'hit'; t.deadTime = now; t.ghost.visible = false;
    t.group.position.copy(t.zone);
    this.onHit && this.onHit(t, info);
  }

  resolveWrong(t, now, fist) {
    t.state = 'missed'; t.deadTime = now; t.setTint(true); t.ghost.visible = false;
    this.onWrong && this.onWrong(t, fist);
  }
}
