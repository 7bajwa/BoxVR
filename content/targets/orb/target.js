// Light Orb — round glowing yellow orb with a hot core and orbiting sparks.
export default {
  create({ THREE, kit, color }) {
    const shellMat = new THREE.MeshBasicMaterial({ color: 0xffc94a, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.12, 24, 16), shellMat);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xfff3cf });
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.065, 18, 12), coreMat);
    const halo = kit.glowSprite(0xffc860, 0.55, 0.7);
    const tintRing = new THREE.Mesh(new THREE.TorusGeometry(0.125, 0.006, 6, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
    const sparks = [];
    const object = new THREE.Group(); object.add(halo, shell, core, tintRing);
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 4), new THREE.MeshBasicMaterial({ color: 0xfff6dd }));
      s.userData.ph = (i / 3) * Math.PI * 2; sparks.push(s); object.add(s);
    }
    return {
      object,
      update(t) {
        shell.scale.setScalar(1 + Math.sin(t * 5) * 0.05); core.scale.setScalar(1 + Math.sin(t * 9) * 0.08);
        for (const s of sparks) { const a = t * 3 + s.userData.ph; s.position.set(Math.cos(a) * 0.16, Math.sin(a * 1.3) * 0.05, Math.sin(a) * 0.16); }
      },
      flash(v) { object.scale.setScalar(1 + v * 0.25); },
      tint(gray) { shellMat.color.set(gray ? 0x55575c : 0xffc94a); coreMat.color.set(gray ? 0x77797e : 0xfff3cf); },
    };
  },
};
