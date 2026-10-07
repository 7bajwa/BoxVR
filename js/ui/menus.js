// BOXFLOW — menu hub (Beat-Saber style): LEVEL SELECT in the middle, OPTIONS on the left,
// local TOP-10 on the right; PAUSE / RESULTS modals; VR HUD strip + pause button.
// Works in VR (rays) and on desktop/phone (mouse/touch rays from the camera).
import * as THREE from 'three';
import { ACTIONS, SEQUENCE, SPEED, DIFFICULTIES, hex } from '../config.js';
import { fmtTime } from '../scoring.js';
import { Panel, C, roundRect, hexA } from './panel.js';

export const speedToT = (s) => (Math.log10(s) + 1) / 2;
export const tToSpeed = (t) => Math.min(SPEED.max, Math.max(SPEED.min, Math.round(Math.pow(10, t * 2 - 1) * 10) / 10));

const DEG = Math.PI / 180;
const RANK_COLORS = { S: '#ffd84a', A: '#5fffb0', B: '#5fe8ff', C: '#c9a6ff', D: '#ff8a9c', '-': '#8ea2c9' };

export class MenuUI {
  constructor(scene, game) {
    this.game = game;
    this.levels = new Panel('levels', 1200, 1180, 0.98);
    this.options = new Panel('options', 800, 1180, 0.66);
    this.scores = new Panel('scores', 800, 1180, 0.66);
    this.modal = new Panel('modal', 1000, 900, 0.82);
    this.hud = new Panel('hud', 2048, 230, 1.7);
    this.mini = new Panel('mini', 300, 120, 0.2);
    this.panels = [this.levels, this.options, this.scores, this.modal, this.hud, this.mini];
    for (const p of this.panels) { scene.add(p.mesh); p.visible = false; }
    this.levels.drawFn = (p, g) => this.drawLevels(p, g);
    this.options.drawFn = (p, g) => this.drawOptions(p, g);
    this.scores.drawFn = (p, g) => this.drawScores(p, g);
    this.modal.drawFn = (p, g) => (game.state === 'results' ? this.drawResults(p, g) : this.drawPause(p, g));
    this.hud.drawFn = (p, g) => this.drawHud(p, g);
    this.mini.drawFn = (p, g) => this.drawMini(p, g);
    this.pointers = new Map();
    this.focus = 'levels';   // narrow screens show one panel at a time
    this.narrow = false;
    this.vr = false;
    this.songPage = 0;
    this.raycaster = new THREE.Raycaster();
    this.hudKey = '';
  }

  markAll() { for (const p of this.panels) p.dirty = true; }

  // ---------------------------------------------------------------- layout / visibility
  layout(anchor, targetH) {
    const y = anchor.y - 0.08, R = 1.12;
    const place = (p, ang, r = R, dy = 0) => {
      p.mesh.position.set(anchor.x - Math.sin(ang) * r, y + dy, anchor.z - Math.cos(ang) * r);
      p.mesh.rotation.set(0, ang, 0);
    };
    const narrowSide = this.narrow && !this.vr;
    place(this.levels, 0);
    if (this.vr) {             // wrap-around arc in the headset
      place(this.options, 40 * DEG, 1.02);
      place(this.scores, -40 * DEG, 1.02);
    } else if (narrowSide) {   // phones: one panel at a time
      place(this.options, 0); place(this.scores, 0);
    } else {                   // flat screens: side by side, slightly angled
      const flatSide = (p, s) => {
        p.mesh.position.set(anchor.x + s * 0.86, y, anchor.z - R + 0.09);
        p.mesh.rotation.set(0, -s * 15 * DEG, 0);
      };
      flatSide(this.options, -1); flatSide(this.scores, 1);
    }
    place(this.modal, 0, 1.05, 0.02);
    this.hud.mesh.position.set(anchor.x, targetH - 0.92, anchor.z - 1.3);
    this.hud.mesh.rotation.set(-Math.atan2(0.9, 1.3), 0, 0);
    this.mini.mesh.position.set(anchor.x - 0.62, anchor.y - 0.72, anchor.z - 0.55);
    this.mini.mesh.rotation.set(-0.85, 0.5, 0, 'YXZ');
  }

