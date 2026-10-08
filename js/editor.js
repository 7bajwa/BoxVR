// BOXFLOW Level Creator — place targets on the beats of a song, per difficulty.
// Songs: any procedural song from content/songs, or your own CC0 audio file (+ BPM/offset).
// Output: a level JSON (Export) or a custom level saved on this device (Save & Test).
import { ACTIONS, SEQUENCE, DIFFICULTIES, hex } from './config.js';
import { AudioEngine, songDuration, songPlan } from './audio.js';
import { buildChart, buildHurdles } from './charts.js';
import { loadRegistry, loadScene, loadSong, loadLevel, customLevels } from './content.js';
import { idbSet, idbGet } from './storage.js';

const $ = (id) => document.getElementById(id);
// Punch lanes + 3 hurdle lanes (H:duck, H:left = wall on the left -> move right, H:right).
const PUNCH = ['L_UPPER', 'L_HOOK', 'JAB', 'CROSS', 'R_HOOK', 'R_UPPER'];
const HURDLE = { 'H:duck': { label: 'DUCK', key: 'C', color: 0xffb35f }, 'H:left': { label: 'WALL ◀', key: 'Q', color: 0xff8a3c }, 'H:right': { label: 'WALL ▶', key: 'E', color: 0xff8a3c } };
const LANES = [...PUNCH, ...Object.keys(HURDLE)];
const isHurdle = (a) => a.startsWith('H:');
const laneInfo = (id) => (isHurdle(id) ? HURDLE[id] : ACTIONS[id]);
const KEY = Object.fromEntries(LANES.map((id) => [laneInfo(id).key.toLowerCase(), id]));

const audio = new AudioEngine();
const st = {
  id: null, name: 'My Level', scene: 'neon-city', target: 'holo', effect: 'neon-burst',
  songId: null, song: null,            // registry song
  audioFile: null, buffer: null,       // custom audio
  bpm: 120, offset: 0,
  diff: 'normal',
  charts: Object.fromEntries(DIFFICULTIES.map((d) => [d, []])), // [{ b, a }]
  grid: 0.5, zoom: 70, view: 0,        // first visible beat
  playing: false, t0: 0, startBeat: 0, recording: false, beat: 0,
};

// ---------------------------------------------------------------- setup
async function init() {
  const reg = await loadRegistry();
  for (const id of reg.scenes) { try { const { meta } = await loadScene(id); opt($('scene'), id, meta.name); } catch { /* */ } }
  for (const id of reg.targets) opt($('target'), id, id);
  for (const id of reg.effects) opt($('effect'), id, id);
  opt($('song'), '', '— custom audio file —');
  for (const id of reg.songs) { try { const s = await loadSong(id); opt($('song'), id, `${s.name} (${s.bpm} BPM)`); } catch { /* */ } }
  refreshOpenList(reg);

  DIFFICULTIES.forEach((d) => {
    const b = document.createElement('button'); b.textContent = d.toUpperCase(); b.dataset.d = d;
    b.onclick = () => { st.diff = d; ui(); };
    $('diffTabs').appendChild(b);
  });

  bind();
  await selectSong(reg.songs[0]);
  ui();
  requestAnimationFrame(loop);
}

function opt(sel, value, text) { const o = document.createElement('option'); o.value = value; o.textContent = text; sel.appendChild(o); }

function refreshOpenList(reg) {
  const sel = $('openSel');
  sel.innerHTML = '';
  opt(sel, '', 'Open level…');
  for (const id of reg.levels) opt(sel, id, `★ ${id}`);
  for (const c of customLevels()) opt(sel, 'custom:' + c.id, `✎ ${c.name}`);
}

