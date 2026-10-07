// BOXFLOW — target spawner + hit judging.
// Two schedules: ENDLESS (one target per interval, the fixed sequence forever, speed can ramp)
// and CHART (absolute note times from a song level). Targets fly straight down the lane and
// reach their hit zone exactly on the beat.
import * as THREE from 'three';
import { ACTIONS, SEQUENCE, TUNING, intervalFor, travelFor, windowFor } from './config.js';
import { Target } from './target.js';

const _v = new THREE.Vector3();
const _d = new THREE.Vector3();

export class Spawner {
  constructor(scene) {
    this.scene = scene;
    this.style = null;
    this.pool = {};
    this.active = [];
    this.anchor = new THREE.Vector3(0, 1.6, 0); // player position (x, z used)
    this.targetHeight = 1.6;                     // meters — straight punches hit here
    this.strictDir = true;
    this.running = false;
    this.mode = 'endless';
    this.seqIndex = 0;
    this.nextHit = 0;
    this.speed = 1;
    this.travel = travelFor(1);
    this.onHit = null; this.onMiss = null; this.onWrong = null;
  }

  setStyle(style) {
    this.clear();
    for (const list of Object.values(this.pool)) for (const t of list) t.dispose();
    this.pool = {};
    this.style = style;
  }

  acquire(actionId) {
    const list = (this.pool[actionId] ||= []);
    let t = list.find((x) => !x.active);
    if (!t) {
      t = new Target(actionId, this.style);
      this.scene.add(t.group, t.ghost);
      list.push(t);
    }
    return t;
  }

  zoneFor(action, out = new THREE.Vector3()) {
    return out.set(this.anchor.x + action.offset[0], this.targetHeight + action.offset[1], this.anchor.z + action.offset[2]);
  }

  // ---------------------------------------------------------------- endless
  setSpeed(speed, now) {
    this.speed = speed;
    this.interval = intervalFor(speed);
    this.travel = travelFor(speed);
    this.window = windowFor(speed);
    if (this.running && this.mode === 'endless') {
      const lastHit = this.nextHit - this.prevInterval;
      this.nextHit = Math.max(lastHit + this.interval, now + this.travel * 0.6);
    }
    this.prevInterval = this.interval;
    return this.nextHit;
  }

  startEndless(now, speed) {
    this.clear();
    this.mode = 'endless';
    this.running = true;
    this.seqIndex = 0;
    this.setSpeed(speed, now);
    this.nextHit = now + Math.max(TUNING.leadIn, this.travel);
    this.prevInterval = this.interval;
    return this.nextHit;
  }

  // ---------------------------------------------------------------- chart
  // notes: [{ time, action }] absolute (clock) seconds, sorted.
  startChart(notes, travel) {
    this.clear();
    this.mode = 'chart';
    this.running = true;
    this.travel = travel;
    this.notes = notes.map((n, i) => {
      const prev = i > 0 ? n.time - notes[i - 1].time : 9;
      const next = i < notes.length - 1 ? notes[i + 1].time - n.time : 9;
      return { ...n, window: Math.min(TUNING.maxWindow, Math.min(prev, next) * 0.45) };
    });
    this.noteIdx = 0;
    this.seqIndex = 0;
  }

  get done() { return this.mode === 'chart' && this.noteIdx >= this.notes.length && this.active.length === 0; }

  // ---------------------------------------------------------------- common
  stop() { this.running = false; this.clear(); }

  clear() {
    for (const t of this.active) t.reset();
    this.active.length = 0;
  }

  // Pause support: push every pending beat later by `d` seconds.
  shift(d) {
    this.nextHit += d;
    if (this.notes) for (let i = this.noteIdx; i < this.notes.length; i++) this.notes[i].time += d;
    for (const t of this.active) { t.hitTime += d; t.deadTime += d; }
  }

  setVisible(v) { for (const t of this.active) { t.group.visible = v; if (!v) t.ghost.visible = false; } }

  spawn(actionId, hitTime, window, now) {
    const t = this.acquire(actionId);
    t.active = true;
    t.state = 'flying';
    t.hitTime = hitTime;
    t.travel = this.travel;
    t.window = window;
    t.velocity = TUNING.spawnDistance / this.travel;
    t.zone = this.zoneFor(t.action, t.zone || new THREE.Vector3());
    t.setTint(false);
    t.group.visible = true;
    this.active.push(t);
    return t;
  }