  updateVisibility() {
    const st = this.game.state, vr = this.vr, n = this.narrow && !vr;
    const menu = st === 'menu' || st === 'loading';
    this.levels.visible = menu && (!n || this.focus === 'levels');
    this.options.visible = (menu && (!n || this.focus === 'options')) || (st === 'paused' && !n);
    this.scores.visible = (menu && (!n || this.focus === 'scores')) || (st === 'results' && !n);
    this.modal.visible = st === 'paused' || st === 'results';
    this.hud.visible = vr && (st === 'playing' || st === 'paused');
    this.mini.visible = vr && st === 'playing';
  }

  update(now) {
    this.updateVisibility();
    for (const p of [this.levels, this.options, this.scores, this.modal, this.mini]) if (p.visible && p.dirty) p.redraw();
    if (this.hud.visible) {
      const k = this.game.hudKey(now);
      if (k !== this.hudKey) { this.hudKey = k; this.hudNow = now; this.hud.redraw(); }
    }
  }

  // ---------------------------------------------------------------- pointers
  // One call per pointer per frame with a ready raycaster. Returns the hit (for ray length / dot).
  ray(id, raycaster) {
    const vis = this.panels.filter((p) => p.visible && p !== this.hud);
    const hits = raycaster.intersectObjects(vis.map((p) => p.mesh), false);
    const hit = hits[0] || null;
    const ptr = this.pointers.get(id) || {};
    let hoverPanel = null, hoverBtn = null;
    if (hit) {
      hoverPanel = hit.object.userData.panel;
      hoverBtn = hoverPanel.hitTest(hit.uv);
      if (ptr.drag && ptr.drag.panel === hoverPanel) {
        ptr.drag.btn.drag((hit.uv.x) * hoverPanel.W);
      }
    }
    const hid = hoverBtn ? hoverBtn.id : null;
    if (ptr.panel && (ptr.panel !== hoverPanel || ptr.hid !== hid)) { ptr.panel.hover = null; ptr.panel.dirty = true; }
    if (hoverPanel && hoverPanel.hover !== hid) { hoverPanel.hover = hid; hoverPanel.dirty = true; }
    Object.assign(ptr, { panel: hoverPanel, btn: hoverBtn, hid, hit });
    this.pointers.set(id, ptr);
    return hit;
  }

  press(id) {
    const ptr = this.pointers.get(id);
    if (!ptr || !ptr.btn) return false;
    if (ptr.btn.drag) { ptr.drag = { panel: ptr.panel, btn: ptr.btn }; ptr.btn.drag(ptr.btn.px); }
    else if (ptr.btn.onClick) { this.game.audio.sfxClick(); ptr.btn.onClick(); }
    this.markAll();
    return true;
  }

  release(id) { const ptr = this.pointers.get(id); if (ptr) ptr.drag = null; }
  clearPointer(id) {
    const ptr = this.pointers.get(id);
    if (ptr && ptr.panel) { ptr.panel.hover = null; ptr.panel.dirty = true; }
    this.pointers.delete(id);
  }

