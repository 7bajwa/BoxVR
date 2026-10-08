// BOXFLOW — scoring.
// Each hit:  points = (35·accuracy + 35·power + 30·swing) × form × streak multiplier
//   accuracy = how close to the beat, power = peak fist speed, swing = how long the punch travelled.
//   A lazy tap on the beat scores ~40; a full, fast, on-beat punch scores 100 (×2 with a long streak).
// Misses / wrong hand / wrong direction break the streak; N in a row can end the run.

export function grade(accuracy) {
  if (accuracy >= 0.85) return 'PERFECT';
  if (accuracy >= 0.6) return 'GREAT';
  return 'GOOD';
}

export class Scoring {
  constructor() { this.reset(); }

  reset() {
    this.score = 0; this.streak = 0; this.longest = 0;
    this.hits = 0; this.misses = 0; this.mistakes = 0; this.missRun = 0;
    this.accSum = 0; this.powSum = 0; this.swingSum = 0;
    this.startTime = 0; this.elapsed = 0; this.running = false;
    this.lastPoints = 0;
  }

  start(now) { this.reset(); this.startTime = now; this.running = true; }
  stop(now) { if (this.running) this.elapsed = now - this.startTime; this.running = false; }
  duration(now) { return this.running ? now - this.startTime : this.elapsed; }

  get multiplier() { return 1 + Math.min(this.streak, 20) * 0.05; }

  hit(accuracy, power, swing, form = 1) {
    this.streak++; this.missRun = 0;
    this.longest = Math.max(this.longest, this.streak);
    this.hits++;
    this.accSum += accuracy; this.powSum += power; this.swingSum += swing;
    const base = 35 * accuracy + 35 * power + 30 * swing;
    const pts = Math.max(5, Math.round(base * (0.6 + 0.4 * form) * this.multiplier));
    this.score += pts;
    this.lastPoints = pts;
    return pts;
  }

  // A clean hurdle dodge: small bonus, keeps the streak alive (does not add to it).
  dodge() { this.dodges = (this.dodges || 0) + 1; this.missRun = 0; const pts = Math.round(25 * this.multiplier); this.score += pts; return pts; }

  miss() { this.misses++; this.streak = 0; this.missRun++; }
  mistake() { this.mistakes++; this.streak = 0; this.missRun++; }

  get total() { return this.hits + this.misses + this.mistakes; }
  get accuracyPct() { return this.hits ? Math.round((this.accSum / this.hits) * 100) : 0; }
  get powerPct() { return this.hits ? Math.round((this.powSum / this.hits) * 100) : 0; }
  get swingPct() { return this.hits ? Math.round((this.swingSum / this.hits) * 100) : 0; }
  get hitRatePct() { return this.total ? Math.round((this.hits / this.total) * 100) : 0; }

  get rank() {
    if (!this.total) return '-';
    const r = (this.hits / this.total) * 0.65 + (this.accSum / Math.max(1, this.hits)) * 0.35;
    return r >= 0.93 ? 'S' : r >= 0.82 ? 'A' : r >= 0.68 ? 'B' : r >= 0.5 ? 'C' : 'D';
  }

  summary() {
    return {
      score: this.score, chain: this.longest, hits: this.hits, total: this.total,
      acc: this.accuracyPct, power: this.powerPct, swing: this.swingPct, hitRate: this.hitRatePct, rank: this.rank,
      time: Math.round(this.elapsed),
    };
  }
}

export function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const mm = String(m).padStart(2, '0'), ss = String(s).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
