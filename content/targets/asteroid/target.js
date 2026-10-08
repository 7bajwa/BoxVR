// Asteroid — low-poly space rock tumbling toward your ship. Most are grey rock with glowing
// cracks in the hand colour; some are golden, some are bright gem-orbs (same rules, more sparkle).
export default {
  create({ THREE, kit, color }) {
    const roll = Math.random();
    const kind = roll < 0.18 ? 'gold' : roll < 0.3 ? 'gem' : 'rock';
    const geo = new THREE.IcosahedronGeometry(0.13, 1);
    const p = geo.attributes.position;
    const seed = Math.random() * 10;
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i));
      const n = 0.82 + 0.28 * Math.abs(Math.sin(v.x * 23 + seed) * Math.cos(v.y * 19 - seed) + Math.sin(v.z * 17));
      v.multiplyScalar(Math.min(1.15, n));
      p.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    let mat;
    if (kind === 'gold') mat = new THREE.MeshLambertMaterial({ color: 0xffc23a, emissive: 0x5a3800, flatShading: true });
    else if (kind === 'gem') mat = new THREE.MeshLambertMaterial({ color: color.clone().lerp(new THREE.Color(0xffffff), 0.3), emissive: color.clone().multiplyScalar(0.6), flatShading: true });
    else mat = new THREE.MeshLambertMaterial({ color: 0x7c7488, emissive: 0x15101e, flatShading: true });
    const rock = new THREE.Mesh(geo, mat);
    const cracks = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), new THREE.LineBasicMaterial({ color, transparent: true, opacity: kind === 'rock' ? 0.9 : 0.5 }));
    const object = new THREE.Group(); object.add(rock, cracks);
    if (kind !== 'rock') { const s = kit.glowSprite(kind === 'gold' ? 0xffd27a : color, 0.55, 0.55); object.add(s); }
    const spin = new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3);
    const base = mat.emissive.clone();
    return {
      object,
      update(t, dt) { rock.rotation.x += spin.x * dt; rock.rotation.y += spin.y * dt; rock.rotation.z += spin.z * dt; cracks.rotation.copy(rock.rotation); },
      flash(v) { mat.emissive.copy(base).lerp(new THREE.Color(0xffffff), v * 0.8); },
      tint(gray) { if (gray) mat.emissive.set(0x050505); else mat.emissive.copy(base); },
    };
  },
};