  // ---------------------------------------------------------------- LEVEL SELECT
  drawLevels(p, g) {
    const game = this.game, prefs = game.prefs, W = p.W;
    p.glass();
    p.text('BOXFLOW', 60, 72, { size: 58, weight: 700, color: C.cyan, glow: 22, spacing: 10 });
    p.text('VR BOXING RHYTHM TRAINER', W - 60, 76, { size: 24, weight: 600, color: C.muted, align: 'right', spacing: 4 });

    p.button('mode-endless', 60, 125, 530, 88, 'ENDLESS TRAINER', { on: prefs.mode === 'endless', size: 36, onClick: () => game.setPref('mode', 'endless') });
    p.button('mode-songs', 610, 125, 530, 88, 'SONG LEVELS', { on: prefs.mode === 'songs', size: 36, onClick: () => game.setPref('mode', 'songs') });

    // Scene picker  ‹ name ›
    const sc = game.sceneMeta();
    p.button('scene-prev', 60, 240, 100, 124, '‹', { size: 84, onClick: () => game.cycleScene(-1) });
    p.button('scene-next', 1040, 240, 100, 124, '›', { size: 84, onClick: () => game.cycleScene(1) });
    roundRect(g, 176, 240, 848, 124, 20);
    const cols = (sc && sc.colors) || ['#1b3b6b', '#0a1428'];
    const grd = g.createLinearGradient(176, 0, 1024, 0);
    grd.addColorStop(0, hexA(cols[0], 0.55)); grd.addColorStop(1, hexA(cols[1] || cols[0], 0.55));
    g.fillStyle = grd; g.fill(); g.lineWidth = 2; g.strokeStyle = C.line; g.stroke();
    p.text('SCENE', 200, 266, { size: 20, weight: 700, color: C.muted, spacing: 3 });
    p.text(sc ? sc.name : '—', 600, 296, { size: 50, weight: 700, align: 'center', glow: 12 });
    p.text(sc ? sc.description || '' : '', 600, 340, { size: 23, weight: 600, align: 'center', color: '#c3d1f0', maxW: 800 });
    const n = game.sceneList.length;
    for (let i = 0; i < n; i++) {
      g.beginPath(); g.arc(600 - (n - 1) * 14 + i * 28, 390, i === game.sceneIdx ? 7 : 5, 0, Math.PI * 2);
      g.fillStyle = i === game.sceneIdx ? C.cyan : 'rgba(255,255,255,0.25)'; g.fill();
    }

    if (prefs.mode === 'endless') this.drawEndless(p, g);
    else this.drawSongs(p, g);

    const loading = game.state === 'loading';
    p.button('play', 330, 930, 540, 118, loading ? 'LOADING…' : 'PLAY', { kind: 'primary', size: 62, onClick: loading ? null : () => game.play() });

    if (this.narrow && !this.vr) {
      p.button('to-options', 60, 1072, 300, 80, '‹ OPTIONS', { size: 30, onClick: () => { this.focus = 'options'; } });
      p.button('to-scores', 840, 1072, 300, 80, 'SCORES ›', { size: 30, onClick: () => { this.focus = 'scores'; } });
    } else {
      p.text(this.vr ? 'Point and pinch / pull trigger to select' : 'Click to select  ·  Enter = Play  ·  Esc = Pause',
        W / 2, 1110, { size: 24, weight: 600, align: 'center', color: C.dim, spacing: 1 });
    }
  }

  drawEndless(p, g) {
    const game = this.game, prefs = game.prefs, W = p.W;
    p.text('SPEED', 60, 450, { size: 30, weight: 700, color: C.muted, spacing: 3 });
    p.text(`${(3 / prefs.speed).toFixed(2)} s per target`, W - 200, 452, { size: 24, weight: 600, color: C.muted, align: 'right' });
    p.text(`${prefs.speed.toFixed(1)}×`, W - 60, 450, { size: 50, weight: 700, color: C.cyan, align: 'right', glow: 12 });
    p.button('spd-', 60, 490, 84, 84, '−', { size: 50, onClick: () => game.setPref('speed', Math.round((prefs.speed - 0.1) * 10) / 10) });
    p.slider('spd', 175, 497, 850, speedToT(prefs.speed), (t) => game.setPref('speed', tToSpeed(t)));
    p.button('spd+', 1056, 490, 84, 84, '+', { size: 50, onClick: () => game.setPref('speed', Math.round((prefs.speed + 0.1) * 10) / 10) });
    p.text('0.1×', 175, 595, { size: 22, color: C.dim }); p.text('1×', 175 + 425, 595, { size: 22, color: C.dim, align: 'center' });
    p.text('10×', 1025, 595, { size: 22, color: C.dim, align: 'right' });

    p.text(prefs.ramp ? `⚡ SPEED RAMP ON — starts at ${prefs.speed.toFixed(1)}×, +1× every minute until you break`
      : 'Speed ramp is off — turn it on in Options for a rising challenge', W / 2, 650,
    { size: 26, weight: 700, align: 'center', color: prefs.ramp ? C.yellow : C.muted, maxW: 1080 });
    p.text(`Game over after 3 misses in a row: ${prefs.gameOver ? 'ON' : 'OFF'}   ·   Strict direction: ${prefs.strictDir ? 'ON' : 'OFF'}`,
      W / 2, 692, { size: 24, weight: 600, align: 'center', color: C.muted });

    // the fixed combo
    const chipW = 168, gap = 12, total = SEQUENCE.length * chipW + (SEQUENCE.length - 1) * gap;
    let x = (W - total) / 2;
    for (const id of SEQUENCE) {
      const a = ACTIONS[id];
      roundRect(g, x, 740, chipW, 64, 14); g.fillStyle = hexA(hex(a.color), 0.16); g.fill();
      g.lineWidth = 2; g.strokeStyle = hexA(hex(a.color), 0.75); g.stroke();
      p.text(a.label, x + chipW / 2, 774, { size: 28, weight: 700, align: 'center', color: hex(a.color) });
      x += chipW + gap;
    }
    const song = game.sceneSongName();
    p.text(`♪ ${song}   ·   one target every ${(3 / prefs.speed).toFixed(1)} s, looping forever`, W / 2, 860, { size: 24, weight: 600, align: 'center', color: C.muted });
  }

