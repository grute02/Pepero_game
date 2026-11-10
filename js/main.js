import { L0, VARIANTS, STICKS, makeRound, advance, lengthAt, round3, errOf, diffText, hasBest } from './sim.js';
import { readTokens, drawStage, spawnCrumbs, stepCrumbs, drawCard } from './render.js';
import { createStore, NICK_RE } from './store.js';
import { challengeUrl, readChallenge, canvasToFile, shareFile, shareLink } from './share.js';

const $ = (id) => document.getElementById(id);
const el = {
  len: $('len'), goal: $('goal'), status: $('status'), result: $('result'),
  rDiff: $('rDiff'), rNote: $('rNote'), rChal: $('rChal'),
  again: $('again'), shareCard: $('shareCard'), shareLink: $('shareLink'), showRank: $('showRank'),
  rankDlg: $('rankDlg'), rankSub: $('rankSub'), rankMe: $('rankMe'), rankList: $('rankList'), rankNick: $('rankNick'),
  stage: $('stage'), cv: $('cv'), flash: $('flash'),
  whoBtn: $('whoBtn'), whoName: $('whoName'), whoEdit: $('whoEdit'),
  ranks: $('ranks'), recent: $('recent'), note: $('note'),
  dlg: $('nickDlg'), form: $('nickForm'), nickInput: $('nickInput'), nickErr: $('nickErr'), nickSave: $('nickSave'), nickLater: $('nickLater'),
  toast: $('toast'), card: $('cardCanvas'), sticks: $('sticks'),
};
const ctx = el.cv.getContext('2d');
const reduceMQ = matchMedia('(prefers-reduced-motion: reduce)');
const STICK_KEY = 'stick0111.stick';
const readStick = () => { try { const v = localStorage.getItem(STICK_KEY); return STICKS[v] ? v : 'normal'; } catch { return 'normal'; } };

// ---------- state ----------
let state = 'ready'; // ready | running | done
let challenge = readChallenge();
let stick = challenge ? challenge.m : readStick();
let boardMode = stick;
let round = makeRound(Math.random, stick);
let L = L0;
let t0 = 0, raf = 0, lastT = 0, doneAt = 0, seenEvents = 0;
let crumbs = [];
let last = null;
let cardFile = null;
let T = readTokens();
let W = 0, H = 0, inset = 0;

// Bottom safe-area inset (home indicator), so the stick stays clear of the readout on notched phones.
const insetProbe = document.createElement('div');
insetProbe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding-bottom:env(safe-area-inset-bottom,0px)';
document.body.append(insetProbe);

const store = createStore(() => { renderWho(); renderBoard(); renderNote(); if (el.rankDlg.open) renderSheet(); });

// ---------- game ----------
function start() {
  cancelAnimationFrame(raf);
  round = makeRound(Math.random, stick);
  seenEvents = 0;
  L = L0;
  state = 'running';
  t0 = performance.now();
  lastT = t0;
  last = null;
  cardFile = null;
  el.result.hidden = true;
  el.goal.hidden = false;
  el.status.hidden = false;
  el.status.textContent = '탭하면 멈춰요';
  el.sticks.hidden = true;
  if (round.p.variant === 'wobble') showFlash(VARIANTS.wobble.flash);
  raf = requestAnimationFrame(loop);
}

function loop(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  if (state === 'running') {
    L = advance(round, (now - t0) / 1000);
    while (seenEvents < round.events.length) showFlash(VARIANTS[round.events[seenEvents++].type].flash);
    el.len.textContent = round3(L).toFixed(3);
    if (!reduceMQ.matches) spawnCrumbs(crumbs, W, H, L, 2, inset);
    if (L <= 0) finish(0);
  }
  crumbs = stepCrumbs(crumbs, dt, H);
  draw();
  if (state === 'running' || crumbs.length) raf = requestAnimationFrame(loop);
}

function stopAt(ts) {
  if (ts - t0 < 220) return; // ignore an accidental double tap right after starting
  finish(lengthAt(round, Math.max(0, (ts - t0) / 1000)));
}

