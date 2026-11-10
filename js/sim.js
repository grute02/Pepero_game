// Game rules and the stick simulation. Pure functions, no DOM — testable in Node.

export const TARGET = 0.111;      // cm
export const L0 = 15;             // starting length, cm
export const DRAG = 0.45;         // floor speed, cm/s
export const HANDLE = 2.4;        // uncoated biscuit end, cm (drawn below 0)
export const BITE_CM = 0.08;      // depth of the bite marks, cm
export const BLIND_BELOW = 1.0;   // blind mode hides the readout below this length, cm
export const BLIND_FOG = 1.2;     // blind mode fogs the stage below this length, cm

// Odd sticks: 40% of rounds get one surprise.
export const VARIANTS = {
  normal: { name: '기본 스틱', p: 0.6 },
  accel: { name: '급가속 스틱', p: 0.14, flash: '급가속!' },
  freeze: { name: '멈칫 스틱', p: 0.13, flash: '멈칫!' },
  wobble: { name: '출렁 스틱', p: 0.13, flash: '출렁출렁' },
};

export function makeRound(rand = Math.random) {
  let r = rand();
  let variant = 'normal';
  for (const [key, v] of Object.entries(VARIANTS)) {
    if (r < v.p) { variant = key; break; }
    r -= v.p;
  }
  const p = {
    variant,
    k: 1.25 + rand() * 0.3,
    accelAt: 1.2 + rand() * 2.3,     // cm, speed jumps when the stick gets this short
    accelX: 1.9,
    freezeAt: 0.35 + rand() * 2.15,  // cm, stick pauses here
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

// dL/dt = -m(t)·(k·L + DRAG): fast at first, slower near the end, so stopping is skill, not luck.
function rate(p, s) {
  if (s.freezeT >= 0 && s.t < s.freezeT + p.freezeDur) return 0;
  let m = 1;
  if (p.variant === 'accel' && s.accelOn) m = p.accelX;
  if (p.variant === 'wobble') m = Math.max(0.45, 1 + 0.55 * Math.sin(2 * Math.PI * p.wobF * s.t + p.wobPh));
  return m * (p.k * s.L + DRAG);
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

export const GRADES = {
  P: { label: 'P', name: '11.11 퍼펙트', msg: '정확히 0.111cm. 오늘의 전설이에요.' },
  S: { label: 'S', name: '장인', msg: '손끝이 캘리퍼 수준이에요.' },
  A: { label: 'A', name: '정밀', msg: '아주 가까워요. 한 판 더 하면 S도 보여요.' },
  B: { label: 'B', name: '준수', msg: '나쁘지 않아요. 타이밍을 조금만 더 다듬어 보세요.' },
  C: { label: 'C', name: '아쉬움', msg: '' },
  D: { label: 'D', name: '성급함', msg: '너무 일찍 멈췄어요. 끝까지 기다려 보세요.' },
  F: { label: '완식', name: '다 먹어버렸어요', msg: '0.000cm. 한 박자만 빨리 눌러 보세요.' },
};

export function tierOf(len, err) {
  if (len <= 0) return 'F';
  if (err === 0) return 'P';
  if (err <= 0.005) return 'S';
  if (err <= 0.02) return 'A';
  if (err <= 0.06) return 'B';
  if (err <= 0.2) return 'C';
  return 'D';
}

export function gradeMessage(tier, len) {
  if (tier !== 'C') return GRADES[tier].msg;
  return len > TARGET ? '조금 일찍 눌렀어요. 반 박자만 더 기다려 보세요.' : '조금 늦었어요. 반 박자만 빨리 눌러 보세요.';
}

export function diffText(len, err) {
  if (err === 0) return '오차 0.000cm';
  return len > TARGET ? `목표보다 ${err.toFixed(3)}cm 길어요` : `목표보다 ${err.toFixed(3)}cm 짧아요`;
}

/** Merge one play into a player's record for a mode. */
export function nextRecord(prev, len, err, now) {
  const had = !!prev && typeof prev.best === 'number';
  const isPB = !had || err < prev.best;
  return {
    rec: {
      best: isPB ? err : prev.best,
      bestLen: isPB ? len : prev.bestLen,
      bestAt: isPB ? now : prev.bestAt,
      tries: ((prev && prev.tries) || 0) + 1,
      lastLen: len,
      lastAt: now,
    },
    isPB: isPB && had,
  };
}
