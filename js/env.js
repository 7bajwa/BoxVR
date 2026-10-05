// BOXFLOW — scene: hazy neon city that dissolves into a glowing horizon, wet reflective floor,
// simple straight lane. Themes: 'city' | 'minimal'. Haze: 0 low, 1 medium, 2 high.
import * as THREE from 'three';
import { getGlowTexture } from './target.js';

const HORIZON = new THREE.Color(0x14385e);   // fog + sky horizon colour (everything blends into this)
const GATE_COLOR = new THREE.Color(0x8ff6ff);
const HAZE_DENSITY = [0.014, 0.024, 0.04];

const skyVert = /* glsl */`
  varying vec3 vDir;
  void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const skyFrag = /* glsl */`
  uniform vec3 uHorizon; uniform float uHaze;
  varying vec3 vDir;
  void main() {
    float h = abs(vDir.y);
    float below = step(vDir.y, 0.0);
    vec3 top = vec3(0.01, 0.02, 0.05);
    vec3 col = mix(uHorizon, top, smoothstep(0.0, 0.35 + uHaze * 0.25, h));
    // bright core where the lane meets the horizon
    float fwd = max(0.0, -vDir.z);
    float core = pow(fwd, 60.0) * exp(-abs(h) * 30.0);
    col += vec3(0.45, 0.9, 1.0) * core * 1.8;
    col += vec3(0.25, 0.6, 1.0) * pow(fwd, 5.0) * exp(-h * 7.0) * 0.55;
    col += vec3(0.35, 0.25, 0.8) * pow(max(0.0, abs(vDir.x)), 3.0) * exp(-h * 10.0) * 0.12; // violet side haze
    col *= mix(1.0, 0.55, below);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }`;

const floorVert = /* glsl */`
  varying vec3 vW;
  void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const floorFrag = /* glsl */`
  uniform vec3 uFog; uniform float uDensity; uniform float uAlpha; uniform float uScroll; uniform float uLaneX;
  varying vec3 vW;
  float lineAt(float x, float c, float w) { return smoothstep(w, 0.0, abs(x - c)); }
  void main() {
    float x = vW.x - uLaneX;
    vec3 col = vec3(0.008, 0.014, 0.03);
    vec3 cyan = vec3(0.3, 0.9, 1.0);
    // lane edges + wide guide lines (like the reference image)
    col += cyan * lineAt(x, -0.5, 0.014) * 1.2;
    col += cyan * lineAt(x,  0.5, 0.014) * 1.2;
    col += vec3(0.75, 0.9, 1.0) * (lineAt(x, -3.2, 0.03) + lineAt(x, 3.2, 0.03)) * 0.55;
    // centre dashes flowing toward the player
    float dash = step(0.5, fract((vW.z + uScroll) * 0.35));
    col += cyan * lineAt(x, 0.0, 0.008) * dash * 0.5;
    // horizon light reflected on the wet floor
    float streak = exp(-abs(x) * 1.6) * smoothstep(-2.0, -40.0, vW.z);
    col += vec3(0.25, 0.7, 1.0) * streak * 0.5;
    float d = length(vW.xz - cameraPosition.xz);
    float f = 1.0 - exp(-pow(d * uDensity, 2.0));
    col = mix(col, uFog, f);
    gl_FragColor = vec4(col, mix(uAlpha, 1.0, f));
    #include <colorspace_fragment>
  }`;

