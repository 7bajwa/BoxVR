// Snow Park — bright winter day in a snowy playground: snow-capped mountains, pine forests,
// snowmen, igloo snow-forts and snow walls built by kids, sleds, a little wooden hut, gentle
// snowfall and birds. Snowballs get lobbed at you.
const HAZE = [0.006, 0.011, 0.02];

export default {
  create({ THREE, kit }) {
    const root = new THREE.Group();
    const r = kit.rand(808);
    const FOG = new THREE.Color(0xcfe2f4);
    const fog = new THREE.FogExp2(FOG.getHex(), HAZE[1]);
    const lam = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, flatShading: true, ...o });
    const snowM = lam(0xf3f7ff);

    // ---------- bright sky + sun ----------
    const sky = kit.skyDome({ top: 0x3d7ed8, horizon: 0xd7e8f6, glow: 0xfff3d0, glowDir: [0.6, 0.45, -0.65], glowPower: 18, glowAmount: 0.6 });
    root.add(sky);
    const sun = new THREE.DirectionalLight(0xfff4e0, 2.2); sun.position.set(80, 70, -90); root.add(sun);
    root.add(new THREE.HemisphereLight(0xcfe6ff, 0x9aa8c0, 1.0));
    const sunDisc = kit.glowSprite(0xfff6dc, 60, 0.9); sunDisc.position.set(220, 170, -240); root.add(sunDisc);

    // ---------- ground ----------
    const gg = new THREE.PlaneGeometry(320, 320, 64, 64); gg.rotateX(-Math.PI / 2);
    const gp = gg.attributes.position;
    for (let i = 0; i < gp.count; i++) {
      const x = gp.getX(i), z = gp.getZ(i), d = Math.hypot(x, z + 8);
      gp.setY(i, d < 14 ? 0 : (Math.sin(x * 0.11) * Math.cos(z * 0.09) + 1.2) * Math.min(2.5, (d - 14) * 0.08));
    }
    gg.computeVertexNormals();
    root.add(new THREE.Mesh(gg, snowM));

    // ---------- snow-capped mountains ring ----------
    const mts = [];
    for (let i = 0; i < 16; i++) {
      const a = Math.PI * (0.15 + 0.7 * (i / 15)) + (r() - 0.5) * 0.15;   // mostly in front / sides
      const d = 170 + r() * 60, h = 45 + r() * 55;
      const x = Math.cos(a) * d * (i % 2 ? 1 : -1) * 0.9, z = -Math.sin(a) * d;
      const m = new THREE.Mesh(new THREE.ConeGeometry(h * 0.9, h, 6 + Math.floor(r() * 3)), lam(0x7e8fa8)); m.position.set(x, h / 2 - 2, z); m.rotation.y = r() * 3; mts.push(m);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(h * 0.38, h * 0.42, m.geometry.parameters.radialSegments), lam(0xffffff)); cap.position.set(x, h - h * 0.21 - 2 + 0.3, z); cap.rotation.y = m.rotation.y; mts.push(cap);
    }
    root.add(kit.mergeByMaterial(mts));

    // ---------- pine forests (instanced, snowy) ----------
    const pine = (() => {
      const list = [];
      for (let i = 0; i < 3; i++) { const c = new THREE.ConeGeometry(1.5 - i * 0.38, 1.8, 7); c.translate(0, 1.2 + i * 1.0, 0); list.push(kit.tint(c, 0x2a5a3a)); }
      for (let i = 0; i < 3; i++) { const c = new THREE.ConeGeometry(1.0 - i * 0.28, 0.6, 7); c.translate(0, 1.95 + i * 1.0, 0); list.push(kit.tint(c, 0xffffff)); }
      const tr = new THREE.CylinderGeometry(0.15, 0.2, 0.8, 5); tr.translate(0, 0.3, 0); list.push(kit.tint(tr, 0x5a3a24));
      let n = 0; for (const g of list) n += g.attributes.position.count;
      const pos = new Float32Array(n * 3), col = new Float32Array(n * 3); let o = 0;
      for (const g of list) { pos.set(g.attributes.position.array, o); col.set(g.attributes.color.array, o); o += g.attributes.position.array.length; }
      const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('color', new THREE.BufferAttribute(col, 3)); out.computeVertexNormals();
      return out;
    })();
    const trees = [];
    for (let i = 0; i < 160; i++) {
      const a = r() * Math.PI * 2, d = 26 + Math.pow(r(), 0.7) * 110;
      const x = Math.cos(a) * d, z = Math.sin(a) * d - 10;
      if (Math.abs(x) < 8 && z < 0) continue;     // keep the lane open
      trees.push([x, z, 1 + r() * 1.8]);
    }
    const tm = new THREE.InstancedMesh(pine, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), trees.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    trees.forEach(([x, z, s], i) => { q.setFromEuler(new THREE.Euler(0, r() * 6, 0)); m4.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(s, s, s)); tm.setMatrixAt(i, m4); });
    root.add(tm);

    // ---------- playground: snowmen, igloos, snow walls, sleds, hut ----------
    const play = [];
    const coal = lam(0x1a1a1a), carrot = lam(0xff7a1a), stick = lam(0x5a3a24);
    const scarfCols = [0xd62b2b, 0x2b7ad6, 0x2bd67a, 0xf2c200];
    const snowman = (x, z, s, ry) => {
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; g.scale.setScalar(s);
      [[0.55, 0.5], [0.4, 1.25], [0.28, 1.8]].forEach(([rad, y]) => { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(rad, 1), snowM); b.position.y = y; g.add(b); });
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 6), carrot); nose.rotation.x = Math.PI / 2; nose.position.set(0, 1.82, 0.36); g.add(nose);
      for (const x2 of [-0.1, 0.1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), coal); e.position.set(x2, 1.92, 0.24); g.add(e); }
      for (let k = 0; k < 3; k++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), coal); b.position.set(0, 1.1 + k * 0.17, 0.4 - Math.abs(k - 1) * 0.02); g.add(b); }
      for (const sx of [-1, 1]) { const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.9, 4), stick); arm.position.set(sx * 0.55, 1.4, 0); arm.rotation.z = sx * -1.0; g.add(arm); }
      const hatB = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.04, 10), coal); hatB.position.y = 2.06; g.add(hatB);
      const hatT = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.35, 10), coal); hatT.position.y = 2.25; g.add(hatT);
      const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.07, 6, 12), lam(scarfCols[Math.floor(r() * 4)])); scarf.rotation.x = Math.PI / 2; scarf.position.y = 1.55; g.add(scarf);
      play.push(g);
    };
    snowman(-5, -9, 1.2, 0.5); snowman(6, -14, 1.4, -0.4); snowman(-9, -24, 1.6, 0.3); snowman(9, -30, 1.1, -0.2); snowman(-3.6, 5, 1.0, 2.6);
    const igloo = (x, z, s, ry) => {
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; g.scale.setScalar(s);
      g.add(new THREE.Mesh(new THREE.SphereGeometry(1.6, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), snowM));
      const tunnel = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.2, 10, 1, false, 0, Math.PI), snowM); tunnel.rotation.set(Math.PI / 2, 0, Math.PI / 2); tunnel.position.set(0, 0, 1.6); g.add(tunnel);
      const hole = new THREE.Mesh(new THREE.CircleGeometry(0.45, 10, 0, Math.PI), new THREE.MeshBasicMaterial({ color: 0x5a6a8a })); hole.position.set(0, 0.02, 2.21); g.add(hole);
      play.push(g);
    };
    igloo(-10, -12, 1.3, 0.8); igloo(11, -20, 1.1, -0.9); igloo(-13, 8, 1.2, 2.2);
    // snow walls / forts made of blocks
    for (const [x, z, n, ry] of [[-6.5, -17, 6, 0.2], [6.8, -8, 5, -0.3], [4.5, -36, 7, 0.1]]) {
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry;
      for (let i = 0; i < n; i++) for (let row = 0; row < 2; row++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.5), snowM); b.position.set(i * 0.72 - n * 0.36 + (row ? 0.36 : 0), 0.2 + row * 0.41, 0); b.rotation.y = (r() - 0.5) * 0.1; g.add(b);
      }
      for (let k = 0; k < 5; k++) { const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 1), snowM); ball.position.set((r() - 0.5) * 1.2, 0.13 + (k > 2 ? 0.2 : 0), 0.55); g.add(ball); }
      play.push(g);
    }
    // sleds
    for (const [x, z, c, ry] of [[3.4, -5, 0xd62b2b, 0.4], [-4.2, -32, 0x2b7ad6, -0.8]]) {
      const g = new THREE.Group(); g.position.set(x, 0.12, z); g.rotation.y = ry;
      const deck = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.06, 1.4), lam(c)); g.add(deck);
      for (const sx of [-0.28, 0.28]) { const run = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 1.5), lam(0x333333)); run.position.set(sx, -0.08, 0); g.add(run); }
      play.push(g);
    }
    // little wooden hut with a swing
    const hut = new THREE.Group(); hut.position.set(14, 0, -42); hut.rotation.y = -0.5;
    const hb = new THREE.Mesh(new THREE.BoxGeometry(4, 2.6, 3.4), lam(0x8a5a36)); hb.position.y = 1.3; hut.add(hb);
    const hr = new THREE.Mesh(new THREE.ConeGeometry(3.3, 1.8, 4), lam(0xffffff)); hr.rotation.y = Math.PI / 4; hr.position.y = 3.5; hut.add(hr);
    const hw = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.8), lam(0xffd890)); hw.position.set(0.8, 1.6, 1.72); hut.add(hw);
    play.push(hut);
    const swing = new THREE.Group(); swing.position.set(-14, 0, -38);
    for (const sx of [-1.2, 1.2]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.8, 6), lam(0xd62b2b)); post.position.set(sx, 1.4, 0); swing.add(post); }
    const topBar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.6, 6), lam(0xd62b2b)); topBar.rotation.z = Math.PI / 2; topBar.position.y = 2.8; swing.add(topBar);
    const seat = new THREE.Group(); seat.position.y = 2.8;
    for (const sx of [-0.3, 0.3]) { const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 2, 4), lam(0x444444)); rope.position.set(sx, -1, 0); seat.add(rope); }
    const plank = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.06, 0.3), lam(0x8a5a36)); plank.position.y = -2; seat.add(plank);
    swing.add(seat); play.push(swing);
    for (const g of play) root.add(g);

    // ---------- birds + gentle snowfall ----------
    const birdMat = new THREE.MeshBasicMaterial({ color: 0x2a2f3a, side: THREE.DoubleSide });
    const wing = new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.5, 0.1), new THREE.Vector2(0.15, -0.06)]));
    wing.rotateX(-Math.PI / 2);
    const birds = [];
    for (let i = 0; i < 7; i++) {
      const b = new THREE.Group(); const L = new THREE.Mesh(wing, birdMat), R = new THREE.Mesh(wing, birdMat); R.scale.x = -1; b.add(L, R);
      b.scale.setScalar(1.6); b.userData = { L, R, c: new THREE.Vector3((r() - 0.5) * 40, 14 + r() * 10, -30 - r() * 30), rad: 8 + r() * 10, sp: 0.15 + r() * 0.15, ph: r() * 6 };
      birds.push(b); root.add(b);
    }
    const FN = 700, fp = new Float32Array(FN * 3), fv = new Float32Array(FN);
    for (let i = 0; i < FN; i++) { fp.set([(r() - 0.5) * 40, r() * 18, 6 - r() * 50], i * 3); fv[i] = 0.3 + r() * 0.5; }
    const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.BufferAttribute(fp, 3));
    const flakes = new THREE.Points(fg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.06, map: kit.glowTexture(), transparent: true, depthWrite: false }));
    flakes.frustumCulled = false; root.add(flakes);

    let haze = 1;
    const apply = () => { fog.density = HAZE[haze]; };
    apply();
    return {
      root, fog, background: FOG.clone(),
      setHaze(h) { haze = h; apply(); },
      setAnchor(a) { root.position.set(a.x, 0, a.z); },
      update(dt, t) {
        seat.rotation.x = Math.sin(t * 1.4) * 0.35;
        for (const b of birds) {
          const u = b.userData, a = t * u.sp + u.ph;
          b.position.set(u.c.x + Math.cos(a) * u.rad, u.c.y + Math.sin(a * 2) * 1.5, u.c.z + Math.sin(a) * u.rad * 0.6);
          b.rotation.y = -a;
          const f = Math.sin(t * 7 + u.ph) * 0.6; u.L.rotation.z = f; u.R.rotation.z = -f;
        }
        for (let i = 0; i < FN; i++) { let y = fp[i * 3 + 1] - fv[i] * dt; if (y < 0) y += 18; fp[i * 3 + 1] = y; fp[i * 3] += Math.sin(t * 0.5 + i) * dt * 0.1; }
        fg.attributes.position.needsUpdate = true;
      },
      dispose() { kit.disposeTree(root); },
    };
  },
};
