// BOXFLOW — charts: which beats get a target, per difficulty.
// A level chart is either explicit notes from the Level Creator: { "notes": [[beat, "ACTION"], ...] }
// or auto-generated:  { "auto": 4 }            → a target every 4 beats
//                     { "auto": "dynamic" }    → density follows the song's section intensity
// Actions default to the fixed training SEQUENCE so the combo is always practised in order.
import { SEQUENCE } from './config.js';
import { songPlan } from './audio.js';

// beats between targets for [intensity 0, 1, 2] per difficulty
const DYNAMIC = {
  easy:   [8, 4, 4],
  normal: [4, 2, 2],
  hard:   [4, 2, 1],
  expert: [2, 1, 1],
};

export function totalBeats(song) {
  if (song.type === 'audio') return Math.floor((song.duration || 120) * song.bpm / 60);
  return songPlan(song).bars.length * 4;
}

function barsFor(song) {
  if (song.type === 'audio') {
    if (song.sections) return songPlan(song).bars;
    const n = Math.ceil(totalBeats(song) / 4);
    return Array.from({ length: n }, (_, i) => ({ intensity: i < 2 ? 0 : 1 }));
  }
  return songPlan(song).bars;
}

export function buildChart(level, song, difficulty) {
  const spec = (level.charts && (level.charts[difficulty] || level.charts.normal)) || { auto: 'dynamic' };
  let notes;
  if (spec.notes) {
    notes = spec.notes.map(([b, a], i) => ({ beat: b, action: a || SEQUENCE[i % SEQUENCE.length] }));
  } else {
    notes = [];
    const bars = barsFor(song);
    const beats = bars.length * 4;
    const start = spec.start ?? 8;                  // let the intro breathe
    const end = beats - (spec.endPad ?? 4);
    let b = start, k = 0;
    while (b < end) {
      const bar = bars[Math.floor(b / 4)] || { intensity: 1 };
      const step = spec.auto === 'dynamic' || spec.auto == null
        ? DYNAMIC[difficulty][Math.min(2, bar.intensity)]
        : Number(spec.auto);
      // align to the step grid inside the bar so patterns feel musical
      if (b % step !== 0) { b = Math.ceil(b / step) * step; continue; }
      notes.push({ beat: b, action: SEQUENCE[k++ % SEQUENCE.length] });
      b += step;
    }
  }
  notes.sort((a, b) => a.beat - b.beat);
  return notes;
}

// Hurdles for a song level: explicit `level.hurdles[difficulty]` / `level.charts[d].hurdles`
// ([[beat, "duck"|"left"|"right"], ...]) or auto — dropped into gaps between targets.
// NOTE: auto mode may remove a target or two next to a hurdle (mutates `notes`) to leave room to dodge.
const HURDLE_EVERY_BARS = { easy: 0, normal: 8, hard: 6, expert: 4 };
const CYCLE = ['duck', 'left', 'duck', 'right'];
export function buildHurdles(level, song, difficulty, notes) {
  const spec = level.charts && level.charts[difficulty];
  if (spec && spec.hurdles) return spec.hurdles.map(([beat, type]) => ({ beat, type }));
  if (spec && spec.notes) return [];   // hand-made chart: only the hurdles its author placed
  const every = HURDLE_EVERY_BARS[difficulty] || 0;
  if (!every || !notes.length) return [];
  const bars = barsFor(song);
  const out = [];
  let k = 0, carved = false;
  for (let bar = every; bar < bars.length - 2; bar += every) {
    if ((bars[bar] || {}).intensity < 1) continue;
    // find the widest gap between notes inside this bar's neighbourhood
    const from = bar * 4, to = from + 8;
    let best = null;
    for (let i = 0; i < notes.length - 1; i++) {
      const a = notes[i].beat, b = notes[i + 1].beat;
      if (b < from || a > to) continue;
      if (b - a >= 2 && (!best || b - a > best.gap)) best = { beat: (a + b) / 2, gap: b - a };
    }
    if (!best) { // dense section: carve a gap (drop targets within 1 beat of the hurdle)
      const h = from + 2;
      for (let i = notes.length - 1; i >= 0; i--) if (Math.abs(notes[i].beat - h) < 1) notes.splice(i, 1);
      best = { beat: h }; carved = true;
    }
    out.push({ beat: best.beat, type: CYCLE[k++ % CYCLE.length] });
  }
  if (carved && !(spec && spec.notes)) notes.forEach((n, i) => { n.action = SEQUENCE[i % SEQUENCE.length]; }); // keep the combo order
  return out;
}
