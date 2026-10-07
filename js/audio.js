// BOXFLOW — audio: procedural songs (data-driven step sequencer), audio-file songs, ambient
// soundscapes and SFX. The AudioContext clock is the game clock, so music and targets stay locked.

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Fold a target rate into a comfortable BPM so every endless target lands on a beat.
export function bpmForInterval(interval) {
  let bpm = 60 / interval, beatsPerTarget = 1;
  while (bpm < 90) { bpm *= 2; beatsPerTarget *= 2; }
  while (bpm >= 180) { bpm /= 2; beatsPerTarget /= 2; }
  return { bpm, beatsPerTarget };
}

// Flatten a song's sections into a per-bar plan.
export function songPlan(song) {
  const bars = [];
  for (const s of song.sections || [{ bars: 16, tracks: Object.keys(song.tracks || {}), intensity: 1 }]) {
    for (let i = 0; i < s.bars; i++) bars.push({ section: s.name || '', tracks: new Set(s.tracks || []), intensity: s.intensity ?? 1, barInSection: i, sectionBars: s.bars });
  }
  const loopName = song.loopSection;
  let loop = bars.filter((b) => b.section === loopName);
  if (!loop.length) loop = bars.filter((b) => b.intensity >= 2);
  if (!loop.length) loop = bars;
  return { bars, loop };
}