  spawnDue(now) {
    if (!this.running) return;
    if (this.mode === 'endless') {
      // After a stall (tab hidden, headset off) skip beats that can no longer be shown.
      while (this.nextHit < now + this.travel * 0.5) {
        this.nextHit += this.interval;
        this.seqIndex = (this.seqIndex + 1) % SEQUENCE.length;
      }
      while (this.nextHit - this.travel <= now) {
        const t = this.spawn(SEQUENCE[this.seqIndex], this.nextHit, this.window, now);
        t.seqIndex = this.seqIndex;
        this.seqIndex = (this.seqIndex + 1) % SEQUENCE.length;
        this.nextHit += this.interval;
      }
    } else {
      while (this.noteIdx < this.notes.length && this.notes[this.noteIdx].time - this.travel <= now) {
        const n = this.notes[this.noteIdx++];
        if (n.time < now - n.window) { this.onMiss && this.onMiss(null); if (!this.running) return; continue; } // stalled past it
        this.spawn(n.action, n.time, n.window, now);
      }
    }
  }

  current(now) {
    for (const t of this.active) if (t.state === 'flying' && Math.abs(now - t.hitTime) <= t.window) return t;
    return null;
  }

  // Next action the player has to throw (HUD).
  nextAction() {
    let best = null;
    for (const t of this.active) if (t.state === 'flying' && (!best || t.hitTime < best.hitTime)) best = t;
    if (best) return best.action.id;
    if (this.mode === 'chart') return this.notes && this.notes[this.noteIdx] ? this.notes[this.noteIdx].action : null;
    return SEQUENCE[this.seqIndex];
  }

  update(now, dt, fists, camera) {
    this.spawnDue(now);
    if (!this.running) return;
    const cur = this.current(now);
    if (cur && fists) this.checkFists(cur, now, fists);

    for (let i = this.active.length - 1; i >= 0; i--) {
      if (!this.running) return;          // a callback (e.g. game over) ended the run
      const t = this.active[i];
      if (!t) continue;
      const tt = t.hitTime - now;
      t.update(now, dt);

      if (t.state === 'flying') {
        t.group.position.set(t.zone.x, t.zone.y, t.zone.z - tt * t.velocity);
        t.setOpacity(Math.max(0, Math.min(1, (t.travel - tt) / 0.4)));
        t.group.lookAt(camera.position.x, t.group.position.y, camera.position.z);
        const g = t.ghost;
        if (tt < t.travel * 0.6 && tt > -t.window) {
          const k = Math.max(0, tt) / (t.travel * 0.6);
          g.visible = true;
          g.position.copy(t.zone);
          g.scale.setScalar(1 + k * 1.3);
          g.material.opacity = 0.3 + (1 - k) * 0.6;
          g.lookAt(camera.position);
        } else g.visible = false;
        if (now - t.hitTime > t.window) {
          t.state = 'missed'; t.deadTime = now; t.setTint(true); g.visible = false;
          this.onMiss && this.onMiss(t);
        }
      } else if (t.state === 'missed') {
        const age = now - t.deadTime;
        t.group.position.z += t.velocity * 0.5 * dt;
        t.group.position.y -= age * 6 * dt;
        t.setOpacity(Math.max(0, 0.6 - age / 0.5));
        if (age > 0.5) { t.reset(); this.active.splice(i, 1); }
      } else if (t.state === 'hit') {
        const age = now - t.deadTime;
        t.group.scale.setScalar(1 + age * 6);
        t.flash(Math.max(0, 1 - age / 0.2));
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
        if (peak < TUNING.minHitSpeed || dot < -0.2) continue; // resting, or pulling back through the zone
        if (this.strictDir && dot < TUNING.dirOk) { this.resolveWrong(t, now, fist, 'dir'); return; }
        const accuracy = Math.max(0, 1 - Math.abs(now - t.hitTime) / t.window);
        const power = Math.min(1, peak / TUNING.fullPowerSpeed);
        const swing = Math.min(1, fist.swingAlong(_d, now) / TUNING.fullSwing);
        const form = Math.min(1, Math.max(0, (dot + 0.2) / 0.9));
        this.resolveHit(t, now, { accuracy, power, swing, form, fist });
        return;
      } else if (peak >= TUNING.wrongHandSpeed && dot > 0.3) {
        this.resolveWrong(t, now, fist, 'hand');
        return;
      }
    }
  }

  // Keyboard / touch: the player names the action they threw.
  keyPunch(actionId, now) {
    const t = this.current(now);
    if (!t) return false;
    if (t.action.id === actionId) {
      const accuracy = Math.max(0, 1 - Math.abs(now - t.hitTime) / t.window);
      this.resolveHit(t, now, { accuracy, power: 0.6, swing: 0.6, form: 1, fist: null });
    } else this.resolveWrong(t, now, null, 'hand');
    return true;
  }

  resolveHit(t, now, info) {
    t.state = 'hit'; t.deadTime = now; t.ghost.visible = false;
    t.group.position.copy(t.zone);
    this.onHit && this.onHit(t, info);
  }

  resolveWrong(t, now, fist, why) {
    t.state = 'missed'; t.deadTime = now; t.setTint(true); t.ghost.visible = false;
    this.onWrong && this.onWrong(t, fist, why);
  }
}
