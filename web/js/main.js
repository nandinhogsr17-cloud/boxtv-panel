import { api, ApiError, login, logout, ensureToken, recoverSession } from './api.js';
import { h, clear, spinner, message, toast } from './dom.js';
import { initNav, focusFirst } from './nav.js';
import { openPlayer, playerOpen } from './player.js';
import { homePage, browsePage, favsPage, gamesPage, searchPage, detailPage, accountPage } from './pages.js';

const CFG = window.IPTV_CONFIG || {};
const NAME = CFG.appName || 'BoxTv';
document.title = NAME;
const app = document.getElementById('app');

export const SKINS = [
  { id: 'cyber', name: 'Cyber Cinema', icon: '⚡', desc: 'Neon Magenta, Violeta & Cyan' },
  { id: 'emerald', name: 'Midnight Emerald', icon: '🟢', desc: 'Esmeralda & Obsidian Profundo' },
  { id: 'gold', name: 'OLED Imperial Gold', icon: '👑', desc: 'Ouro Real & Preto Puro' },
  { id: 'amethyst', name: 'Amethyst Neon', icon: '🔮', desc: 'Ametista & Violeta Galáctica' },
];

export function applySkin(skinId) {
  const s = SKINS.find((x) => x.id === skinId) || SKINS[0];
  document.documentElement.setAttribute('data-skin', s.id);
  localStorage.setItem('boxtv_skin', s.id);
  return s;
}

// Inicializa a skin imediatamente antes do carregamento da tela
applySkin(localStorage.getItem('boxtv_skin') || 'cyber');

function openSkinModal() {
  const existing = document.getElementById('skin-modal');
  if (existing) { existing.remove(); return; }
  const curr = localStorage.getItem('boxtv_skin') || 'cyber';
  const modal = h('div', { id: 'skin-modal', style: 'position:fixed;inset:0;background:rgba(0,0,0,0.78);backdrop-filter:blur(10px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px' },
    h('div', { class: 'box', style: 'background:var(--card);border:1px solid var(--line);border-radius:20px;padding:24px;width:100%;max-width:440px;box-shadow:0 24px 60px rgba(0,0,0,0.9)' },
      h('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:18px' },
        h('h3', { style: 'font-size:1.3rem;font-weight:900;color:var(--txt);display:flex;align-items:center;gap:8px' }, '🎨 Skins & Temas'),
        h('button', { class: 'btn sm', onclick: () => modal.remove(), style: 'font-size:1.1rem;padding:4px 10px' }, '✕')
      ),
      h('div', { style: 'display:grid;gap:12px' },
        SKINS.map((s) => {
          const isAct = s.id === curr;
          return h('button', {
            class: 'skin-card' + (isAct ? ' active' : ''),
            'data-f': true,
            style: `display:flex;align-items:center;gap:14px;padding:14px 18px;border-radius:14px;text-align:left;border:2px solid ${isAct ? 'var(--accent)' : 'var(--line)'};background:${isAct ? 'rgba(255,255,255,0.08)' : 'var(--bg2)'};cursor:pointer;transition:transform .15s,border-color .2s`,
            onclick: () => {
              applySkin(s.id);
              toast(`Skin aplicada: ${s.name}`);
              modal.remove();
            }
          },
            h('span', { style: 'font-size:1.9rem' }, s.icon),
            h('div', { style: 'flex:1' },
              h('div', { style: 'font-weight:800;font-size:1.05rem;color:var(--txt)' }, s.name),
              h('div', { style: 'font-size:0.8rem;color:var(--dim)' }, s.desc)),
            isAct ? h('span', { style: 'color:var(--accent);font-weight:900;font-size:1.25rem' }, '✓') : null
          );
        })
      )
    )
  );
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  document.body.append(modal);
}

