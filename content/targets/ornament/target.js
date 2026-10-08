// Christmas Ornament — glossy glass bauble in the hand colour with a gold cap. A white snowflake
// emblem sits on the side the punch comes FROM (left / right / bottom = uppercut / front = straight).
export default {
  create({ THREE, kit, color, action }) {
    const glass = new THREE.MeshLambertMaterial({ color, emissive: color.clone().multiplyScalar(0.35) });
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.12, 28, 20), glass);
    const shine = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }));
    shine.scale.set(1, 1.6, 0.4); shine.position.set(-0.05, 0.05, 0.1);
    const gold = new THREE.MeshLambertMaterial({ color: 0xe8c45a, emissive: 0x3a2a00 });
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.035, 12), gold); cap.position.y = 0.125;
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.004, 6, 16), gold); loop.position.y = 0.155;
    // snowflake: 3 crossed bars + tips
    const flake = new THREE.Group();
    const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (let i = 0; i < 3; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.009, 0.004), white); bar.rotation.z = (i * Math.PI) / 3; flake.add(bar);
    }
    flake.add(Object.assign(new THREE.Mesh(new THREE.CircleGeometry(0.012, 6), white)));
    const pos = { right: [-0.115, 0, 0.03, 0, -1.3], left: [0.115, 0, 0.03, 0, 1.3], up: [0, -0.115, 0.03, 1.3, 0], fwd: [0, 0, 0.122, 0, 0] }[action.arrow];
    flake.position.set(pos[0], pos[1], pos[2]); flake.rotation.set(pos[3], pos[4], 0);
    const sparkle = kit.glowSprite(0xffffff, 0.12, 0.8); sparkle.position.copy(flake.position);
    const object = new THREE.Group(); object.add(ball, shine, cap, loop, flake, sparkle);
    const base = glass.emissive.clone();
    return {
      object,
      update(t) { object.rotation.z = Math.sin(t * 2.2) * 0.12; sparkle.material.opacity = 0.5 + 0.5 * Math.sin(t * 8); },
      flash(v) { glass.emissive.copy(base).lerp(new THREE.Color(0xffffff), v * 0.7); },
      tint(gray) { glass.color.set(gray ? 0x55575c : color); glass.emissive.copy(gray ? new THREE.Color(0) : base); },
    };
  },
};
