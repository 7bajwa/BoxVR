// Jingle Street — snowy Christmas night: a lane between colourful houses with snowy roofs and
// twinkling string lights, snow-covered pines, street lamps, a big decorated tree at the end,
// moonlight, falling snow, and Santa's sleigh with reindeer flying across the sky.
const HAZE = [0.012, 0.02, 0.034];

export default {
  create({ THREE, kit }) {
    const root = new THREE.Group();
    const r = kit.rand(1225);
    const FOG = new THREE.Color(0x1b2a48);
    const fog = new THREE.FogExp2(FOG.getHex(), HAZE[1]);
    const lam = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, flatShading: true, ...o });
    const snowM = lam(0xe9f0ff), snowRoof = lam(0xf4f8ff);

    // ---------- sky, stars, moon ----------
    const sky = kit.skyDome({ top: 0x05081a, horizon: 0x24375e, glow: 0xbfd2ff, glowDir: [-0.5, 0.45, -0.75], glowPower: 40, glowAmount: 0.35 });
    sky.material.uniforms.uSpread.value = 0.45;
    root.add(sky);
    const SN = 700, sp = new Float32Array(SN * 3);
    for (let i = 0; i < SN; i++) { const th = r() * Math.PI * 2, ph = Math.acos(0.1 + r() * 0.9), R = 360; sp.set([R * Math.sin(ph) * Math.cos(th), R * Math.cos(ph), R * Math.sin(ph) * Math.sin(th)], i * 3); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    root.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xe8f0ff, size: 1.4, map: kit.glowTexture(), transparent: true, depthWrite: false, fog: false })));
    const moon = new THREE.Mesh(new THREE.CircleGeometry(10, 36), new THREE.MeshBasicMaterial({ color: 0xf8f6ea, fog: false }));
    moon.position.set(-110, 95, -170); moon.lookAt(0, 0, 0); root.add(moon);
    const moonHalo = kit.glowSprite(0xd6e2ff, 70, 0.45); moonHalo.position.copy(moon.position); root.add(moonHalo);
    const moonLight = new THREE.DirectionalLight(0x9fb8ff, 0.75); moonLight.position.copy(moon.position); root.add(moonLight);
    root.add(new THREE.HemisphereLight(0x4a5f9a, 0x15151f, 0.45));

    // ---------- snowy ground + street ----------
    const gg = new THREE.PlaneGeometry(300, 300, 60, 60); gg.rotateX(-Math.PI / 2);
    const gp = gg.attributes.position;
    for (let i = 0; i < gp.count; i++) { const x = gp.getX(i), z = gp.getZ(i); const d = Math.abs(x); gp.setY(i, d < 6 ? -0.02 : (Math.sin(x * 0.3) * Math.cos(z * 0.2) + 1) * 0.15 * Math.min(1, (d - 6) / 6)); }
    gg.computeVertexNormals();
    root.add(new THREE.Mesh(gg, snowM));
    const street = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 260).rotateX(-Math.PI / 2).translate(0, 0.005, -120), new THREE.MeshLambertMaterial({ color: 0xb8c6e2 }));
    root.add(street);

    // ---------- houses with snowy roofs, glowing windows, wreaths, string lights ----------
    const houseCols = [0xb8322a, 0x2f6b46, 0xe2d6b8, 0x3a5a8c, 0x8a4a2a, 0xd9a441];
    const parts = [];
    const winM = new THREE.MeshBasicMaterial({ color: 0xffcf7a });
    const lightPos = [], lightCol = [];
    const bulbCols = [0xff4040, 0x40ff70, 0x4080ff, 0xffd040, 0xff60e0].map((c) => new THREE.Color(c));
    for (const side of [-1, 1]) {
      for (let z = -6; z > -110; z -= 9 + r() * 4) {
        const w = 6 + r() * 2, d = 6 + r() * 2, h = 4 + r() * 2.5;
        const x = side * (7.5 + w / 2);
        const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lam(houseCols[Math.floor(r() * houseCols.length)])); body.position.set(x, h / 2, z); parts.push(body);
        const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.78, 2.8, 4), snowRoof); roof.rotation.y = Math.PI / 4; roof.scale.set(w / Math.max(w, d), 1, d / Math.max(w, d)); roof.position.set(x, h + 1.4, z); parts.push(roof);
        const chim = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.6, 0.6), lam(0x6a3a2a)); chim.position.set(x + side * w * 0.2, h + 2, z - d * 0.2); parts.push(chim);
        // street-facing windows + door + wreath
        const fx = x - side * (w / 2 + 0.02);
        for (const [dz, dy] of [[-1.6, h * 0.6], [1.6, h * 0.6], [-1.6, h * 0.25]]) {
          const win = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.1), winM); win.position.set(fx, dy, z + dz); win.rotation.y = -side * Math.PI / 2; root.add(win);
        }
        const door = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2), lam(0x3a2216)); door.position.set(fx - side * 0.01, 1, z + 1.6); door.rotation.y = -side * Math.PI / 2; root.add(door);
        const wreath = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.08, 6, 14), lam(0x1f6a2a)); wreath.position.set(fx - side * 0.04, 1.55, z + 1.6); wreath.rotation.y = -side * Math.PI / 2; root.add(wreath);
        const bow = kit.glowSprite(0xff3030, 0.25, 0.9); bow.position.set(fx - side * 0.06, 1.3, z + 1.6); root.add(bow);
        // string lights along the roof edge facing the street
        for (let k = 0; k <= 12; k++) {
          const zz = z - d / 2 + (d * k) / 12;
          lightPos.push(fx - side * 0.1, h + 0.05 - Math.sin((k / 12) * Math.PI) * 0.25, zz);
          const c = bulbCols[k % bulbCols.length]; lightCol.push(c.r, c.g, c.b);
        }
        const glow = kit.glowSprite(0xffb85a, 6, 0.18); glow.position.set(fx - side * 0.6, h * 0.45, z); root.add(glow);
      }
    }
    root.add(kit.mergeByMaterial(parts));
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lightPos, 3));
    const baseCol = new Float32Array(lightCol); lg.setAttribute('color', new THREE.Float32BufferAttribute(lightCol, 3));
    const bulbs = new THREE.Points(lg, new THREE.PointsMaterial({ size: 0.35, vertexColors: true, map: kit.glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    root.add(bulbs);

    // ---------- snowy pines (instanced) ----------
    const pine = (() => {
      const geos = [];
      for (let i = 0; i < 3; i++) { const c = new THREE.ConeGeometry(1.6 - i * 0.4, 1.8, 7); c.translate(0, 1.2 + i * 1.0, 0); geos.push(kit.tint(c, 0x1d4a2e)); }
      for (let i = 0; i < 3; i++) { const c = new THREE.ConeGeometry(1.05 - i * 0.3, 0.7, 7); c.translate(0, 1.9 + i * 1.0, 0); geos.push(kit.tint(c, 0xf2f6ff)); }
      const trunk = new THREE.CylinderGeometry(0.15, 0.2, 0.8, 5); trunk.translate(0, 0.3, 0); geos.push(kit.tint(trunk, 0x4a3020));
      return mergeAll(geos);
    })();
    function mergeAll(list) {
      let n = 0; for (const g of list) n += g.attributes.position.count;
      const pos = new Float32Array(n * 3), col = new Float32Array(n * 3); let o = 0;
      for (const g of list) { pos.set(g.attributes.position.array, o); col.set(g.attributes.color.array, o); o += g.attributes.position.array.length; }
      const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('color', new THREE.BufferAttribute(col, 3)); out.computeVertexNormals();
      return out;
    }
    const trees = [];
    for (let i = 0; i < 70; i++) { const side = r() < 0.5 ? -1 : 1; trees.push([side * (17 + r() * 40), -5 - r() * 130, 0.9 + r() * 1.4]); }
    for (let i = 0; i < 10; i++) { const side = i % 2 ? -1 : 1; trees.push([side * (3.2 + r() * 0.8), -8 - i * 9, 0.7 + r() * 0.3]); }
    const tm = new THREE.InstancedMesh(pine, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), trees.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    trees.forEach(([x, z, s], i) => { q.setFromEuler(new THREE.Euler(0, r() * 6, 0)); m4.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(s, s, s)); tm.setMatrixAt(i, m4); });
    root.add(tm);

    // ---------- street lamps ----------
    for (let z = -4; z > -90; z -= 12) for (const side of [-1, 1]) {
      const x = side * 2.8;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.6, 6), lam(0x22262e)); pole.position.set(x, 1.8, z - (side > 0 ? 6 : 0)); root.add(pole);
      const lamp = kit.glowSprite(0xffd28a, 1.8, 0.85); lamp.position.set(x, 3.7, pole.position.z); root.add(lamp);
      const pool = kit.glowSprite(0xffc070, 1, 0.22); pool.scale.set(4, 1.4, 1); pool.position.set(x, 0.05, pole.position.z); root.add(pool);
    }

    // ---------- the big Christmas tree at the end of the street ----------
    const big = new THREE.Mesh(pine, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    big.scale.setScalar(4.5); big.position.set(0, 0, -118); root.add(big);
    const star = kit.glowSprite(0xffe680, 7, 1); star.position.set(0, 19.5, -118); root.add(star);
    const treeLights = [];
    for (let i = 0; i < 40; i++) {
      const y = 2 + r() * 14, rad = (1 - (y - 2) / 16) * 6.5 + 0.4, a = r() * Math.PI * 2;
      const l = kit.glowSprite(bulbCols[i % bulbCols.length], 1.1, 0.9); l.position.set(Math.cos(a) * rad, y, -118 + Math.sin(a) * rad * 0.6 + 2);
      treeLights.push(l); root.add(l);
    }

    // ---------- Santa's sleigh + reindeer flying across the sky ----------
    const ink = (c) => new THREE.MeshLambertMaterial({ color: c, fog: false });
    const sleigh = new THREE.Group();
    const sb = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 1.2), ink(0xb81e1e)); sleigh.add(sb);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.3, 1.2), ink(0xb81e1e)); back.position.set(-1.1, 0.4, 0); sleigh.add(back);
    for (const z of [-0.55, 0.55]) { const run = new THREE.Mesh(new THREE.BoxGeometry(3, 0.1, 0.08), ink(0xe8c45a)); run.position.set(0.2, -0.6, z); sleigh.add(run); }
    const santa = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), ink(0xd02020)); santa.position.set(-0.4, 0.75, 0); sleigh.add(santa);
    const beard = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), ink(0xffffff)); beard.position.set(-0.05, 0.95, 0); sleigh.add(beard);
    const hatS = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.6, 8), ink(0xd02020)); hatS.position.set(-0.4, 1.45, 0); hatS.rotation.z = 0.5; sleigh.add(hatS);
    for (const [c, x, z] of [[0x2a8a3a, 0.6, -0.2], [0x2a5aca, 0.9, 0.25], [0xe8c45a, 0.3, 0.3]]) { const gift = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), ink(c)); gift.position.set(x, 0.65, z); sleigh.add(gift); }
    const deer = [];
    for (let i = 0; i < 4; i++) {
      const rd = new THREE.Group();
      const bodyD = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 0.8, 4, 8), ink(0x7a5232)); bodyD.rotation.z = Math.PI / 2; rd.add(bodyD);
      const headD = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), ink(0x7a5232)); headD.position.set(0.7, 0.35, 0); rd.add(headD);
      for (const z of [-0.1, 0.1]) { const ant = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.4, 4), ink(0xd8c49a)); ant.position.set(0.65, 0.65, z); ant.rotation.z = -0.4; rd.add(ant); }
      if (i === 3) { const nose = kit.glowSprite(0xff2020, 0.6, 1); nose.position.set(0.9, 0.35, 0); rd.add(nose); }
      rd.position.set(2.6 + Math.floor(i / 2) * 1.6 + (i === 3 ? 1.6 : 0), 0.3, i % 2 ? 0.45 : -0.45);
      if (i === 3) rd.position.z = 0;
      deer.push(rd); sleigh.add(rd);
    }
    const trail = [];
    for (let i = 0; i < 24; i++) { const s = kit.glowSprite(0xfff2b0, 0.8, 0); trail.push(s); root.add(s); }
    sleigh.scale.setScalar(3);
    root.add(sleigh);
    const sleighState = { t: 0, dir: 1 };

    // ---------- falling snow around the player ----------
    const FN = 1400, fp = new Float32Array(FN * 3), fv = new Float32Array(FN);
    for (let i = 0; i < FN; i++) { fp.set([(r() - 0.5) * 40, r() * 20, 6 - r() * 50], i * 3); fv[i] = 0.5 + r() * 0.8; }
    const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.BufferAttribute(fp, 3));
    const flakes = new THREE.Points(fg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.07, map: kit.glowTexture(), transparent: true, depthWrite: false }));
    flakes.frustumCulled = false; root.add(flakes);

    let haze = 1;
    const apply = () => { fog.density = HAZE[haze]; };
    apply();
    const tmp = new THREE.Vector3();

    return {
      root, fog, background: FOG.clone(),
      setHaze(h) { haze = h; apply(); },
      setAnchor(a) { root.position.set(a.x, 0, a.z); },
      update(dt, t) {
        // twinkle the string lights
        const ca = lg.attributes.color;
        for (let i = 0; i < ca.count; i++) { const k = 0.45 + 0.55 * Math.max(0, Math.sin(t * 2.4 + i * 1.7)); ca.setXYZ(i, baseCol[i * 3] * k, baseCol[i * 3 + 1] * k, baseCol[i * 3 + 2] * k); }
        ca.needsUpdate = true;
        for (let i = 0; i < treeLights.length; i++) treeLights[i].material.opacity = 0.4 + 0.6 * Math.max(0, Math.sin(t * 3 + i));
        star.material.opacity = 0.75 + 0.25 * Math.sin(t * 4);
        // sleigh: one pass every ~30 s, alternating direction, across the moonlit sky
        sleighState.t += dt;
        if (sleighState.t > 30) { sleighState.t = 0; sleighState.dir *= -1; }
        const k = sleighState.t / 18;
        sleigh.visible = k <= 1;
        if (sleigh.visible) {
          const x = (k * 2 - 1) * 140 * sleighState.dir;
          sleigh.position.set(x, 62 + Math.sin(k * Math.PI) * 18, -150);
          sleigh.rotation.y = sleighState.dir > 0 ? 0 : Math.PI;
          for (let i = 0; i < deer.length; i++) deer[i].position.y = 0.3 + Math.sin(t * 8 + i) * 0.15;
          trail.forEach((s, i) => { tmp.set(-i * 2.2 * sleighState.dir * 3 - 2 * sleighState.dir, Math.sin(t * 6 + i) * 0.6, 0); s.position.copy(sleigh.position).add(tmp); s.material.opacity = 0.5 * (1 - i / trail.length); });
        } else trail.forEach((s) => { s.material.opacity = 0; });
        // snow
        for (let i = 0; i < FN; i++) {
          let y = fp[i * 3 + 1] - fv[i] * dt; if (y < 0) y += 20;
          fp[i * 3 + 1] = y; fp[i * 3] += Math.sin(t * 0.7 + i) * dt * 0.15;
        }
        fg.attributes.position.needsUpdate = true;
      },
      dispose() { kit.disposeTree(root); },
    };
  },
};