  drawSongs(p, g) {
    const game = this.game, prefs = game.prefs;
    const levels = game.levelList;
    const per = 4;
    const pages = Math.max(1, Math.ceil(levels.length / per));
    this.songPage = Math.min(this.songPage, pages - 1);
    const list = levels.slice(this.songPage * per, this.songPage * per + per);
    if (!levels.length) p.text('No levels found in content/registry.json', 600, 560, { size: 30, align: 'center', color: C.muted });
    list.forEach((lvl, i) => {
      const y = 418 + i * 92, x = 60, w = pages > 1 ? 1000 : 1080, h = 84;
      const sel = lvl.id === prefs.level;
      const hov = p.hover === 'lvl-' + lvl.id;
      roundRect(g, x, y, w, h, 16);
      g.fillStyle = sel ? 'rgba(95,232,255,0.16)' : hov ? 'rgba(95,232,255,0.08)' : C.fill; g.fill();
      g.lineWidth = sel ? 3 : 2; g.strokeStyle = sel ? C.cyan : C.line; g.stroke();
      p.text(lvl.name + (lvl.custom ? '  · CUSTOM' : ''), x + 26, y + 30, { size: 36, weight: 700, color: sel ? '#fff' : C.text });
      const s = lvl.songInfo || {};
      const meta = [s.artist || (lvl.custom ? 'Level Creator' : ''), s.bpm ? `${s.bpm} BPM` : (lvl.audio ? `${lvl.audio.bpm} BPM` : ''), lvl.durationText || '', game.sceneName(lvl.scene)].filter(Boolean).join('  ·  ');
      p.text(meta, x + 26, y + 64, { size: 22, weight: 600, color: C.muted });
      const best = game.bestFor(lvl.id, prefs.difficulty);
      p.text(best ? best.toLocaleString() : '—', x + w - 26, y + 32, { size: 34, weight: 700, color: sel ? C.cyan : '#b9c8ea', align: 'right' });
      p.text('BEST', x + w - 26, y + 64, { size: 18, weight: 700, color: C.dim, align: 'right', spacing: 2 });
      p.hit('lvl-' + lvl.id, x, y, w, h, () => game.selectLevel(lvl.id));
    });
    if (pages > 1) {
      p.button('pg-up', 1074, 418, 66, 178, '▲', { size: 30, disabled: this.songPage === 0, onClick: () => { this.songPage--; } });
      p.button('pg-dn', 1074, 604, 66, 178, '▼', { size: 30, disabled: this.songPage >= pages - 1, onClick: () => { this.songPage++; } });
    }
    const counts = game.chartCounts();
    DIFFICULTIES.forEach((d, i) => {
      p.button('diff-' + d, 60 + i * 274, 805, 262, 92, d.toUpperCase(), {
        on: prefs.difficulty === d, size: 32, sub: counts[d] != null ? `${counts[d]} targets` : '',
        accent: ['#5fffb0', '#5fe8ff', '#ffb35f', '#ff5f8f'][i], onClick: () => game.setPref('difficulty', d),
      });
    });
  }