function finish(raw) {
  const len = round3(raw);
  const err = errOf(len);
  L = len;
  state = 'done';
  doneAt = performance.now();
  el.len.textContent = len.toFixed(3);
  const isPB = store.record(stick, len, err);
  last = { len, err, stick, variant: round.p.variant, bite: round.bite, isPB, chal: challengeResult(err) };
  showResult(last);
  draw();
  if (store.st.kind === 'firebase' && !store.st.nickname) toast('닉네임을 정하면 이 기록부터 순위에 올라가요');
  prepareCard();
}

function challengeResult(err) {
  if (!challenge || challenge.m !== stick) return null;
  const theirs = errOf(challenge.l);
  if (err < theirs) return { win: true, text: `도전 성공! ${challenge.n}님보다 ${(theirs - err).toFixed(3)}cm 더 가까워요.` };
  if (err === theirs) return { win: false, text: `무승부예요. ${challenge.n}님과 오차가 똑같아요.` };
  return { win: false, text: `도전 실패. ${challenge.n}님에게 ${(err - theirs).toFixed(3)}cm 졌어요.` };
}

function showResult(r) {
  el.rDiff.textContent = diffText(r.len, r.err);
  const notes = [];
  if (r.variant !== 'normal') notes.push(`이번 판은 ${VARIANTS[r.variant].name} 스틱이었어요.`);
  if (r.len <= 0) notes.push('최고 기록에는 안 들어가요.');
  el.rNote.replaceChildren();
  if (r.isPB) { const b = document.createElement('span'); b.className = 'pb'; b.textContent = '개인 최고 기록! '; el.rNote.append(b); }
  if (notes.length) el.rNote.append(document.createTextNode(notes.join(' ')));
  el.rNote.hidden = !r.isPB && !notes.length;
  el.rChal.hidden = !r.chal;
  if (r.chal) { el.rChal.textContent = r.chal.text; el.rChal.dataset.win = r.chal.win ? '1' : '0'; }
  el.goal.hidden = true;
  el.status.hidden = true;
  el.result.hidden = false;
  el.sticks.hidden = false;
}

function resetReady() {
  cancelAnimationFrame(raf);
  state = 'ready';
  round = makeRound(Math.random, stick);
  L = L0;
  crumbs = [];
  last = null;
  el.len.textContent = L0.toFixed(3);
  el.result.hidden = true;
  el.goal.hidden = false;
  el.status.hidden = false;
  el.status.textContent = '탭하면 시작해요';
  el.sticks.hidden = false;
  draw();
}

function setStick(id) {
  if (!STICKS[id] || state === 'running') return;
  stick = id;
  try { localStorage.setItem(STICK_KEY, id); } catch {}
  for (const b of el.sticks.querySelectorAll('button')) b.setAttribute('aria-checked', String(b.dataset.stick === id));
  setBoard(id);
  resetReady();
}
for (const b of document.querySelectorAll('#sticks button')) b.addEventListener('click', () => setStick(b.dataset.stick));

function setBoard(id) {
  boardMode = id;
  for (const b of document.querySelectorAll('.tabs button')) b.setAttribute('aria-selected', String(b.dataset.board === id));
  renderBoard();
}
for (const b of document.querySelectorAll('.tabs button')) b.addEventListener('click', () => setBoard(b.dataset.board));

function handleAct(ts) {
  if (el.dlg.open || el.rankDlg.open) return;
  if (state === 'ready') start();
  else if (state === 'running') stopAt(ts);
  else if (performance.now() - doneAt > 600) start();
}
const evTime = (e) => (e && e.timeStamp > 0 && e.timeStamp <= performance.now() + 5 ? e.timeStamp : performance.now());

el.stage.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  if (e.target.closest('button')) return; // result buttons handle themselves
  e.preventDefault();
  handleAct(evTime(e));
});
document.addEventListener('keydown', (e) => {
  if (el.dlg.open || el.rankDlg.open) return;
  if (e.code !== 'Space' && e.key !== ' ' && e.key !== 'Enter') return;
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'BUTTON')) return;
  e.preventDefault();
  if (e.repeat) return;
  handleAct(evTime(e));
});
el.again.addEventListener('click', () => { if (state === 'done') start(); });