function bind() {
  $('name').oninput = (e) => { st.name = e.target.value; };
  $('scene').onchange = (e) => { st.scene = e.target.value; };
  $('target').onchange = (e) => { st.target = e.target.value; };
  $('effect').onchange = (e) => { st.effect = e.target.value; };
  $('song').onchange = (e) => (e.target.value ? selectSong(e.target.value) : null);
  $('audioFile').onchange = (e) => e.target.files[0] && loadAudioFile(e.target.files[0]);
  $('bpm').onchange = (e) => { st.bpm = Math.max(40, Math.min(240, Number(e.target.value) || 120)); ui(); };
  $('offset').onchange = (e) => { st.offset = Number(e.target.value) || 0; ui(); };
  $('nudgeL').onclick = () => { st.offset = +(st.offset - 0.01).toFixed(3); ui(); };
  $('nudgeR').onclick = () => { st.offset = +(st.offset + 0.01).toFixed(3); ui(); };
  $('tapBtn').onclick = tap;
  $('grid').onchange = (e) => { st.grid = Number(e.target.value); };
  $('zoom').oninput = (e) => { st.zoom = Number(e.target.value); };
  $('autoBtn').onclick = autoFill;
  $('clearBtn').onclick = () => { if (confirm(`Clear all ${st.diff} targets?`)) { st.charts[st.diff] = []; ui(); } };
  $('playBtn').onclick = () => (st.playing ? pause() : play());
  $('stopBtn').onclick = () => { pause(); st.beat = 0; st.view = 0; ui(); };
  $('recBtn').onclick = () => { st.recording = !st.recording; if (st.recording && !st.playing) play(); ui(); };
  $('newBtn').onclick = newLevel;
  $('openSel').onchange = (e) => e.target.value && openLevel(e.target.value);
  $('importFile').onchange = (e) => e.target.files[0] && importJSON(e.target.files[0]);
  $('exportBtn').onclick = exportJSON;
  $('testBtn').onclick = saveAndTest;

  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    const k = e.key.toLowerCase();
    if (k === ' ') { e.preventDefault(); st.playing ? pause() : play(); return; }
    if (e.repeat) return;
    if (!st.playing || !st.recording) return;
    if (KEY[k]) { placeAt(currentBeat(), KEY[k]); flashLane(KEY[k]); }
    if (k === 'enter') placeAt(currentBeat(), null);
  });

  const cv = $('timeline');
  let drag = null;
  cv.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, view: st.view, moved: false }; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (Math.abs(dx) > 4) drag.moved = true;
    if (drag.moved) st.view = Math.max(-1, drag.view - dx / st.zoom);
  });
  cv.addEventListener('pointerup', (e) => { if (drag && !drag.moved) click(e); drag = null; });
  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (e.ctrlKey) st.zoom = Math.max(20, Math.min(200, st.zoom * (e.deltaY > 0 ? 0.9 : 1.1)));
    else st.view = Math.max(-1, st.view + (e.deltaY + e.deltaX) / st.zoom);
    $('zoom').value = st.zoom;
  }, { passive: false });
}

// ---------------------------------------------------------------- songs
async function selectSong(id) {
  pause();
  const s = await loadSong(id);
  st.songId = id; st.song = s; st.audioFile = null; st.buffer = null;
  st.bpm = s.bpm; st.offset = s.offset || 0;
  if (s.type === 'audio') { st.buffer = await audio.loadBuffer(s.audioUrl); }
  $('song').value = id;
  $('audioInfo').textContent = s.type === 'synth' ? `Procedural song · ${fmt(songDuration(s))} · ${songPlan(s).bars.length} bars` : `${s.file}`;
  ui();
}

async function loadAudioFile(file) {
  pause();
  audio.ensure();
  const buf = await audio.ctx.decodeAudioData(await file.arrayBuffer());
  st.audioFile = file; st.buffer = buf; st.songId = null; st.song = null;
  $('song').value = '';
  $('audioInfo').textContent = `${file.name} · ${fmt(buf.duration)} — set the BPM (Tap) and offset`;
  ui();
}

function duration() {
  if (st.buffer) return st.buffer.duration;
  if (st.song) return songDuration(st.song);
  return 120;
}
const spb = () => 60 / st.bpm;
const totalBeats = () => Math.ceil((duration() - st.offset) / spb());

let taps = [];
function tap() {
  const t = performance.now() / 1000;
  if (taps.length && t - taps[taps.length - 1] > 2) taps = [];
  taps.push(t);
  if (taps.length >= 4) {
    const iv = (taps[taps.length - 1] - taps[0]) / (taps.length - 1);
    st.bpm = Math.round((60 / iv) * 10) / 10; ui();
  }
  $('tapBtn').textContent = `Tap (${taps.length})`;
}

