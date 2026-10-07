// Deep Space — a low-poly highway out into space: nebula sky, stars, ringed planet, drifting asteroids,
// warp streaks that rush past faster as the game speeds up.
const HAZE = [0.004, 0.008, 0.016];

export default {
  create({ THREE, kit }) {
    const root = new THREE.Group();
    const r = kit.rand(77);
    const FOG = new THREE.Color(0x0b0a22);
    const fog = new THREE.FogExp2(FOG.getHex(), HAZE[1]);

    // ---------- nebula sky ----------
    const sky = new THREE.Mesh(new THREE.SphereGeometry(450, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
      fragmentShader: `varying vec3 vD;
        float n(vec3 p){ return sin(p.x*3.1+sin(p.y*2.3))*sin(p.y*2.7+sin(p.z*3.7))*sin(p.z*2.9+sin(p.x*1.9)); }
        void main(){
          vec3 d = vD;
          float a = n(d * 2.0) * 0.5 + n(d * 4.3 + 1.7) * 0.3 + n(d * 9.1 + 3.1) * 0.2;
          vec3 c = vec3(0.012, 0.01, 0.035);
          c += vec3(0.32, 0.12, 0.55) * smoothstep(0.05, 0.7, a) * 0.5;
          c += vec3(0.05, 0.3, 0.55) * smoothstep(0.2, 0.9, -a) * 0.35;
          c += vec3(0.6, 0.3, 0.9) * pow(max(0.0, -d.z), 8.0) * 0.18;
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    }));
    sky.renderOrder = -10; sky.frustumCulled = false;
    root.add(sky);

    const SN = 2400, sp = new Float32Array(SN * 3), sc = new Float32Array(SN * 3);
    for (let i = 0; i < SN; i++) {
      const th = r() * Math.PI * 2, ph = Math.acos(2 * r() - 1), R = 380;
      sp.set([R * Math.sin(ph) * Math.cos(th), R * Math.cos(ph), R * Math.sin(ph) * Math.sin(th)], i * 3);
      const c = new THREE.Color().setHSL(0.55 + r() * 0.25, 0.6, 0.65 + r() * 0.35); sc.set([c.r, c.g, c.b], i * 3);
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3)); sg.setAttribute('color', new THREE.BufferAttribute(sc, 3));
    root.add(new THREE.Points(sg, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: true, vertexColors: true, fog: false, map: kit.glowTexture(), transparent: true, depthWrite: false })));

    // ---------- sun + planets ----------
    const sun = new THREE.DirectionalLight(0xfff0dd, 2.2); sun.position.set(-200, 80, -120); root.add(sun);
    root.add(new THREE.HemisphereLight(0x6a5aff, 0x050210, 0.35));
    const sunGlow = kit.glowSprite(0xffd7a8, 120, 0.7); sunGlow.position.set(-300, 120, -180); root.add(sunGlow);
    const planet = new THREE.Mesh(new THREE.IcosahedronGeometry(55, 2), new THREE.MeshLambertMaterial({ color: 0x6a4cc8, flatShading: true, fog: false }));
    planet.position.set(110, 40, -260);
    const ring = new THREE.Mesh(new THREE.RingGeometry(70, 105, 48, 1), new THREE.MeshBasicMaterial({ color: 0xb9a6ff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, fog: false }));
    ring.position.copy(planet.position); ring.rotation.set(1.25, 0.2, 0.3);
    const moon = new THREE.Mesh(new THREE.IcosahedronGeometry(12, 1), new THREE.MeshLambertMaterial({ color: 0x9aa7c2, flatShading: true, fog: false }));
    moon.position.set(-80, 70, -220);
    root.add(planet, ring, moon);

    // ---------- highway platform ----------
    const laneMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
      uniforms: { uScroll: { value: 0 } },
      vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `uniform float uScroll; varying vec3 vW;
        float L(float x, float c, float w){ return smoothstep(w, 0.0, abs(x - c)); }
        void main(){
          float fade = exp(vW.z * 0.012);
          float edge = L(abs(vW.x), 1.5, 0.03);
          float cross = smoothstep(0.06, 0.0, abs(fract((vW.z + uScroll) * 0.25) - 0.5) - 0.44);
          float inner = L(abs(vW.x), 0.5, 0.015);
          vec3 c = vec3(0.75, 0.45, 1.0) * edge * 1.4 + vec3(0.4, 0.8, 1.0) * inner * 0.8 + vec3(0.55, 0.4, 1.0) * cross * 0.35;
          float a = clamp(edge + inner * 0.8 + cross * 0.4 + 0.12, 0.0, 1.0) * fade;
          gl_FragColor = vec4(c + vec3(0.03, 0.02, 0.08), a);
          #include <colorspace_fragment>
        }`,
    });
    const lane = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 260).rotateX(-Math.PI / 2).translate(0, 0, -128), laneMat);
    root.add(lane);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.6, 0.25, 6), new THREE.MeshLambertMaterial({ color: 0x1c1640, emissive: 0x120a30, flatShading: true }));
    pad.position.y = -0.13; root.add(pad);
    const padEdge = new THREE.LineSegments(new THREE.EdgesGeometry(pad.geometry), new THREE.LineBasicMaterial({ color: 0xb48cff }));
    padEdge.position.copy(pad.position); root.add(padEdge);

    // ---------- asteroids (instanced, drifting toward the player) ----------
    const astGeo = new THREE.IcosahedronGeometry(1, 1);
    const ap = astGeo.attributes.position;
    for (let i = 0; i < ap.count; i++) { const k = 0.75 + r() * 0.5; ap.setXYZ(i, ap.getX(i) * k, ap.getY(i) * k, ap.getZ(i) * k); }
    astGeo.computeVertexNormals();
    const AN = 46;
    const ast = new THREE.InstancedMesh(astGeo, new THREE.MeshLambertMaterial({ color: 0x8a7fa6, emissive: 0x140c2a, flatShading: true }), AN);
    const astData = [];
    for (let i = 0; i < AN; i++) {
      let x, y;
      do { x = (r() - 0.5) * 140; y = (r() - 0.35) * 70; } while (Math.abs(x) < 14 && y > -8 && y < 12);
      astData.push({ p: new THREE.Vector3(x, y, -10 - r() * 190), s: 0.5 + Math.pow(r(), 2) * 4, rot: new THREE.Euler(r() * 6, r() * 6, r() * 6), w: new THREE.Vector3((r() - 0.5) * 0.6, (r() - 0.5) * 0.6, (r() - 0.5) * 0.6) });
    }
    root.add(ast);

    // ---------- warp streaks ----------
    const WN = 220, wp = new Float32Array(WN * 6);
    const wseed = [];
    for (let i = 0; i < WN; i++) {
      let x, y; do { x = (r() - 0.5) * 60; y = (r() - 0.3) * 30; } while (Math.abs(x) < 3 && Math.abs(y - 1.5) < 3);
      const z = -r() * 160; wseed.push([x, y, z]);
    }
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.BufferAttribute(wp, 3));
    const streaks = new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x9fc4ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    streaks.frustumCulled = false;
    root.add(streaks);

    let haze = 1, scroll = 0;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3();
    const apply = () => { fog.density = HAZE[haze]; };
    apply();

    return {
      root, fog, background: FOG.clone(),
      setHaze(h) { haze = h; apply(); },
      setAnchor(a) { root.position.set(a.x, 0, a.z); },
      update(dt, t, { flow }) {
        const v = Math.max(1.5, flow);
        scroll += dt * v; laneMat.uniforms.uScroll.value = scroll;
        planet.rotation.y += dt * 0.02; moon.rotation.y -= dt * 0.05;
        for (let i = 0; i < AN; i++) {
          const a = astData[i];
          a.p.z += dt * v * 0.6; if (a.p.z > 12) a.p.z -= 200;
          a.rot.x += a.w.x * dt; a.rot.y += a.w.y * dt; a.rot.z += a.w.z * dt;
          q.setFromEuler(a.rot); sv.setScalar(a.s); m4.compose(a.p, q, sv); ast.setMatrixAt(i, m4);
        }
        ast.instanceMatrix.needsUpdate = true;
        const len = 0.6 + v * 0.35;
        for (let i = 0; i < WN; i++) {
          const s = wseed[i]; s[2] += dt * v * 3; if (s[2] > 6) s[2] -= 166;
          wp.set([s[0], s[1], s[2], s[0], s[1], s[2] - len], i * 6);
        }
        wg.attributes.position.needsUpdate = true;
      },
      dispose() { kit.disposeTree(root); },
    };
  },
};
