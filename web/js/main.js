import { api, ApiError, login, logout, ensureToken } from './api.js';
import { h, clear, spinner, message, toast } from './dom.js';
import { initNav, focusFirst } from './nav.js';
import { openPlayer, playerOpen } from './player.js';
import { homePage, browsePage, favsPage, gamesPage, searchPage, detailPage, accountPage, stopLivePreview } from './pages.js';

const CFG = window.IPTV_CONFIG || {};
const NAME = CFG.appName || 'BoxTv';
document.title = NAME;
const app = document.getElementById('app');

// ====================================================================== Splash Screen
function showSplash() {
  const splash = document.getElementById('splash');
  if (!splash) return Promise.resolve();
  return new Promise((resolve) => {
    setTimeout(() => {
      splash.style.transition = 'opacity 0.5s ease';
      splash.style.opacity = '0';
      setTimeout(() => { splash.remove(); resolve(); }, 500);
    }, 1200);
  });
}

// ====================================================================== Login
function loginScreen(onSuccess) {
  let serverHost = '';
  let busy = false;

  const user = h('input', { class: 'login-input', type: 'text', placeholder: 'Usuário', autocomplete: 'username', autocapitalize: 'none', 'data-f': true });
  const pass = h('input', { class: 'login-input', type: 'password', placeholder: 'Senha', autocomplete: 'current-password', 'data-f': true });
  const host = h('input', { class: 'login-input', type: 'url', placeholder: 'Servidor Xtream (opcional)', autocomplete: 'url', 'data-f': true });

  const hostWrap = h('div', { class: 'login-server-wrap' },
    h('button', {
      class: 'login-server-toggle', type: 'button',
      onclick: (e) => {
        const content = e.currentTarget.nextElementSibling;
        const isOpen = content.style.maxHeight && content.style.maxHeight !== '0px';
        content.style.maxHeight = isOpen ? '0px' : '120px';
        content.style.opacity = isOpen ? '0' : '1';
        e.currentTarget.classList.toggle('open', !isOpen);
      }
    }, '⚙️ Configurar servidor'),
    h('div', { class: 'login-server-content', style: 'max-height:0;opacity:0;overflow:hidden;transition:max-height .3s ease,opacity .3s ease' },
      h('label', { class: 'login-label' }, 'Endereço do servidor'),
      host
    )
  );

  const out = h('div', { class: 'login-error', role: 'status', 'aria-live': 'polite' });

  const submit = h('button', { class: 'btn primary login-submit', 'data-f': true, type: 'button' }, 'Entrar');

  submit.addEventListener('click', async () => {
    if (busy) return;
    if (!user.value.trim() || !pass.value) {
      out.innerHTML = '<span class="login-error-icon">⚠️</span> Informe seu usuário e sua senha.';
      out.classList.add('visible');
      return;
    }
    busy = true; submit.disabled = true;
    submit.innerHTML = '<span class="login-spinner"></span> Conectando…';
    out.classList.remove('visible');
    try {
      const result = await login(user.value.trim(), pass.value, host.value.trim() || serverHost || undefined);
      localStorage.setItem('iptv.logged_user', result.username || user.value.trim());
      out.classList.remove('visible');
      onSuccess({ status: 'active', name: result.username || user.value.trim(), expiresAt: result.expiresAt || null });
    } catch (e) {
      const code = e instanceof ApiError ? e.code : '';
      const messages = {
        no_default_server: 'O servidor Xtream ainda não foi configurado pelo fornecedor.',
        auth_failed: 'Usuário ou senha não conferem. Confira os dados com seu provedor.',
        xtream_auth_failed: 'Usuário ou senha não conferem. Confira os dados com seu provedor.',
        account_expired: 'Esta conta venceu. Fale com seu provedor para renovar.',
        account_disabled: 'Esta conta está desativada. Fale com seu provedor.',
        provider_unavailable: 'Não foi possível conectar ao servidor Xtream. Tente novamente.',
        too_many_attempts: 'Muitas tentativas. Aguarde antes de tentar novamente.',
        offline: 'Sem conexão com o painel. Verifique sua internet.'
      };
      const msg = messages[code] || 'Não foi possível entrar. Verifique os dados e tente novamente.';
      out.innerHTML = `<span class="login-error-icon">⚠️</span> ${msg}`;
      out.classList.add('visible');
    } finally {
      busy = false; submit.disabled = false; submit.textContent = 'Entrar';
    }
  });

  // Allow Enter key to submit
  [user, pass, host].forEach(el => el.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit.click(); }));

  const card = h('div', { class: 'login-card' },
    h('div', { class: 'login-logo-wrap' },
      h('img', { src: 'boxtv-logo.svg', alt: 'BoxTv', class: 'login-logo', onerror: (e) => { e.currentTarget.style.display='none'; } }),
    ),
    h('h1', { class: 'login-title' }, 'BoxTv ⚡'),
    h('p', { class: 'login-subtitle' }, 'O MELHOR DO ENTRETENIMENTO · CANAIS AO VIVO · FILMES · SÉRIES · JOGOS'),
    h('h2', { class: 'login-heading' }, 'Entrar com Xtream'),
    h('p', { class: 'login-hint' }, 'Digite o usuário e a senha fornecidos pelo seu provedor.'),
    h('div', { class: 'login-fields' }, user, pass),
    hostWrap,
    submit,
    out,
    h('p', { class: 'login-version' }, `v${CFG.version || '1.0'}`)
  );

  clear(app).append(h('div', { class: 'login-bg' }, h('div', { class: 'login-center' }, card)));

  api('/activate/config').then((cfg) => { serverHost = cfg.serverHost || ''; host.value = serverHost; }).catch(() => {});
  setTimeout(() => { card.classList.add('visible'); user.focus({ preventScroll: true }); }, 50);
}

