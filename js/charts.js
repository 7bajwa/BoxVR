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
