// Game rules and the stick simulation. Pure functions, no DOM — testable in Node.

export const TARGET = 0.111;      // cm
export const L0 = 5;              // starting length, cm
// Speed curve fitted to the reference clip: ~1.85 cm/s while the stick is long,
// rising to ~4 cm/s over the last 4 cm. Speed depends on length, so a 5 cm stick
// starts in the fast part of the curve.
export const V_SLOW = 1.85;       // cm/s while the stick is long
export const V_RISE = 2.2;        // extra cm/s near the end
export const RISE_AT = 4.4;       // cm, middle of the speed-up
export const RISE_W = 0.8;        // cm, how gradual the speed-up is
export const HANDLE = 2.4;        // uncoated biscuit end, cm (drawn below 0)
export const BITE_CM = 0.08;      // depth of the bite marks, cm
export const NO_BEST = 15;        // stored as `best` when every play so far ate the whole stick

// Stick types, each with its own leaderboard.
export const STICKS = {
  normal: { name: '기본', full: '기본 스틱', level: '', speed: 1, wobble: 0 },
  almond: { name: '아몬드', full: '아몬드 스틱', level: '중', speed: 1.2, wobble: 0 },
  cookie: { name: '쿠키', full: '쿠키 스틱', level: '상', speed: 1.45, wobble: 0.3 },
};
export const STICK_IDS = Object.keys(STICKS);

// Odd sticks: 40% of rounds get one surprise.
export const VARIANTS = {
  normal: { name: '기본', p: 0.6 },
  accel: { name: '급가속', p: 0.14, flash: '급가속!' },
  freeze: { name: '멈칫', p: 0.13, flash: '멈칫!' },
  wobble: { name: '출렁', p: 0.13, flash: '출렁출렁' },
};

export function makeRound(rand = Math.random, stick = 'normal') {
  let r = rand();
  let variant = 'normal';
  for (const [key, v] of Object.entries(VARIANTS)) {
    if (r < v.p) { variant = key; break; }
    r -= v.p;
  }
  const st = STICKS[stick] || STICKS.normal;
  const p = {
    variant,
    stick: STICKS[stick] ? stick : 'normal',
    speed: st.speed,
    shake: st.wobble,
    shakeF: 2.2 + rand() * 0.8,      // Hz, cookie stick's built-in unsteadiness
    shakePh: rand() * Math.PI * 2,
    accelAt: 0.8 + rand() * 2.7,     // cm, speed jumps when the stick gets this short
    accelX: 1.6,
    freezeAt: 0.4 + rand() * 3,      // cm, stick pauses here
    freezeDur: 0.35 + rand() * 0.4,  // s
    wobF: 1.1 + rand() * 0.5,        // Hz
    wobPh: rand() * Math.PI * 2,
  };
  const bite = [];
  const n = 7;
  for (let i = 0; i <= n; i++) bite.push(i === 0 || i === n ? 0.55 + rand() * 0.45 : rand());
  bite[1 + Math.floor(rand() * (n - 1))] = 0;
  return { p, bite, s: freshState(), cps: [], events: [] };
}

const DT = 0.001; // fixed 1 ms grid, so the result never depends on frame timing
const freshState = () => ({ n: 0, t: 0, L: L0, accelOn: false, freezeT: -1 });

// Base speed: steady, then speeds up over the last few centimetres (logistic in length).
export const baseSpeed = (L) => V_SLOW + V_RISE / (1 + Math.exp((L - RISE_AT) / RISE_W));

function rate(p, s) {
  if (s.freezeT >= 0 && s.t < s.freezeT + p.freezeDur) return 0;
  let m = p.speed;
  if (p.shake) m *= 1 + p.shake * Math.sin(2 * Math.PI * p.shakeF * s.t + p.shakePh);
  if (p.variant === 'accel' && s.accelOn) m *= p.accelX;
  if (p.variant === 'wobble') m *= Math.max(0.5, 1 + 0.45 * Math.sin(2 * Math.PI * p.wobF * s.t + p.wobPh));
  return m * baseSpeed(s.L);
}

// Steps s along the grid up to t and returns the length at exactly t (sub-step interpolated, s untouched by it).
function stepTo(p, s, t, events) {
  const target = Math.floor(t / DT + 1e-9);
  while (s.n < target && s.L > 0) {
    s.L -= rate(p, s) * DT;
    s.n += 1;
    s.t = s.n * DT;
    if (p.variant === 'accel' && !s.accelOn && s.L <= p.accelAt) {
      s.accelOn = true;
      if (events) events.push({ type: 'accel', t: s.t });
    }
    if (p.variant === 'freeze' && s.freezeT < 0 && s.L <= p.freezeAt) {
      s.freezeT = s.t;
      if (events) events.push({ type: 'freeze', t: s.t });
    }
  }
  if (s.L < 0) s.L = 0;
  const frac = t - s.t;
  return s.L > 0 && frac > 0 ? Math.max(0, s.L - rate(p, s) * frac) : s.L;
}

/** Move the live round forward to tSec (called once per frame). */
export function advance(round, tSec) {
  if (Math.floor(tSec / DT + 1e-9) > round.s.n) round.cps.push({ ...round.s });
  return stepTo(round.p, round.s, tSec, round.events);
}

/** Length at any moment of the round, without disturbing the live state. Used for the exact tap time. */
export function lengthAt(round, tSec) {
  let base = null;
  if (round.s.t <= tSec) base = round.s;
  else {
    for (let i = round.cps.length - 1; i >= 0; i--) {
      if (round.cps[i].t <= tSec) { base = round.cps[i]; break; }
    }
  }
  const s = { ...(base || freshState()) };
  return stepTo(round.p, s, tSec, null);
}

export const round3 = (v) => Math.round(v * 1000) / 1000;
export const errOf = (len) => Math.abs(Math.round(len * 1000) - Math.round(TARGET * 1000)) / 1000;

export function diffText(len, err) {
  if (len <= 0) return '끝까지 다 먹어버렸어요';
  if (err === 0) return '오차 0.000cm';
  return len > TARGET ? `목표보다 ${err.toFixed(3)}cm 길어요` : `목표보다 ${err.toFixed(3)}cm 짧아요`;
}

/** A stored best that counts for ranking: a real stop, not a stick eaten to 0. */
export const hasBest = (r) => !!r && typeof r.best === 'number' && typeof r.bestLen === 'number' && r.bestLen > 0;

/**
 * Merge one play into a player's record. Eating the whole stick (0.000cm) is a miss:
 * it counts as a play but never becomes the best.
 */
export function nextRecord(prev, len, err, now) {
  const had = hasBest(prev);
  const valid = len > 0;
  const isPB = valid && (!had || err < prev.best);
  let best, bestLen, bestAt;
  if (isPB) { best = err; bestLen = len; bestAt = now; }
  else if (had) { best = prev.best; bestLen = prev.bestLen; bestAt = prev.bestAt; }
  else { best = NO_BEST; bestLen = 0; bestAt = now; }
  return {
    rec: { best, bestLen, bestAt, tries: ((prev && prev.tries) || 0) + 1, lastLen: len, lastAt: now },
    isPB: isPB && had,
  };
}
