// Foghorn Point — foggy sea at dusk, a lighthouse on a rocky island with a rotating volumetric beam,
// the player standing at the end of a wooden pier. Ocean ambience + foghorn come from the audio engine.
const HAZE = [0.012, 0.02, 0.032];

export default {
  create({ THREE, kit }) {
    const root = new THREE.Group();
    const r = kit.rand(5);
    const FOG = new THREE.Color(0x46595c);
    const fog = new THREE.FogExp2(FOG.getHex(), HAZE[1]);
    const flat = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, flatShading: true, ...o });
    const LH = new THREE.Vector3(-20, 0, -48);          // lighthouse base
    const LAMP = new THREE.Vector3(LH.x, 19.2, LH.z);   // lantern

    // ---------- sky ----------
    const sky = kit.skyDome({ top: 0x16232a, horizon: 0x4c6063, glow: 0xffd59a, glowDir: [LAMP.x, LAMP.y, LAMP.z], glowPower: 30, glowAmount: 0.25 });
    sky.material.uniforms.uSpread.value = 0.5;
    root.add(sky);
    root.add(new THREE.HemisphereLight(0x8fa7aa, 0x1a2224, 0.9));
    const dl = new THREE.DirectionalLight(0xc8d6d4, 0.5); dl.position.set(30, 40, 20); root.add(dl);

    // ---------- ocean (vertex waves, beam glint, manual fog) ----------
    const water = new THREE.Mesh(new THREE.PlaneGeometry(500, 500, 120, 120).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
      fog: false,
      uniforms: { uTime: { value: 0 }, uFog: { value: FOG }, uDensity: { value: HAZE[1] }, uBeam: { value: new THREE.Vector3(1, 0, 0) }, uLamp: { value: LAMP } },
      vertexShader: `uniform float uTime; varying vec3 vW; varying float vH;
        void main(){ vec3 p = position;
          float h = sin(p.x * 0.18 + uTime * 0.9) * 0.35 + sin(p.z * 0.23 - uTime * 1.1) * 0.3
                  + sin((p.x + p.z) * 0.6 + uTime * 1.7) * 0.08 + sin((p.x - p.z) * 1.3 - uTime * 2.3) * 0.04;
          p.y = h - 1.4; vH = h;
          vec4 w = modelMatrix * vec4(p, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform vec3 uFog, uBeam, uLamp; uniform float uDensity; varying vec3 vW; varying float vH;
        void main(){
          vec3 deep = vec3(0.03, 0.07, 0.08), crest = vec3(0.2, 0.3, 0.31);
          vec3 col = mix(deep, crest, smoothstep(-0.4, 0.6, vH));
          col += vec3(0.85, 0.9, 0.85) * smoothstep(0.52, 0.72, vH) * 0.25;            // foam on crests
          vec2 toP = vW.xz - uLamp.xz; float d2 = length(toP);
          float inBeam = pow(max(0.0, dot(normalize(toP), uBeam.xz)), 40.0) * exp(-d2 * 0.012);
          col += vec3(1.0, 0.82, 0.5) * inBeam * (0.35 + 0.65 * smoothstep(0.0, 0.6, vH));  // beam sweeping over the sea
          float d = length(vW - cameraPosition);
          gl_FragColor = vec4(mix(col, uFog, 1.0 - exp(-pow(d * uDensity, 2.0))), 1.0);
          #include <colorspace_fragment>
        }`,
    }));
    root.add(water);

    // ---------- pier under the player ----------
    const parts = [];
    const wood = flat(0x5a4632), darkWood = flat(0x3b2d20);
    for (let z = 1.6; z > -17; z -= 0.27) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.08, 0.24), r() < 0.15 ? darkWood : wood);
      p.position.set((r() - 0.5) * 0.06, -0.04, z); p.rotation.y = (r() - 0.5) * 0.02; parts.push(p);
    }
    for (let z = 1.2; z > -17.5; z -= 3) for (const x of [-1.55, 1.55]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 3.6, 6), darkWood); post.position.set(x, -1.5, z); parts.push(post);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.9, 6), darkWood); top.position.set(x, 0.45, z); parts.push(top);
    }
    for (const x of [-1.55, 1.55]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 19), wood); rail.position.set(x, 0.85, -7.8); parts.push(rail); }
    root.add(kit.mergeByMaterial(parts));
    const lamps = [];
    for (const x of [-1.55, 1.55]) {
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd28a }));
      lamp.position.set(x, 1.0, -16.3); root.add(lamp);
      const g = kit.glowSprite(0xffb85a, 1.6, 0.5); g.position.copy(lamp.position); root.add(g); lamps.push(g);
    }

    // ---------- island + lighthouse ----------
    const rocks = [];
    for (let i = 0; i < 16; i++) {
      const s = 2 + r() * 4.5;
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), flat(r() < 0.5 ? 0x2b3133 : 0x353b3c));
      m.position.set(LH.x + (r() - 0.5) * 16, -1.6 + r() * 0.8, LH.z + (r() - 0.5) * 12); m.scale.y = 0.45 + r() * 0.35;
      m.rotation.set(r() * 3, r() * 3, r() * 3); rocks.push(m);
    }
    const stone = flat(0xd9d2c2), band = flat(0x8a2f2a), dark = flat(0x23292b);
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2.4, 17, 12), stone); tower.position.set(LH.x, 8.5, LH.z);
    const bands = [5, 11].map((y) => { const b = new THREE.Mesh(new THREE.CylinderGeometry(2.4 - y * 0.053, 2.4 - (y - 2) * 0.053 + 0.02, 2, 12), band); b.position.set(LH.x, y, LH.z); return b; });
    const gallery = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.35, 12), dark); gallery.position.set(LH.x, 17.2, LH.z);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.6, 1.8, 12), dark); cap.position.set(LH.x, 21.4, LH.z);
    const house = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 4), stone); house.position.set(LH.x + 4.5, 1.5, LH.z + 2);
    const roofH = new THREE.Mesh(new THREE.ConeGeometry(3.8, 2, 4), band); roofH.rotation.y = Math.PI / 4; roofH.scale.set(1, 1, 0.85); roofH.position.set(LH.x + 4.5, 4, LH.z + 2);
    root.add(kit.mergeByMaterial([...rocks, tower, ...bands, gallery, cap, house, roofH]));
    const lantern = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 2.4, 12), new THREE.MeshBasicMaterial({ color: 0xffe2a0 }));
    lantern.position.copy(LAMP); root.add(lantern);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.1), new THREE.MeshBasicMaterial({ color: 0xffc070 }));
    win.position.set(LH.x + 4.5, 1.6, LH.z + 4.02); root.add(win);

    const lampGlow = kit.glowSprite(0xffd38a, 14, 0.75); lampGlow.position.copy(LAMP); root.add(lampGlow);
    const flare = kit.glowSprite(0xfff0c8, 40, 0); flare.position.copy(LAMP); root.add(flare);

    // rotating beam: two opposed soft cones from the lantern
    const beamMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { uAmt: { value: 0.32 } },
      vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz);
          gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform float uAmt; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        void main(){ float a = pow(vUv.y, 1.6) * pow(abs(dot(normalize(vN), normalize(vV))), 1.4) * uAmt;
          gl_FragColor = vec4(vec3(1.0, 0.86, 0.6) * a, a);
          #include <colorspace_fragment>
        }`,
    });
    const coneGeo = new THREE.ConeGeometry(11, 110, 24, 1, true);
    coneGeo.translate(0, -55, 0); coneGeo.rotateZ(Math.PI / 2);   // apex at origin, opening along +X
    const beam = new THREE.Group(); beam.position.copy(LAMP);
    const b1 = new THREE.Mesh(coneGeo, beamMat), b2 = new THREE.Mesh(coneGeo, beamMat); b2.rotation.y = Math.PI;
    b1.rotation.z = b2.rotation.z = -0.04;
    beam.add(b1, b2); root.add(beam);

    // ---------- buoys with blinking lights ----------
    const buoys = [];
    for (const [x, z, c] of [[9, -26, 0xff3b3b], [-6, -34, 0x3bff7a], [18, -60, 0xff3b3b], [4, -80, 0x3bff7a]]) {
      const b = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.3, 6), flat(c === 0xff3b3b ? 0x8a2222 : 0x1f6a3a));
      b.position.set(x, -1.0, z); root.add(b);
      const g = kit.glowSprite(c, 1.8, 0.8); g.position.set(x, -0.1, z); root.add(g);
      buoys.push({ b, g, ph: r() * 6 });
    }

    // ---------- drifting sea mist ----------
    const mists = [];
    for (let i = 0; i < 18; i++) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: kit.glowTexture(), color: 0xb5c4c2, transparent: true, opacity: 0.16, depthWrite: false }));
      m.scale.set(18 + r() * 16, 3 + r() * 3, 1); m.position.set((r() - 0.5) * 80, -0.6 + r() * 2.5, -8 - r() * 70);
      m.userData.v = 0.4 + r() * 0.8; mists.push(m); root.add(m);
    }

    let haze = 1;
    const apply = () => { fog.density = HAZE[haze]; water.material.uniforms.uDensity.value = HAZE[haze]; sky.material.uniforms.uSpread.value = 0.4 + haze * 0.12; };
    apply();
    const tmp = new THREE.Vector3(), beamDir = new THREE.Vector3();

    return {
      root, fog, background: FOG.clone(),
      setHaze(h) { haze = h; apply(); },
      setAnchor(a) { root.position.set(a.x, 0, a.z); },
      update(dt, t, { camera }) {
        water.material.uniforms.uTime.value = t;
        beam.rotation.y = t * 0.55;
        beamDir.set(Math.cos(beam.rotation.y), 0, -Math.sin(beam.rotation.y));
        water.material.uniforms.uBeam.value.copy(beamDir);
        // flare when the beam swings toward the viewer
        camera.getWorldPosition(tmp); tmp.sub(root.position).sub(LAMP).setY(0).normalize();
        const facing = Math.max(Math.pow(Math.max(0, beamDir.dot(tmp)), 24), Math.pow(Math.max(0, -beamDir.dot(tmp)), 24));
        flare.material.opacity = facing * 0.85;
        lampGlow.material.opacity = 0.6 + facing * 0.3;
        for (const bu of buoys) { bu.b.position.y = -1.0 + Math.sin(t * 1.2 + bu.ph) * 0.15; bu.g.position.y = bu.b.position.y + 0.9; bu.g.material.opacity = Math.sin(t * 2 + bu.ph) > 0.6 ? 0.95 : 0.08; }
        for (const m of mists) { m.position.x += m.userData.v * dt; if (m.position.x > 45) m.position.x = -45; }
        for (const l of lamps) l.material.opacity = 0.45 + Math.sin(t * 9 + l.position.x) * 0.04;
      },
      dispose() { kit.disposeTree(root); },
    };
  },
};