export function hideSplash() {
  const s = document.getElementById('splash');
  if (!s) return;
  s.style.transition = 'opacity .4s ease';
  s.style.opacity = '0';
  setTimeout(() => { if (s && s.parentNode) s.remove(); }, 400);
}

// ====================================================================== Login Xtream (sem código de ativação e sem M3U)
function loginScreen(onSuccess) {
  let serverHost = '';
  let busy = false;
  const user = h('input', { class: 'login-input', type: 'text', placeholder: 'Usuário', autocomplete: 'username', autocapitalize: 'none', 'data-f': true });
  const pass = h('input', { class: 'login-input', type: 'password', placeholder: 'Senha', autocomplete: 'current-password', 'data-f': true });
  const host = h('input', { class: 'login-input', type: 'url', placeholder: 'Servidor Xtream (ex.: http://servidor.com:80)', autocomplete: 'url', 'data-f': true });
  const hostPass = h('input', { class: 'login-input', type: 'password', placeholder: 'Senha mestra para alterar (box54321)', autocomplete: 'current-password', 'data-f': true });
  const hostStatus = h('div', { class: 'dim', style: 'font-size:.82rem;margin-top:6px;min-height:18px' });
  const hostSaveAll = h('button', { class: 'btn sm', type: 'button', 'data-f': true, style: 'margin-top:8px;width:100%;justify-content:center' }, 'Salvar servidor para todos (site e aparelhos)');
  hostSaveAll.addEventListener('click', async () => {
    const targetHost = host.value.trim();
    if (!targetHost) { hostStatus.textContent = 'Informe a URL do novo servidor.'; return; }
    if (!hostPass.value) { hostStatus.textContent = 'Digite a senha box54321 para salvar.'; return; }
    hostStatus.textContent = 'Salvando para todos os aparelhos…';
    try {
      const res = await api('/server', { method: 'POST', body: { host: targetHost, password: hostPass.value, force: true } });
      serverHost = targetHost;
      hostStatus.style.color = 'var(--accent, #ff4081)';
      hostStatus.textContent = `✓ Servidor atualizado para todos (${res.migrated || 0} aparelhos migrados)!`;
      hostPass.value = '';
    } catch (e) {
      hostStatus.style.color = '#ff6b6b';
      hostStatus.textContent = e.message || 'Senha incorreta. Use box54321.';
    }
  });

  const hostWrap = h('details', { style: 'width:100%;margin-top:12px;text-align:left' },
    h('summary', { style: 'cursor:pointer;color:var(--dim);padding:8px 2px' }, '⚙ Configurar servidor (senha: box54321)'),
    h('label', { class: 'dim', style: 'display:block;margin:8px 0 4px;font-size:.84rem' }, 'Endereço do servidor'), host,
    h('label', { class: 'dim', style: 'display:block;margin:8px 0 4px;font-size:.84rem' }, 'Senha mestra'), hostPass,
    hostSaveAll, hostStatus);
  const out = h('div', { class: 'dim', role: 'status', 'aria-live': 'polite', style: 'min-height:24px;text-align:center;margin-top:12px' });
  const submit = h('button', { class: 'btn primary', 'data-f': true, style: 'width:100%;justify-content:center;padding:14px;margin-top:18px;font-weight:800' }, 'Entrar');
  submit.addEventListener('click', async () => {
    if (busy) return;
    if (!user.value.trim() || !pass.value) { out.textContent = 'Informe seu usuário e sua senha.'; return; }
    busy = true; submit.disabled = true; submit.textContent = 'Conectando…';
    out.textContent = 'Validando sua conta no servidor Xtream…';
    try {
      const result = await login(user.value.trim(), pass.value, host.value.trim() || serverHost || undefined);
      localStorage.setItem('iptv.logged_user', result.username || user.value.trim());
      out.textContent = '';
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
      out.textContent = messages[code] || 'Não foi possível entrar. Verifique os dados e tente novamente.';
    } finally {
      busy = false; submit.disabled = false; submit.textContent = 'Entrar';
    }
  });
  clear(app).append(h('div', { class: 'act' }, h('div', { class: 'box', style: 'max-width:460px;padding:30px 24px;border-radius:22px;border:1px solid rgba(255,255,255,.12);background:rgba(18,18,24,.97);box-shadow:0 12px 40px rgba(0,0,0,.6)' },
    h('div', { style: 'display:flex;justify-content:center;margin-bottom:14px' }, h('img', { src: 'boxtv-logo.svg', alt: 'BoxTv', style: 'width:76px;height:76px;border-radius:20px;box-shadow:0 8px 30px rgba(179,77,255,.28)' })),
    h('h1', { style: 'font-size:1.9rem;margin:0 0 6px;text-align:center;font-weight:900;color:#fff' }, 'BoxTv ⚡'),
    h('p', { style: 'margin:0 0 22px;text-align:center;font-size:.82rem;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.06em' }, 'O MELHOR DO ENTRETENIMENTO · CANAIS AO VIVO · FILMES · SÉRIES · JOGOS'),
    h('h2', { style: 'text-align:center;margin:0 0 8px' }, 'Entrar com Xtream'),
    h('p', { class: 'dim', style: 'text-align:center;font-size:.9rem;margin:0 0 18px' }, 'Digite o usuário e a senha fornecidos pelo seu provedor.'),
    h('div', { style: 'display:grid;gap:12px' }, user, pass), hostWrap, submit, out
  )));
  api('/activate/config').then((cfg) => { serverHost = cfg.serverHost || ''; host.value = serverHost; }).catch(() => { });
  hideSplash();
  user.focus({ preventScroll: true });
}

