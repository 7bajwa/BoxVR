// Snow Puff — snowball bursts into a soft white cloud and falling flakes.
export default {
  create({ kit, scene }) {
    const flakes = kit.particleSystem(scene, { max: 600, size: 0.035, gravity: -1.2, drag: 2.2 });
    const puffs = [];
    for (let i = 0; i < 10; i++) {
      const s = kit.glowSprite(0xffffff, 0.2, 0); s.renderOrder = 8; s.visible = false; s.userData.life = 0; scene.add(s); puffs.push(s);
    }
    let next = 0;
    return {
      burst(p, color, power) {
        flakes.emit(p, 40 + Math.round(power * 30), { color: 0xffffff, speed: [0.5, 2.6 * (0.6 + power)], whiten: 1, life: [0.6, 1.2] });
        flakes.emit(p, 10, { color, speed: [0.4, 1.2], life: [0.3, 0.6] });
        const s = puffs[next]; next = (next + 1) % puffs.length;
        s.position.copy(p); s.userData.life = 0.7; s.visible = true;
      },
      update(dt) {
        flakes.update(dt);
        for (const s of puffs) if (s.userData.life > 0) {
          s.userData.life -= dt;
          const k = 1 - s.userData.life / 0.7;
          s.scale.setScalar(0.3 + k * 1.2); s.material.opacity = (1 - k) * 0.7;
          if (s.userData.life <= 0) s.visible = false;
        }
      },
      dispose() { flakes.dispose(); for (const s of puffs) { scene.remove(s); s.material.dispose(); } },
    };
  },
};
