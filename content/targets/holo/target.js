// Holo Core — holographic fresnel sphere with scanlines (the classic BOXFLOW target).
// Target plugin contract: create(ctx) → { object, update?(t, dt), flash?(v), tint?(gray), dispose? }
// ctx = { THREE, kit, action, color (THREE.Color), meta }. Create materials per instance.
export default {
  create({ THREE, color }) {
    const GRAY = new THREE.Color(0x4a505c);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: color.clone() }, uTime: { value: 0 }, uOpacity: { value: 1 }, uFlash: { value: 0 } },
      vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vW;
        void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
          vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform vec3 uColor; uniform float uTime, uOpacity, uFlash; varying vec3 vN; varying vec3 vV; varying vec3 vW;
        void main(){ float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
          float scan = 0.55 + 0.45 * sin(vW.y * 90.0 - uTime * 8.0);
          float a = (0.3 + fres * 0.95) * (0.75 + 0.25 * scan);
          vec3 col = mix(uColor, vec3(1.0), fres * 0.35 + uFlash);
          gl_FragColor = vec4(col * (1.2 + uFlash * 2.0), a * uOpacity); }`,
    });
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 2), mat);
    const inner = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.004, 6, 48), new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
    const object = new THREE.Group(); object.add(core, inner);
    return {
      object,
      update(t, dt) { mat.uniforms.uTime.value = t; mat.uniforms.uOpacity.value = mat.opacity; core.scale.setScalar(1 + Math.sin(t * 10) * 0.04); inner.rotation.z -= dt * 0.8; },
      flash(v) { mat.uniforms.uFlash.value = v; },
      tint(gray) { mat.uniforms.uColor.value.copy(gray ? GRAY : color); },
    };
  },
};
