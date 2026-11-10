// Canvas drawing: the game stage and the shareable result card.
import { TARGET, L0, HANDLE, BITE_CM } from './sim.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const TOKENS = ['stage', 'ink', 'muted', 'rule', 'hair', 'choco', 'choco-hi', 'biscuit', 'biscuit-lo', 'mark', 'panel'];
export function readTokens() {
  const cs = getComputedStyle(document.documentElement);
  const T = {};
  for (const n of TOKENS) T[n] = cs.getPropertyValue('--' + n).trim();
  T.mono = cs.getPropertyValue('--f-mono').trim() || 'monospace';
  return T;
}

// Fixed light palette for the result card, so shared images look the same everywhere.
export const CARD_T = {
  stage: '#FFFFFF', bg: '#ECEFF2', ink: '#1B2127', muted: '#63707C', rule: '#C3CBD3', hair: '#DEE3E8',
  choco: '#4A2C1E', 'choco-hi': '#7E5038', biscuit: '#DCAB5E', 'biscuit-lo': '#B5843C', mark: '#D2392B', panel: '#F7F9FA',
  mono: '"JetBrains Mono", ui-monospace, Menlo, monospace',
};

/** Stick stands in the middle, fully visible; the readout block sits below it. */
export const HUD_SPACE = 196; // px kept free at the bottom for the readout and buttons
export function stageGeom(W, H, inset = 0) {
  const topPad = 40;
  const bottom = HUD_SPACE + inset;
  const ppc = (H - topPad - bottom) / (L0 + HANDLE);
  const zeroY = H - bottom - HANDLE * ppc;
  const stickW = clamp(W * 0.075, 22, 38);
  return { ppc, zeroY, stickX: Math.round(W / 2), stickW };
}