// ---------------------------------------------------------------- playback
async function play() {
  await audio.resume();
  const startBeat = Math.max(0, st.beat);
  const now = audio.ctx.currentTime + 0.05;
  st.t0 = now - startBeat * spb() - st.offset;  // clock time of audio position 0
  if (st.song && st.song.type === 'synth') {
    audio.playSynth({ ...st.song, bpm: st.bpm }, { mode: 'song', t0: now - startBeat * spb(), spb: spb(), fromBeat: startBeat });
    st.t0 = now - startBeat * spb() - st.offset;
  } else if (st.buffer) {
    audio.playBuffer(st.buffer, now, Math.max(0, startBeat * spb() + st.offset));
  }
  audio.onSongEnd = () => pause();
  st.playing = true; st.metroNext = Math.ceil(startBeat);
  ui();
}
function pause() {
  if (!st.playing) return;
  st.beat = currentBeat();
  audio.stopSong(); audio.onSongEnd = null;
  st.playing = false; ui();
}
function currentBeat() {
  if (!st.playing) return st.beat;
  return (audio.ctx.currentTime - st.t0 - st.offset) / spb();
}

// ---------------------------------------------------------------- editing
const snap = (b) => Math.round(b / st.grid) * st.grid;
function notes() { return st.charts[st.diff]; }
function sortNotes() { notes().sort((a, b) => a.b - b.b); }

function nextComboAction(beat) {
  const before = notes().filter((n) => n.b < beat && !isHurdle(n.a));
  if (!before.length) return SEQUENCE[0];
  const last = before[before.length - 1].a;
  return SEQUENCE[(SEQUENCE.indexOf(last) + 1) % SEQUENCE.length];
}

function placeAt(beat, action) {
  const b = snap(beat);
  if (b < 0) return;
  const list = notes();
  const hz = !!(action && isHurdle(action));
  const existing = list.findIndex((n) => Math.abs(n.b - b) < 1e-6 && isHurdle(n.a) === hz);
  if (existing >= 0) list.splice(existing, 1);
  list.push({ b, a: action || nextComboAction(b) });
  sortNotes();
  if ($('seqOrder').checked && !(action && isHurdle(action))) renumber();
  ui();
}

// Keep the combo order intact after inserts/removals.
function renumber() { let i = 0; for (const n of notes()) if (!isHurdle(n.a)) n.a = SEQUENCE[i++ % SEQUENCE.length]; }

function autoFill() {
  const mode = $('autoMode').value;
  const songLike = st.song ? { ...st.song, bpm: st.bpm } : { type: 'audio', bpm: st.bpm, duration: duration() - st.offset };
  const chart = buildChart({ charts: { [st.diff]: { auto: mode === 'dynamic' ? 'dynamic' : Number(mode) } } }, songLike, st.diff);
  const hurdles = buildHurdles({}, songLike, st.diff, chart);   // also suggests hurdles (edit freely)
  st.charts[st.diff] = [...chart.map((n) => ({ b: n.beat, a: n.action })), ...hurdles.map((h) => ({ b: h.beat, a: 'H:' + h.type }))].sort((x, y) => x.b - y.b);
  ui();
}

// ---------------------------------------------------------------- level IO
function levelJSON(forDevice = false) {
  const charts = {};
  for (const d of DIFFICULTIES) {
    charts[d] = { notes: st.charts[d].filter((n) => !isHurdle(n.a)).map((n) => [n.b, n.a]) };
    const h = st.charts[d].filter((n) => isHurdle(n.a)).map((n) => [n.b, n.a.slice(2)]);
    if (h.length) charts[d].hurdles = h;
  }
  const lvl = { name: st.name, scene: st.scene, target: st.target, effect: st.effect, charts };
  if (st.songId && !st.audioFile) lvl.song = st.songId;
  else lvl.audio = { file: st.audioFile ? st.audioFile.name : 'song.ogg', bpm: st.bpm, offset: st.offset, ...(forDevice ? { idbKey: 'audio:' + st.id } : {}) };
  if (st.songId && st.bpm !== st.song.bpm) lvl.bpmOverride = st.bpm;
  return lvl;
}