async function gate() {
  clear(app).append(spinner());
  try {
    const current = await api('/status');
    if (current && current.status === 'active') return current;
  } catch { /* aparelho ainda não autenticado */ }
  return new Promise((resolve) => loginScreen(resolve));
}

// ====================================================================== app principal
const TABS = [
  ['home', '🏠 Início'], ['live', '📡 Ao Vivo'], ['movies', '🎬 Filmes'], ['series', '🎭 Séries'],
  ['favs', '❤️ Favoritos'], ['games', '⚽ Jogos'], ['search', '🔍 Buscar'], ['account', '👤 Conta'],
];
let status = null;
let detailBase = null;
let main, nav;

function route() {
  const m = /^#\/([a-z]+)(?:\/(.+))?$/.exec(location.hash);
  return { name: m ? m[1] : 'home', arg: m && m[2] ? decodeURIComponent(m[2]) : null };
}
const go = (name) => { location.hash = '#/' + name; };

async function open(item, direct = false) {
  if (item.type === 'movie') {
    if (direct) return play({ items: [item], index: 0 });
    detailBase = item; location.hash = '#/item/' + encodeURIComponent(item.id);
  } else if (item.type === 'series') {
    detailBase = item; location.hash = '#/item/' + encodeURIComponent(item.id);
  } else if (item.type === 'episode') {
    try {
      const s = await api('/series/' + encodeURIComponent(item.seriesId));
      const all = s.seasons.flatMap((x) => x.episodes);
      const i = all.findIndex((e) => e.id === item.id);
      if (i >= 0) {
        all[i].positionMs = item.positionMs || all[i].positionMs;
        all[i].durationMs = item.durationMs || all[i].durationMs;
        return play({ items: all, index: i, heading: `${s.title} · T${item.season}E${item.episode}` });
      }
    } catch { /* toca só o episódio */ }
    play({ items: [item], index: 0 });
  } else {
    play({ items: [item], index: 0 });
  }
}

function play(req) {
  if (!req.items.length) return;
  openPlayer({ ...req, onClose: () => { const r = route().name; if (['home', 'favs', 'item'].includes(r)) render(); } });
}