export function songDuration(song) {
  const spb = 60 / song.bpm;
  if (song.type === 'audio') return song.duration || 0;
  return songPlan(song).bars.length * 4 * spb;
}

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.musicOn = true;
    this.musicLevel = 1;
    this.song = null;
    this.mode = 'loop';      // 'loop' (endless / menu preview) | 'song'
    this.playing = false;
    this.t0 = 0; this.spb = 0.5; this.nextStep = 0;
    this.timer = null;
    this.counters = {};
    this.onSongEnd = null;
    this.ambientNodes = [];
    this.ambientTimers = [];
  }

  ensure() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = this.ctx = new AC({ latencyHint: 'interactive' });
    this.master = ctx.createGain(); this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -12; comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.musicBus = ctx.createGain(); this.musicBus.connect(this.master);
    this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = 0.85; this.sfxBus.connect(this.master);
    this.ambBus = ctx.createGain(); this.ambBus.gain.value = 0.5; this.ambBus.connect(this.master);
    this.applyMusicGain();
    this.delay = ctx.createDelay(1.0);
    this.delayFb = ctx.createGain(); this.delayFb.gain.value = 0.3;
    const wet = ctx.createGain(); wet.gain.value = 0.3;
    this.delay.connect(this.delayFb).connect(this.delay);
    this.delay.connect(wet).connect(this.musicBus);
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }

  async resume() { this.ensure(); if (this.ctx.state !== 'running') await this.ctx.resume(); }
  now() { return this.ctx ? this.ctx.currentTime : performance.now() / 1000; }

  applyMusicGain() {
    if (!this.musicBus) return;
    const v = this.musicOn ? 0.55 * this.musicLevel : 0;
    this.musicBus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.08);
  }
  setMusic(on) { this.musicOn = on; this.applyMusicGain(); }
  setMusicLevel(x) { this.musicLevel = x; this.applyMusicGain(); }

  // ================================================================ songs
  // Synth song: mode 'loop' repeats the loop section forever (tempo can be re-gridded);
  // mode 'song' plays the arrangement once from beat 0 at t0, then calls onSongEnd.
  playSynth(song, { mode = 'loop', t0, spb, fromBeat = 0 }) {
    this.stopSong();
    this.song = song; this.mode = mode;
    this.plan = songPlan(song);
    this.counters = {};
    this.spb = spb ?? 60 / song.bpm;
    this.t0 = t0 ?? this.ctx.currentTime + 0.1;
    this.nextStep = Math.max(Math.ceil((this.ctx.currentTime + 0.02 - this.t0) / (this.spb / 4)), Math.round(fromBeat * 4));
    this.delay.delayTime.setValueAtTime(Math.min(0.99, this.spb * 0.75), this.ctx.currentTime);
    this.playing = true;
    clearInterval(this.timer);
    this.timer = setInterval(() => this.pump(), 25);
    this.pump();
  }

  // Re-anchor the beat grid (endless speed changes / resume after pause).
  setGrid(t0, spb) {
    this.t0 = t0; this.spb = spb;
    this.delay.delayTime.setValueAtTime(Math.min(0.99, spb * 0.75), this.ctx.currentTime);
    this.nextStep = Math.ceil((this.ctx.currentTime + 0.02 - this.t0) / (spb / 4));
  }

  // Pause: stop scheduling (synth) or stop the source remembering its position (audio file).
  pauseSong() {
    this.pausedAt = this.ctx.currentTime;
    this.wasPlaying = this.playing || !!this.bufSrc;
    this.playing = false; clearInterval(this.timer);
    if (this.bufSrc) {
      this.pausedPos = Math.max(0, this.ctx.currentTime - this.bufStart) + this.bufStartOffset;
      const s = this.bufSrc; this.bufSrc = null;
      try { s.stop(); } catch { /* already stopped */ }
    }
  }
  // Resume with the whole timeline pushed d seconds later than when it was paused.
  resumeSong(d) {
    if (!this.wasPlaying) return;
    if (this.buffer) { this.bufferOffset = this.pausedPos; this.startBuffer(this.pausedAt + d); return; }
    this.t0 += d;
    this.playing = true; clearInterval(this.timer); this.timer = setInterval(() => this.pump(), 25);
  }

  stopSong() {
    this.playing = false; clearInterval(this.timer); this.timer = null;
    if (this.bufSrc) { try { this.bufSrc.stop(); } catch { /* */ } this.bufSrc = null; }
    this.buffer = null;
  }

  pump() {
    if (!this.playing || !this.ctx) return;
    const step = this.spb / 4;
    const horizon = this.ctx.currentTime + 0.12;
    while (this.t0 + this.nextStep * step < horizon) {
      const i = this.nextStep;
      if (this.mode === 'song' && i >= this.plan.bars.length * 16) {
        this.playing = false; clearInterval(this.timer);
        const endAt = this.t0 + i * step;
        setTimeout(() => this.onSongEnd && this.onSongEnd(), Math.max(0, (endAt - this.ctx.currentTime) * 1000));
        return;
      }
      if (i >= 0) this.playStep(i, this.t0 + i * step);
      this.nextStep++;
    }
  }

  playStep(i, t) {
    const song = this.song;
    const barIdx = Math.floor(i / 16);
    const bar = this.mode === 'song' ? this.plan.bars[barIdx] : this.plan.loop[barIdx % this.plan.loop.length];
    if (!bar) return;
    const prog = song.progression || [[57, 60, 64]];
    const chord = prog[(this.mode === 'song' ? barIdx : barIdx) % prog.length];
    for (const [name, tr] of Object.entries(song.tracks || {})) {
      if (!bar.tracks.has(name)) continue;
      const pat = tr.pattern || 'x...............';
      const ch = pat[i % pat.length];
      if (ch === '.' || ch === '-' || ch === ' ') continue;
      const vel = (ch === 'X' ? 1 : ch === 'o' ? 0.55 : 0.85) * (tr.vol ?? 1);
      const dur = (tr.len ?? 1) * this.spb / 4;
      const oct = (tr.octave ?? 0) * 12;
      const notes = this.pickNotes(name, tr, chord, oct);
      for (const n of notes) this.instrument(tr.inst, n, t, dur, vel, tr);
    }
  }

  pickNotes(name, tr, chord, oct) {
    const c = (this.counters[name] = (this.counters[name] || 0) + 1) - 1;
    switch (tr.notes) {
      case 'chord': return chord.map((n) => n + oct);
      case 'arp': return [chord[c % chord.length] + oct];
      case 'arpud': { const seq = [...chord, chord[1]]; return [seq[c % seq.length] + oct]; }
      case 'seq': return [chord[0] + tr.seq[c % tr.seq.length] + oct];
      case 'fixed': return [tr.note];
      case 'root': return [chord[0] + oct];
      default: return [null];
    }
  }

  // ---- audio-file songs ----
  async loadBuffer(url) {
    this.ensure();
    const r = await fetch(url); const ab = await r.arrayBuffer();
    return this.ctx.decodeAudioData(ab);
  }
  playBuffer(buffer, when, offset = 0) {
    this.stopSong();
    this.buffer = buffer; this.bufferOffset = offset; this.mode = 'song';
    this.startBuffer(when);
  }
  startBuffer(when) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer; src.connect(this.musicBus);
    src.onended = () => { if (this.bufSrc === src && this.onSongEnd) this.onSongEnd(); };
    const at = Math.max(this.ctx.currentTime, when);
    this.bufStartOffset = Math.max(0, this.bufferOffset + Math.max(0, this.ctx.currentTime - when));
    src.start(at, this.bufStartOffset);
    this.bufStart = at;
    this.bufSrc = src;
  }

  // ================================================================ instruments
  instrument(inst, midi, t, dur, vel, tr = {}) {
    const out = this.musicBus;
    const f = midi == null ? 0 : mtof(midi);
    switch (inst) {
      case 'kick': return this.kick(t, vel, out);
      case 'snare': return this.snare(t, vel, out);
      case 'clap': return this.clap(t, vel, out);
      case 'hat': return this.noiseHit(t, out, 0.09 * vel, 0.045, 'highpass', 7500);
      case 'openhat': return this.noiseHit(t, out, 0.07 * vel, 0.22, 'highpass', 6500);
      case 'shaker': return this.noiseHit(t, out, 0.05 * vel, 0.06, 'bandpass', 5000);
      case 'tom': return this.tom(t, vel, out, f || 110);
      case 'bass': return this.osc(f, t, dur * 0.9, 'sawtooth', 0.17 * vel, out, tr.cutoff || 520, false, 0.005, 3);
      case 'sub': return this.osc(f, t, dur, 'sine', 0.3 * vel, out, 400);
      case 'pluck': return this.osc(f, t, Math.max(dur, 0.18), tr.wave || 'triangle', 0.09 * vel, out, tr.cutoff || 3000, true, 0.003, 6);
      case 'lead': return this.osc(f, t, dur, tr.wave || 'square', 0.05 * vel, out, tr.cutoff || 2600, true, 0.01, 0, true);
      case 'pad': return this.pad(f, t, dur, vel, out, tr);
      case 'organ': return this.organ(f, t, dur, vel, out);
      case 'bell': return this.bell(f, t, vel, out);
      case 'riser': return this.riser(t, dur, vel, out);
      default: return null;
    }
  }

  osc(freq, t, dur, type, vol, out, cutoff = 3000, send = false, attack = 0.005, filterEnv = 0, vibrato = false) {
    if (!freq) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = cutoff;
    if (filterEnv) {
      fl.frequency.setValueAtTime(cutoff * filterEnv, t);
      fl.frequency.exponentialRampToValueAtTime(cutoff, t + Math.min(dur, 0.25));
    }
    if (vibrato) {
      const l = ctx.createOscillator(); l.frequency.value = 5.5; const lg = ctx.createGain(); lg.gain.value = freq * 0.006;
      l.connect(lg).connect(o.frequency); l.start(t); l.stop(t + dur + 0.1);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.02);
    o.connect(fl).connect(g).connect(out);
    if (send) g.connect(this.delay);
    o.start(t); o.stop(t + dur + 0.08);
  }

  pad(freq, t, dur, vel, out, tr) {
    if (!freq) return;
    const ctx = this.ctx;
    const g = ctx.createGain();
    const atk = tr.attack ?? 0.25;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.028 * vel, t + atk);
    g.gain.setValueAtTime(0.028 * vel, t + Math.max(atk, dur - 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.4);
    const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = tr.cutoff || 1400;
    fl.connect(g).connect(out); g.connect(this.delay);
    for (const det of [-7, 7]) {
      const o = ctx.createOscillator(); o.type = tr.wave || 'sawtooth'; o.frequency.value = freq; o.detune.value = det;
      o.connect(fl); o.start(t); o.stop(t + dur + 0.5);
    }
  }

  organ(freq, t, dur, vel, out) {
    if (!freq) return;
    for (const [h, a] of [[1, 0.05], [2, 0.03], [3, 0.018], [4, 0.01]]) this.osc(freq * h, t, dur, 'sine', a * vel, out, 6000, true, 0.02);
  }

  bell(freq, t, vel, out) {
    if (!freq) return;
    const ctx = this.ctx;
    const car = ctx.createOscillator(); car.frequency.value = freq;
    const mod = ctx.createOscillator(); mod.frequency.value = freq * 3.5;
    const mg = ctx.createGain(); mg.gain.setValueAtTime(freq * 2, t); mg.gain.exponentialRampToValueAtTime(1, t + 1.2);
    mod.connect(mg).connect(car.frequency);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.06 * vel, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    car.connect(g).connect(out); g.connect(this.delay);
    car.start(t); mod.start(t); car.stop(t + 1.7); mod.stop(t + 1.7);
  }

  kick(t, vel, out) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.setValueAtTime(155, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(0.95 * vel, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
    o.connect(g).connect(out); o.start(t); o.stop(t + 0.42);
    this.noiseHit(t, out, 0.08 * vel, 0.015, 'highpass', 3000);
  }
  tom(t, vel, out, f) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.setValueAtTime(f * 1.6, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.15);
    g.gain.setValueAtTime(0.4 * vel, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g).connect(out); o.start(t); o.stop(t + 0.4);
  }
  noiseHit(t, out, vol, dur, type, freq, q = 1) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.02);
  }
  snare(t, vel, out) { this.noiseHit(t, out, 0.32 * vel, 0.17, 'bandpass', 1900); this.osc(185, t, 0.09, 'triangle', 0.14 * vel, out); }
  clap(t, vel, out) { for (let k = 0; k < 3; k++) this.noiseHit(t + k * 0.011, out, 0.22 * vel, 0.09 + k * 0.03, 'bandpass', 1300, 1.5); }
  riser(t, dur, vel, out) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2;
    f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(8000, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.001, t); g.gain.exponentialRampToValueAtTime(0.12 * vel, t + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
    src.connect(f).connect(g).connect(out); src.start(t); src.stop(t + dur + 0.1);
  }

  // ================================================================ ambience
  setAmbient(type) {
    if (!this.ctx) return;
    for (const n of this.ambientNodes) { try { n.stop ? n.stop() : n.disconnect(); } catch { /* */ } }
    for (const id of this.ambientTimers) clearTimeout(id);
    this.ambientNodes = []; this.ambientTimers = [];
    const ctx = this.ctx, out = this.ambBus;
    const noiseLoop = (type, freq, q, vol) => {
      const s = ctx.createBufferSource(); s.buffer = this.noise; s.loop = true;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = vol;
      s.connect(f).connect(g).connect(out); s.start();
      this.ambientNodes.push(s);
      return { f, g };
    };
    const lfo = (param, rate, depth) => {
      const o = ctx.createOscillator(); o.frequency.value = rate;
      const g = ctx.createGain(); g.gain.value = depth; o.connect(g).connect(param); o.start();
      this.ambientNodes.push(o);
    };
    const every = (min, max, fn) => {
      const tick = () => { fn(); this.ambientTimers.push(setTimeout(tick, (min + Math.random() * (max - min)) * 1000)); };
      this.ambientTimers.push(setTimeout(tick, (min * 0.5) * 1000));
    };
    if (type === 'ocean') {
      const a = noiseLoop('lowpass', 520, 0.6, 0.35); lfo(a.g.gain, 0.09, 0.28);
      const b = noiseLoop('bandpass', 1400, 0.4, 0.08); lfo(b.g.gain, 0.13, 0.07); lfo(b.f.frequency, 0.05, 500);
      every(18, 34, () => this.foghorn());
    } else if (type === 'wind') {
      const a = noiseLoop('bandpass', 420, 0.8, 0.22); lfo(a.f.frequency, 0.07, 260); lfo(a.g.gain, 0.05, 0.12);
      every(25, 55, () => this.thunder());
    } else if (type === 'space') {
      for (const [f, v] of [[55, 0.05], [55.4, 0.05], [82.5, 0.025]]) {
        const o = ctx.createOscillator(); o.frequency.value = f; const g = ctx.createGain(); g.gain.value = v;
        o.connect(g).connect(out); o.start(); this.ambientNodes.push(o);
      }
      const h = noiseLoop('highpass', 6000, 0.5, 0.012); lfo(h.g.gain, 0.04, 0.01);
    } else if (type === 'rain') {
      noiseLoop('highpass', 2500, 0.3, 0.05);
      const low = noiseLoop('lowpass', 200, 0.5, 0.06); lfo(low.g.gain, 0.03, 0.03);
    }
  }
  foghorn() {
    const ctx = this.ctx, t = ctx.currentTime, out = this.ambBus;
    for (const f of [73, 110]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 380;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.09, t + 0.9);
      g.gain.setValueAtTime(0.09, t + 2.6); g.gain.exponentialRampToValueAtTime(0.0001, t + 4.2);
      o.connect(fl).connect(g).connect(out); o.start(t); o.stop(t + 4.3);
    }
  }
  thunder() {
    const t = this.ctx.currentTime;
    this.noiseHit(t, this.ambBus, 0.5, 3.5, 'lowpass', 140);
    this.noiseHit(t + 0.15, this.ambBus, 0.25, 2.2, 'lowpass', 300);
  }

  // ================================================================ SFX
  sfxHit(power = 0.6, idx = 0, style = 'zap') {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, out = this.sfxBus;
    this.noiseHit(t, out, 0.45 + power * 0.45, 0.1 + power * 0.06, 'lowpass', 1200 + power * 3000);
    this.osc(80 + power * 50, t, 0.2, 'sine', 0.55 + power * 0.3, out);
    const notes = [880, 988, 1175, 1319, 1480, 1760];
    const n = notes[idx % notes.length];
    if (style === 'thud') { // pumpkin: crunchy squash + spooky low note
      this.noiseHit(t, out, 0.35, 0.22, 'bandpass', 700, 0.8);
      this.osc(n / 4, t, 0.3, 'square', 0.06, out, 900);
    } else if (style === 'chime') { // orb: glassy bell
      this.bell(n, t, 0.8, out);
    } else {
      this.osc(n, t, 0.22, 'triangle', 0.12, out, 6000);
    }
  }
  sfxMiss() { if (!this.ctx) return; const t = this.ctx.currentTime; this.osc(160, t, 0.25, 'sawtooth', 0.12, this.sfxBus, 400); this.osc(110, t + 0.08, 0.3, 'sawtooth', 0.1, this.sfxBus, 300); }
  sfxWrong() { if (!this.ctx) return; const t = this.ctx.currentTime; this.osc(220, t, 0.12, 'square', 0.1, this.sfxBus, 900); this.osc(207, t + 0.1, 0.15, 'square', 0.1, this.sfxBus, 900); }
  sfxClick() { if (!this.ctx) return; this.osc(1400, this.ctx.currentTime, 0.05, 'triangle', 0.12, this.sfxBus, 8000); }
  sfxSpeedUp() { if (!this.ctx) return; const t = this.ctx.currentTime; this.riser(t, 0.8, 1, this.sfxBus); [523, 659, 784, 1047].forEach((f, i) => this.osc(f, t + 0.7 + i * 0.07, 0.25, 'square', 0.06, this.sfxBus, 4000)); }
  sfxGameOver() { if (!this.ctx) return; const t = this.ctx.currentTime; [392, 330, 262, 196].forEach((f, i) => this.osc(f, t + i * 0.18, 0.4, 'sawtooth', 0.1, this.sfxBus, 1200)); }
  sfxComplete() { if (!this.ctx) return; const t = this.ctx.currentTime; [523, 659, 784, 1047, 1319].forEach((f, i) => this.bell(f, t + i * 0.09, 0.9, this.sfxBus)); }
}
