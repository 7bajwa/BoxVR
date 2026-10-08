// BOXFLOW — shared configuration: actions, the fixed training sequence, tuning constants.

// `hand` must throw it; `dir` is the required fist motion (player faces -Z); `offset` is the
// hit-zone position: x/z relative to the player, y relative to the TARGET HEIGHT setting.
// Two colours only: which HAND. The arrows on a target show which DIRECTION.
export const HAND_COLORS = { left: 0x2fa8ff, right: 0xff3d7f };
const L = HAND_COLORS.left, R = HAND_COLORS.right;

// `zone` = half-extents (x, y, z in m) of the forgiving hit volume around the hit point:
// straights are deep (you can meet the target a little early), uppercuts are tall.
export const ACTIONS = {
  JAB:     { id: 'JAB',     label: 'JAB',     hand: 'left',  color: L, dir: [0, 0, -1],    offset: [-0.13,  0.00, -0.48], zone: [0.22, 0.22, 0.38], arrow: 'fwd',   key: 'F' },
  CROSS:   { id: 'CROSS',   label: 'CROSS',   hand: 'right', color: R, dir: [0, 0, -1],    offset: [ 0.13,  0.00, -0.50], zone: [0.22, 0.22, 0.38], arrow: 'fwd',   key: 'J' },
  L_HOOK:  { id: 'L_HOOK',  label: 'L HOOK',  hand: 'left',  color: L, dir: [1, 0, -0.3],  offset: [-0.24, -0.02, -0.40], zone: [0.32, 0.22, 0.32], arrow: 'right', key: 'D' },
  R_HOOK:  { id: 'R_HOOK',  label: 'R HOOK',  hand: 'right', color: R, dir: [-1, 0, -0.3], offset: [ 0.24, -0.02, -0.40], zone: [0.32, 0.22, 0.32], arrow: 'left',  key: 'K' },
  L_UPPER: { id: 'L_UPPER', label: 'L UPPER', hand: 'left',  color: L, dir: [0, 1, -0.4],  offset: [-0.12, -0.20, -0.40], zone: [0.24, 0.34, 0.34], arrow: 'up',    key: 'S' },
  R_UPPER: { id: 'R_UPPER', label: 'R UPPER', hand: 'right', color: R, dir: [0, 1, -0.4],  offset: [ 0.12, -0.20, -0.40], zone: [0.24, 0.34, 0.34], arrow: 'up',    key: 'L' },
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
  minHitSpeed: 0.9,       // m/s fist speed for a valid punch
  wrongHandSpeed: 1.4,    // m/s — a faster wrong-hand entry counts as a mistake
  fullPowerSpeed: 4.5,    // m/s peak speed for 100% power
  fullSwing: 0.45,        // meters of travel along the punch direction for 100% swing
  dirOk: 0.4,             // cos(angle) needed between fist motion and target direction (uppercuts use dirOkUpper)
  dirOkUpper: 0.45,       // uppercuts: judged on their fastest (upward) moment; a flat jab (0.37) fails
  leadIn: 2.0,
  missesForGameOver: 3,
  rampStep: 0.1,          // speed ramp: +0.1× ...
  rampEvery: 6,           // ... every 6 seconds (≈ +1× per minute, but smooth)
  hurdleEveryTargets: 7,  // endless: one hurdle roughly every N targets
  duckDepth: 0.26,        // how far below standing head height you must go under a duck bar
  sideClear: 0.14,        // how far past the lane centre your head must lean for side hurdles
};

export const intervalFor = (speed) => SPEED.baseInterval / speed;
export const travelFor = (speed) =>
  Math.min(TUNING.maxTravel, Math.max(TUNING.minTravel, intervalFor(speed) * TUNING.travelIntervals));
export const windowFor = (speed) => Math.min(TUNING.maxWindow, intervalFor(speed) * 0.45);

export const hex = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0');