// Buildings: dark facades with world-scale lit windows, manual exp2 fog (instancing-aware).
const bldVert = /* glsl */`
  varying vec3 vW; varying vec3 vN;
  void main() {
    mat4 m = modelMatrix;
    #ifdef USE_INSTANCING
      m = m * instanceMatrix;
    #endif
    vec4 w = m * vec4(position, 1.0);
    vW = w.xyz; vN = normalize(mat3(m) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
const bldFrag = /* glsl */`
  uniform vec3 uFog; uniform float uDensity;
  varying vec3 vW; varying vec3 vN;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    float y = abs(vW.y);
    vec3 col = mix(vec3(0.004, 0.008, 0.02), vec3(0.016, 0.03, 0.065), clamp(y / 90.0, 0.0, 1.0));
    float side = step(abs(vN.y), 0.5);
    float u = abs(vN.x) > 0.5 ? vW.z : vW.x;
    vec2 cell = floor(vec2(u / 1.4, y / 2.0));
    vec2 f = fract(vec2(u / 1.4, y / 2.0));
    float inside = step(0.28, f.x) * step(f.x, 0.72) * step(0.3, f.y) * step(f.y, 0.72);
    float r = hash(cell + floor(vW.xz / 40.0) * 7.0);
    float lit = step(0.8, r) * (0.25 + 0.75 * hash(cell * 1.7));
    vec3 wc = mix(vec3(0.35, 0.75, 1.0), vec3(0.6, 0.45, 1.0), step(0.85, hash(cell * 3.1)));
    float d = length(vW - cameraPosition);
    col += wc * inside * lit * side * 0.55 * (1.0 - smoothstep(40.0, 120.0, d));
    float fog = 1.0 - exp(-pow(d * uDensity, 2.0));
    gl_FragColor = vec4(mix(col, uFog, fog), 1.0);
    #include <colorspace_fragment>
  }`;

function rand(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

export class Environment {
  constructor(scene) {
    this.scene = scene;
    this.scroll = 0;
    scene.background = HORIZON.clone();
    scene.fog = new THREE.FogExp2(HORIZON.getHex(), HAZE_DENSITY[1]);

    this.sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.ShaderMaterial({
      vertexShader: skyVert, fragmentShader: skyFrag, side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { uHorizon: { value: HORIZON }, uHaze: { value: 0.5 } },
    }));
    this.sky.renderOrder = -10;
    scene.add(this.sky);

    // Horizon glow + vertical light spire at the end of the lane
    const glowMat = new THREE.SpriteMaterial({ map: getGlowTexture(), color: 0x66e6ff, transparent: true, opacity: 0.9,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    this.sun = new THREE.Sprite(glowMat);
    this.sun.scale.set(60, 22, 1);
    this.sun.position.set(0, 2, -220);
    scene.add(this.sun);
    const beam = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 260), new THREE.MeshBasicMaterial({
      color: 0x55dfff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    beam.position.set(0, 130, -230);
    this.beam = beam;
    scene.add(beam);
    this.sunMirror = this.sun.clone(); this.sunMirror.material = glowMat.clone(); this.sunMirror.material.opacity = 0.5;
    this.sunMirror.position.y = -2;
    this.beamMirror = beam.clone(); this.beamMirror.material = beam.material.clone(); this.beamMirror.position.y = -130;
    scene.add(this.sunMirror, this.beamMirror);

    // Floor (semi-transparent over mirrored city = wet reflection)
    this.floorMat = new THREE.ShaderMaterial({
      vertexShader: floorVert, fragmentShader: floorFrag, transparent: true, fog: false,
      uniforms: { uFog: { value: HORIZON }, uDensity: { value: HAZE_DENSITY[1] }, uAlpha: { value: 0.8 },
        uScroll: { value: 0 }, uLaneX: { value: 0 } },
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    // City + its reflection
    this.city = this.buildCity();
    this.mirror = this.city.clone();
    this.mirror.scale.y = -1;
    scene.add(this.city, this.mirror);

    // Minimal theme: a few distant monoliths only
    this.monoliths = this.buildMonoliths();
    this.monoMirror = this.monoliths.clone(); this.monoMirror.scale.y = -1;
    scene.add(this.monoliths, this.monoMirror);

    // Lane gate (subtle)
    this.lane = new THREE.Group();
    scene.add(this.lane);
    this.gate = new THREE.Group();
    this.gateMat = new THREE.LineBasicMaterial({ color: GATE_COLOR, transparent: true, opacity: 0.22, fog: false });
    const w = 0.55, h0 = -0.55, h1 = 0.25;
    const pts = [[-w, h0], [w, h0], [w, h1], [-w, h1], [-w, h0]].map(([x, y]) => new THREE.Vector3(x, y, 0));
    this.gate.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), this.gateMat));
    this.lane.add(this.gate);

    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    this.theme = 'city'; this.haze = 1; this.reflections = true;
    this.apply();
  }

  buildCity() {
    this.bldMat = new THREE.ShaderMaterial({
      vertexShader: bldVert, fragmentShader: bldFrag, fog: false,
      uniforms: { uFog: { value: HORIZON }, uDensity: { value: HAZE_DENSITY[1] } },
    });
    const r = rand(7);
    const g = new THREE.Group();
    const boxes = [];
    for (const side of [-1, 1]) {
      // front row lining the avenue (gaps between buildings = side streets)
      for (let z = -16 - r() * 6; z > -230;) {
        const w = 6 + r() * 8, d = 6 + r() * 9;
        boxes.push({ x: side * (11 + w / 2 + r() * 5), z: z - d / 2, w, d, h: 14 + Math.pow(r(), 1.5) * 50 });
        z -= d + 3 + r() * 7;
      }
      // taller back row
      for (let z = -24 - r() * 10; z > -260;) {
        const w = 8 + r() * 10, d = 8 + r() * 10;
        boxes.push({ x: side * (30 + r() * 25), z: z - d / 2, w, d, h: 35 + Math.pow(r(), 1.3) * 90 });
        z -= d + 4 + r() * 9;
      }
    }
    // towers framing the vanishing point
    for (let i = 0; i < 8; i++) {
      const side = i % 2 ? 1 : -1;
      boxes.push({ x: side * (16 + r() * 26), z: -240 - r() * 60, w: 6 + r() * 8, d: 6 + r() * 8, h: 90 + r() * 110 });
    }

    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1),
      this.bldMat, boxes.length);
    const m = new THREE.Matrix4();
    boxes.forEach((b, i) => { m.compose(new THREE.Vector3(b.x, b.h / 2, b.z), new THREE.Quaternion(), new THREE.Vector3(b.w, b.h, b.d)); inst.setMatrixAt(i, m); });
    g.add(inst);

    // Neon edge strips (thin quads, so they stay visible in VR) on a subset of buildings
    const pos = [], col = [];
    const cyan = new THREE.Color(0x6ff0ff), violet = new THREE.Color(0xb27bff), white = new THREE.Color(0xe0fbff);
    const quad = (a, b, w, c) => { // strip from a to b, half-width vector w
      const p = [[a[0] - w[0], a[1] - w[1], a[2] - w[2]], [a[0] + w[0], a[1] + w[1], a[2] + w[2]],
        [b[0] + w[0], b[1] + w[1], b[2] + w[2]], [b[0] - w[0], b[1] - w[1], b[2] - w[2]]];
      for (const i of [0, 1, 2, 0, 2, 3]) { pos.push(...p[i]); col.push(c.r, c.g, c.b); }
    };
    for (const b of boxes) {
      if (r() < 0.2) continue;
      const c = r() < 0.65 ? cyan : r() < 0.5 ? violet : white;
      const sx = Math.sign(b.x || 1);
      const fx = b.x - sx * (b.w / 2 + 0.06);     // face toward the lane
      const zf = b.z + b.d / 2 + 0.06, zb = b.z - b.d / 2;
      const t = 0.09 + Math.min(0.25, -b.z / 900); // thicker far away so they survive distance
      quad([fx, 0, zf], [fx, b.h, zf], [0, 0, t], c);                       // vertical corner
      if (r() < 0.6) quad([fx, b.h, zf], [fx, b.h, zb], [0, t, 0], c);       // roof edge
      if (r() < 0.5) { const y = b.h * (0.3 + r() * 0.5); quad([fx, y, zf], [fx, y, zb], [0, t, 0], c); }
      if (r() < 0.4) quad([b.x - b.w / 2, b.h, zf], [b.x + b.w / 2, b.h, zf], [0, t, 0], c);
    }
    const eg = new THREE.BufferGeometry();
    eg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    eg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.add(new THREE.Mesh(eg, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })));
    return g;
  }

  buildMonoliths() {
    const g = new THREE.Group();
    const mat = this.monoMat = this.bldMat.clone();
    const lineMat = new THREE.LineBasicMaterial({ color: 0x3fe0ff });
    for (const [x, z, h] of [[-14, -60, 40], [16, -75, 55], [-30, -120, 70], [34, -140, 60], [-6, -200, 110], [9, -190, 90]]) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(5, h, 5), mat);
      box.position.set(x, h / 2, z); g.add(box);
      const e = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x - Math.sign(x) * 2.5, 0, z + 2.5), new THREE.Vector3(x - Math.sign(x) * 2.5, h, z + 2.5)]), lineMat);
      g.add(e);
    }
    return g;
  }

  setTheme(t) { this.theme = t; this.apply(); }
  setHaze(h) { this.haze = h; this.apply(); }
  setReflections(on) { this.reflections = on; this.apply(); }

  apply() {
    const city = this.theme === 'city';
    this.city.visible = city; this.mirror.visible = city && this.reflections;
    this.monoliths.visible = !city; this.monoMirror.visible = !city && this.reflections;
    const dens = HAZE_DENSITY[this.haze] ?? HAZE_DENSITY[1];
    this.scene.fog.density = dens;
    this.floorMat.uniforms.uDensity.value = dens;
    this.bldMat.uniforms.uDensity.value = dens * 0.55; // keep silhouettes readable; haze mostly at the horizon
    this.monoMat.uniforms.uDensity.value = dens * 0.55;
    this.floorMat.uniforms.uAlpha.value = this.reflections ? 0.78 : 1.0;
    this.sky.material.uniforms.uHaze.value = this.haze / 2;
    this.beam.material.opacity = [0.45, 0.35, 0.22][this.haze];
    this.beamMirror.material.opacity = this.reflections ? this.beam.material.opacity * 0.5 : 0;
    this.sunMirror.visible = this.reflections;
  }

  setAnchor(anchor) {
    this.lane.position.set(anchor.x, 0, anchor.z);
    this.gate.position.set(0, anchor.y, -0.45);
    this.floorMat.uniforms.uLaneX.value = anchor.x;
  }

  flashGate(color) { this.gateMat.color.set(color); this.gateMat.opacity = 0.9; }

  update(dt, flow) {
    this.scroll += dt * flow;
    this.floorMat.uniforms.uScroll.value = this.scroll;
    this.gateMat.opacity += (0.22 - this.gateMat.opacity) * Math.min(1, dt * 6);
    this.gateMat.color.lerp(GATE_COLOR, Math.min(1, dt * 4));
  }
}
