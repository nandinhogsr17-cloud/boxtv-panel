// Navegação por setas (controle remoto de TV/teclado): move o foco para o elemento mais próximo na direção.
// Elementos navegáveis têm o atributo data-f. Em overlays, só vale o contêiner ativo (setScope).
let scope = document;
export const setScope = (el) => { scope = el || document; };

function focusables() {
  return [...scope.querySelectorAll('[data-f]')].filter((e) => !e.disabled && e.offsetParent !== null);
}
function center(r) { return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }

function pick(from, dir) {
  const list = focusables().filter((e) => e !== from);
  if (!from) return list[0] || null;
  const a = from.getBoundingClientRect();
  const ca = center(a);
  let best = null, bestScore = Infinity;
  for (const el of list) {
    const b = el.getBoundingClientRect();
    const cb = center(b);
    const dx = cb.x - ca.x, dy = cb.y - ca.y;
    let main, cross, overlap;
    if (dir === 'ArrowRight') { if (b.left < a.right - 4 && dx <= 0) continue; main = Math.max(0, b.left - a.right); cross = Math.abs(dy); overlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0; }
    else if (dir === 'ArrowLeft') { if (b.right > a.left + 4 && dx >= 0) continue; main = Math.max(0, a.left - b.right); cross = Math.abs(dy); overlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0; }
    else if (dir === 'ArrowDown') { if (b.top < a.bottom - 4 && dy <= 0) continue; main = Math.max(0, b.top - a.bottom); cross = Math.abs(dx); overlap = Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0; }
    else { if (b.bottom > a.top + 4 && dy >= 0) continue; main = Math.max(0, a.top - b.bottom); cross = Math.abs(dx); overlap = Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0; }
    const score = main + cross * (overlap ? 0.5 : 3);
    if (score < bestScore) { bestScore = score; best = el; }
  }
  return best;
}

export function moveFocus(dir) {
  const cur = document.activeElement && document.activeElement.hasAttribute('data-f') ? document.activeElement : null;
  const next = pick(cur, dir);
  if (next) {
    next.focus({ preventScroll: true });
    next.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    return true;
  }
  return false;
}
export function focusFirst(root) {
  const el = (root || scope).querySelector('[data-f]');
  if (el) el.focus({ preventScroll: true });
}

export function initNav({ onBack, isBlocked }) {
  document.addEventListener('keydown', (e) => {
    if (isBlocked && isBlocked()) return;
    const t = e.target;
    const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
    if (e.key.startsWith('Arrow')) {
      if (typing && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return;
      if (moveFocus(e.key)) e.preventDefault();
    } else if (e.key === 'Escape' || e.key === 'BrowserBack' || (e.key === 'Backspace' && !typing)) {
      if (onBack && onBack()) e.preventDefault();
    }
  });
}
