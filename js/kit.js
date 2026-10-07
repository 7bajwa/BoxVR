// BOXFLOW — shared toolkit handed to every content plugin (scenes / targets / effects) as `ctx.kit`.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let glowTex = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

let darkTex = null;
// Soft black disc — placed behind targets so they pop against bright haze.
export function shadowTexture() {
  if (darkTex) return darkTex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(0,0,0,0.95)');
  grd.addColorStop(0.55, 'rgba(0,0,0,0.6)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  darkTex = new THREE.CanvasTexture(c);
  return darkTex;
}

export function glowSprite(color, scale = 1, opacity = 0.6) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  }));
  s.scale.setScalar(scale);
  return s;
}

export function textSprite(text, color = '#ffffff', { size = 64, width = 512, height = 128, scale = 0.32, weight = 800 } = {}) {
  const c = document.createElement('canvas'); c.width = width; c.height = height;
  const g = c.getContext('2d');
  g.font = `${weight} ${size}px "Segoe UI", system-ui, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 10; g.strokeStyle = 'rgba(0,0,0,0.65)'; g.strokeText(text, width / 2, height / 2);
  g.shadowColor = color; g.shadowBlur = 18;
  g.fillStyle = color; g.fillText(text, width / 2, height / 2);
  g.shadowBlur = 0; g.fillStyle = '#ffffff'; g.globalAlpha = 0.85; g.fillText(text, width / 2, height / 2);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
  s.scale.set(scale * (width / height), scale, 1);
  return s;
}

// Deterministic PRNG so scenes look the same every load.
export function rand(seed = 1) { let s = seed % 2147483647 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

// Gradient sky dome with an optional glow toward a direction.
export function skyDome({ top = 0x02040a, horizon = 0x14385e, glow = 0x66ddff, glowDir = [0, 0.05, -1], glowPower = 6, glowAmount = 0.5, radius = 400 } = {}) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uTop: { value: new THREE.Color(top) }, uHorizon: { value: new THREE.Color(horizon) },
      uGlow: { value: new THREE.Color(glow) }, uDir: { value: new THREE.Vector3(...glowDir).normalize() },
      uPow: { value: glowPower }, uAmt: { value: glowAmount }, uSpread: { value: 0.35 },
    },
    vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
    fragmentShader: `uniform vec3 uTop, uHorizon, uGlow, uDir; uniform float uPow, uAmt, uSpread; varying vec3 vD;
      void main(){ float h = abs(vD.y);
        vec3 c = mix(uHorizon, uTop, smoothstep(0.0, uSpread, h));
        c += uGlow * pow(max(0.0, dot(vD, uDir)), uPow) * uAmt;
        c *= mix(1.0, 0.6, step(vD.y, 0.0));
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), mat);
  m.renderOrder = -10;
  m.frustumCulled = false;
  return m;
}

// Low-poly look: flat-shaded Lambert.
export function flat(color, opts = {}) { return new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts }); }

// Merge many meshes that share one material into a single draw call.
export function mergeByMaterial(meshes) {
  const groups = new Map();
  for (const m of meshes) {
    m.updateMatrixWorld(true);
    const g = m.geometry.clone().applyMatrix4(m.matrixWorld);
    const key = m.material;
    if (!groups.has(key)) groups.set(key, []);
    // normalise attributes so mergeGeometries accepts mixed primitives
    const ng = g.index ? g.toNonIndexed() : g;
    for (const name of Object.keys(ng.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(name)) ng.deleteAttribute(name);
    if (!ng.attributes.uv) ng.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(ng.attributes.position.count * 2), 2));
    if (!ng.attributes.normal) ng.computeVertexNormals();
    groups.get(key).push(ng);
  }
  const out = new THREE.Group();
  for (const [mat, geos] of groups) {
    const withColor = geos.some((g) => g.attributes.color);
    for (const g of geos) {
      if (withColor && !g.attributes.color) {
        const a = new Float32Array(g.attributes.position.count * 3).fill(1);
        g.setAttribute('color', new THREE.Float32BufferAttribute(a, 3));
      } else if (!withColor && g.attributes.color) g.deleteAttribute('color');
    }
    out.add(new THREE.Mesh(mergeGeometries(geos, false), mat));
  }
  return out;
}

