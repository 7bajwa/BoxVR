// Pumpkin Embers — orange shell shards tumbling down, rising embers and a fiery ring.
export default {
  create({ THREE, kit, scene }) {
    const sparks = kit.particleSystem(scene, { max: 500, size: 0.05, gravity: 1.2, drag: 1.6 });
    const rings = kit.ringPool(scene, 6, { inner: 0.8 });
    const N = 60;
    const shards = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(0.035, 0),
      new THREE.MeshLambertMaterial({ color: 0xe0670f, emissive: 0x401200, flatShading: true }), N);
    shards.frustumCulled = false;
    const data = Array.from({ length: N }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3() }));
    let next = 0;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), zero = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < N; i++) { m4.compose(zero, q, zero); shards.setMatrixAt(i, m4); }
    scene.add(shards);
    return {
      burst(p, color, power) {
        sparks.emit(p, 26 + Math.round(power * 30), { color: 0xffa030, speed: [0.5, 2.4 * (0.6 + power)], up: 0.8, whiten: 0.6, life: [0.6, 1.2] });
        sparks.emit(p, 12, { color, speed: [0.5, 1.5], life: [0.3, 0.6] });
        rings.fire(p, 0xff8a1a, { to: 0.6 });
        for (let k = 0; k < 10; k++) {
          const d = data[next]; next = (next + 1) % N;
          d.life = 1.2; d.p.copy(p);
          d.v.set((Math.random() - 0.5) * 3, Math.random() * 2.5 * (0.5 + power), -Math.random() * 1.5 - 0.5);
          d.w.set(Math.random() * 10, Math.random() * 10, Math.random() * 10);
        }
      },
      update(dt, camera) {
        sparks.update(dt); rings.update(dt, camera);
        for (let i = 0; i < N; i++) {
          const d = data[i];
          if (d.life <= 0) continue;
          d.life -= dt; d.v.y -= 7 * dt; d.p.addScaledVector(d.v, dt);
          d.r.x += d.w.x * dt; d.r.y += d.w.y * dt; d.r.z += d.w.z * dt;
          q.setFromEuler(d.r); m4.compose(d.p, q, d.life > 0 ? one : zero); shards.setMatrixAt(i, m4);
        }
        shards.instanceMatrix.needsUpdate = true;
      },
      dispose() { sparks.dispose(); rings.dispose(); scene.remove(shards); shards.geometry.dispose(); shards.material.dispose(); },
    };
  },
};
