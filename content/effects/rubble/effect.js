// Rubble — asteroid smashes into tumbling rock chunks, hot sparks and a shock ring.
export default {
  create({ THREE, kit, scene }) {
    const sparks = kit.particleSystem(scene, { max: 500, size: 0.045, gravity: 0, drag: 1.4 });
    const rings = kit.ringPool(scene, 6);
    const N = 70;
    const chunks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.03, 0),
      new THREE.MeshLambertMaterial({ color: 0x8a8296, emissive: 0x1a1426, flatShading: true }), N);
    chunks.frustumCulled = false;
    const data = Array.from({ length: N }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), s: 1 }));
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), zero = new THREE.Vector3(), sc = new THREE.Vector3();
    for (let i = 0; i < N; i++) { m4.compose(zero, q, zero); chunks.setMatrixAt(i, m4); }
    scene.add(chunks);
    let next = 0;
    return {
      burst(p, color, power) {
        sparks.emit(p, 24 + Math.round(power * 30), { color: 0xffb35f, speed: [1, 3.5 * (0.6 + power)], whiten: 0.6, life: [0.3, 0.7] });
        sparks.emit(p, 14, { color, speed: [0.6, 2], life: [0.4, 0.8] });
        rings.fire(p, color, { to: 0.4 });
        for (let k = 0; k < 12; k++) {
          const d = data[next]; next = (next + 1) % N;
          d.life = 1.4; d.p.copy(p); d.s = 0.6 + Math.random() * 1.2;
          d.v.set((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, -Math.random() * 3) .multiplyScalar(0.5 + power);
          d.w.set(Math.random() * 8, Math.random() * 8, Math.random() * 8);
        }
      },
      update(dt, camera) {
        sparks.update(dt); rings.update(dt, camera);
        for (let i = 0; i < N; i++) {
          const d = data[i];
          if (d.life <= 0) continue;
          d.life -= dt; d.v.multiplyScalar(1 - 0.6 * dt); d.p.addScaledVector(d.v, dt);   // zero-g: no gravity
          d.r.x += d.w.x * dt; d.r.y += d.w.y * dt; d.r.z += d.w.z * dt;
          q.setFromEuler(d.r); m4.compose(d.p, q, d.life > 0 ? sc.setScalar(d.s * Math.min(1, d.life)) : zero); chunks.setMatrixAt(i, m4);
        }
        chunks.instanceMatrix.needsUpdate = true;
      },
      dispose() { sparks.dispose(); rings.dispose(); scene.remove(chunks); chunks.geometry.dispose(); chunks.material.dispose(); },
    };
  },
};
