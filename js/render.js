// Canvas drawing: the game stage and the shareable result card.
import { TARGET, L0, HANDLE, BITE_CM, BLIND_FOG } from './sim.js';

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
  tier: { P: '#A8730C', S: '#6B4029', A: '#8F611A', B: '#336687', C: '#63707C', D: '#D2392B', F: '#D2392B' },
};

export function stageGeom(W, H) {
  const padT = 26, padB = 16;
  const ppc = (H - padT - padB) / (L0 + HANDLE + 0.5);
  const zeroY = H - padB - HANDLE * ppc;
  const rulerX = 46;
  const stickX = Math.round(Math.max(108, W * 0.36));
  const stickW = clamp(ppc * 0.62, 14, 24);
  let r = clamp(Math.min(W * 0.2, H * 0.2), 52, 96);
  r = Math.min(r, (W - (stickX + stickW / 2) - 34) / 2);
  const cx = Math.min(W - r - 12, stickX + stickW / 2 + r + 38);
  const cy = clamp(zeroY - r - 26, padT + r, H - r - 20);
  return { ppc, zeroY, rulerX, stickX, stickW, r, cx, cy };
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

function drawStick(ctx, T, x, w, zeroY, ppc, len, bite) {
  const hb = zeroY + HANDLE * ppc;
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
  const depth = BITE_CM * ppc;
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
  ctx.lineWidth = clamp(depth * 0.55, 2, 9);
  ctx.lineJoin = 'round';
  ctx.beginPath();
  pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  ctx.stroke();
  ctx.restore();
}

function targetLine(ctx, T, x0, x1, y, dash, sc = 1) {
  ctx.save();
  ctx.strokeStyle = T.mark;
  ctx.lineWidth = sc;
  if (dash) ctx.setLineDash([3 * sc, 3 * sc]);
  ctx.beginPath(); ctx.moveTo(x0, Math.round(y) + 0.5); ctx.lineTo(x1, Math.round(y) + 0.5); ctx.stroke();
  ctx.restore();
}

function hatch(ctx, T, x0, y0, w, h, gap) {
  ctx.save();
  ctx.beginPath(); ctx.rect(x0, y0, w, h); ctx.clip();
  ctx.strokeStyle = T.rule; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = x0 - h; x < x0 + w; x += gap) { ctx.moveTo(x, y0 + h); ctx.lineTo(x + h, y0); }
  ctx.stroke();
  ctx.restore();
}

const W_TOP = 0.45, W_BOT = -0.15; // loupe window, cm

