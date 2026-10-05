// BOXFLOW — shared configuration: the fixed sequence, colors, and tuning constants.

// Action definitions. `hand` is the hand that must throw it, `dir` is the expected
// fist motion direction (world space, player faces -Z), `offset` is the hit-zone
// position relative to the player's head (meters).
export const ACTIONS = {
  JAB:      { id: 'JAB',      label: 'JAB',       hand: 'left',  color: 0x22d3ff, dir: [0, 0, -1],   offset: [-0.13, -0.08, -0.48], arrow: 'fwd',   key: 'F' },
  CROSS:    { id: 'CROSS',    label: 'CROSS',     hand: 'right', color: 0xff3355, dir: [0, 0, -1],   offset: [ 0.13, -0.08, -0.50], arrow: 'fwd',   key: 'J' },
  L_HOOK:   { id: 'L_HOOK',   label: 'L HOOK',    hand: 'left',  color: 0x33ff88, dir: [1, 0, -0.3], offset: [-0.26, -0.10, -0.40], arrow: 'right', key: 'D' },
  R_HOOK:   { id: 'R_HOOK',   label: 'R HOOK',    hand: 'right', color: 0xffd23f, dir: [-1, 0, -0.3],offset: [ 0.26, -0.10, -0.40], arrow: 'left',  key: 'K' },
  L_UPPER:  { id: 'L_UPPER',  label: 'L UPPER',   hand: 'left',  color: 0xb36bff, dir: [0, 1, -0.3], offset: [-0.12, -0.30, -0.36], arrow: 'up',    key: 'S' },
  R_UPPER:  { id: 'R_UPPER',  label: 'R UPPER',   hand: 'right', color: 0xff8a2b, dir: [0, 1, -0.3], offset: [ 0.12, -0.30, -0.36], arrow: 'up',    key: 'L' },
};

// The fixed loop, taken from the reference videos (Box_look_01 / Box_loop_02):
// Right uppercut → Jab → Right hook → Left uppercut → Right cross → Left hook → repeat.
export const SEQUENCE = ['R_UPPER', 'JAB', 'R_HOOK', 'L_UPPER', 'CROSS', 'L_HOOK'];

export const SPEED = {
  min: 0.1,
  max: 10,
  default: 1,
  baseInterval: 3.0, // seconds between targets at 1×
};

export const TUNING = {
  spawnDistance: 14,      // meters in front of the hit zone where targets appear
  minTravel: 1.1,         // seconds a target takes to reach the hit zone (fastest)
  maxTravel: 7.0,         // (slowest)
  travelIntervals: 2.2,   // travel time ≈ this many target intervals
  maxWindow: 0.38,        // ± seconds around the beat a hit is accepted
  zoneRadius: 0.21,       // meters — fist must enter this sphere around the hit zone
  minHitSpeed: 0.9,       // m/s fist speed for a valid punch
  wrongHandSpeed: 1.4,    // m/s — a faster wrong-hand entry counts as a mistake
  fullPowerSpeed: 4.0,    // m/s speed that scores 100% power
  leadIn: 2.0,            // seconds before the first target reaches the hit zone (min)
};

export const intervalFor = (speed) => SPEED.baseInterval / speed;
export const travelFor = (speed) =>
  Math.min(TUNING.maxTravel, Math.max(TUNING.minTravel, intervalFor(speed) * TUNING.travelIntervals));
export const windowFor = (speed) => Math.min(TUNING.maxWindow, intervalFor(speed) * 0.45);

export const hex = (c) => '#' + c.toString(16).padStart(6, '0');