async function gate() {
  clear(app).append(spinner());
  try {
    const current = await api('/status');
    if (current && current.status === 'active') return current;
    // Servidor reiniciou e perdeu o cadastro: reativa com a sessão salva, sem pedir senha.
    if (await recoverSession()) {
      const again = await api('/status');
      if (again && again.status === 'active') return again;
    }
  } catch { /* aparelho ainda não autenticado: exibe login Xtream */ }
  return new Promise((resolve) => loginScreen(resolve));
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
    h('button', {
      class: 'pill skin-btn', 'data-f': true, title: 'Personalizar Skin / Tema', 'aria-label': 'Skins e Temas',
      style: 'margin-left:auto;padding:6px 14px;font-size:0.85rem;display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12)',
      onclick: () => openSkinModal()
    }, '🎨 Skin'),
    h('button', {
      class: 'keybtn', 'data-f': true, title: `Usuário conectado: ${loggedUser}${expHint} (clique para sair)`, 'aria-label': 'Conta do usuário',
      style: 'margin-left:8px;display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:999px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);color:var(--txt);font-size:.85rem',
      onclick: () => {
        if (confirm('Deseja sair da conta?')) logout();
      }
    },
      '👤',
      h('span', { style: 'font-weight:700' }, loggedUser),
      expHint ? h('small', { style: 'color:var(--dim2);font-weight:500;font-size:.76rem' }, expHint) : null));
  main = h('main', {});
  clear(app).append(nav, main);
  hideSplash();
  window.addEventListener('hashchange', render);
  render();
  // confere o acesso de tempos em tempos (vencimento/bloqueio no painel)
  setInterval(async () => {
    try {
      const s = await api('/status');
      status = s;
      if (s.status !== 'active' && !(await recoverSession())) location.reload();
    } catch (e) { if (e instanceof ApiError && (e.status === 401 || e.status === 403)) location.reload(); }
  }, 60000);
  // renova o token de imagens antes de vencer
  setInterval(() => ensureToken().catch(() => { }), 30 * 60000);
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
  hideSplash();
  status = await gate();
  hideSplash();
  try { await ensureToken(); } catch { /* imagens http ficam sem capa */ }
  shell();
  hideSplash();
})();
