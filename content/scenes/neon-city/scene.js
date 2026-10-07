// Neon City — hazy cyber avenue that dissolves into a glowing horizon, wet reflective floor.
// Scene plugin contract: create(ctx) → { root, fog, background, update, setHaze, setReflections, setAnchor, dispose }
const HAZE = [0.014, 0.024, 0.04];

export default {
  create({ THREE, kit }) {
    const HORIZON = new THREE.Color(0x0f2c4c);
    const root = new THREE.Group();
    const fog = new THREE.FogExp2(HORIZON.getHex(), HAZE[1]);

    // Sky — the bright core is kept small and low so targets (at eye level) read against darker sky.
    const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { uHorizon: { value: HORIZON }, uHaze: { value: 0.5 } },
      vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
      fragmentShader: `uniform vec3 uHorizon; uniform float uHaze; varying vec3 vD;
        void main(){
          float h = abs(vD.y); float below = step(vD.y, 0.0);
          vec3 col = mix(uHorizon, vec3(0.008, 0.016, 0.04), smoothstep(0.0, 0.3 + uHaze * 0.25, h));
          float fwd = max(0.0, -vD.z);
          col += vec3(0.45, 0.9, 1.0) * pow(fwd, 90.0) * exp(-h * 45.0) * 0.9;
          col += vec3(0.2, 0.5, 0.95) * pow(fwd, 6.0) * exp(-h * 9.0) * 0.4;
          col += vec3(0.35, 0.25, 0.8) * pow(abs(vD.x), 3.0) * exp(-h * 10.0) * 0.12;
          col *= mix(1.0, 0.5, below);
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    }));
    sky.renderOrder = -10; sky.frustumCulled = false;
    root.add(sky);

    const sun = kit.glowSprite(0x66e6ff, 1, 0.55); sun.scale.set(50, 12, 1); sun.position.set(0, 0.5, -220);
    const beam = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 260), new THREE.MeshBasicMaterial({
      color: 0x55dfff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    beam.position.set(0, 130, -230);
    const sunM = sun.clone(); sunM.material = sun.material.clone(); sunM.material.opacity = 0.3; sunM.position.y = -0.5;
    const beamM = beam.clone(); beamM.material = beam.material.clone(); beamM.position.y = -130;
    root.add(sun, beam, sunM, beamM);

    // Wet floor (semi-transparent over the mirrored city)
    const floorMat = new THREE.ShaderMaterial({
      transparent: true, fog: false,
      uniforms: { uFog: { value: HORIZON }, uDensity: { value: HAZE[1] }, uAlpha: { value: 0.8 }, uScroll: { value: 0 }, uLaneX: { value: 0 } },
      vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `uniform vec3 uFog; uniform float uDensity, uAlpha, uScroll, uLaneX; varying vec3 vW;
        float L(float x, float c, float w){ return smoothstep(w, 0.0, abs(x - c)); }
        void main(){
          float x = vW.x - uLaneX;
          vec3 col = vec3(0.006, 0.011, 0.025), cy = vec3(0.3, 0.9, 1.0);
          col += cy * (L(x, -0.5, 0.014) + L(x, 0.5, 0.014)) * 1.2;
          col += vec3(0.75, 0.9, 1.0) * (L(x, -3.2, 0.03) + L(x, 3.2, 0.03)) * 0.55;
          col += cy * L(x, 0.0, 0.008) * step(0.5, fract((vW.z + uScroll) * 0.35)) * 0.5;
          col += vec3(0.25, 0.7, 1.0) * exp(-abs(x) * 1.6) * smoothstep(-2.0, -40.0, vW.z) * 0.35;
          float d = length(vW.xz - cameraPosition.xz);
          float f = 1.0 - exp(-pow(d * uDensity, 2.0));
          gl_FragColor = vec4(mix(col, uFog, f), mix(uAlpha, 1.0, f));
          #include <colorspace_fragment>
        }`,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), floorMat);
    floor.rotation.x = -Math.PI / 2;
    root.add(floor);

    // Buildings: dark facades with world-scale lit windows (instanced, own exp2 fog)
    const bldMat = new THREE.ShaderMaterial({
      fog: false,
      uniforms: { uFog: { value: HORIZON }, uDensity: { value: HAZE[1] } },
      vertexShader: `varying vec3 vW; varying vec3 vN;
        void main(){ mat4 m = modelMatrix;
          #ifdef USE_INSTANCING
            m = m * instanceMatrix;
          #endif
          vec4 w = m * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(m) * normal);
          gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform vec3 uFog; uniform float uDensity; varying vec3 vW; varying vec3 vN;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main(){
          float y = abs(vW.y);
          vec3 col = mix(vec3(0.004, 0.008, 0.02), vec3(0.016, 0.03, 0.065), clamp(y / 90.0, 0.0, 1.0));
          float side = step(abs(vN.y), 0.5);
          float u = abs(vN.x) > 0.5 ? vW.z : vW.x;
          vec2 cell = floor(vec2(u / 1.4, y / 2.0)); vec2 f = fract(vec2(u / 1.4, y / 2.0));
          float inside = step(0.28, f.x) * step(f.x, 0.72) * step(0.3, f.y) * step(f.y, 0.72);
          float lit = step(0.8, hash(cell + floor(vW.xz / 40.0) * 7.0)) * (0.25 + 0.75 * hash(cell * 1.7));
          vec3 wc = mix(vec3(0.35, 0.75, 1.0), vec3(0.6, 0.45, 1.0), step(0.85, hash(cell * 3.1)));
          float d = length(vW - cameraPosition);
          col += wc * inside * lit * side * 0.55 * (1.0 - smoothstep(40.0, 120.0, d));
          gl_FragColor = vec4(mix(col, uFog, 1.0 - exp(-pow(d * uDensity, 2.0))), 1.0);
          #include <colorspace_fragment>
        }`,
    });
    const r = kit.rand(7);
    const boxes = [];
    for (const side of [-1, 1]) {
      for (let z = -16 - r() * 6; z > -230;) {
        const w = 6 + r() * 8, d = 6 + r() * 9;
        boxes.push({ x: side * (11 + w / 2 + r() * 5), z: z - d / 2, w, d, h: 14 + Math.pow(r(), 1.5) * 50 });
        z -= d + 3 + r() * 7;
      }
      for (let z = -24 - r() * 10; z > -260;) {
        const w = 8 + r() * 10, d = 8 + r() * 10;
        boxes.push({ x: side * (30 + r() * 25), z: z - d / 2, w, d, h: 35 + Math.pow(r(), 1.3) * 90 });
        z -= d + 4 + r() * 9;
      }
    }
    for (let i = 0; i < 8; i++) {
      const side = i % 2 ? 1 : -1;
      boxes.push({ x: side * (16 + r() * 26), z: -240 - r() * 60, w: 6 + r() * 8, d: 6 + r() * 8, h: 90 + r() * 110 });
    }
    const city = new THREE.Group();
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), bldMat, boxes.length);
    const m = new THREE.Matrix4();
    boxes.forEach((b, i) => { m.compose(new THREE.Vector3(b.x, b.h / 2, b.z), new THREE.Quaternion(), new THREE.Vector3(b.w, b.h, b.d)); inst.setMatrixAt(i, m); });
    city.add(inst);

    // Neon edge strips
    const pos = [], col = [];
    const cyan = new THREE.Color(0x6ff0ff), violet = new THREE.Color(0xb27bff), white = new THREE.Color(0xe0fbff);
    const quad = (a, b, w, c) => {
      const p = [[a[0] - w[0], a[1] - w[1], a[2] - w[2]], [a[0] + w[0], a[1] + w[1], a[2] + w[2]],
        [b[0] + w[0], b[1] + w[1], b[2] + w[2]], [b[0] - w[0], b[1] - w[1], b[2] - w[2]]];
      for (const i of [0, 1, 2, 0, 2, 3]) { pos.push(...p[i]); col.push(c.r, c.g, c.b); }
    };
    for (const b of boxes) {
      if (r() < 0.2) continue;
      const c = r() < 0.65 ? cyan : r() < 0.5 ? violet : white;
      const fx = b.x - Math.sign(b.x || 1) * (b.w / 2 + 0.06);
      const zf = b.z + b.d / 2 + 0.06, zb = b.z - b.d / 2;
      const t = 0.09 + Math.min(0.25, -b.z / 900);
      quad([fx, 0, zf], [fx, b.h, zf], [0, 0, t], c);
      if (r() < 0.6) quad([fx, b.h, zf], [fx, b.h, zb], [0, t, 0], c);
      if (r() < 0.5) { const y = b.h * (0.3 + r() * 0.5); quad([fx, y, zf], [fx, y, zb], [0, t, 0], c); }
      if (r() < 0.4) quad([b.x - b.w / 2, b.h, zf], [b.x + b.w / 2, b.h, zf], [0, t, 0], c);
    }
    const eg = new THREE.BufferGeometry();
    eg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    eg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    city.add(new THREE.Mesh(eg, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })));
    const mirror = city.clone(); mirror.scale.y = -1;
    root.add(city, mirror);

    let scroll = 0, haze = 1, refl = true;
    const apply = () => {
      const d = HAZE[haze];
      fog.density = d; floorMat.uniforms.uDensity.value = d; bldMat.uniforms.uDensity.value = d * 0.55;
      floorMat.uniforms.uAlpha.value = refl ? 0.78 : 1.0;
      sky.material.uniforms.uHaze.value = haze / 2;
      beam.material.opacity = [0.45, 0.35, 0.22][haze];
      beamM.material.opacity = refl ? beam.material.opacity * 0.5 : 0;
      mirror.visible = refl; sunM.visible = refl;
    };
    apply();

    return {
      root, fog, background: HORIZON.clone(),
      setHaze(h) { haze = h; apply(); },
      setReflections(on) { refl = on; apply(); },
      setAnchor(a) { floorMat.uniforms.uLaneX.value = a.x; },
      update(dt, t, { flow }) { scroll += dt * flow; floorMat.uniforms.uScroll.value = scroll; },
      dispose() { kit.disposeTree(root); },
    };
  },
};
