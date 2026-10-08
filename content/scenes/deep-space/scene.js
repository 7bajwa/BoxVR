// Deep Space — you stand on the solar-panel wing of a satellite, defending it from incoming
// asteroids. A bright star lights the scene; a ringed planet with its own orbiting asteroid belt,
// a rotating space station, patrol ships, drifting rocks at different speeds, nebula + stars.
const HAZE = [0.003, 0.006, 0.012];

export default {
  create({ THREE, kit }) {
    const root = new THREE.Group();
    const r = kit.rand(77);
    const FOG = new THREE.Color(0x0b0a22);
    const fog = new THREE.FogExp2(FOG.getHex(), HAZE[1]);
    const lam = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, flatShading: true, ...o });

    // ---------- nebula sky + stars ----------
    const sky = new THREE.Mesh(new THREE.SphereGeometry(450, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
      fragmentShader: `varying vec3 vD;
        float n(vec3 p){ return sin(p.x*3.1+sin(p.y*2.3))*sin(p.y*2.7+sin(p.z*3.7))*sin(p.z*2.9+sin(p.x*1.9)); }
        void main(){
          float a = n(vD * 2.0) * 0.5 + n(vD * 4.3 + 1.7) * 0.3 + n(vD * 9.1 + 3.1) * 0.2;
          vec3 c = vec3(0.01, 0.008, 0.03);
          c += vec3(0.32, 0.12, 0.55) * smoothstep(0.05, 0.7, a) * 0.45;
          c += vec3(0.05, 0.3, 0.55) * smoothstep(0.2, 0.9, -a) * 0.3;
          vec3 sd = normalize(vec3(-0.75, 0.3, -0.45));
          c += vec3(1.0, 0.85, 0.6) * pow(max(0.0, dot(vD, sd)), 30.0) * 0.6;   // star glow on the sky
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
    root.add(new THREE.Points(sg, new THREE.PointsMaterial({ size: 1.6, vertexColors: true, fog: false, map: kit.glowTexture(), transparent: true, depthWrite: false })));

    // ---------- the bright star (key light) + lens flare ----------
    const STAR = new THREE.Vector3(-300, 120, -180);
    const sun = new THREE.DirectionalLight(0xfff2dd, 2.6); sun.position.copy(STAR); root.add(sun);
    root.add(new THREE.HemisphereLight(0x6a5aff, 0x050210, 0.45));
    const starCore = kit.glowSprite(0xfff6e0, 40, 1); starCore.position.copy(STAR); root.add(starCore);
    const starHalo = kit.glowSprite(0xffc98a, 160, 0.55); starHalo.position.copy(STAR); root.add(starHalo);
    const flares = [];
    for (const [k, ang, c] of [[0.55, 0.07, 0x88aaff], [0.35, 0.035, 0xffaa66], [0.2, 0.1, 0x6655ff], [0.08, 0.025, 0xffffff]]) {
      const f = kit.glowSprite(c, 1, 0.16); f.userData.k = k; f.userData.ang = ang; flares.push(f); root.add(f);
    }

    // ---------- ringed planet + its orbiting asteroid belt + moon ----------
    const PLANET = new THREE.Vector3(110, 30, -260);
    const planet = new THREE.Mesh(new THREE.IcosahedronGeometry(55, 2), new THREE.MeshLambertMaterial({ color: 0x6a4cc8, flatShading: true, fog: false }));
    planet.position.copy(PLANET);
    const ring = new THREE.Mesh(new THREE.RingGeometry(70, 105, 64, 1), new THREE.MeshBasicMaterial({ color: 0xb9a6ff, transparent: true, opacity: 0.3, side: THREE.DoubleSide, fog: false }));
    ring.position.copy(PLANET); ring.rotation.set(1.25, 0.2, 0.3);
    const moon = new THREE.Mesh(new THREE.IcosahedronGeometry(12, 1), new THREE.MeshLambertMaterial({ color: 0x9aa7c2, flatShading: true, fog: false }));
    root.add(planet, ring, moon);
    const rockGeo = new THREE.IcosahedronGeometry(1, 0);
    const BN = 140;
    const belt = new THREE.InstancedMesh(rockGeo, new THREE.MeshLambertMaterial({ color: 0x8f86a4, flatShading: true, fog: false }), BN);
    const beltData = Array.from({ length: BN }, () => ({ a: r() * Math.PI * 2, rad: 78 + r() * 26, y: (r() - 0.5) * 4, s: 0.6 + r() * 2.2, w: 0.02 + r() * 0.03 }));
    root.add(belt);

    // ---------- the satellite we stand on: solar-panel wing + body + dish ----------
    const cells = (() => {
      const c = document.createElement('canvas'); c.width = 256; c.height = 512;
      const g = c.getContext('2d');
      g.fillStyle = '#c9ced8'; g.fillRect(0, 0, 256, 512);
      for (let y = 0; y < 16; y++) for (let x = 0; x < 8; x++) {
        const grd = g.createLinearGradient(0, y * 32, 0, y * 32 + 32);
        grd.addColorStop(0, '#1b3a8a'); grd.addColorStop(1, '#0d1f55');
        g.fillStyle = grd; g.fillRect(x * 32 + 2, y * 32 + 2, 28, 28);
      }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
    })();
    const sat = new THREE.Group();
    const panelM = new THREE.MeshLambertMaterial({ map: cells, emissive: 0x0a1030 });
    const wing = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.06, 9), panelM); wing.position.set(0, -0.03, -2.2); sat.add(wing);
    const wing2 = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.06, 9), panelM); wing2.position.set(0, -0.03, 13.8); sat.add(wing2);
    const truss = lam(0x9aa0aa);
    for (const x of [-1.62, 1.62]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 25), truss); b.position.set(x, -0.03, 5.8); sat.add(b); }
    const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 25, 8), truss); spine.rotation.x = Math.PI / 2; spine.position.set(0, -0.35, 5.8); sat.add(spine);
    const body = new THREE.Mesh(new THREE.BoxGeometry(3, 2.6, 3.4), new THREE.MeshLambertMaterial({ color: 0xd9a63a, emissive: 0x3a2400, flatShading: true }));
    body.position.set(0, -1.2, 5.2); sat.add(body);
    const dish = new THREE.Mesh(new THREE.SphereGeometry(1.4, 16, 8, 0, Math.PI * 2, 0, Math.PI / 3.2), new THREE.MeshLambertMaterial({ color: 0xe8e8ee, side: THREE.DoubleSide }));
    dish.rotation.x = -Math.PI / 2.4; dish.position.set(0, 0.9, 6.2); sat.add(dish);
    const feed = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 5), truss); feed.rotation.x = -0.5; feed.position.set(0, 1.0, 5.5); sat.add(feed);
    const beacon = kit.glowSprite(0xff3355, 0.6, 0.9); beacon.position.set(1.5, 0.1, 3.4); sat.add(beacon);
    root.add(sat);
    // faint targeting beam down the lane
    const laneMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uScroll: { value: 0 } },
      vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `uniform float uScroll; varying vec3 vW;
        void main(){ float fade = exp((vW.z + 6.0) * 0.02) * smoothstep(-6.0, -8.0, vW.z);
          float edge = smoothstep(0.03, 0.0, abs(abs(vW.x) - 1.5));
          float pulse = smoothstep(0.06, 0.0, abs(fract((vW.z + uScroll) * 0.2) - 0.5) - 0.45);
          vec3 c = vec3(0.6, 0.45, 1.0) * edge + vec3(0.4, 0.7, 1.0) * pulse * 0.25;
          gl_FragColor = vec4(c * fade, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    const lane = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 220).rotateX(-Math.PI / 2).translate(0, -0.05, -116), laneMat);
    root.add(lane);

    // ---------- space station (rotating ring) ----------
    const station = new THREE.Group(); station.position.set(-70, 18, -150);
    const torus = new THREE.Mesh(new THREE.TorusGeometry(16, 1.6, 8, 32), lam(0xcfd3dc));
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 8, 12), lam(0xaab0bc)); hub.rotation.x = Math.PI / 2;
    station.add(torus, hub);
    for (let i = 0; i < 4; i++) { const sp2 = new THREE.Mesh(new THREE.BoxGeometry(0.8, 30, 0.8), lam(0x9aa0aa)); sp2.rotation.z = (i * Math.PI) / 4; station.add(sp2); }
    const sPanel = new THREE.Mesh(new THREE.BoxGeometry(26, 0.2, 6), panelM); sPanel.position.z = -6; station.add(sPanel);
    const stationLights = [];
    for (let i = 0; i < 10; i++) { const l = kit.glowSprite(i % 2 ? 0x5fe8ff : 0xffd27a, 2.2, 0.8); const a = (i / 10) * Math.PI * 2; l.position.set(Math.cos(a) * 16, Math.sin(a) * 16, 1.8); stationLights.push(l); station.add(l); }
    station.rotation.y = 0.6;
    root.add(station);

    // ---------- foreground asteroids drifting past (different speeds) ----------
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
      astData.push({ p: new THREE.Vector3(x, y, -10 - r() * 190), s: 0.5 + Math.pow(r(), 2) * 4, v: 0.25 + r() * 1.1,
        rot: new THREE.Euler(r() * 6, r() * 6, r() * 6), w: new THREE.Vector3((r() - 0.5) * 0.6, (r() - 0.5) * 0.6, (r() - 0.5) * 0.6) });
    }
    root.add(ast);

    // ---------- patrol ships flying past now and then ----------
    const ships = [];
    for (let i = 0; i < 3; i++) {
      const sh = new THREE.Group();
      const hullS = new THREE.Mesh(new THREE.ConeGeometry(0.9, 4.5, 4), lam(0xb8bfcc)); hullS.rotation.x = -Math.PI / 2; hullS.scale.set(1, 1, 0.45); sh.add(hullS);
      const wings = new THREE.Mesh(new THREE.BoxGeometry(5, 0.12, 1.4), lam(0x6e7686)); wings.position.z = 0.9; sh.add(wings);
      const engine = kit.glowSprite(0x6fd8ff, 2.2, 0.9); engine.position.z = 2.4; sh.add(engine);
      sh.userData = { t: -i * 9, from: new THREE.Vector3(80 - i * 50, 10 + i * 8, -60 - i * 30), to: new THREE.Vector3(-90 + i * 30, 25 - i * 4, -140) };
      ships.push(sh); root.add(sh);
    }

    // ---------- warp streaks (subtle) ----------
    const WN = 140, wp = new Float32Array(WN * 6), wseed = [];
    for (let i = 0; i < WN; i++) {
      let x, y; do { x = (r() - 0.5) * 60; y = (r() - 0.3) * 30; } while (Math.abs(x) < 3 && Math.abs(y - 1.5) < 3);
      wseed.push([x, y, -r() * 160]);
    }
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.BufferAttribute(wp, 3));
    const streaks = new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x9fc4ff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    streaks.frustumCulled = false; root.add(streaks);

    let haze = 1, scroll = 0, time = 0;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), tmp = new THREE.Vector3(), camP = new THREE.Vector3();
    const apply = () => { fog.density = HAZE[haze]; };
    apply();

    return {
      root, fog, background: FOG.clone(),
      setHaze(h) { haze = h; apply(); },
      setAnchor(a) { root.position.set(a.x, 0, a.z); },
      update(dt, t, { flow, camera }) {
        time += dt;
        const v = Math.max(1.5, flow);
        scroll += dt * v; laneMat.uniforms.uScroll.value = scroll;
        planet.rotation.y += dt * 0.02;
        moon.position.set(PLANET.x + Math.cos(time * 0.03) * 150, PLANET.y + 30, PLANET.z + Math.sin(time * 0.03) * 90);
        for (let i = 0; i < BN; i++) {
          const b = beltData[i]; b.a += b.w * dt;
          tmp.set(Math.cos(b.a) * b.rad, b.y, Math.sin(b.a) * b.rad).applyEuler(ring.rotation).add(PLANET);
          q.setFromEuler(new THREE.Euler(b.a * 3, b.a * 2, 0)); sv.setScalar(b.s); m4.compose(tmp, q, sv); belt.setMatrixAt(i, m4);
        }
        belt.instanceMatrix.needsUpdate = true;
        for (let i = 0; i < AN; i++) {
          const a = astData[i];
          a.p.z += dt * v * 0.6 * a.v; if (a.p.z > 12) a.p.z -= 200;
          a.rot.x += a.w.x * dt; a.rot.y += a.w.y * dt; a.rot.z += a.w.z * dt;
          q.setFromEuler(a.rot); sv.setScalar(a.s); m4.compose(a.p, q, sv); ast.setMatrixAt(i, m4);
        }
        ast.instanceMatrix.needsUpdate = true;
        torus.rotation.z += dt * 0.08; for (const l of stationLights) l.material.opacity = 0.4 + 0.5 * Math.max(0, Math.sin(t * 2 + l.position.x));
        beacon.material.opacity = Math.sin(t * 3) > 0.7 ? 1 : 0.15;
        for (const sh of ships) {
          const u = sh.userData; u.t += dt;
          const k = (u.t % 30) / 7;
          sh.visible = k >= 0 && k <= 1;
          if (sh.visible) { sh.position.lerpVectors(u.from, u.to, k); sh.lookAt(tmp.subVectors(u.to, u.from).normalize().add(sh.position)); }
        }
        // lens flare along the line from the star toward the screen centre
        camera.getWorldPosition(camP);
        tmp.copy(STAR).add(root.position);
        const D = tmp.distanceTo(camP);
        for (const f of flares) {
          const p = 0.6 + f.userData.k * 0.38;
          f.position.lerpVectors(tmp, camP, p).sub(root.position);
          f.scale.setScalar((1 - p) * D * f.userData.ang);   // constant angular size
        }
        const len = 0.4 + v * 0.2;
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