// ---------- drawing ----------
function draw() {
  drawStage(ctx, W, H, T, { L, bite: round.bite, crumbs, inset, stick: round.p.stick });
}
function resize() {
  const r = el.stage.getBoundingClientRect();
  W = Math.max(1, r.width); H = Math.max(1, r.height);
  inset = parseFloat(getComputedStyle(insetProbe).paddingBottom) || 0;
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  el.cv.width = Math.round(W * dpr); el.cv.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
}
new ResizeObserver(resize).observe(el.stage);
const retheme = () => { T = readTokens(); draw(); };
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', retheme);
new MutationObserver(retheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

let flashTimer = 0;
function showFlash(text) {
  clearTimeout(flashTimer);
  el.flash.hidden = true;
  void el.flash.offsetWidth; // restart the animation
  el.flash.textContent = text;
  el.flash.hidden = false;
  flashTimer = setTimeout(() => { el.flash.hidden = true; }, 950);
}

let toastTimer = 0;
function toast(text) {
  clearTimeout(toastTimer);
  el.toast.textContent = text;
  el.toast.hidden = false;
  toastTimer = setTimeout(() => { el.toast.hidden = true; }, 2600);
}

// ---------- sharing ----------
const fontsReady = Promise.all([
  document.fonts.load('700 196px "JetBrains Mono"'),
  document.fonts.load('64px "Black Han Sans"'),
  document.fonts.load('700 44px "IBM Plex Sans KR"'),
]).catch(() => {});

function siteLabel() {
  return (location.host + location.pathname).replace(/\/index\.html$/, '').replace(/\/$/, '');
}

async function prepareCard() {
  const r = last;
  if (!r) return;
  await fontsReady;
  if (r !== last) return;
  const d = new Date();
  const sk = STICKS[r.stick];
  drawCard(el.card, {
    nickname: store.st.nickname || '익명',
    stick: r.stick,
    stickLabel: sk.level ? `${sk.full}(난이도 ${sk.level})` : sk.full,
    len: r.len,
    diff: diffText(r.len, r.err),
    variantName: r.variant !== 'normal' ? `이번 판: ${VARIANTS[r.variant].name} 스틱` : '',
    challengeLine: r.chal ? r.chal.text : '',
    url: siteLabel(),
    dateText: `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`,
    bite: r.bite,
  });
  const f = await canvasToFile(el.card, `0111-${r.len.toFixed(3)}.png`);
  if (r === last) cardFile = f;
}

el.shareCard.addEventListener('click', async () => {
  if (!last) return;
  if (!cardFile) { toast('카드를 만드는 중이에요. 잠시 후 다시 눌러 주세요'); return; }
  const res = await shareFile(cardFile, `0.111cm 챌린지 ${last.len.toFixed(3)}cm`);
  if (res === 'downloaded') toast('결과 카드를 저장했어요');
  else if (res === 'failed') toast('카드를 만들지 못했어요');
});

el.shareLink.addEventListener('click', async () => {
  if (!last) return;
  const nick = store.st.nickname || '익명';
  const url = challengeUrl({ n: nick.slice(0, 12), l: last.len, m: last.stick });
  const text = `${nick}의 0.111cm 챌린지 ${STICKS[last.stick].full} 기록 ${last.len.toFixed(3)}cm. 이길 수 있어요?`;
  const res = await shareLink(url, text);
  if (res === 'copied') toast('도전장 링크를 복사했어요');
});

function renderChallenge() {
  const box = $('challenge');
  if (!challenge) { box.hidden = true; return; }
  $('chName').textContent = challenge.n;
  $('chLen').textContent = `${challenge.l.toFixed(3)}cm(${STICKS[challenge.m].name})`;
  box.hidden = false;
}
$('chClose').addEventListener('click', () => {
  challenge = null;
  history.replaceState(null, '', location.pathname + location.search);
  renderChallenge();
});
window.addEventListener('hashchange', () => {
  const c = readChallenge();
  if (c) { challenge = c; renderChallenge(); if (state !== 'running') setStick(c.m); }
});

// ---------- nickname ----------
function openNick() {
  el.nickInput.value = store.st.nickname || '';
  el.nickErr.hidden = true;
  if (!el.dlg.open) el.dlg.showModal();
  setTimeout(() => el.nickInput.focus(), 30);
}
el.whoBtn.addEventListener('click', openNick);
el.nickLater.addEventListener('click', () => el.dlg.close());
el.form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const nick = el.nickInput.value.trim();
  const fail = (t) => { el.nickErr.textContent = t; el.nickErr.hidden = false; };
  if (!NICK_RE.test(nick)) return fail('한글·영문·숫자·_·- 로 2~12자를 입력해 주세요.');
  if (nick === store.st.nickname) { el.dlg.close(); return; }
  el.nickSave.disabled = true;
  try {
    await store.setNickname(nick);
    el.dlg.close();
    toast(`${nick}님, 반가워요`);
  } catch (err) {
    const code = err && err.code;
    if (code === 'taken') fail('이미 누가 쓰고 있는 닉네임이에요. 다른 이름을 써 주세요.');
    else if (code === 'no-auth') fail('로그인 준비가 안 됐어요. 잠시 후 다시 시도해 주세요.');
    else if (code === 'permission-denied') fail('저장 권한이 없어요. Firestore 보안 규칙을 확인해 주세요.');
    else fail(`저장하지 못했어요 (${code || '오류'}).`);
  } finally {
    el.nickSave.disabled = false;
  }
});