// Magnified view of the last half centimetre. sc scales strokes and type (1 on screen, ~3 on the card).
export function drawLoupe(ctx, T, { cx, cy, r, L, bite, hidden, sc = 1 }) {
  const ppcL = (2 * r) / (W_TOP - W_BOT);
  const zeroL = cy + ((W_TOP + W_BOT) / 2) * ppcL;
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = T.panel; ctx.fill();
  ctx.clip();
  if (hidden) {
    hatch(ctx, T, cx - r, cy - r, 2 * r, 2 * r, 7 * sc);
    ctx.fillStyle = T.muted;
    ctx.font = `700 ${Math.round(r * 0.7)}px ${T.mono}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('?', cx, cy + 2);
  } else {
    drawRuler(ctx, T, { x: cx - r * 0.42, zeroY: zeroL, ppc: ppcL, from: 0, to: W_TOP + 0.1, sc });
    drawStick(ctx, T, cx + r * 0.2, r * 0.6, zeroL, ppcL, L, bite);
    const tyL = zeroL - TARGET * ppcL;
    targetLine(ctx, T, cx - r * 0.42 - 12 * sc, cx + r, tyL, true, sc);
    ctx.font = `700 ${10 * sc}px ${T.mono}`;
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillStyle = T.mark;
    ctx.fillText('0.111', cx + r - 6 * sc, tyL - 3 * sc);
  }
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = T.ink; ctx.lineWidth = 1.5 * sc;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
  return ppcL;
}

/**
 * view: { L, bite, fog, hideLoupe, hidePointer, crumbs }
 */
export function drawStage(ctx, W, H, T, view) {
  if (!W || !H) return;
  const g = stageGeom(W, H);
  const { ppc, zeroY, rulerX, stickX, stickW, r, cx, cy } = g;
  const { L, bite } = view;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = T.stage; ctx.fillRect(0, 0, W, H);

  drawRuler(ctx, T, { x: rulerX, zeroY, ppc, from: 0, to: L0 });
  drawStick(ctx, T, stickX, stickW, zeroY, ppc, L, bite);

  if (view.fog) {
    const yTop = zeroY - BLIND_FOG * ppc;
    const x0 = rulerX - 18, x1 = stickX + stickW / 2 + 12;
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = T.stage;
    ctx.fillRect(x0, yTop, x1 - x0, zeroY - yTop + 3);
    ctx.restore();
    hatch(ctx, T, x0, yTop, x1 - x0, zeroY - yTop + 3, 6);
    ctx.save();
    ctx.font = `600 10px ${T.mono}`;
    ctx.fillStyle = T.muted; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('블라인드 구간', x0 + 2, zeroY + 10);
    ctx.restore();
  }

  if (!view.hidePointer) {
    const py = zeroY - L * ppc;
    ctx.fillStyle = T.ink;
    ctx.beginPath(); ctx.moveTo(rulerX + 2, py); ctx.lineTo(rulerX + 9, py - 4); ctx.lineTo(rulerX + 9, py + 4); ctx.closePath(); ctx.fill();
  }

  targetLine(ctx, T, rulerX - 12, stickX + stickW / 2 + 6, zeroY - TARGET * ppc, false);

  const mx0 = stickX - stickW / 2 - 5, mx1 = stickX + stickW / 2 + 5;
  ctx.save();
  ctx.strokeStyle = T.muted; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
  ctx.strokeRect(Math.round(mx0) + 0.5, Math.round(zeroY - W_TOP * ppc) + 0.5, Math.round(mx1 - mx0), Math.round((W_TOP - W_BOT) * ppc));
  ctx.restore();

  for (const c of view.crumbs || []) {
    ctx.globalAlpha = clamp(c.life / 0.4, 0, 1);
    ctx.fillStyle = c.biscuit ? T.biscuit : T.choco;
    ctx.fillRect(c.x - c.s / 2, c.y - c.s / 2, c.s, c.s);
  }
  ctx.globalAlpha = 1;

  if (r < 40) return;
  const ax = mx1, ay = zeroY - 0.15 * ppc;
  const dx = ax - cx, dy = ay - cy, d = Math.hypot(dx, dy) || 1;
  ctx.save();
  ctx.strokeStyle = T.muted; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(cx + (dx / d) * r, cy + (dy / d) * r); ctx.stroke();
  ctx.restore();
  const ppcL = drawLoupe(ctx, T, { cx, cy, r, L, bite, hidden: view.hideLoupe });
  ctx.save();
  ctx.font = `500 10px ${T.mono}`;
  ctx.fillStyle = T.muted; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(view.hideLoupe ? '확대경 꺼짐' : '확대 ×' + Math.round(ppcL / ppc), cx, cy + r + 6);
  ctx.restore();
}

export function spawnCrumbs(crumbs, W, H, L, n) {
  const g = stageGeom(W, H);
  const y = g.zeroY - L * g.ppc;
  for (let i = 0; i < n && crumbs.length < 90; i++) {
    crumbs.push({
      x: g.stickX + (Math.random() - 0.5) * g.stickW, y,
      vx: (Math.random() - 0.5) * 90, vy: -(30 + Math.random() * 70),
      s: 1.5 + Math.random() * 2, life: 0.6 + Math.random() * 0.5, biscuit: Math.random() < 0.35,
    });
  }
}
export function stepCrumbs(crumbs, dt, H) {
  for (const c of crumbs) { c.vy += 700 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.life -= dt; }
  return crumbs.filter((c) => c.life > 0 && c.y < H + 10);
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

/**
 * data: { nickname, modeLabel, len, tier, gradeName, diff, variantName, challengeLine, url, dateText, bite }
 */
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
  ctx.fillText(`11.11 · ${data.modeLabel}`, M + 20, 150);
  ctx.fillStyle = T.ink;
  ctx.font = `64px ${display}`;
  ctx.fillText('0.111cm 챌린지', M + 20, 230);

  ctx.font = `700 44px ${body}`;
  ctx.fillText(data.nickname || '익명', M + 20, 340);

  ctx.font = `700 196px ${T.mono}`;
  const lenText = data.len.toFixed(3);
  ctx.fillStyle = data.tier === 'F' || data.tier === 'D' ? T.mark : T.ink;
  ctx.fillText(lenText, M + 8, 560);
  const lw = ctx.measureText(lenText).width;
  ctx.fillStyle = T.muted;
  ctx.font = `500 60px ${T.mono}`;
  ctx.fillText('cm', M + 8 + lw + 18, 560);

  const tc = T.tier[data.tier] || T.ink;
  const gx = M + 20, gy = 620, gs = 128;
  ctx.fillStyle = tc + '22';
  rrect(ctx, gx, gy, gs, gs, 24); ctx.fill();
  ctx.strokeStyle = tc; ctx.lineWidth = 4;
  rrect(ctx, gx, gy, gs, gs, 24); ctx.stroke();
  ctx.fillStyle = tc;
  const label = data.tier === 'F' ? '완식' : data.tier;
  ctx.font = `${label.length > 1 ? 40 : 64}px ${display}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, gx + gs / 2, gy + gs / 2 + 4);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = T.ink;
  ctx.font = `700 50px ${body}`;
  ctx.fillText(data.gradeName, gx + gs + 32, gy + 58);
  ctx.fillStyle = T.muted;
  ctx.font = `500 32px ${T.mono}`;
  ctx.fillText(data.diff, gx + gs + 32, gy + 112);

  // magnified end of the stick
  const r = 200, lcx = Wc - M - r - 10, lcy = 990;
  drawLoupe(ctx, T, { cx: lcx, cy: lcy, r, L: data.len, bite: data.bite, hidden: false, sc: 2.6 });

  ctx.fillStyle = T.ink;
  ctx.font = `600 34px ${body}`;
  let ty = 880;
  const textW = lcx - r - M - 50;
  if (data.variantName) ty = wrapText(ctx, data.variantName, M + 20, ty, textW, 48);
  if (data.challengeLine) {
    ctx.fillStyle = T.mark;
    ty = wrapText(ctx, data.challengeLine, M + 20, ty + 10, textW, 48);
  }
  ctx.fillStyle = T.muted;
  ctx.font = `500 30px ${body}`;
  wrapText(ctx, '0.111cm에 가장 가깝게 멈춘 사람이 이겨요.', M + 20, Math.max(ty + 10, 1060), textW, 42);

  ctx.fillStyle = T.muted;
  ctx.font = `500 26px ${T.mono}`;
  ctx.fillText(data.url, M + 20, Hc - 90);
  ctx.textAlign = 'right';
  ctx.fillText(data.dateText, Wc - M - 20, Hc - 90);
  ctx.textAlign = 'left';
}
