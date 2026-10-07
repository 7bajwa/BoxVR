// Neon Burst — glowing particle spray + shockwave ring in the action colour.
// Effect plugin contract: create(ctx) → { burst(pos, color, power), update(dt, camera), dispose() }
export default {
  create({ kit, scene }) {
    const ps = kit.particleSystem(scene, { max: 700, size: 0.04 });
    const rings = kit.ringPool(scene, 8);
    return {
      burst(p, color, power) {
        ps.emit(p, 30 + Math.round(power * 40), { color, speed: [0.8 * (0.6 + power), 3.2 * (0.6 + power)] });
        rings.fire(p, color);
      },
      update(dt, camera) { ps.update(dt); rings.update(dt, camera); },
      dispose() { ps.dispose(); rings.dispose(); },
    };
  },
};
