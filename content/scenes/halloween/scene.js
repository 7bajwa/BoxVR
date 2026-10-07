// Haunted Hollow — low-poly Halloween night: full moon, drifting clouds, bats, dead trees,
// haunted houses with glowing windows, fences, gravestones and jack-o'-lanterns along a crooked path.
const HAZE = [0.018, 0.03, 0.05];

export default {
  create({ THREE, kit }) {
    const root = new THREE.Group();
    const r = kit.rand(31);
    const FOG = new THREE.Color(0x1a2526);
    const fog = new THREE.FogExp2(FOG.getHex(), HAZE[1]);
    const flat = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, flatShading: true, ...o });
    const pathX = (z) => (z > -10 ? 0 : Math.sin((z + 10) * 0.06) * 3.2 + Math.sin((z + 10) * 0.017) * 5);

    // ---------- sky: teal-grey night, moon halo, warm low glow on the horizon ----------
    const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { uHaze: { value: 0.5 } },
      vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
      fragmentShader: `uniform float uHaze; varying vec3 vD;
        void main(){
          float h = vD.y;
          vec3 top = vec3(0.02, 0.035, 0.045), hor = vec3(0.10, 0.145, 0.15);
          vec3 c = mix(hor, top, smoothstep(0.0, 0.55 + uHaze * 0.2, h));
          vec3 m = normalize(vec3(0.0, 0.3, -1.0));
          float md = max(0.0, dot(vD, m));
          c += vec3(0.55, 0.62, 0.6) * pow(md, 40.0) * 0.6 + vec3(0.3, 0.38, 0.38) * pow(md, 6.0) * 0.25;
          c += vec3(0.6, 0.28, 0.06) * exp(-abs(h) * 22.0) * pow(max(0.0, -vD.z), 2.0) * 0.35;
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    }));
    sky.renderOrder = -10; sky.frustumCulled = false;
    root.add(sky);

    // ---------- moon ----------
    const moon = new THREE.Group();
    moon.add(new THREE.Mesh(new THREE.CircleGeometry(13, 40), new THREE.MeshBasicMaterial({ color: 0xf6f1d8, fog: false })));
    for (const [x, y, s] of [[-4, 3, 2.6], [3, -4, 3.4], [5, 4, 1.6], [-2, -6, 1.8], [-6, -1, 1.2]]) {
      const c = new THREE.Mesh(new THREE.CircleGeometry(s, 7), new THREE.MeshBasicMaterial({ color: 0xd9d3b8, fog: false }));
      c.position.set(x, y, 0.05); moon.add(c);
    }
    const halo = kit.glowSprite(0xdfe8d8, 90, 0.5); halo.position.z = -1;
    moon.add(halo);
    moon.position.set(0, 52, -170);
    root.add(moon);

    // ---------- lights ----------
    const moonLight = new THREE.DirectionalLight(0xa9c2cf, 1.4);
    moonLight.position.set(0, 52, -170);
    root.add(moonLight, moonLight.target);
    root.add(new THREE.HemisphereLight(0x5a6e7a, 0x24160a, 0.75));

    // ---------- ground (low-poly, displaced away from the path) ----------
    const gg = new THREE.PlaneGeometry(260, 260, 70, 70);
    gg.rotateX(-Math.PI / 2);
    const gp = gg.attributes.position;
    for (let i = 0; i < gp.count; i++) {
      const x = gp.getX(i), z = gp.getZ(i);
      const dPath = Math.abs(x - pathX(z));
      const n = Math.sin(x * 0.21) * Math.cos(z * 0.17) * 0.8 + Math.sin(x * 0.07 + z * 0.05) * 1.6 + (r() - 0.5) * 0.35;
      gp.setY(i, Math.max(0, dPath - 2.5) * 0.06 * (1 + n) + (dPath > 3 ? n * 0.4 : -0.02));
    }
    gg.computeVertexNormals();
    root.add(new THREE.Mesh(gg, flat(0x221c14)));

    // path: a slightly lighter, wet-looking ribbon that winds away into the fog
    const pathPts = [];
    for (let z = 2; z > -160; z -= 1.5) pathPts.push([pathX(z), z]);
    const pv = [], pi = [];
    pathPts.forEach(([x, z], i) => {
      const w = 1.25 + Math.max(0, -z) * 0.002;
      pv.push(x - w, 0.02, z, x + w, 0.02, z);
      if (i) { const a = (i - 1) * 2; pi.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    });
    const pgeo = new THREE.BufferGeometry();
    pgeo.setAttribute('position', new THREE.Float32BufferAttribute(pv, 3)); pgeo.setIndex(pi); pgeo.computeVertexNormals();
    root.add(new THREE.Mesh(pgeo, new THREE.MeshLambertMaterial({ color: 0x4a4235, emissive: 0x0f0c08 })));
    const sheen = kit.glowSprite(0xbfd2d0, 1, 0.18); sheen.scale.set(2.2, 30, 1);
    sheen.material.rotation = 0; sheen.position.set(0, 0.05, -30);
    root.add(sheen);

    // ---------- dead trees (instanced) ----------
    const treeParts = [];
    const trunk = new THREE.CylinderGeometry(0.22, 0.55, 5, 6); trunk.translate(0, 2.5, 0); treeParts.push(trunk);
    const branch = (len, rad, x, y, z, rx, rz) => {
      const b = new THREE.CylinderGeometry(rad * 0.4, rad, len, 5); b.translate(0, len / 2, 0);
      b.rotateZ(rz); b.rotateX(rx); b.translate(x, y, z); treeParts.push(b);
    };
    branch(2.6, 0.18, 0, 3.4, 0, 0.2, 0.9); branch(2.2, 0.16, 0, 3.9, 0, -0.3, -1.0); branch(1.8, 0.13, 0, 4.6, 0, 0.5, 0.5);
    branch(1.6, 0.12, 0, 4.4, 0, -0.6, -0.4); branch(1.2, 0.08, 1.5, 4.9, 0, 0.1, 1.3); branch(1.1, 0.08, -1.4, 5.1, 0, 0.0, -1.2);
    const treeGeo = mergeGeoms(treeParts);
    function mergeGeoms(list) {
      const ng = list.map((g) => g.index ? g.toNonIndexed() : g);
      for (const g of ng) { g.deleteAttribute('uv'); }
      const out = new THREE.BufferGeometry();
      let n = 0; for (const g of ng) n += g.attributes.position.count;
      const pos = new Float32Array(n * 3); let o = 0;
      for (const g of ng) { pos.set(g.attributes.position.array, o); o += g.attributes.position.array.length; }
      out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.computeVertexNormals();
      return out;
    }
    const trees = [];
    for (let i = 0; i < 46; i++) {
      const z = -6 - r() * 120, side = r() < 0.5 ? -1 : 1;
      trees.push([pathX(z) + side * (4 + r() * 22), z, 0.8 + r() * 1.1, r() * Math.PI * 2]);
    }
    trees.push([-6.8, -8, 1.8, 0.3], [7.2, -10, 2.0, 2.6]); // big framing trees
    const treeMesh = new THREE.InstancedMesh(treeGeo, flat(0x17120d), trees.length);
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion();
    trees.forEach(([x, z, s, ry], i) => {
      q.setFromEuler(new THREE.Euler((r() - 0.5) * 0.15, ry, (r() - 0.5) * 0.2));
      mtx.compose(new THREE.Vector3(x, -0.1, z), q, new THREE.Vector3(s, s * (0.9 + r() * 0.4), s));
      treeMesh.setMatrixAt(i, mtx);
    });
    root.add(treeMesh);

    // ---------- fences + gravestones (instanced) ----------
    const posts = [], rails = [];
    for (const side of [-1, 1]) {
      for (let z = -2.5; z > -70; z -= 1.7) {
        if (r() < 0.12) continue;
        const x = pathX(z) + side * (2.3 + r() * 0.2);
        posts.push([x, z, (r() - 0.5) * 0.25]);
        if (r() > 0.25) rails.push([x, z]);
      }
    }
    const postMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 1.1, 0.1).translate(0, 0.55, 0), flat(0x2e2419), posts.length);
    posts.forEach(([x, z, tilt], i) => { q.setFromEuler(new THREE.Euler(0, 0, tilt)); mtx.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(1, 0.8 + r() * 0.5, 1)); postMesh.setMatrixAt(i, mtx); });
    const railMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 0.07, 1.75), flat(0x2a2016), rails.length * 2);
    rails.forEach(([x, z], i) => {
      for (let k = 0; k < 2; k++) {
        q.setFromEuler(new THREE.Euler((r() - 0.5) * 0.12, 0, 0));
        mtx.compose(new THREE.Vector3(x, 0.45 + k * 0.38, z - 0.85), q, new THREE.Vector3(1, 1, 1));
        railMesh.setMatrixAt(i * 2 + k, mtx);
      }
    });
    const stones = [];
    for (let i = 0; i < 34; i++) { const z = -8 - r() * 50; const side = r() < 0.5 ? -1 : 1; stones.push([pathX(z) + side * (3.2 + r() * 7), z]); }
    const stoneGeo = new THREE.BoxGeometry(0.55, 0.8, 0.14); stoneGeo.translate(0, 0.4, 0);
    const stoneMesh = new THREE.InstancedMesh(stoneGeo, flat(0x4a5052), stones.length);
    stones.forEach(([x, z], i) => { q.setFromEuler(new THREE.Euler((r() - 0.5) * 0.3, (r() - 0.5) * 0.8, (r() - 0.5) * 0.3)); mtx.compose(new THREE.Vector3(x, -0.05, z), q, new THREE.Vector3(0.8 + r() * 0.6, 0.7 + r() * 0.8, 1)); stoneMesh.setMatrixAt(i, mtx); });
    root.add(postMesh, railMesh, stoneMesh);

    // ---------- haunted houses with glowing windows ----------
    const houseParts = [];
    const glowWins = [];
    const wall = flat(0x241d19), roof = flat(0x1a2026), win = new THREE.MeshBasicMaterial({ color: 0xffb24a, fog: false });
    const house = (x, z, w, h, d, ry, tower) => {
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry;
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wall); body.position.y = h / 2; g.add(body);
      const rf = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.78, h * 0.7, 4), roof);
      rf.rotation.y = Math.PI / 4; rf.scale.set(w / Math.max(w, d), 1, d / Math.max(w, d)); rf.position.y = h + h * 0.35; g.add(rf);
      if (tower) {
        const tw = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, h * 1.7, 6), wall); tw.position.set(w * 0.35, h * 0.85, d * 0.2); g.add(tw);
        const sp = new THREE.Mesh(new THREE.ConeGeometry(1.5, h * 1.3, 6), roof); sp.position.set(w * 0.35, h * 1.7 + h * 0.65, d * 0.2); g.add(sp);
        const tWin = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.8), win); tWin.position.set(w * 0.35, h * 1.35, d * 0.2 + 1.15); g.add(tWin); glowWins.push(tWin);
      }
      for (let k = 0; k < 4; k++) {
        const wx = -w / 2 + w * (0.2 + 0.6 * (k % 2)), wy = h * (k < 2 ? 0.35 : 0.72);
        const wm = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.0), win); wm.position.set(wx, wy, d / 2 + 0.02); g.add(wm); glowWins.push(wm);
      }
      const door = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.8), win); door.position.set(0, 0.9, d / 2 + 0.03); g.add(door); glowWins.push(door);
      root.add(g);
      houseParts.push(g);
    };
    house(-10, -24, 7, 5, 6, 0.5, true);
    house(11, -36, 8, 5.5, 6, -0.45, false);
    house(-4, -78, 9, 6, 7, 0.15, true);
    house(16, -95, 7, 5, 6, -0.3, true);
    root.updateMatrixWorld(true);
    for (const w of glowWins) { const s = kit.glowSprite(0xff9a2a, 2.6, 0.35); w.getWorldPosition(s.position); root.add(s); }

    // ---------- jack-o'-lantern decorations along the path ----------
    const pumpkinGeo = new THREE.SphereGeometry(0.32, 12, 8);
    const pp = pumpkinGeo.attributes.position;
    for (let i = 0; i < pp.count; i++) {
      const x = pp.getX(i), y = pp.getY(i), z = pp.getZ(i);
      const k = 0.92 + 0.08 * Math.cos(8 * Math.atan2(z, x));
      pp.setXYZ(i, x * k, y * 0.78, z * k);
    }
    pumpkinGeo.computeVertexNormals();
    const pumpkinMat = new THREE.MeshLambertMaterial({ color: 0xd9640f, emissive: 0x401400, flatShading: true });
    const faceMat = new THREE.MeshBasicMaterial({ color: 0xffd060, fog: false });
    const faceShape = () => {
      // two triangle eyes + a jagged grin
      const eyes = [[-0.12, 0.05], [0.12, 0.05]].map(([cx, cy]) => { const e = new THREE.Shape(); e.moveTo(cx - 0.06, cy - 0.03); e.lineTo(cx + 0.06, cy - 0.03); e.lineTo(cx, cy + 0.07); e.closePath(); return e; });
      const m = new THREE.Shape(); m.moveTo(-0.18, -0.06); m.lineTo(-0.1, -0.1); m.lineTo(-0.06, -0.06); m.lineTo(0, -0.11); m.lineTo(0.06, -0.06); m.lineTo(0.1, -0.1); m.lineTo(0.18, -0.06); m.lineTo(0.1, -0.17); m.lineTo(-0.1, -0.17); m.closePath();
      return new THREE.ShapeGeometry([...eyes, m]);
    };
    const faceGeo = faceShape();
    const flicker = [];
    for (let i = 0; i < 16; i++) {
      const z = -3 - i * 4.5 - r() * 2, side = i % 2 ? 1 : -1;
      const x = pathX(z) + side * (1.7 + r() * 0.9);
      const pg = new THREE.Group(); pg.position.set(x, 0.22, z);
      pg.add(new THREE.Mesh(pumpkinGeo, pumpkinMat));
      const f = new THREE.Mesh(faceGeo, faceMat); f.position.z = 0.3; pg.add(f);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.14, 5), flat(0x3a4a1a)); stem.position.y = 0.28; pg.add(stem);
      pg.lookAt(0, 0.22, z + 6); pg.rotation.y += (r() - 0.5) * 0.6;
      const glow = kit.glowSprite(0xff8a1a, 1.6, 0.45); glow.position.set(x, 0.35, z);
      const pool = kit.glowSprite(0xff6a00, 1, 0.25); pool.scale.set(3, 1.2, 1); pool.position.set(x, 0.05, z);
      root.add(pg, glow, pool);
      flicker.push(glow, pool);
    }

    // ---------- drifting clouds (some pass in front of the moon) ----------
    const cloudMat = new THREE.MeshLambertMaterial({ color: 0x3a464c, flatShading: true, transparent: true, opacity: 0.92, fog: false });
    const clouds = [];
    for (let i = 0; i < 9; i++) {
      const c = new THREE.Group();
      const n = 4 + Math.floor(r() * 4);
      for (let k = 0; k < n; k++) {
        const b = new THREE.Mesh(new THREE.IcosahedronGeometry(3 + r() * 4, 0), cloudMat);
        b.position.set(k * 4 - n * 2 + (r() - 0.5) * 2, (r() - 0.5) * 2, (r() - 0.5) * 3); b.scale.y = 0.55;
        c.add(b);
      }
      c.position.set(-120 + r() * 240, 38 + r() * 26, -150 + r() * 25);
      c.userData.v = 1.2 + r() * 1.6;
      clouds.push(c); root.add(c);
    }

    // ---------- bats ----------
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 0); wingShape.lineTo(0.5, 0.18); wingShape.lineTo(0.46, -0.02); wingShape.lineTo(0.36, 0.04);
    wingShape.lineTo(0.27, -0.07); wingShape.lineTo(0.16, 0.0); wingShape.lineTo(0.0, -0.06); wingShape.closePath();
    const wingGeo = new THREE.ShapeGeometry(wingShape); wingGeo.rotateX(-Math.PI / 2);
    const batMat = new THREE.MeshBasicMaterial({ color: 0x07080a, side: THREE.DoubleSide });
    const bats = [];
    for (let i = 0; i < 16; i++) {
      const b = new THREE.Group();
      const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09, 0), batMat); body.scale.set(0.8, 0.7, 1.5); b.add(body);
      const L = new THREE.Mesh(wingGeo, batMat), R = new THREE.Mesh(wingGeo, batMat); R.scale.x = -1;
      b.add(L, R);
      const far = i < 6;
      b.scale.setScalar(far ? 4 + r() * 3 : 1.2 + r() * 1.2);
      b.userData = {
        L, R, phase: r() * 10, speed: 0.25 + r() * 0.35, flap: 9 + r() * 6,
        c: far ? new THREE.Vector3((r() - 0.5) * 30, 40 + r() * 15, -140) : new THREE.Vector3((r() - 0.5) * 18, 4 + r() * 6, -12 - r() * 30),
        rx: far ? 12 + r() * 20 : 5 + r() * 8, rz: far ? 4 : 3 + r() * 6, ry: 1 + r() * 2,
      };
      bats.push(b); root.add(b);
    }

    // ---------- floating embers + low ground mist ----------
    const N = 90, epos = new Float32Array(N * 3), eseed = [];
    for (let i = 0; i < N; i++) { epos[i * 3] = (r() - 0.5) * 30; epos[i * 3 + 1] = r() * 4; epos[i * 3 + 2] = -r() * 40; eseed.push(r() * 10); }
    const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.BufferAttribute(epos, 3));
    const embers = new THREE.Points(eg, new THREE.PointsMaterial({ color: 0xffa040, size: 0.08, map: kit.glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    root.add(embers);
    const mists = [];
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: kit.glowTexture(), color: 0x9fb2b0, transparent: true, opacity: 0.12, depthWrite: false }));
      m.scale.set(14 + r() * 10, 2.2, 1); m.position.set((r() - 0.5) * 40, 0.6, -6 - r() * 50); m.userData.v = 0.2 + r() * 0.4;
      mists.push(m); root.add(m);
    }

    let haze = 1;
    const apply = () => { fog.density = HAZE[haze]; sky.material.uniforms.uHaze.value = haze / 2; };
    apply();

    return {
      root, fog, background: FOG.clone(),
      setHaze(h) { haze = h; apply(); },
      setAnchor(a) { root.position.set(a.x, 0, a.z); },
      update(dt, t) {
        for (const c of clouds) { c.position.x += c.userData.v * dt; if (c.position.x > 130) c.position.x = -130; }
        for (const b of bats) {
          const u = b.userData, a = t * u.speed + u.phase;
          const p = new THREE.Vector3(u.c.x + Math.sin(a) * u.rx, u.c.y + Math.sin(a * 2.3) * u.ry, u.c.z + Math.sin(a * 2) * u.rz);
          b.lookAt(p.x + Math.cos(a) * u.rx, p.y, p.z + Math.cos(a * 2) * u.rz * 2);
          b.position.copy(p);
          const f = Math.sin(t * u.flap + u.phase) * 0.9;
          u.L.rotation.z = f; u.R.rotation.z = -f;
        }
        const ep = embers.geometry.attributes.position;
        for (let i = 0; i < N; i++) {
          let y = ep.getY(i) + dt * 0.25; if (y > 5) y = 0;
          ep.setY(i, y); ep.setX(i, ep.getX(i) + Math.sin(t + eseed[i]) * dt * 0.2);
        }
        ep.needsUpdate = true;
        for (const m of mists) { m.position.x += m.userData.v * dt; if (m.position.x > 25) m.position.x = -25; }
        for (let i = 0; i < flicker.length; i++) {
          const g = flicker[i];
          g.material.opacity = (i % 2 ? 0.22 : 0.42) * (0.8 + 0.2 * Math.sin(t * 13 + i * 1.7) * Math.sin(t * 7.3 + i));
        }
      },
      dispose() { kit.disposeTree(root); },
    };
  },
};
