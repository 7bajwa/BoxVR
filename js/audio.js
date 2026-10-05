// BOXFLOW — procedural looping music + SFX (Web Audio). The AudioContext clock is the
// game's master clock, so targets and music stay in lock-step.

const CHORDS = [ // A minor synthwave loop: Am – F – C – G (MIDI roots + triad)
  [57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62],
];
const BASS = [45, 41, 36, 43];
const ARP = [0, 1, 2, 1, 2, 0, 1, 2];

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Fold the target rate into a comfortable BPM so every target lands on a beat.
// 1× = 20 targets/min → 160 BPM (8 beats per target).
export function bpmForInterval(interval) {
  let bpm = 60 / interval;
  let beatsPerTarget = 1;
  while (bpm < 90) { bpm *= 2; beatsPerTarget *= 2; }
  while (bpm >= 180) { bpm /= 2; beatsPerTarget /= 2; }
  return { bpm, beatsPerTarget };
}

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.musicOn = true;
    this.playing = false;
    this.t0 = 0;           // time of beat 0 of the grid
    this.spb = 60 / 160;   // seconds per beat
    this.nextStep = 0;     // next 16th-note index to schedule
    this.timer = null;
  }

  ensure() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC({ latencyHint: 'interactive' });
    const ctx = this.ctx;

    this.master = ctx.createGain(); this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);

    this.musicBus = ctx.createGain(); this.musicBus.gain.value = this.musicOn ? 0.55 : 0;
    this.musicBus.connect(this.master);
    this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = 0.8;
    this.sfxBus.connect(this.master);

    // Simple feedback delay for the arp/pad shimmer.
    this.delay = ctx.createDelay(1.0);
    this.delayFb = ctx.createGain(); this.delayFb.gain.value = 0.32;
    this.delayWet = ctx.createGain(); this.delayWet.gain.value = 0.35;
    this.delay.connect(this.delayFb).connect(this.delay);
    this.delay.connect(this.delayWet).connect(this.musicBus);

    // Shared noise buffer for drums / impacts.
    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }

  async resume() { this.ensure(); if (this.ctx.state !== 'running') await this.ctx.resume(); }
  now() { return this.ctx ? this.ctx.currentTime : performance.now() / 1000; }

  setMusic(on) {
    this.musicOn = on;
    if (this.musicBus) this.musicBus.gain.setTargetAtTime(on ? 0.55 : 0, this.ctx.currentTime, 0.05);
  }

  // Align the music grid so beat 0 falls at `anchor` with the given beat length.
  setGrid(anchor, spb) {
    this.t0 = anchor; this.spb = spb;
    this.delay.delayTime.setValueAtTime(Math.min(0.99, spb * 0.75), this.ctx.currentTime);
    const step = spb / 4;
    this.nextStep = Math.ceil((this.ctx.currentTime + 0.02 - this.t0) / step);
  }

  start() {
    this.playing = true;
    clearInterval(this.timer);
    this.timer = setInterval(() => this.pump(), 25);
  }
  stop() { this.playing = false; clearInterval(this.timer); this.timer = null; }

  pump() {
    if (!this.playing || !this.ctx) return;
    const step = this.spb / 4;
    const horizon = this.ctx.currentTime + 0.12;
    while (this.t0 + this.nextStep * step < horizon) {
      this.playStep(this.nextStep, this.t0 + this.nextStep * step);
      this.nextStep++;
    }
  }

  playStep(i, t) {
    const s16 = ((i % 16) + 16) % 16;            // step within bar
    const bar = Math.floor(i / 16);
    const ci = ((bar % 4) + 4) % 4;
    const chord = CHORDS[ci];
    const out = this.musicBus;

    if (s16 % 4 === 0) this.kick(t, out);
    if (s16 === 4 || s16 === 12) this.snare(t, out);
    if (s16 % 2 === 1) this.hat(t, out, s16 % 4 === 2 ? 0.05 : 0.09);
    if (s16 % 2 === 0) this.tone(mtof(BASS[ci]), t, this.spb * 0.45, 'sawtooth', 0.16, out, 500);
    if (s16 % 2 === 0) {
      const n = chord[ARP[(s16 / 2) % ARP.length]] + 12;
      this.tone(mtof(n), t, this.spb * 0.35, 'square', 0.035, out, 2400, true);
    }
    if (s16 === 0) chord.forEach((n) => this.tone(mtof(n), t, this.spb * 3.8, 'sawtooth', 0.03, out, 1200, true, 0.3));
  }

  tone(freq, t, dur, type, vol, out, cutoff = 3000, send = false, attack = 0.005) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(out);
    if (send) g.connect(this.delay);
    o.start(t); o.stop(t + dur + 0.05);
  }

  kick(t, out) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g).connect(out); o.start(t); o.stop(t + 0.4);
  }

  noiseHit(t, out, vol, dur, type, freq) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
  }
  snare(t, out) { this.noiseHit(t, out, 0.35, 0.18, 'bandpass', 1800); this.tone(190, t, 0.1, 'triangle', 0.15, out); }
  hat(t, out, vol) { this.noiseHit(t, out, vol, 0.05, 'highpass', 7000); }

  // ---- SFX ----
  sfxHit(power = 0.6, color = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.noiseHit(t, this.sfxBus, 0.5 + power * 0.4, 0.12, 'lowpass', 1500 + power * 2500);
    this.tone(90 + power * 40, t, 0.18, 'sine', 0.6, this.sfxBus);
    const notes = [880, 988, 1175, 1319, 1480, 1760];
    this.tone(notes[color % notes.length], t, 0.25, 'triangle', 0.12, this.sfxBus, 6000);
  }
  sfxMiss() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone(160, t, 0.25, 'sawtooth', 0.12, this.sfxBus, 400);
    this.tone(110, t + 0.08, 0.3, 'sawtooth', 0.1, this.sfxBus, 300);
  }
  sfxWrong() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone(220, t, 0.12, 'square', 0.1, this.sfxBus, 900);
    this.tone(207, t + 0.1, 0.15, 'square', 0.1, this.sfxBus, 900);
  }
  sfxClick() {
    if (!this.ctx) return;
    this.tone(1400, this.ctx.currentTime, 0.05, 'triangle', 0.12, this.sfxBus, 8000);
  }
}