function renderWho() {
  const n = store.st.nickname;
  el.whoName.textContent = n || '닉네임 정하기';
  el.whoEdit.hidden = !n;
  el.whoBtn.setAttribute('aria-label', n ? `닉네임 ${n}, 변경` : '닉네임 정하기');
}

// ---------- board ----------
function rel(ts) {
  if (!ts) return '';
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return '방금';
  if (s < 3600) return Math.floor(s / 60) + '분 전';
  if (s < 86400) return Math.floor(s / 3600) + '시간 전';
  const d = new Date(ts);
  return d.getMonth() + 1 + '/' + d.getDate();
}

const nameOf = (id) => store.st.names.get(id) || (id === store.st.uid ? store.st.nickname || '나' : '이름 없음');

function rankedRows(mode) {
  return (store.st.boards[mode] || [])
    .filter(hasBest)
    .sort((a, b) => a.best - b.best || (a.bestAt || 0) - (b.bestAt || 0));
}

function fillRanks(list, mode) {
  const st = store.st;
  const rows = rankedRows(mode);
  list.replaceChildren();
  if (!st.loaded[mode] && st.kind !== 'local') {
    const li = document.createElement('li'); li.className = 'empty'; li.textContent = '순위를 불러오는 중이에요…';
    list.append(li);
  } else if (!rows.length) {
    const li = document.createElement('li'); li.className = 'empty';
    li.textContent = `${STICKS[mode].full} 기록이 아직 없어요. 첫 판을 하면 여기에 올라가요.`;
    list.append(li);
  }
  rows.forEach((r, i) => {
    const li = document.createElement('li');
    const isMe = r.id === st.uid;
    if (isMe) li.className = 'me';
    const rk = document.createElement('span'); rk.className = 'rk'; rk.textContent = i + 1;
    const who = document.createElement('div'); who.className = 'who-cell';
    const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = nameOf(r.id);
    if (isMe) { const y = document.createElement('span'); y.className = 'you'; y.textContent = '나'; nm.append(y); }
    const meta = document.createElement('span'); meta.className = 'meta';
    meta.textContent = `±${r.best.toFixed(3)} · ${r.tries || 0}판`;
    who.append(nm, meta);
    const sc = document.createElement('span'); sc.className = 'sc'; sc.textContent = r.bestLen.toFixed(3);
    li.append(rk, who, sc);
    list.append(li);
  });
  return rows;
}

