// Glass & Glitter — ornament shatters into coloured glass shards, gold glitter and a sparkle ring.
export default {
  create({ THREE, kit, scene }) {
    const glitter = kit.particleSystem(scene, { max: 600, size: 0.03, gravity: -2.5, drag: 1.5 });
    const rings = kit.ringPool(scene, 6, { inner: 0.93 });
    const N = 60;
    const shards = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(0.03, 0),
      new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }), N);
    shards.frustumCulled = false;
    const data = Array.from({ length: N }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3() }));
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), zero = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < N; i++) { m4.compose(zero, q, zero); shards.setMatrixAt(i, m4); shards.setColorAt(i, new THREE.Color(0xffffff)); }
    scene.add(shards);
    let next = 0;
    const c = new THREE.Color();
    return {
      burst(p, color, power) {
        glitter.emit(p, 30 + Math.round(power * 30), { color: 0xffe08a, speed: [0.8, 3 * (0.6 + power)], whiten: 0.8, life: [0.5, 1.0] });
        glitter.emit(p, 16, { color, speed: [0.5, 1.6], life: [0.4, 0.8] });
        rings.fire(p, 0xffffff, { to: 0.36 });
        c.set(color);
        for (let k = 0; k < 10; k++) {
          const d = data[next]; shards.setColorAt(next, c); next = (next + 1) % N;
          d.life = 1.0; d.p.copy(p);
          d.v.set((Math.random() - 0.5) * 3.5, Math.random() * 2.5, -Math.random() * 2).multiplyScalar(0.6 + power);
          d.w.set(Math.random() * 12, Math.random() * 12, Math.random() * 12);
        }
        shards.instanceColor.needsUpdate = true;
      },
      update(dt, camera) {
        glitter.update(dt); rings.update(dt, camera);
        for (let i = 0; i < N; i++) {
          const d = data[i];
          if (d.life <= 0) continue;
          d.life -= dt; d.v.y -= 6 * dt; d.p.addScaledVector(d.v, dt);
          d.r.x += d.w.x * dt; d.r.y += d.w.y * dt; d.r.z += d.w.z * dt;
          q.setFromEuler(d.r); m4.compose(d.p, q, d.life > 0 ? one : zero); shards.setMatrixAt(i, m4);
        }
        shards.instanceMatrix.needsUpdate = true;
      },
      dispose() { glitter.dispose(); rings.dispose(); scene.remove(shards); shards.geometry.dispose(); shards.material.dispose(); },
    };
  },
};
