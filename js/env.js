// BOXFLOW — scene setup: dark holographic arena, scrolling grid floor, straight lane, hit zone.
import * as THREE from 'three';

const GATE_COLOR = new THREE.Color(0x8ff6ff);
const gridVert = /* glsl */`
  varying vec3 vW;
  void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const gridFrag = /* glsl */`
  uniform float uScroll; uniform vec3 uColor; uniform vec3 uLane;
  varying vec3 vW;
  float line(float x, float w) { float f = abs(fract(x) - 0.5); return smoothstep(w, 0.0, 0.5 - f); }
  void main() {
    float gx = line(vW.x, 0.03);
    float gz = line(vW.z + uScroll, 0.03);
    float g = max(gx, gz);
    float dist = length(vW.xz);
    float fade = exp(-dist * 0.09);
    float lane = smoothstep(0.55, 0.45, abs(vW.x)) * step(vW.z, 0.2);
    vec3 col = uColor * g * fade * 0.9 + uLane * lane * 0.08 * (0.6 + 0.4 * line(vW.z * 0.5 + uScroll * 0.5, 0.12));
    gl_FragColor = vec4(col, 1.0);
  }`;

export class Environment {
  constructor(scene) {
    this.scene = scene;
    scene.background = new THREE.Color(0x05060d);
    scene.fog = new THREE.Fog(0x05060d, 8, 30);

    // Sky dome gradient
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(60, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, fog: false,
        vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
        fragmentShader: `varying vec3 vP; void main(){ float h = normalize(vP).y;
          vec3 top = vec3(0.01,0.01,0.04); vec3 hor = vec3(0.10,0.02,0.16); vec3 glow = vec3(0.0,0.35,0.5);
          vec3 c = mix(hor, top, smoothstep(0.0, 0.5, h));
          c += glow * exp(-abs(h) * 14.0) * 0.6;
          gl_FragColor = vec4(c, 1.0); }`,
      }),
    );
    scene.add(sky);

    // Stars
    const n = 900, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random() * 0.95);
      const r = 50;
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = r * Math.cos(ph);
      pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0x9fb4ff, size: 0.12, fog: false })));

    // Grid floor
    this.gridMat = new THREE.ShaderMaterial({
      vertexShader: gridVert, fragmentShader: gridFrag,
      uniforms: { uScroll: { value: 0 }, uColor: { value: new THREE.Color(0x1a8cff) }, uLane: { value: new THREE.Color(0x46e0ff) } },
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), this.gridMat);
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    // Lane group (positioned relative to the player anchor)
    this.lane = new THREE.Group();
    scene.add(this.lane);
    const railMat = new THREE.MeshBasicMaterial({ color: 0x46e0ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    for (const x of [-0.5, 0.5]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 16), railMat);
      rail.position.set(x, 0.01, -8);
      this.lane.add(rail);
    }

    // Hit-zone frame: vertical gate the targets fly into.
    this.gate = new THREE.Group();
    const gateMat = new THREE.LineBasicMaterial({ color: 0x8ff6ff, transparent: true, opacity: 0.35 });
    const w = 0.55, h0 = -0.55, h1 = 0.25; // relative to head height
    const pts = [[-w, h0], [w, h0], [w, h1], [-w, h1], [-w, h0]].map(([x, y]) => new THREE.Vector3(x, y, 0));
    this.gate.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gateMat));
    this.gateMat = gateMat;
    this.lane.add(this.gate);

    // Arches flowing toward the player for a sense of motion.
    this.arches = [];
    const archGeo = new THREE.TorusGeometry(1.6, 0.012, 6, 64, Math.PI);
    const archMat = new THREE.MeshBasicMaterial({ color: 0x7a3cff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 8; i++) {
      const a = new THREE.Mesh(archGeo, archMat.clone());
      a.position.z = -2 - i * 2.5;
      this.lane.add(a); this.arches.push(a);
    }

    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    this.scroll = 0;
  }

  setAnchor(anchor) {
    this.lane.position.set(anchor.x, 0, anchor.z);
    this.gate.position.set(0, anchor.y, -0.45);
  }

  flashGate(color) {
    this.gateMat.color.set(color);
    this.gateMat.opacity = 1;
  }

  update(dt, flow) {
    this.scroll += dt * flow;
    this.gridMat.uniforms.uScroll.value = this.scroll;
    for (const a of this.arches) {
      a.position.z += dt * flow;
      if (a.position.z > 0) a.position.z -= 20;
      const d = -a.position.z;
      a.material.opacity = Math.min(0.6, d / 4) * Math.min(1, (20 - d) / 6);
    }
    this.gateMat.opacity += (0.35 - this.gateMat.opacity) * Math.min(1, dt * 6);
    this.gateMat.color.lerp(GATE_COLOR, Math.min(1, dt * 4));
  }
}
