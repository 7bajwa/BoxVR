// BOXFLOW — scoring system: score (accuracy + power), current streak, longest chain, duration.

export function grade(accuracy) {
  if (accuracy >= 0.85) return 'PERFECT';
  if (accuracy >= 0.6) return 'GREAT';
  return 'GOOD';
}

export class Scoring {
  constructor() { this.reset(); }

  reset() {
    this.score = 0;
    this.streak = 0;
    this.longest = 0;
    this.hits = 0;
    this.misses = 0;
    this.mistakes = 0;
    this.accSum = 0;
    this.powSum = 0;
    this.startTime = 0;
    this.elapsed = 0;
    this.running = false;
  }

  start(now) { this.reset(); this.startTime = now; this.running = true; }
  stop(now) { if (this.running) this.elapsed = now - this.startTime; this.running = false; }
  duration(now) { return this.running ? now - this.startTime : this.elapsed; }

  // accuracy, power, form all in [0,1]. Returns points awarded.
  hit(accuracy, power, form = 1) {
    this.streak++;
    this.longest = Math.max(this.longest, this.streak);
    this.hits++;
    this.accSum += accuracy;
    this.powSum += power;
    const base = 60 * accuracy + 40 * power;            // up to 100 per punch
    const mult = 1 + Math.min(this.streak, 20) * 0.05;  // up to 2× for long chains
    const pts = Math.max(10, Math.round(base * (0.6 + 0.4 * form) * mult));
    this.score += pts;
    return pts;
  }

  miss() { this.misses++; this.streak = 0; }
  mistake() { this.mistakes++; this.streak = 0; }

  get accuracyPct() { return this.hits ? Math.round((this.accSum / this.hits) * 100) : 0; }
  get powerPct() { return this.hits ? Math.round((this.powSum / this.hits) * 100) : 0; }
  get hitRatePct() {
    const total = this.hits + this.misses + this.mistakes;
    return total ? Math.round((this.hits / total) * 100) : 0;
  }
}

export function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const mm = String(m).padStart(2, '0'), ss = String(s).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
