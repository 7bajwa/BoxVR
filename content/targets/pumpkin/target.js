// Jack-o'-Lantern — low-poly ribbed pumpkin with a glowing carved face. The inner light takes
// the action colour so each move is still recognisable.
export default {
  create({ THREE, kit, color }) {
    const geo = new THREE.SphereGeometry(0.13, 14, 9);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = 0.9 + 0.1 * Math.abs(Math.cos(4 * Math.atan2(z, x)));
      p.setXYZ(i, x * k * 1.08, y * 0.8, z * k);
    }
    geo.computeVertexNormals();
    const shell = new THREE.MeshLambertMaterial({ color: 0xe0670f, emissive: 0x5a1e00, flatShading: true });
    const body = new THREE.Mesh(geo, shell);
    const faceCol = new THREE.Color(0xffd040).lerp(color, 0.35);
    const face = new THREE.MeshBasicMaterial({ color: faceCol });
    const eye = (cx) => { const s = new THREE.Shape(); s.moveTo(cx - 0.035, 0.0); s.lineTo(cx + 0.035, 0.0); s.lineTo(cx, 0.05); s.closePath(); return s; };
    const mouth = new THREE.Shape();
    mouth.moveTo(-0.075, -0.03); mouth.lineTo(-0.045, -0.05); mouth.lineTo(-0.025, -0.03); mouth.lineTo(0, -0.055);
    mouth.lineTo(0.025, -0.03); mouth.lineTo(0.045, -0.05); mouth.lineTo(0.075, -0.03); mouth.lineTo(0.045, -0.085); mouth.lineTo(-0.045, -0.085); mouth.closePath();
    const faceMesh = new THREE.Mesh(new THREE.ShapeGeometry([eye(-0.045), eye(0.045), mouth]), face);
    faceMesh.position.set(0, 0.02, 0.128);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, 0.06, 5), new THREE.MeshLambertMaterial({ color: 0x4a5a1a, flatShading: true }));
    stem.position.y = 0.12; stem.rotation.z = 0.25;
    const light = kit.glowSprite(color.clone().lerp(new THREE.Color(0xff9a20), 0.5), 0.45, 0.6);
    light.position.z = 0.1;
    const object = new THREE.Group(); object.add(body, faceMesh, stem, light);
    const base = faceCol.clone();
    return {
      object,
      update(t) { face.color.copy(base).multiplyScalar(0.85 + 0.15 * Math.sin(t * 17) * Math.sin(t * 7)); object.rotation.z = Math.sin(t * 3) * 0.06; },
      flash(v) { shell.emissive.setRGB(0.35 + v * 0.6, 0.12 + v * 0.3, 0); object.scale.setScalar(1 + v * 0.15); },
      tint(gray) { shell.color.set(gray ? 0x55504a : 0xe0670f); shell.emissive.set(gray ? 0x000000 : 0x5a1e00); },
    };
  },
};