// Paint a vertex colour onto a geometry (so merged meshes can keep per-part colours).
export function tint(geometry, color) {
  const c = new THREE.Color(color);
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const n = g.attributes.position.count; const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.Float32BufferAttribute(a, 3));
  return g;
}

const gltf = new GLTFLoader();
const glbCache = new Map();
export function loadGLB(url) {
  if (!glbCache.has(url)) glbCache.set(url, new Promise((res, rej) => gltf.load(url, res, undefined, rej)));
  return glbCache.get(url);
}

export { THREE };

// Free GPU memory of everything under `root` (call from a plugin's dispose()).
export function disposeTree(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) for (const m of [].concat(o.material)) {
      for (const v of Object.values(m)) if (v && v.isTexture && v !== glowTex && v !== darkTex) v.dispose();
      m.dispose();
    }
  });
}

// Simple CPU particle system (additive glowing points). Effects plugins use this.
export function particleSystem(scene, { max = 600, size = 0.035, gravity = -3, drag = 2.5 } = {}) {
  const pos = new Float32Array(max * 3), col = new Float32Array(max * 3), base = new Float32Array(max * 3);
  const vel = new Float32Array(max * 3), life = new Float32Array(max), maxLife = new Float32Array(max), grav = new Float32Array(max);
  let next = 0;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const points = new THREE.Points(geo, new THREE.PointsMaterial({
    size, map: glowTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  }));
  points.frustumCulled = false; points.renderOrder = 8;
  scene.add(points);
  const c = new THREE.Color();
  return {
    points,
    emit(p, n, { color = 0xffffff, speed = [0.8, 3], life: L = [0.5, 0.9], up = 0, back = -1, whiten = 0.5, g = gravity } = {}) {
      c.set(color);
      for (let k = 0; k < n; k++) {
        const i = next; next = (next + 1) % max;
        pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
        const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
        const sp = speed[0] + Math.random() * (speed[1] - speed[0]);
        vel[i * 3] = Math.sin(ph) * Math.cos(th) * sp;
        vel[i * 3 + 1] = Math.sin(ph) * Math.sin(th) * sp + up;
        vel[i * 3 + 2] = Math.cos(ph) * sp + back;
        const m = Math.random() * whiten;
        base[i * 3] = c.r + (1 - c.r) * m; base[i * 3 + 1] = c.g + (1 - c.g) * m; base[i * 3 + 2] = c.b + (1 - c.b) * m;
        life[i] = maxLife[i] = L[0] + Math.random() * (L[1] - L[0]);
        grav[i] = g;
      }
    },
    update(dt) {
      for (let i = 0; i < max; i++) {
        if (life[i] > 0) {
          life[i] -= dt;
          const k = Math.max(0, life[i] / maxLife[i]);
          vel[i * 3 + 1] += grav[i] * dt;
          for (let a = 0; a < 3; a++) {
            vel[i * 3 + a] *= 1 - drag * dt;
            pos[i * 3 + a] += vel[i * 3 + a] * dt;
            col[i * 3 + a] = base[i * 3 + a] * k;
          }
        } else if (col[i * 3] !== 0 || col[i * 3 + 1] !== 0) { col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0; }
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    },
    dispose() { scene.remove(points); geo.dispose(); points.material.dispose(); },
  };
}

// Expanding shockwave rings that face the camera.
export function ringPool(scene, n = 8, { inner = 0.9 } = {}) {
  const geo = new THREE.RingGeometry(inner, 1.0, 48);
  const rings = [];
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
    m.visible = false; m.renderOrder = 8; m.userData.life = 0; scene.add(m); rings.push(m);
  }
  return {
    fire(p, color, { life = 0.35, from = 0.08, to = 0.55 } = {}) {
      const r = rings.find((x) => x.userData.life <= 0) || rings[0];
      r.position.copy(p); r.material.color.set(color); Object.assign(r.userData, { life, max: life, from, to }); r.visible = true;
    },
    update(dt, camera) {
      for (const r of rings) if (r.userData.life > 0) {
        r.userData.life -= dt;
        const p = 1 - r.userData.life / r.userData.max;
        r.scale.setScalar(r.userData.from + p * (r.userData.to - r.userData.from));
        r.material.opacity = (1 - p) * 0.9;
        r.lookAt(camera.position);
        if (r.userData.life <= 0) r.visible = false;
      }
    },
    dispose() { for (const r of rings) { scene.remove(r); r.material.dispose(); } geo.dispose(); },
  };
}