function applyLevel(lvl, songObj) {
  st.name = lvl.name || 'Level'; st.scene = lvl.scene || st.scene; st.target = lvl.target || st.target; st.effect = lvl.effect || st.effect;
  for (const d of DIFFICULTIES) {
    const spec = lvl.charts && lvl.charts[d];
    if (spec && spec.notes) st.charts[d] = [...spec.notes.map(([b, a], i) => ({ b, a: a || SEQUENCE[i % SEQUENCE.length] })),
      ...(spec.hurdles || []).map(([b, type]) => ({ b, a: 'H:' + type }))].sort((x, y) => x.b - y.b);
    else if (songObj) st.charts[d] = buildChart(lvl, songObj, d).map((n) => ({ b: n.beat, a: n.action }));
    else st.charts[d] = [];
  }
}

function newLevel() {
  pause();
  st.id = null; st.name = 'My Level';
  for (const d of DIFFICULTIES) st.charts[d] = [];
  st.beat = 0; st.view = 0; ui();
}

async function openLevel(id) {
  pause();
  const lvl = await loadLevel(id);
  st.id = id.startsWith('custom:') ? id.slice(7) : null;
  if (lvl.song) {
    await selectSong(lvl.song);
    applyLevel(lvl, st.song);
  } else if (lvl.audio) {
    st.bpm = lvl.audio.bpm; st.offset = lvl.audio.offset || 0;
    const blob = lvl.audio.blob || (lvl.audio.idbKey && await idbGet(lvl.audio.idbKey));
    if (blob) await loadAudioFile(new File([blob], lvl.audio.file || 'audio'));
    applyLevel(lvl, null);
  }
  $('openSel').value = '';
  ui();
}

async function importJSON(file) {
  const lvl = JSON.parse(await file.text());
  if (lvl.song) { await selectSong(lvl.song); applyLevel(lvl, st.song); }
  else { if (lvl.audio) { st.bpm = lvl.audio.bpm; st.offset = lvl.audio.offset || 0; } applyLevel(lvl, null); $('audioInfo').textContent = 'Now load the audio file this level uses.'; }
  ui();
}

function slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'level'; }