  // ---------------------------------------------------------------- OPTIONS
  drawOptions(p, g) {
    const game = this.game, o = game.prefs, W = p.W;
    p.glass();
    p.title('OPTIONS', 78, 56);
    const row = (i, label, sub) => {
      const y = 150 + i * 104;
      p.text(label, 50, y + 22, { size: 33, weight: 700 });
      if (sub) p.text(sub, 50, y + 56, { size: 21, weight: 600, color: C.muted, maxW: 470 });
      if (i) { g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(50, y - 12, W - 100, 2); }
      return y;
    };
    const tog = (i, key, label, sub) => { const y = row(i, label, sub); p.toggle('opt-' + key, W - 50 - 110, y + 6, o[key], () => game.setPref(key, !o[key])); };
    tog(0, 'gameOver', 'Game over', '3 misses in a row ends the run');
    tog(1, 'ramp', 'Speed ramp', 'Endless: +1× every minute');
    tog(2, 'strictDir', 'Strict direction', "Punch must follow the target's arrows");
    let y = row(3, 'Target height', 'Straight-punch height');
    p.stepper('th', W - 50 - 270, y + 4, 270, `${o.targetHeight} cm`, () => game.setPref('targetHeight', Math.max(100, o.targetHeight - 5)), () => game.setPref('targetHeight', Math.min(220, o.targetHeight + 5)));
    y = row(4, 'Haptics', 'Max rumble on hardest hits');
    p.stepper('hp', W - 50 - 270, y + 4, 270, o.haptics ? `${o.haptics}%` : 'OFF', () => game.setPref('haptics', Math.max(0, o.haptics - 10)), () => game.setPref('haptics', Math.min(100, o.haptics + 10)));
    tog(5, 'music', 'Music', null);
    y = row(6, 'Haze', null);
    ['LOW', 'MED', 'HIGH'].forEach((n, i) => p.button('haze' + i, W - 50 - 300 + i * 102, y, 96, 60, n, { on: o.haze === i, size: 24, onClick: () => game.setPref('haze', i) }));
    tog(7, 'reflections', 'Reflections', 'Wet floor / water mirror');

    if (this.vr) {
      p.button('recenter', 50, 1000, 340, 86, '⟲ RECENTER', { size: 30, onClick: () => game.recenter() });
      p.button('exitvr', 410, 1000, 340, 86, 'EXIT VR', { size: 30, onClick: () => game.exitVR() });
    } else {
      p.button('editor', 50, 990, 700, 80, '✎  LEVEL CREATOR', { size: 30, onClick: () => game.openEditor() });
    }
    if (this.narrow && !this.vr) p.button('back-o', 50, 1088, 700, 74, 'BACK ›', { size: 30, onClick: () => { this.focus = 'levels'; } });
  }

  // ---------------------------------------------------------------- SCORES
  drawScores(p, g) {
    const game = this.game, W = p.W;
    p.glass();
    p.title('HIGHSCORES', 78, 56);
    p.text(game.boardLabel(), W / 2, 138, { size: 30, weight: 700, align: 'center', color: C.cyan, maxW: 720 });
    const list = game.topScores();
    const cols = { n: 50, score: 330, chain: 460, acc: 580, rank: 655, date: 755 };
    const hy = 196;
    p.text('#', cols.n, hy, { size: 20, color: C.dim, weight: 700 });
    p.text('SCORE', cols.score, hy, { size: 20, color: C.dim, weight: 700, align: 'right', spacing: 2 });
    p.text('CHAIN', cols.chain, hy, { size: 20, color: C.dim, weight: 700, align: 'right', spacing: 2 });
    p.text('ACC', cols.acc, hy, { size: 20, color: C.dim, weight: 700, align: 'right', spacing: 2 });
    p.text('RANK', cols.rank, hy, { size: 20, color: C.dim, weight: 700, align: 'center', spacing: 2 });
    if (!list.length) {
      p.text('No scores yet', W / 2, 520, { size: 40, weight: 700, align: 'center', color: C.muted });
      p.text('Finish a run to set the first one', W / 2, 570, { size: 26, weight: 600, align: 'center', color: C.dim });
    }
    list.forEach((e, i) => {
      const y = 246 + i * 74;
      const fresh = game.lastScoreDate && e.date === game.lastScoreDate;
      if (fresh) { roundRect(g, 30, y - 30, W - 60, 62, 12); g.fillStyle = 'rgba(95,232,255,0.14)'; g.fill(); }
      const first = i === 0;
      p.text(String(i + 1), cols.n, y, { size: 32, weight: 700, color: first ? C.cyan : '#9fb2da' });
      p.text(e.score.toLocaleString(), cols.score, y, { size: 36, weight: 700, color: first ? C.cyan : '#fff', align: 'right', glow: first ? 10 : 0 });
      p.text(String(e.chain ?? 0), cols.chain, y, { size: 30, weight: 600, color: '#c9d6f5', align: 'right' });
      p.text(`${e.acc ?? 0}%`, cols.acc, y, { size: 30, weight: 600, color: '#c9d6f5', align: 'right' });
      p.text(e.rank || '-', cols.rank, y, { size: 32, weight: 700, color: RANK_COLORS[e.rank] || C.text, align: 'center' });
      const d = new Date(e.date);
      p.text(`${d.getDate()}/${d.getMonth() + 1}`, cols.date, y, { size: 20, weight: 600, color: C.dim, align: 'right' });
    });
    p.text('Scores are saved on this device', W / 2, 1020, { size: 22, weight: 600, align: 'center', color: C.dim });
    if (this.narrow && !this.vr) p.button('back-s', 50, 1088, 700, 74, '‹ BACK', { size: 30, onClick: () => { this.focus = 'levels'; } });
  }

