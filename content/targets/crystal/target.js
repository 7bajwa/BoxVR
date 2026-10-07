// Star Crystal — spinning low-poly crystal lit from inside in the action colour.
export default {
  create({ THREE, kit, color }) {
    const mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(0xffffff).lerp(color, 0.5), emissive: color.clone().multiplyScalar(0.55), flatShading: true });
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.12, 0), mat);
    gem.scale.set(1, 1.35, 1);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(gem.geometry), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }));
    edges.scale.copy(gem.scale);
    const glow = kit.glowSprite(color, 0.5, 0.55);
    const object = new THREE.Group(); object.add(glow, gem, edges);
    return {
      object,
      update(t, dt) { gem.rotation.y += dt * 1.6; edges.rotation.y = gem.rotation.y; },
      flash(v) { mat.emissive.copy(color).multiplyScalar(0.55 + v); },
      tint(gray) { if (gray) mat.emissive.set(0x111111); else mat.emissive.copy(color).multiplyScalar(0.55); },
    };
  },
};