function renderBoard() {
  const st = store.st;
  const mine = st.mine[boardMode];
  $('mBest').textContent = hasBest(mine) ? mine.bestLen.toFixed(3) + 'cm' : '—';
  $('mErr').textContent = hasBest(mine) ? '±' + mine.best.toFixed(3) : '—';
  $('mTries').textContent = ((mine && mine.tries) || 0) + '판';

  const rows = fillRanks(el.ranks, boardMode);
  $('boardSub').textContent = rows.length ? `${rows.length}명 참여 · 1인 최고 기록 · 0.111cm에 가까운 순` : '1인 최고 기록 · 0.111cm에 가까운 순';

  el.recent.replaceChildren();
  const recent = (st.boards[boardMode] || []).filter((r) => r.lastAt).sort((a, b) => b.lastAt - a.lastAt).slice(0, 5);
  if (!recent.length) {
    const li = document.createElement('li');
    const sp = document.createElement('span'); sp.className = 'rn'; sp.textContent = '아직 기록이 없어요';
    li.append(sp); el.recent.append(li);
  }
  for (const r of recent) {
    const li = document.createElement('li');
    const x = document.createElement('span'); x.className = 'rn'; x.textContent = nameOf(r.id);
    const y = document.createElement('span'); y.className = 'rv';
    y.textContent = `${(typeof r.lastLen === 'number' ? r.lastLen : 0).toFixed(3)}cm · ${rel(r.lastAt)}`;
    li.append(x, y); el.recent.append(li);
  }
}

// ---------- ranking sheet (opened from the result) ----------
let sheetMode = 'normal';
function renderSheet() {
  const st = store.st;
  const rows = fillRanks(el.rankList, sheetMode);
  el.rankSub.textContent = `${STICKS[sheetMode].full} · ${rows.length}명 참여 · 0.111cm에 가까운 순`;
  const idx = rows.findIndex((r) => r.id === st.uid);
  const named = st.kind === 'local' || !!st.nickname;
  el.rankNick.hidden = named;
  if (!named) {
    el.rankMe.textContent = '닉네임을 정하면 이번 기록부터 순위에 올라가요.';
    el.rankMe.dataset.tone = 'warn';
  } else if (idx >= 0) {
    el.rankMe.textContent = `내 순위 ${idx + 1}위 / ${rows.length}명 · 최고 ${rows[idx].bestLen.toFixed(3)}cm`;
    delete el.rankMe.dataset.tone;
  } else {
    el.rankMe.textContent = '아직 순위에 오른 기록이 없어요. 끝까지 다 먹기 전에 멈춰 보세요.';
    delete el.rankMe.dataset.tone;
  }
  el.shareCard.hidden = !last;
}
function openSheet() {
  sheetMode = last ? last.stick : stick;
  renderSheet();
  if (!el.rankDlg.open) el.rankDlg.showModal();
  const me = el.rankList.querySelector('li.me');
  if (me) me.scrollIntoView({ block: 'center' });
}
el.showRank.addEventListener('click', openSheet);
$('rankClose').addEventListener('click', () => el.rankDlg.close());
$('rankAgain').addEventListener('click', () => { el.rankDlg.close(); start(); });
el.rankNick.addEventListener('click', () => { el.rankDlg.close(); openNick(); });
el.rankDlg.addEventListener('click', (e) => { if (e.target === el.rankDlg) el.rankDlg.close(); });

function renderNote() {
  const st = store.st;
  el.note.textContent = st.note;
  el.note.hidden = !st.note;
  if (st.noteTone) el.note.dataset.tone = st.noteTone; else delete el.note.dataset.tone;
}

setInterval(renderBoard, 30000);

// ---------- boot ----------
renderChallenge();
el.len.textContent = L0.toFixed(3);
for (const b of el.sticks.querySelectorAll('button')) b.setAttribute('aria-checked', String(b.dataset.stick === stick));
setBoard(stick);
renderWho();
renderBoard();
draw();
document.fonts && document.fonts.ready.then(draw);

store.init().then(() => {
  const st = store.st;
  const loadTimer = setTimeout(() => {
    if (st.kind === 'firebase' && !st.loaded.normal && !st.note) {
      st.note = '순위를 아직 불러오지 못했어요. 연결이 느린 것 같아요.'; st.noteTone = 'warn'; renderNote();
    }
  }, 10000);
  if (st.loaded.normal) clearTimeout(loadTimer);
  const canName = st.kind === 'local' || (st.kind === 'firebase' && st.uid);
  if (canName && !st.nickname) openNick();
});
