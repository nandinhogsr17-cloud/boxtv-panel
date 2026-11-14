import { api, ApiError, identity, login, logout, ensureToken } from './api.js';
import { h, clear, spinner, message, toast } from './dom.js';
import { initNav, focusFirst } from './nav.js';
import { openPlayer, playerOpen } from './player.js';
import { homePage, browsePage, favsPage, gamesPage, searchPage, detailPage, accountPage } from './pages.js';

const CFG = window.IPTV_CONFIG || {};
const NAME = CFG.appName || 'TV';
document.title = NAME;
const app = document.getElementById('app');

// ====================================================================== Tela de Login
function loginScreen(onSuccess) {
  const userInput = h('input', {
    type: 'text',
    placeholder: 'Usuário',
    autocomplete: 'username',
    'data-f': true,
    style: 'width:100%;margin-bottom:12px;padding:12px 14px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:#fff;font-size:1rem'
  });

  const passInput = h('input', {
    type: 'password',
    placeholder: 'Senha',
    autocomplete: 'current-password',
    'data-f': true,
    style: 'width:100%;margin-bottom:18px;padding:12px 14px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:#fff;font-size:1rem'
  });

  const errBox = h('div', { class: 'err', style: 'display:none;margin-bottom:14px;color:var(--accent);font-size:.9rem;text-align:center' });

  const btnSubmit = h('button', {
    class: 'btn primary',
    'data-f': true,
    style: 'width:100%;justify-content:center;padding:12px;font-size:1.05rem;font-weight:700',
    onclick: doLogin
  }, 'Entrar');

  async function doLogin() {
    const user = userInput.value.trim();
    const pass = passInput.value.trim();
    if (!user || !pass) {
      errBox.textContent = 'Preencha o usuário e a senha.';
      errBox.style.display = 'block';
      return;
    }
    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Conectando…';
    errBox.style.display = 'none';

    try {
      const res = await login(user, pass);
      localStorage.setItem('iptv.logged_user', user);
      onSuccess(res);
    } catch (e) {
      btnSubmit.disabled = false;
      btnSubmit.textContent = 'Entrar';
      errBox.textContent = e.body?.message || 'Falha ao autenticar. Verifique o usuário e a senha.';
      errBox.style.display = 'block';
    }
  }

  // Permite pressionar Enter para logar
  [userInput, passInput].forEach(inp => {
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doLogin();
    });
  });

  const savedUser = localStorage.getItem('iptv.logged_user');
  if (savedUser) userInput.value = savedUser;

  clear(app).append(h('div', { class: 'act' }, h('div', { class: 'box', style: 'max-width:380px' },
    h('div', { style: 'display:flex;justify-content:center;margin-bottom:14px' },
      h('img', { src: 'boxtv-logo.svg', alt: 'BoxTv', style: 'width:72px;height:72px;border-radius:18px;box-shadow:0 8px 30px rgba(255,0,85,0.35)' })
    ),
    h('h1', { style: 'font-size:1.6rem;margin-bottom:6px;text-align:center;font-weight:800;letter-spacing:-.02em' }, 'BoxTv'),
    h('p', { class: 'dim', style: 'margin-bottom:22px;text-align:center;font-size:.9rem' }, 'Entre com seu usuário e senha para começar a assistir.'),
    errBox,
    userInput,
    passInput,
    btnSubmit
  )));

  setTimeout(() => (userInput.value ? passInput : userInput).focus(), 100);
}

async function gate() {
  clear(app).append(spinner());

  // Se já temos um status ativo e usuário salvo, entra direto
  const loggedUser = localStorage.getItem('iptv.logged_user');
  if (loggedUser) {
    try {
      const r = await api('/status');
      if (r.status === 'active') return r;
    } catch {}
  }

  // Caso contrário, aguarda o usuário logar na tela limpa de login
  return new Promise((resolve) => {
    loginScreen((statusInfo) => {
      resolve(statusInfo);
    });
  });
}

// ====================================================================== app principal
const TABS = [
  ['home', 'Início'], ['live', 'Ao Vivo'], ['movies', 'Filmes'], ['series', 'Séries'],
  ['favs', 'Favoritos'], ['games', 'Jogos'], ['search', 'Buscar'], ['account', 'Conta'],
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
    // monta a lista da série para tocar o próximo episódio sozinho
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
      // se abriu o endereço direto, descobre se é filme ou série
      if (!detailBase || detailBase.id !== arg) {
        try { base.type = (await api('/item/' + encodeURIComponent(arg))).type; } catch { /* detalhe mostra o erro */ }
      }
      return detailPage(root, ctx, base);
    }
    default: return homePage(root, ctx);
  }
}

function shell() {
  const loggedUser = localStorage.getItem('iptv.logged_user') || (status && status.name) || 'Conta';
  
  // Formata o vencimento de forma elegante e discreta (ex: " · até 17/05/2034")
  let expHint = '';
  if (status && status.expiresAt) {
    const d = new Date(status.expiresAt);
    if (!isNaN(d.getTime())) {
      expHint = ` · até ${d.toLocaleDateString('pt-BR')}`;
    }
  }

  nav = h('nav', { class: 'top', 'aria-label': 'Menu' },
    h('div', { class: 'brand', style: 'display:flex;align-items:center;gap:8px' },
      h('img', { src: 'boxtv-logo.svg', alt: 'BoxTv', style: 'width:28px;height:28px;border-radius:6px' }),
      h('span', {}, 'BoxTv')
    ),
    TABS.map(([id, label]) => h('button', { class: 'pill', 'data-f': true, 'data-tab': id, onclick: () => go(id) }, label)),
    h('button', { class: 'keybtn', 'data-f': true, title: `Usuário conectado: ${loggedUser}${expHint} (clique para sair)`, 'aria-label': 'Conta do usuário',
      style: 'margin-left:auto;display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:999px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);color:var(--txt);font-size:.85rem',
      onclick: () => {
        if (confirm('Deseja sair da conta?')) logout();
      } },
      '👤',
      h('span', { style: 'font-weight:700' }, loggedUser),
      expHint ? h('small', { style: 'color:var(--dim2);font-weight:500;font-size:.76rem' }, expHint) : null));
  main = h('main', {});
  clear(app).append(nav, main);
  window.addEventListener('hashchange', render);
  render();
  // confere o acesso de tempos em tempos (vencimento/bloqueio no painel)
  setInterval(async () => {
    try {
      const s = await api('/status');
      status = s;
      if (s.status !== 'active') location.reload();
    } catch (e) { if (e instanceof ApiError && (e.status === 401 || e.status === 403)) location.reload(); }
  }, 60000);
  // renova o token de imagens antes de vencer
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
  status = await gate();
  try { await ensureToken(); } catch { /* imagens http ficam sem capa */ }
  shell();
})();
