// Lantern Mist — warm light bursts into soft glowing mist with a slow ripple and sparkles.
export default {
  create({ kit, scene }) {
    const sparkle = kit.particleSystem(scene, { max: 400, size: 0.03, gravity: 0.3, drag: 1.2 });
    const rings = kit.ringPool(scene, 6, { inner: 0.94 });
    const puffs = [];
    for (let i = 0; i < 12; i++) {
      const s = kit.glowSprite(0xffe2a0, 0.2, 0); s.renderOrder = 8; s.visible = false; s.userData.life = 0; scene.add(s); puffs.push(s);
    }
    let next = 0;
    return {
      burst(p, color, power) {
        sparkle.emit(p, 30 + Math.round(power * 25), { color: 0xfff0c0, speed: [0.3, 1.8 * (0.6 + power)], whiten: 0.7, life: [0.6, 1.1] });
        sparkle.emit(p, 10, { color, speed: [0.3, 1.0], life: [0.4, 0.7] });
        rings.fire(p, 0xffd78a, { life: 0.6, to: 0.8 });
        for (let k = 0; k < 2; k++) {
          const s = puffs[next]; next = (next + 1) % puffs.length;
          s.position.copy(p); s.userData.life = 0.9; s.userData.max = 0.9; s.visible = true;
          s.material.color.set(k ? color : 0xffe2a0);
        }
      },
      update(dt, camera) {
        sparkle.update(dt); rings.update(dt, camera);
        for (const s of puffs) if (s.userData.life > 0) {
          s.userData.life -= dt;
          const k = 1 - s.userData.life / s.userData.max;
          s.scale.setScalar(0.3 + k * 1.4);
          s.material.opacity = (1 - k) * 0.55;
          s.position.y += dt * 0.15;
          if (s.userData.life <= 0) s.visible = false;
        }
      },
      dispose() { sparkle.dispose(); rings.dispose(); for (const s of puffs) { scene.remove(s); s.material.dispose(); } },
    };
  },
};