  // ---------------------------------------------------------------- PAUSE / RESULTS
  drawPause(p) {
    const game = this.game, sc = game.scoring, W = p.W;
    p.glass();
    p.title('PAUSED', 110, 80);
    p.text(`${sc.score.toLocaleString()} pts   ·   streak ${sc.streak}   ·   chain ${sc.longest}`, W / 2, 190, { size: 32, weight: 600, align: 'center', color: C.muted });
    p.button('continue', 200, 250, 600, 130, 'CONTINUE', { kind: 'primary', size: 54, onClick: () => game.resume() });
    p.button('restart', 200, 410, 600, 96, 'RESTART', { size: 36, onClick: () => game.restart() });
    p.button('menu', 200, 530, 600, 96, 'MAIN MENU', { size: 36, kind: 'danger', onClick: () => game.toMenu() });
    if (this.vr) p.button('recenter2', 200, 650, 600, 86, '⟲ RECENTER', { size: 30, onClick: () => game.recenter() });
    p.text(this.vr ? 'B / Y to continue' : 'Esc to continue', W / 2, 820, { size: 24, weight: 600, align: 'center', color: C.dim });
  }

  drawResults(p, g) {
    const game = this.game, r = game.results || {}, s = r.summary || {}, W = p.W;
    p.glass();
    const col = r.kind === 'complete' ? C.green : r.kind === 'gameover' ? C.red : C.cyan;
    p.text(r.title || 'RESULTS', W / 2, 88, { size: 72, weight: 700, align: 'center', color: col, glow: 24, spacing: 6 });
    p.text(r.board || '', W / 2, 148, { size: 28, weight: 600, align: 'center', color: C.muted });
    // rank badge
    const rc = RANK_COLORS[s.rank] || C.text;
    g.beginPath(); g.arc(220, 320, 118, 0, Math.PI * 2);
    g.fillStyle = hexA(rc, 0.12); g.fill(); g.lineWidth = 6; g.strokeStyle = rc; g.shadowColor = rc; g.shadowBlur = 26; g.stroke(); g.shadowBlur = 0;
    p.text(s.rank || '-', 220, 326, { size: 150, weight: 700, align: 'center', color: rc, glow: 20 });
    p.text('SCORE', 400, 238, { size: 26, weight: 700, color: C.muted, spacing: 4 });
    p.text((s.score || 0).toLocaleString(), 400, 312, { size: 104, weight: 700, color: '#fff', glow: 14 });
    if (r.newRank) p.text(r.newRank === 1 ? '★ NEW HIGH SCORE!' : `★ #${r.newRank} ON YOUR TOP 10`, 400, 392, { size: 34, weight: 700, color: C.yellow, glow: 14 });
    const stats = [
      ['HITS', `${s.hits ?? 0}/${s.total ?? 0}`], ['LONGEST CHAIN', s.chain ?? 0], ['ACCURACY', `${s.acc ?? 0}%`], ['POWER', `${s.power ?? 0}%`],
      ['SWING', `${s.swing ?? 0}%`], ['HIT RATE', `${s.hitRate ?? 0}%`], ['TIME', fmtTime(s.time || 0)], [r.maxSpeed ? 'TOP SPEED' : 'SCENE', r.maxSpeed ? `${r.maxSpeed.toFixed(1)}×` : (r.scene || '')],
    ];
    stats.forEach(([k, v], i) => {
      const x = 50 + (i % 4) * 225, y = 478 + Math.floor(i / 4) * 120;
      roundRect(g, x, y, 210, 104, 14); g.fillStyle = C.fill; g.fill(); g.lineWidth = 1.5; g.strokeStyle = C.line; g.stroke();
      p.text(k, x + 105, y + 30, { size: 19, weight: 700, color: C.muted, align: 'center', spacing: 2, maxW: 196 });
      p.text(String(v), x + 105, y + 70, { size: 40, weight: 700, align: 'center', maxW: 196 });
    });
    p.button('retry', 100, 760, 380, 104, 'RETRY', { kind: 'primary', size: 44, onClick: () => game.restart() });
    p.button('tomenu', 520, 760, 380, 104, 'MENU', { size: 40, onClick: () => game.toMenu() });
  }

