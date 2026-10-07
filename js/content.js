// BOXFLOW — content system. Everything playable lives in /content:
//   content/registry.json          ← lists the ids below (static hosting can't list folders)
//   content/scenes/<id>/scene.json  (+ scene.js module and/or a .glb model)
//   content/targets/<id>/target.json (+ target.js module and/or a .glb model)
//   content/effects/<id>/effect.json (+ effect.js)
//   content/songs/<id>/song.json    (procedural synth song, or an audio file + bpm)
//   content/levels/<id>.json        (song + scene + target + effect + charts per difficulty)
// Custom levels made in the Level Creator are stored on the device (localStorage + IndexedDB).
import * as THREE from 'three';
import * as kit from './kit.js';
import { idbGet } from './storage.js';

const BASE = new URL('../content/', import.meta.url);
const url = (p) => new URL(p, BASE).href;

async function json(path) {
  const r = await fetch(url(path), { cache: 'no-cache' });
  if (!r.ok) throw new Error(`Missing ${path} (${r.status})`);
  return r.json();
}

let registry = null;
export async function loadRegistry() {
  registry ||= await json('registry.json');
  return registry;
}

const cache = new Map();
function once(key, fn) { if (!cache.has(key)) cache.set(key, fn().catch((e) => { cache.delete(key); throw e; })); return cache.get(key); }

// A plugin folder: meta json + optional JS module (default export) + optional GLB.
async function plugin(kind, id) {
  return once(`${kind}:${id}`, async () => {
    const dir = `${kind}s/${id}/`;
    const meta = { id, ...(await json(`${dir}${kind}.json`)) };
    meta.baseUrl = url(dir);
    let mod = null;
    if (meta.module) mod = (await import(url(dir + meta.module))).default;
    if (meta.glb) meta.glbUrl = url(dir + meta.glb);
    return { meta, mod };
  });
}

export const loadScene = (id) => plugin('scene', id);
export const loadTarget = (id) => plugin('target', id);
export const loadEffect = (id) => plugin('effect', id);

export function loadSong(id) {
  return once(`song:${id}`, async () => {
    const song = { id, ...(await json(`songs/${id}/song.json`)) };
    if (song.type === 'audio') song.audioUrl = url(`songs/${id}/${song.file}`);
    return song;
  });
}

export async function loadLevel(id) {
  if (id.startsWith('custom:')) return loadCustomLevel(id.slice(7));
  return once(`level:${id}`, async () => ({ id, ...(await json(`levels/${id}.json`)) }));
}

export async function listLevels() {
  const reg = await loadRegistry();
  const out = [];
  for (const id of reg.levels) {
    try {
      const lvl = await loadLevel(id);
      const song = lvl.song ? await loadSong(lvl.song) : null;
      out.push({ ...lvl, songInfo: song });
    } catch (e) { console.warn('level', id, e); }
  }
  for (const c of customLevels()) out.push({ ...c, id: 'custom:' + c.id, custom: true });
  return out;
}

// ---- custom levels (from the Level Creator) ----
export function customLevels() {
  try { return JSON.parse(localStorage.getItem('boxflow.customLevels') || '[]'); } catch { return []; }
}
async function loadCustomLevel(id) {
  const lvl = customLevels().find((l) => l.id === id);
  if (!lvl) throw new Error('Custom level not found: ' + id);
  const out = { ...lvl, id: 'custom:' + id, custom: true };
  if (lvl.audio && lvl.audio.idbKey) {
    const blob = await idbGet(lvl.audio.idbKey);
    if (blob) out.audio = { ...lvl.audio, blob };
  }
  return out;
}

// Song description for a level: either a registry song or inline/custom audio.
export async function songForLevel(level) {
  if (level.song) { const s = await loadSong(level.song); return level.bpmOverride ? { ...s, bpm: level.bpmOverride } : s; }
  if (level.audio) {
    const a = level.audio;
    return {
      id: level.id, name: level.name, type: 'audio', bpm: a.bpm, offset: a.offset || 0,
      audioUrl: a.blob ? URL.createObjectURL(a.blob) : (a.file ? url(`levels/${a.file}`) : null),
      sections: a.sections,
    };
  }
  throw new Error('Level has no song');
}

// Context handed to plugins.
export function pluginContext(extra = {}) {
  return { THREE, kit, ...extra };
}

// Generic GLB scene/target support (no JS module needed).
export async function glbObject(meta) {
  const g = await kit.loadGLB(meta.glbUrl);
  const obj = g.scene.clone(true);
  if (meta.scale) obj.scale.setScalar(meta.scale);
  if (meta.position) obj.position.fromArray(meta.position);
  if (meta.rotationY) obj.rotation.y = meta.rotationY;
  return { obj, animations: g.animations };
}