const ctx = { open, play, go, back: () => (history.length > 1 ? history.back() : go('home')) };

async function render() {
  stopLivePreview();
  const { name, arg } = route();
  const root = h('div', {});
  main.replaceChildren(root);
  nav.querySelectorAll('.pill').forEach((p) => p.classList.toggle('on', p.dataset.tab === (name === 'item' ? '' : name)));
  window.scrollTo(0, 0);
  switch (name) {
    case 'live': return browsePage(root, ctx, 'live');
    case 'movies': return browsePage(root, ctx, 'movie');
    case 'series': return browsePage(root, ctx, 'series');
    case 'favs': return favsPage(root, ctx);
    case 'games': return gamesPage(root, ctx);
    case 'search': return searchPage(root, ctx);
    case 'account': return accountPage(root, ctx, status || {});
    case 'item': {
      const base = detailBase && detailBase.id === arg ? detailBase : { id: arg, type: 'series' };
      if (!detailBase || detailBase.id !== arg) {
        try { base.type = (await api('/item/' + encodeURIComponent(arg))).type; } catch { }
      }
      return detailPage(root, ctx, base);
    }
    default: return homePage(root, ctx);
  }
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/[\s._-]+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function shell() {
  const loggedUser = localStorage.getItem('iptv.logged_user') || (status && status.name) || 'Conta';

  let expHint = '';
  let expShort = '';
  if (status && status.expiresAt) {
    const d = new Date(status.expiresAt);
    if (!isNaN(d.getTime())) {
      expHint = `até ${d.toLocaleDateString('pt-BR')}`;
      expShort = `· ${d.toLocaleDateString('pt-BR')}`;
    }
  }

  const initials = getInitials(loggedUser);

  // Online indicator
  const onlineDot = h('span', { class: 'online-dot', title: 'Conectado' });

  const userBadge = h('button', {
    class: 'user-badge', 'data-f': true,
    title: `${loggedUser}${expHint ? ' · ' + expHint : ''} · Clique para sair`,
    'aria-label': 'Conta do usuário',
    onclick: () => { if (confirm('Deseja sair da conta?')) logout(); }
  },
    onlineDot,
    h('div', { class: 'user-avatar' }, initials),
    h('div', { class: 'user-info' },
      h('span', { class: 'user-name' }, loggedUser),
      expHint ? h('span', { class: 'user-exp' }, expHint) : null
    )
  );

  nav = h('nav', { class: 'top', 'aria-label': 'Menu' },
    h('a', { class: 'brand', href: '#/home', 'aria-label': 'BoxTv – Início' },
      h('div', { class: 'brand-icon' }, '▶'),
      h('span', { class: 'brand-name' }, 'BoxTv')
    ),
    h('div', { class: 'nav-pills' },
      ...TABS.map(([id, label]) => h('button', { class: 'pill', 'data-f': true, 'data-tab': id, onclick: () => go(id) }, label))
    ),
    userBadge
  );

  main = h('main', {});
  clear(app).append(nav, main);
  window.addEventListener('hashchange', render);
  render();

  // Poll status
  setInterval(async () => {
    try {
      const s = await api('/status');
      status = s;
      // Update online dot
      onlineDot.style.background = '#22c55e';
      if (s.status !== 'active') location.reload();
    } catch (e) {
      onlineDot.style.background = '#ef4444';
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) location.reload();
    }
  }, 60000);

  setInterval(() => ensureToken().catch(() => {}), 30 * 60000);
}

initNav({
  isBlocked: () => playerOpen(),
  onBack: () => {
    const { name } = route();
    if (name === 'item') { ctx.back(); return true; }
    if (name !== 'home') { go('home'); return true; }
    return false;
  },
});

(async () => {
  await showSplash();
  status = await gate();
  try { await ensureToken(); } catch { /* imagens http ficam sem capa */ }
  shell();
})();