  // ---------------------------------------------------------------- VR HUD strip + pause button
  drawHud(p, g) {
    const info = this.game.hudInfo(this.hudNow || 0);
    const W = p.W, H = p.H;
    const bg = g.createLinearGradient(0, 0, W, 0);
    bg.addColorStop(0, 'rgba(6,12,28,0)'); bg.addColorStop(0.12, 'rgba(6,12,28,0.62)');
    bg.addColorStop(0.88, 'rgba(6,12,28,0.62)'); bg.addColorStop(1, 'rgba(6,12,28,0)');
    g.fillStyle = bg; g.fillRect(0, 20, W, H - 40);
    const line = g.createLinearGradient(0, 0, W, 0);
    line.addColorStop(0, 'rgba(95,232,255,0)'); line.addColorStop(0.5, 'rgba(95,232,255,0.85)'); line.addColorStop(1, 'rgba(95,232,255,0)');
    g.fillStyle = line; g.fillRect(0, 20, W, 2); g.fillRect(0, H - 22, W, 2);
    if (info.progress != null) { g.fillStyle = 'rgba(95,232,255,0.9)'; g.fillRect(W * 0.12, H - 24, W * 0.76 * info.progress, 5); }

    const cells = [
      ['SCORE', info.score, '#ffffff', 1.25],
      ['STREAK', info.streak, '#5fffb0', 1, info.mult],
      ['NEXT', info.next.label, info.next.color, 1.1],
      ['LONGEST CHAIN', info.longest, '#ffd84a', 1],
      [info.timeLabel, info.time, '#5fe8ff', 1],
    ];
    if (info.speed) cells.push(['SPEED', info.speed, '#ffb35f', 0.8]);
    const totalW = cells.reduce((s, c) => s + c[3], 0);
    let x = 120; const usable = W - 240;
    cells.forEach(([lab, val, col, wgt, extra], i) => {
      const cw = usable * (wgt / totalW), cx = x + cw / 2;
      if (i > 0) { g.fillStyle = 'rgba(140,170,220,0.25)'; g.fillRect(x, 60, 2, H - 120); }
      p.text(lab, cx, 66, { size: 30, weight: 700, color: '#8ea2c9', align: 'center', spacing: 4 });
      const vx = extra ? cx - 28 : cx;
      p.text(String(val), vx, 148, { size: i === 0 ? 92 : 80, weight: 700, color: col, align: 'center', glow: 16 });
      if (extra) {
        g.font = `700 80px "Rajdhani", sans-serif`;
        const vw = g.measureText(String(val)).width;
        p.text(extra, vx + vw / 2 + 12, 156, { size: 36, weight: 700, color: 'rgba(95,255,176,0.7)' });
      }
      x += cw;
    });
    // misses-in-a-row pips (game over warning)
    if (info.missRun != null) for (let i = 0; i < 3; i++) {
      g.beginPath(); g.arc(W / 2 - 30 + i * 30, H - 46, 8, 0, Math.PI * 2);
      g.fillStyle = i < info.missRun ? '#ff4d6a' : 'rgba(255,255,255,0.15)'; g.fill();
    }
  }

  drawMini(p, g) {
    const hov = p.hover === 'pause';
    roundRect(g, 4, 4, p.W - 8, p.H - 8, 56);
    g.fillStyle = hov ? 'rgba(40,60,110,0.92)' : 'rgba(10,18,38,0.78)'; g.fill();
    g.lineWidth = 3; g.strokeStyle = hov ? C.cyan : 'rgba(120,220,255,0.4)'; g.stroke();
    p.text('❚❚  PAUSE', p.W / 2, p.H / 2 + 2, { size: 46, weight: 700, align: 'center' });
    p.hit('pause', 0, 0, p.W, p.H, () => this.game.pause());
  }
}
