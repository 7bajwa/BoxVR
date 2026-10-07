// BOXFLOW — shared configuration: actions, the fixed training sequence, tuning constants.

// `hand` must throw it; `dir` is the required fist motion (player faces -Z); `offset` is the
// hit-zone position: x/z relative to the player, y relative to the TARGET HEIGHT setting.
export const ACTIONS = {
  JAB:     { id: 'JAB',     label: 'JAB',     hand: 'left',  color: 0x22d3ff, dir: [0, 0, -1],    offset: [-0.13,  0.00, -0.48], arrow: 'fwd',   key: 'F' },
  CROSS:   { id: 'CROSS',   label: 'CROSS',   hand: 'right', color: 0xff3355, dir: [0, 0, -1],    offset: [ 0.13,  0.00, -0.50], arrow: 'fwd',   key: 'J' },
  L_HOOK:  { id: 'L_HOOK',  label: 'L HOOK',  hand: 'left',  color: 0x33ff88, dir: [1, 0, -0.3],  offset: [-0.26, -0.02, -0.40], arrow: 'right', key: 'D' },
  R_HOOK:  { id: 'R_HOOK',  label: 'R HOOK',  hand: 'right', color: 0xffd23f, dir: [-1, 0, -0.3], offset: [ 0.26, -0.02, -0.40], arrow: 'left',  key: 'K' },
  L_UPPER: { id: 'L_UPPER', label: 'L UPPER', hand: 'left',  color: 0xb36bff, dir: [0, 1, -0.3],  offset: [-0.12, -0.22, -0.36], arrow: 'up',    key: 'S' },
  R_UPPER: { id: 'R_UPPER', label: 'R UPPER', hand: 'right', color: 0xff8a2b, dir: [0, 1, -0.3],  offset: [ 0.12, -0.22, -0.36], arrow: 'up',    key: 'L' },
};

// The fixed loop from the reference videos:
// Right uppercut → Jab → Right hook → Left uppercut → Right cross → Left hook → repeat.
export const SEQUENCE = ['R_UPPER', 'JAB', 'R_HOOK', 'L_UPPER', 'CROSS', 'L_HOOK'];

export const SPEED = { min: 0.1, max: 10, default: 1, baseInterval: 3.0 }; // 1× = one target / 3 s

export const DIFFICULTIES = ['easy', 'normal', 'hard', 'expert'];
// Approach time (s) per song difficulty — how long a target flies before reaching the gate.
export const DIFF_TRAVEL = { easy: 2.6, normal: 2.2, hard: 1.8, expert: 1.5 };

export const TUNING = {
  spawnDistance: 14,      // meters in front of the hit zone where targets appear
  minTravel: 1.1,
  maxTravel: 7.0,
  travelIntervals: 2.2,   // endless: travel time ≈ this many target intervals
  maxWindow: 0.38,        // ± seconds around the beat a hit is accepted
  zoneRadius: 0.21,       // meters — fist must enter this sphere around the hit zone
  minHitSpeed: 0.9,       // m/s fist speed for a valid punch
  wrongHandSpeed: 1.4,    // m/s — a faster wrong-hand entry counts as a mistake
  fullPowerSpeed: 4.5,    // m/s peak speed for 100% power
  fullSwing: 0.45,        // meters of travel along the punch direction for 100% swing
  dirOk: 0.45,            // cos(angle) needed between fist motion and target direction
  leadIn: 2.0,
  missesForGameOver: 3,
};

export const intervalFor = (speed) => SPEED.baseInterval / speed;
export const travelFor = (speed) =>
  Math.min(TUNING.maxTravel, Math.max(TUNING.minTravel, intervalFor(speed) * TUNING.travelIntervals));
export const windowFor = (speed) => Math.min(TUNING.maxWindow, intervalFor(speed) * 0.45);

export const hex = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0');
