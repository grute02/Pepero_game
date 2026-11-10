// Result card sharing and challenge links (#c=...).
import { round3, STICKS } from './sim.js';

function b64urlEncode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(s) {
  let b = s.replace(/-/g, '+').replace(/_/g, '/');
  while (b.length % 4) b += '=';
  const bin = atob(b);
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** { n: nickname, l: length cm, m: stick id } */
export function challengeUrl(c) {
  const u = new URL(location.href);
  u.search = '';
  u.hash = 'c=' + b64urlEncode(JSON.stringify({ n: c.n, l: c.l, m: c.m }));
  return u.toString();
}

export function readChallenge(hash = location.hash) {
  const m = /^#c=([A-Za-z0-9_-]+)$/.exec(hash || '');
  if (!m) return null;
  try {
    const o = JSON.parse(b64urlDecode(m[1]));
    if (typeof o.n !== 'string' || !o.n.trim() || o.n.length > 12) return null;
    if (typeof o.l !== 'number' || !(o.l >= 0 && o.l <= 15)) return null;
    return { n: o.n.trim(), l: round3(o.l), m: STICKS[o.m] ? o.m : 'normal' };
  } catch {
    return null;
  }
}

export function canvasToFile(canvas, filename) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob ? new File([blob], filename, { type: 'image/png' }) : null), 'image/png');
  });
}

/** Share an image file through the share sheet, or save it. Must run inside the click handler. */
export async function shareFile(file, text) {
  if (!file) return 'failed';
  if (navigator.canShare && navigator.share) {
    try {
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text });
        return 'shared';
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return 'downloaded';
}

export async function shareLink(url, text) {
  if (navigator.share) {
    try {
      await navigator.share({ title: '0.111cm 챌린지', text, url });
      return 'shared';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    return 'copied';
  } catch {
    window.prompt('아래 링크를 복사해서 보내세요', url);
    return 'manual';
  }
}