function exportJSON() {
  const blob = new Blob([JSON.stringify(levelJSON(false), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = slug(st.name) + '.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function saveAndTest() {
  if (!notes().length && !DIFFICULTIES.some((d) => st.charts[d].length)) { alert('Place some targets first (or use Auto-fill).'); return; }
  st.id ||= slug(st.name) + '-' + Date.now().toString(36);
  const lvl = { id: st.id, ...levelJSON(true) };
  if (st.audioFile) await idbSet('audio:' + st.id, st.audioFile);
  const list = customLevels().filter((l) => l.id !== st.id);
  list.push(lvl);
  localStorage.setItem('boxflow.customLevels', JSON.stringify(list));
  refreshOpenList(await loadRegistry());
  // remember difficulty so the game opens on the one being edited
  try { const p = JSON.parse(localStorage.getItem('boxflow.prefs') || '{}'); p.difficulty = st.diff; localStorage.setItem('boxflow.prefs', JSON.stringify(p)); } catch { /* */ }
  window.open(`index.html?level=custom:${st.id}`, '_blank');
}

// ---------------------------------------------------------------- timeline
const cv = $('timeline');
const g = cv.getContext('2d');
const LABEL_W = 120, RULER_H = 34, BAND_H = 12;
let laneFlash = {};
function flashLane(id) { laneFlash[id] = performance.now(); }

function layout() {
  const r = cv.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  if (cv.width !== Math.round(r.width * dpr) || cv.height !== Math.round(r.height * dpr)) {
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
  }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { W: r.width, H: r.height, laneH: Math.max(36, (r.height - RULER_H - BAND_H - 10) / LANES.length) };
}

const xOf = (b, W) => LABEL_W + (b - st.view) * st.zoom;

function click(e) {
  const r = cv.getBoundingClientRect();
  const x = e.clientX - r.left, y = e.clientY - r.top;
  const { laneH } = layout();
  const beat = (x - LABEL_W) / st.zoom + st.view;
  if (x < LABEL_W) return;
  if (y < RULER_H + BAND_H) { st.beat = Math.max(0, beat); if (st.playing) { pause(); play(); } return; }
  const lane = Math.floor((y - RULER_H - BAND_H) / laneH);
  if (lane < 0 || lane >= LANES.length) return;
  const b = snap(beat);
  const hurdleLane = isHurdle(LANES[lane]);
  const hit = notes().findIndex((n) => Math.abs(n.b - b) < st.grid / 2 && (n.a === LANES[lane] || (!hurdleLane && !isHurdle(n.a) && $('seqOrder').checked)));
  if (hit >= 0) { notes().splice(hit, 1); if ($('seqOrder').checked) renumber(); ui(); }
  else placeAt(beat, LANES[lane]);
}

function draw() {
  const { W, H, laneH } = layout();
  g.clearRect(0, 0, W, H);
  g.fillStyle = '#070b16'; g.fillRect(0, 0, W, H);
  const beats = totalBeats();
  const first = Math.floor(st.view), last = Math.ceil(st.view + (W - LABEL_W) / st.zoom);

  // section bands (synth songs)
  if (st.song && st.song.type === 'synth') {
    const bars = songPlan(st.song).bars;
    for (let i = Math.max(0, Math.floor(first / 4)); i < Math.min(bars.length, last / 4 + 1); i++) {
      const it = bars[i].intensity;
      g.fillStyle = ['#1d2a4a', '#2c4f7a', '#5fe8ff'][Math.min(2, it)];
      g.globalAlpha = it === 2 ? 0.5 : 0.8;
      g.fillRect(xOf(i * 4, W), RULER_H, 4 * st.zoom - 1, BAND_H);
      g.globalAlpha = 1;
      if (bars[i].barInSection === 0) { g.fillStyle = '#8ea2c9'; g.font = '600 11px Rajdhani'; g.fillText(bars[i].section, xOf(i * 4, W) + 3, RULER_H - 4); }
    }
  }
  // waveform (audio files)
  if (st.buffer && !st.song) drawWave(W, laneH);

  // grid
  for (let b = Math.max(0, first); b <= Math.min(beats, last); b += st.grid) {
    const x = xOf(b, W);
    const bar = b % 4 === 0, whole = Math.abs(b - Math.round(b)) < 1e-6;
    g.fillStyle = bar ? 'rgba(150,190,255,0.35)' : whole ? 'rgba(150,190,255,0.14)' : 'rgba(150,190,255,0.05)';
    g.fillRect(x, RULER_H + BAND_H, 1, H);
    if (bar) { g.fillStyle = '#c9d6f5'; g.font = '700 12px Rajdhani'; g.fillText(String(b / 4 + 1), x + 3, 14); }
  }
  g.fillStyle = 'rgba(255,77,106,0.5)'; const endX = xOf(beats, W); g.fillRect(endX, RULER_H, 2, H);

  // lanes
  LANES.forEach((id, i) => {
    const a = laneInfo(id), y = RULER_H + BAND_H + i * laneH;
    const fl = laneFlash[id] && performance.now() - laneFlash[id] < 150;
    g.fillStyle = i % 2 ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.04)';
    if (fl) g.fillStyle = hex(a.color) + '33';
    g.fillRect(LABEL_W, y, W - LABEL_W, laneH);
    g.fillStyle = '#0e1630'; g.fillRect(0, y, LABEL_W, laneH);
    g.fillStyle = hex(a.color); g.font = '700 15px Rajdhani'; g.fillText(a.label, 10, y + laneH / 2 + 1);
    g.fillStyle = '#8ea2c9'; g.font = '600 12px Rajdhani'; g.fillText(`key ${a.key}`, 10, y + laneH / 2 + 16);
  });

  // notes
  for (const n of notes()) {
    if (n.b < first - 1 || n.b > last + 1) continue;
    const i = LANES.indexOf(n.a), a = laneInfo(n.a);
    const x = xOf(n.b, W), y = RULER_H + BAND_H + i * laneH;
    const w = Math.max(10, Math.min(st.zoom * st.grid * 0.9, 36));
    g.fillStyle = hex(a.color); g.shadowColor = hex(a.color); g.shadowBlur = 10;
    roundRect(x - w / 2, y + 6, w, laneH - 12, 6); g.fill(); g.shadowBlur = 0;
  }

  // playhead
  const pb = currentBeat();
  const px = xOf(pb, W);
  g.fillStyle = st.recording ? '#ff4d6a' : '#ffffff'; g.fillRect(px, 0, 2, H);
  g.fillStyle = '#0e1630'; g.fillRect(0, 0, LABEL_W, RULER_H + BAND_H);
  g.fillStyle = '#8ea2c9'; g.font = '700 12px Rajdhani'; g.fillText('BAR', 10, 14);
}

function roundRect(x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

let wavePeaks = null, wavePeaksFor = null;
function drawWave(W, laneH) {
  if (wavePeaksFor !== st.buffer) {
    const d = st.buffer.getChannelData(0), N = 4000, step = Math.floor(d.length / N);
    wavePeaks = new Float32Array(N);
    for (let i = 0; i < N; i++) { let m = 0; for (let k = 0; k < step; k += 8) m = Math.max(m, Math.abs(d[i * step + k] || 0)); wavePeaks[i] = m; }
    wavePeaksFor = st.buffer;
  }
  const top = RULER_H + BAND_H, h = laneH * LANES.length, mid = top + h / 2;
  g.fillStyle = 'rgba(95,232,255,0.12)';
  for (let x = LABEL_W; x < W; x += 2) {
    const beat = (x - LABEL_W) / st.zoom + st.view;
    const t = beat * spb() + st.offset;
    const i = Math.floor((t / st.buffer.duration) * wavePeaks.length);
    if (i < 0 || i >= wavePeaks.length) continue;
    const a = wavePeaks[i] * h * 0.48;
    g.fillRect(x, mid - a, 2, a * 2);
  }
}

// ---------------------------------------------------------------- loop + ui
function loop() {
  if (st.playing) {
    const b = currentBeat();
    const { W } = layout();
    const visible = (W - LABEL_W) / st.zoom;
    if (b > st.view + visible * 0.7 || b < st.view) st.view = b - visible * 0.3;
    // metronome
    if ($('metro').checked && audio.ctx) {
      while (st.metroNext < b + 0.25) {
        const t = st.t0 + st.offset + st.metroNext * spb();
        if (t > audio.ctx.currentTime - 0.01) audio.osc(st.metroNext % 4 === 0 ? 1760 : 1320, t, 0.04, 'square', 0.08, audio.sfxBus, 6000);
        st.metroNext++;
      }
    } else st.metroNext = Math.ceil(b);
    if (b > totalBeats() + 1) pause();
    const t = Math.max(0, b * spb() + st.offset);
    $('time').textContent = `${fmt(t)} · beat ${Math.max(0, b).toFixed(1)}`;
  }
  draw();
  requestAnimationFrame(loop);
}

function ui() {
  $('name').value = st.name; $('scene').value = st.scene; $('target').value = st.target; $('effect').value = st.effect;
  $('bpm').value = st.bpm; $('offset').value = st.offset;
  $('playBtn').textContent = st.playing ? '❚❚ Pause' : '▶ Play';
  $('recBtn').classList.toggle('on', st.recording);
  for (const b of $('diffTabs').children) b.classList.toggle('on', b.dataset.d === st.diff);
  const counts = DIFFICULTIES.map((d) => `${d} ${st.charts[d].length}`).join(' · ');
  $('stats').textContent = `${notes().length} targets on ${st.diff.toUpperCase()} · song ${fmt(duration())} · ${counts}`;
  if (!st.playing) $('time').textContent = `${fmt(Math.max(0, st.beat * spb() + st.offset))} · beat ${st.beat.toFixed(1)}`;
}

function fmt(s) { s = Math.max(0, s); return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`; }

init().catch((e) => { console.error(e); alert('Editor failed to load: ' + e.message); });