function drawRuler(ctx, T, { x, zeroY, ppc, from, to, sc = 1 }) {
  const steps = [10, 50, 100, 500, 1000, 5000]; // thousandths of a cm
  const minor = steps.find((s) => (s / 1000) * ppc >= 1.7 * sc) || 5000;
  const label = steps.find((s) => s >= minor && (s / 1000) * ppc >= 16 * sc) || 5000;
  const mid = label / 2 >= minor && (label / 2) % minor === 0 ? label / 2 : label;
  ctx.save();
  ctx.lineWidth = sc;
  ctx.strokeStyle = T.rule;
  ctx.beginPath();
  ctx.moveTo(x + 0.5, zeroY - from * ppc);
  ctx.lineTo(x + 0.5, zeroY - to * ppc);
  ctx.stroke();
  ctx.font = `500 ${10 * sc}px ${T.mono}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  const a = Math.ceil((from * 1000) / minor), b = Math.floor((to * 1000) / minor + 1e-6);
  for (let i = a; i <= b; i++) {
    const v = i * minor;
    const y = Math.round(zeroY - (v / 1000) * ppc) + 0.5;
    const isL = v % label === 0, isM = v % mid === 0;
    const len = (isL ? 12 : isM ? 8 : 4) * sc;
    ctx.strokeStyle = isL ? T.muted : T.rule;
    ctx.beginPath(); ctx.moveTo(x - len, y); ctx.lineTo(x, y); ctx.stroke();
    if (isL) {
      ctx.fillStyle = T.muted;
      const t = label >= 1000 ? (v / 1000).toFixed(0) : label >= 100 ? (v / 1000).toFixed(1) : (v / 1000).toFixed(2);
      ctx.fillText(t, x - len - 4 * sc, y);
    }
  }
  ctx.restore();
}

function cylGrad(ctx, x, w, c0, c1) {
  const gr = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
  gr.addColorStop(0, c0); gr.addColorStop(0.32, c1); gr.addColorStop(0.55, c1); gr.addColorStop(1, c0);
  return gr;
}

function drawStick(ctx, T, { x, w, zeroY, ppc, len, bite, depth, handleEnd }) {
  const hb = handleEnd ?? zeroY + HANDLE * ppc;
  ctx.fillStyle = cylGrad(ctx, x, w, T['biscuit-lo'], T.biscuit);
  const rr = Math.min(w * 0.35, 6);
  ctx.beginPath();
  ctx.moveTo(x - w / 2, zeroY);
  ctx.lineTo(x + w / 2, zeroY);
  ctx.lineTo(x + w / 2, hb - rr);
  ctx.quadraticCurveTo(x + w / 2, hb, x + w / 2 - rr, hb);
  ctx.lineTo(x - w / 2 + rr, hb);
  ctx.quadraticCurveTo(x - w / 2, hb, x - w / 2, hb - rr);
  ctx.closePath();
  ctx.fill();
  if (len <= 0) return;
  const topY = zeroY - len * ppc;
  const n = bite.length - 1;
  const pts = bite.map((b, i) => [x - w / 2 + (w * i) / n, Math.min(zeroY, topY + depth * b)]);
  const p = new Path2D();
  p.moveTo(x - w / 2, zeroY);
  for (const [px, py] of pts) p.lineTo(px, py);
  p.lineTo(x + w / 2, zeroY);
  p.closePath();
  ctx.fillStyle = cylGrad(ctx, x, w, T.choco, T['choco-hi']);
  ctx.fill(p);
  ctx.save();
  ctx.clip(p);
  ctx.strokeStyle = T.biscuit;
  ctx.lineWidth = clamp(depth * 0.5, 2, 9);
  ctx.lineJoin = 'round';
  ctx.beginPath();
  pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  ctx.stroke();
  ctx.restore();
}

/** view: { L, bite, crumbs } */
export function drawStage(ctx, W, H, T, view) {
  if (!W || !H) return;
  const g = stageGeom(W, H, view.inset || 0);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = T.stage;
  ctx.fillRect(0, 0, W, H);
  drawStick(ctx, T, {
    x: g.stickX, w: g.stickW, zeroY: g.zeroY, ppc: g.ppc, len: view.L, bite: view.bite,
    depth: g.stickW * 0.32,
  });
  for (const c of view.crumbs || []) {
    ctx.globalAlpha = clamp(c.life / 0.4, 0, 1);
    ctx.fillStyle = c.biscuit ? T.biscuit : T.choco;
    ctx.fillRect(c.x - c.s / 2, c.y - c.s / 2, c.s, c.s);
  }
  ctx.globalAlpha = 1;
}

export function spawnCrumbs(crumbs, W, H, L, n, inset = 0) {
  const g = stageGeom(W, H, inset);
  const y = g.zeroY - L * g.ppc;
  for (let i = 0; i < n && crumbs.length < 90; i++) {
    crumbs.push({
      x: g.stickX + (Math.random() - 0.5) * g.stickW, y,
      vx: (Math.random() - 0.5) * 110, vy: -(30 + Math.random() * 80),
      s: 2 + Math.random() * 2.5, life: 0.6 + Math.random() * 0.5, biscuit: Math.random() < 0.35,
    });
  }
}
export function stepCrumbs(crumbs, dt, H) {
  for (const c of crumbs) { c.vy += 700 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.life -= dt; }
  return crumbs.filter((c) => c.life > 0 && c.y < H + 10);
}

// ---------- result card ----------
const W_TOP = 0.45, W_BOT = -0.15; // magnified window on the card, cm

function drawLoupe(ctx, T, { cx, cy, r, L, bite, sc }) {
  const ppcL = (2 * r) / (W_TOP - W_BOT);
  const zeroL = cy + ((W_TOP + W_BOT) / 2) * ppcL;
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = T.panel; ctx.fill();
  ctx.clip();
  drawRuler(ctx, T, { x: cx - r * 0.42, zeroY: zeroL, ppc: ppcL, from: 0, to: W_TOP + 0.1, sc });
  drawStick(ctx, T, { x: cx + r * 0.2, w: r * 0.6, zeroY: zeroL, ppc: ppcL, len: L, bite, depth: BITE_CM * ppcL });
  const tyL = Math.round(zeroL - TARGET * ppcL) + 0.5;
  ctx.strokeStyle = T.mark; ctx.lineWidth = sc; ctx.setLineDash([3 * sc, 3 * sc]);
  ctx.beginPath(); ctx.moveTo(cx - r * 0.42 - 12 * sc, tyL); ctx.lineTo(cx + r, tyL); ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = `700 ${10 * sc}px ${T.mono}`;
  ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
  ctx.fillStyle = T.mark;
  ctx.fillText('0.111', cx + r - 6 * sc, tyL - 3 * sc);
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = T.ink; ctx.lineWidth = 1.5 * sc;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function wrapText(ctx, text, x, y, maxW, lh) {
  let line = '';
  for (const word of text.split(' ')) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, y); y += lh; line = word;
    } else line = test;
  }
  if (line) ctx.fillText(line, x, y);
  return y + lh;
}

/** data: { nickname, len, diff, variantName, challengeLine, url, dateText, bite } */
export function drawCard(canvas, data) {
  const T = CARD_T;
  const Wc = 1080, Hc = 1350, M = 80;
  canvas.width = Wc; canvas.height = Hc;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = T.bg; ctx.fillRect(0, 0, Wc, Hc);
  ctx.fillStyle = T.stage;
  rrect(ctx, 40, 40, Wc - 80, Hc - 80, 36); ctx.fill();

  const body = '"IBM Plex Sans KR", system-ui, sans-serif';
  const display = '"Black Han Sans", "IBM Plex Sans KR", sans-serif';
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  ctx.fillStyle = T.muted;
  ctx.font = `500 28px ${T.mono}`;
  ctx.fillText('11.11', M + 20, 150);
  ctx.fillStyle = T.ink;
  ctx.font = `64px ${display}`;
  ctx.fillText('0.111cm 챌린지', M + 20, 230);

  ctx.font = `700 44px ${body}`;
  ctx.fillText(data.nickname || '익명', M + 20, 340);

  ctx.font = `700 196px ${T.mono}`;
  const lenText = data.len.toFixed(3);
  ctx.fillStyle = data.len <= 0 ? T.mark : T.ink;
  ctx.fillText(lenText, M + 8, 560);
  const lw = ctx.measureText(lenText).width;
  ctx.fillStyle = T.muted;
  ctx.font = `500 60px ${T.mono}`;
  ctx.fillText('cm', M + 8 + lw + 18, 560);

  ctx.fillStyle = T.ink;
  ctx.font = `600 40px ${body}`;
  ctx.fillText(data.diff, M + 20, 650);

  const r = 200, lcx = Wc - M - r - 10, lcy = 990;
  drawLoupe(ctx, T, { cx: lcx, cy: lcy, r, L: data.len, bite: data.bite, sc: 2.6 });

  const textW = lcx - r - M - 50;
  let ty = 860;
  ctx.font = `600 34px ${body}`;
  if (data.variantName) { ctx.fillStyle = T.ink; ty = wrapText(ctx, data.variantName, M + 20, ty, textW, 48); }
  if (data.challengeLine) { ctx.fillStyle = T.mark; ty = wrapText(ctx, data.challengeLine, M + 20, ty + 10, textW, 48); }
  ctx.fillStyle = T.muted;
  ctx.font = `500 30px ${body}`;
  wrapText(ctx, '0.111cm에 가장 가깝게 멈춘 사람이 이겨요.', M + 20, Math.max(ty + 10, 1060), textW, 42);

  ctx.font = `500 26px ${T.mono}`;
  ctx.fillText(data.url, M + 20, Hc - 90);
  ctx.textAlign = 'right';
  ctx.fillText(data.dateText, Wc - M - 20, Hc - 90);
  ctx.textAlign = 'left';
}
