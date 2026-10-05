// BOXFLOW — holographic target prefab. One Target instance is pooled and reused.
import * as THREE from 'three';
import { ACTIONS, hex } from './config.js';

const holoVert = /* glsl */`
  varying vec3 vN; varying vec3 vV; varying vec3 vW;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vW = wp.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    vV = normalize(cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const holoFrag = /* glsl */`
  uniform vec3 uColor; uniform float uTime; uniform float uOpacity; uniform float uFlash;
  varying vec3 vN; varying vec3 vV; varying vec3 vW;
  void main() {
    float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
    float scan = 0.55 + 0.45 * sin(vW.y * 90.0 - uTime * 8.0);
    float a = (0.18 + fres * 0.95) * (0.75 + 0.25 * scan);
    vec3 col = mix(uColor, vec3(1.0), fres * 0.35 + uFlash);
    gl_FragColor = vec4(col * (1.0 + uFlash * 2.0), a * uOpacity);
  }`;

let glowTex = null;
export function getGlowTexture() {
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

export function makeTextSprite(text, color = '#ffffff', { size = 64, width = 512, height = 128, scale = 0.32, weight = 800 } = {}) {
  const c = document.createElement('canvas'); c.width = width; c.height = height;
  const g = c.getContext('2d');
  g.font = `${weight} ${size}px "Segoe UI", system-ui, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = color; g.shadowBlur = 18;
  g.fillStyle = color; g.fillText(text, width / 2, height / 2);
  g.shadowBlur = 0; g.fillStyle = '#ffffff'; g.globalAlpha = 0.85; g.fillText(text, width / 2, height / 2);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const s = new THREE.Sprite(mat);
  s.scale.set(scale * (width / height), scale, 1);
  return s;
}

// Chevron arrow shape pointing +Y in its local space.
function chevronGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0, 0.09); s.lineTo(0.08, 0.0); s.lineTo(0.05, 0.0); s.lineTo(0, 0.05);
  s.lineTo(-0.05, 0.0); s.lineTo(-0.08, 0.0); s.closePath();
  return new THREE.ShapeGeometry(s);
}

const shared = {};
function sharedGeo() {
  if (shared.core) return shared;
  shared.core = new THREE.IcosahedronGeometry(0.1, 2);
  shared.ring = new THREE.TorusGeometry(0.16, 0.01, 8, 48);
  shared.ring2 = new THREE.TorusGeometry(0.2, 0.004, 6, 48);
  shared.chevron = chevronGeometry();
  shared.dot = new THREE.CircleGeometry(0.035, 20);
  return shared;
}

export class Target {
  constructor(actionId) {
    const a = ACTIONS[actionId];
    const geo = sharedGeo();
    this.action = a;
    this.color = new THREE.Color(a.color);
    this.group = new THREE.Group();
    this.group.name = `Target_${a.id}`;

    this.coreMat = new THREE.ShaderMaterial({
      vertexShader: holoVert, fragmentShader: holoFrag,
      uniforms: { uColor: { value: this.color }, uTime: { value: 0 }, uOpacity: { value: 1 }, uFlash: { value: 0 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.core = new THREE.Mesh(geo.core, this.coreMat);

    const basic = (op) => new THREE.MeshBasicMaterial({
      color: this.color, transparent: true, opacity: op, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.ringMat = basic(0.95);
    this.ring = new THREE.Mesh(geo.ring, this.ringMat);
    this.ring2Mat = basic(0.5);
    this.ring2 = new THREE.Mesh(geo.ring2, this.ring2Mat);

    // Direction indicator: chevrons for hooks/uppercuts, a bright dot for straights.
    this.markMat = basic(1);
    this.mark = new THREE.Group();
    if (a.arrow === 'fwd') {
      this.mark.add(new THREE.Mesh(geo.dot, this.markMat));
    } else {
      for (let i = 0; i < 2; i++) {
        const m = new THREE.Mesh(geo.chevron, this.markMat);
        m.position.y = -0.03 + i * 0.06;
        this.mark.add(m);
      }
      this.mark.rotation.z = a.arrow === 'up' ? 0 : a.arrow === 'left' ? Math.PI / 2 : -Math.PI / 2;
    }
    this.mark.position.z = 0.11;

    this.glowMat = new THREE.SpriteMaterial({
      map: getGlowTexture(), color: this.color, transparent: true, opacity: 0.55,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.glow = new THREE.Sprite(this.glowMat);
    this.glow.scale.setScalar(0.75);

    this.label = makeTextSprite(a.label, hex(a.color), { scale: 0.09 });
    this.label.position.y = 0.25;

    this.group.add(this.glow, this.core, this.ring, this.ring2, this.mark, this.label);
    this.reset();
  }

  reset() {
    this.active = false;
    this.state = 'idle';   // idle | flying | hit | missed
    this.hitTime = 0;
    this.spawnTime = 0;
    this.deadTime = 0;
    this.group.visible = false;
    this.group.scale.setScalar(1);
    this.coreMat.uniforms.uFlash.value = 0;
    this.setOpacity(1);
  }

  setOpacity(o) {
    this.coreMat.uniforms.uOpacity.value = o;
    this.ringMat.opacity = 0.95 * o;
    this.ring2Mat.opacity = 0.5 * o;
    this.markMat.opacity = o;
    this.glowMat.opacity = 0.55 * o;
    this.label.material.opacity = o;
  }

  setTint(gray) {
    const c = gray ? new THREE.Color(0x555a66) : this.color;
    this.coreMat.uniforms.uColor.value = c;
    this.ringMat.color.copy(c); this.ring2Mat.color.copy(c);
    this.markMat.color.copy(c); this.glowMat.color.copy(c);
  }

  update(t, dt) {
    this.coreMat.uniforms.uTime.value = t;
    this.ring.rotation.z += dt * 1.5;
    this.ring2.rotation.z -= dt * 0.8;
    const pulse = 1 + Math.sin(t * 10) * 0.04;
    this.core.scale.setScalar(pulse);
  }
}
