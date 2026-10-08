// Snowball — a lumpy packed snowball lobbed at you (target.json "arc" makes it fly in an arc).
// The hand colour glows behind it; the framework arrows show the punch direction.
export default {
  create({ THREE, kit, color }) {
    const geo = new THREE.IcosahedronGeometry(0.11, 2);
    const p = geo.attributes.position, seed = Math.random() * 9;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = 1 + 0.07 * Math.sin(x * 40 + seed) * Math.cos(y * 37 + z * 29);
      p.setXYZ(i, x * k, y * k, z * k);
    }
    geo.computeVertexNormals();
    const snow = new THREE.MeshLambertMaterial({ color: 0xf4f8ff, emissive: 0x30384a, flatShading: true });
    const ball = new THREE.Mesh(geo, snow);
    const dust = kit.glowSprite(0xffffff, 0.3, 0.35);
    const rim = kit.glowSprite(color, 0.38, 0.5); rim.position.z = -0.03;
    const object = new THREE.Group(); object.add(rim, ball, dust);
    return {
      object,
      update(t, dt) { ball.rotation.x -= dt * 4; },
      flash(v) { snow.emissive.setScalar(0.2 + v * 0.6); },
      tint(gray) { snow.color.set(gray ? 0x777b84 : 0xf4f8ff); },
    };
  },
};
