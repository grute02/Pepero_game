// Records and leaderboards: Firebase (anonymous auth + Firestore) or this browser only.
import { FIREBASE_CONFIG } from './config.js';
import { nextRecord } from './sim.js';

const SDK = 'https://www.gstatic.com/firebasejs/12.19.0';
const LS_KEY = 'stick0111.v2';
const COL = { normal: 'scores_normal', blind: 'scores_blind' };
export const MODES = ['normal', 'blind'];
export const NICK_RE = /^[0-9A-Za-z가-힣_-]{2,12}$/;

export function createStore(onChange) {
  const st = {
    kind: 'pending', // pending | firebase | local
    note: '', noteTone: '',
    ready: false,
    uid: null, nickname: '',
    mine: { normal: null, blind: null },
    boards: { normal: [], blind: [] },
    loaded: { normal: false, blind: false },
    names: new Map(),
  };
  let fb = null;
  const queues = { normal: { busy: false, body: null }, blind: { busy: false, body: null } };
  const emit = () => onChange(st);
  const setNote = (text, tone = '') => { st.note = text; st.noteTone = tone; emit(); };

  // ---------- local ----------
  function loadLocal() {
    try {
      const v = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
      return v && typeof v === 'object' ? v : {};
    } catch { return {}; }
  }
  function saveLocal() {
    try { localStorage.setItem(LS_KEY, JSON.stringify({ nickname: st.nickname, mine: st.mine })); } catch {}
  }
  function localBoards() {
    for (const m of MODES) {
      const r = st.mine[m];
      st.boards[m] = r && typeof r.best === 'number' ? [{ id: '__me', ...r }] : [];
      st.loaded[m] = true;
    }
    if (st.nickname) st.names.set('__me', st.nickname);
  }
  function goLocal(note) {
    st.kind = 'local';
    st.uid = '__me';
    const v = loadLocal();
    st.nickname = typeof v.nickname === 'string' ? v.nickname : '';
    if (v.mine && typeof v.mine === 'object') {
      for (const m of MODES) st.mine[m] = v.mine[m] || null;
    }
    localBoards();
    st.ready = true;
    setNote(note, '');
  }

  // ---------- firebase ----------
  async function init() {
    const cfg = FIREBASE_CONFIG || {};
    if (!cfg.apiKey || !cfg.projectId) {
      goLocal('Firebase 설정 전이라 기록이 이 브라우저에만 남아요.');
      return;
    }
    let appMod, authMod, fs;
    try {
      [appMod, authMod, fs] = await Promise.all([
        import(`${SDK}/firebase-app.js`),
        import(`${SDK}/firebase-auth.js`),
        import(`${SDK}/firebase-firestore.js`),
      ]);
    } catch {
      goLocal('랭킹 서버에 연결하지 못했어요. 지금 기록은 이 브라우저에만 남아요.');
      return;
    }
    const app = appMod.initializeApp(cfg);
    const auth = authMod.getAuth(app);
    const db = fs.getFirestore(app);
    fb = { auth, db, fs };
    st.kind = 'firebase';
    subscribe();

    let user = null;
    try {
      user = await new Promise((resolve) => {
        const un = authMod.onAuthStateChanged(auth, (u) => { un(); resolve(u); });
      });
      if (!user) user = (await authMod.signInAnonymously(auth)).user;
    } catch (e) {
      const code = (e && e.code) || '';
      if (code === 'auth/operation-not-allowed' || code === 'auth/admin-restricted-operation') {
        setNote('Firebase에서 익명 로그인이 꺼져 있어서 기록할 수 없어요. 순위는 볼 수 있어요.', 'warn');
      } else {
        setNote(`로그인하지 못했어요 (${code || '알 수 없는 오류'}). 순위는 볼 수 있어요.`, 'warn');
      }
      st.ready = true;
      emit();
      return;
    }
    st.uid = user.uid;
    try {
      const ps = await fs.getDoc(fs.doc(db, 'players', st.uid));
      if (ps.exists()) st.nickname = ps.data().nickname || '';
    } catch {}
    await Promise.all(MODES.map(async (m) => {
      try {
        const s = await fs.getDoc(fs.doc(db, COL[m], st.uid));
        if (s.exists()) adoptServer(m, s.data());
      } catch {}
    }));
    st.ready = true;
    emit();
  }

  function adoptServer(mode, data) {
    const cur = st.mine[mode];
    if (!cur || (data.tries || 0) > (cur.tries || 0)) {
      st.mine[mode] = {
        best: data.best, bestLen: data.bestLen, bestAt: data.bestAt,
        tries: data.tries, lastLen: data.lastLen, lastAt: data.lastAt,
      };
    }
  }

  function subscribe() {
    const { fs, db } = fb;
    for (const m of MODES) {
      const q = fs.query(fs.collection(db, COL[m]), fs.orderBy('best', 'asc'), fs.limit(100));
      fs.onSnapshot(q, (snap) => {
        st.boards[m] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        st.loaded[m] = true;
        const me = st.uid && st.boards[m].find((d) => d.id === st.uid);
        if (me) adoptServer(m, me);
        emit();
      }, (e) => {
        st.loaded[m] = true;
        if (e && e.code === 'permission-denied') setNote('순위를 읽을 권한이 없어요. Firestore 보안 규칙을 적용했는지 확인해 주세요.', 'warn');
        else setNote(`순위를 불러오지 못했어요 (${(e && e.code) || '오류'}).`, 'warn');
      });
    }
    fs.onSnapshot(fs.query(fs.collection(db, 'players'), fs.limit(500)), (snap) => {
      st.names = new Map(snap.docs.map((d) => [d.id, d.data().nickname || '']));
      emit();
    }, () => {});
  }

  async function setNickname(nick) {
    if (!NICK_RE.test(nick)) { const e = new Error('invalid'); e.code = 'invalid'; throw e; }
    if (st.kind === 'local') {
      st.nickname = nick;
      saveLocal();
      localBoards();
      emit();
      return;
    }
    if (st.kind !== 'firebase' || !st.uid) { const e = new Error('no-auth'); e.code = 'no-auth'; throw e; }
    const { fs, db } = fb;
    const key = nick.toLowerCase();
    const uid = st.uid;
    await fs.runTransaction(db, async (tx) => {
      const nref = fs.doc(db, 'nicknames', key);
      const pref = fs.doc(db, 'players', uid);
      const ns = await tx.get(nref);
      const ps = await tx.get(pref);
      if (ns.exists() && ns.data().uid !== uid) { const e = new Error('taken'); e.code = 'taken'; throw e; }
      const now = Date.now();
      if (!ns.exists()) tx.set(nref, { uid, nickname: nick });
      const prevKey = ps.exists() ? ps.data().nickKey : '';
      if (prevKey && prevKey !== key) tx.delete(fs.doc(db, 'nicknames', prevKey));
      tx.set(pref, { nickname: nick, nickKey: key, createdAt: ps.exists() ? ps.data().createdAt : now, updatedAt: now });
    });
    st.nickname = nick;
    st.names.set(uid, nick);
    for (const m of MODES) if (st.mine[m]) enqueue(m, st.mine[m]);
    emit();
  }

  /** Record one play. Returns true when it beats an earlier best. */
  function record(mode, len, err) {
    const { rec, isPB } = nextRecord(st.mine[mode], len, err, Date.now());
    st.mine[mode] = rec;
    if (st.kind === 'local') { saveLocal(); localBoards(); }
    else if (st.kind === 'firebase' && st.uid && st.nickname) enqueue(mode, rec);
    emit();
    return isPB;
  }

  function enqueue(mode, body) {
    queues[mode].body = { ...body };
    flush(mode);
  }

  function mergeRec(server, local) {
    const better = local.best < server.best;
    const sTries = server.tries || 0;
    return {
      best: better ? local.best : server.best,
      bestLen: better ? local.bestLen : server.bestLen,
      bestAt: better ? local.bestAt : server.bestAt,
      tries: local.tries > sTries ? local.tries : sTries + 1,
      lastLen: local.lastLen,
      lastAt: local.lastAt,
    };
  }

  async function flush(mode) {
    const q = queues[mode];
    if (q.busy) return;
    q.busy = true;
    const { fs, db } = fb;
    while (q.body) {
      const body = q.body;
      q.body = null;
      const ref = fs.doc(db, COL[mode], st.uid);
      try {
        await fs.setDoc(ref, body);
      } catch (e) {
        try {
          if (!e || e.code !== 'permission-denied') throw e;
          // Another tab or device moved the record on; merge with the server copy and retry once.
          const snap = await fs.getDoc(ref);
          if (!snap.exists()) throw e;
          const merged = mergeRec(snap.data(), body);
          st.mine[mode] = merged;
          emit();
          await fs.setDoc(ref, merged);
        } catch (e2) {
          setNote(`기록을 저장하지 못했어요 (${(e2 && e2.code) || '오류'}).`, 'warn');
        }
      }
    }
    q.busy = false;
  }

  return { st, init, setNickname, record };
}
