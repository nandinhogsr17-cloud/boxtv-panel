import { api, ApiError, identity, getDeviceCode, login, logout, ensureToken } from './api.js?v=20261115b';
import { h, clear, spinner, message, toast } from './dom.js?v=20261115b';
import { initNav, focusFirst } from './nav.js?v=20261115b';
import { openPlayer, playerOpen } from './player.js?v=20261115b';
import { homePage, browsePage, favsPage, gamesPage, searchPage, detailPage, accountPage } from './pages.js?v=20261115b';
import { openDevicesModal } from './devices_modal.js?v=20261115b';

const CFG = window.IPTV_CONFIG || {};
const NAME = CFG.appName || 'BoxTv';
document.title = NAME;
const app = document.getElementById('app');

// ====================================================================== 🏧 Tela de Ativação por Código Único
function activationScreen(onSuccess) {
  const code = getDeviceCode();

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      toast('Código copiado!');
    } catch {
      prompt('Copie o código do aparelho:', code);
    }
  }

  // Polling automático: registra e confere a cada 3.5s se este dispositivo foi ativado remotamente
  const pollInterval = setInterval(async () => {
    try {
      // Usa /register para garantir que o device está registrado E verificar o status atual
      const s = await api('/register', {
        method: 'POST',
        body: { mac: identity.mac, key: identity.key, appVersion: 'web-1.0', model: navigator.platform || 'Web' }
      });
      if (s && s.status === 'active') {
        clearInterval(pollInterval);
        toast('Aparelho ativado!');
        onSuccess(s);
      }
    } catch { }
  }, 3500);

  const btnOpenActivation = h('button', {
    class: 'btn primary',
    'data-f': true,
    style: 'width:100%;justify-content:center;padding:14px;font-size:1.1rem;font-weight:700;box-shadow:0 0 25px rgba(255,0,85,0.45);display:flex;align-items:center;gap:8px',
    onclick: () => {
      openDevicesModal({
        onDeviceActivated: async () => {
          try {
            const s = await api('/register', {
              method: 'POST',
              body: { mac: identity.mac, key: identity.key, appVersion: 'web-1.0', model: navigator.platform || 'Web' }
            });
            if (s && s.status === 'active') {
              clearInterval(pollInterval);
              onSuccess(s);
            }
          } catch { }
        }
      });
    }
  }, '🏧 Ativar / Gerenciar Dispositivos');

  clear(app).append(h('div', { class: 'act' }, h('div', { class: 'box', style: 'max-width:460px;padding:32px 24px;border-radius:20px;border:1px solid rgba(255,255,255,0.1);background:rgba(18,18,24,0.95);box-shadow:0 12px 40px rgba(0,0,0,0.6)' },
    h('div', { style: 'display:flex;justify-content:center;margin-bottom:14px' },
      h('img', { src: 'boxtv-logo.svg', alt: 'BoxTv', style: 'width:76px;height:76px;border-radius:20px;box-shadow:0 8px 30px rgba(255,0,85,0.4)' })
    ),
    h('h1', { style: 'font-size:1.8rem;margin-bottom:6px;text-align:center;font-weight:900;letter-spacing:-.02em;color:#fff' }, 'BoxTv ⚡'),
    h('p', { style: 'margin-bottom:20px;text-align:center;font-size:.82rem;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.06em' },
      'O MELHOR DO ENTRETENIMENTO · Canais Ao Vivo · Filmes · Séries · Jogos'
    ),

    // Card com o código único fixo do dispositivo
    h('div', {
      style: 'padding:18px;border-radius:14px;background:rgba(0,229,255,0.06);border:2px solid rgba(0,229,255,0.35);margin-bottom:20px;text-align:center;box-shadow:0 0 20px rgba(0,229,255,0.15)'
    },
      h('div', { style: 'font-size:.78rem;color:var(--dim);text-transform:uppercase;letter-spacing:.08em;font-weight:700;margin-bottom:6px' }, 'Seu Código Único Deste Aparelho'),
      h('div', { style: 'font-size:1.6rem;font-weight:900;color:#00e5ff;font-family:monospace;letter-spacing:.06em;margin-bottom:10px' }, code),
      h('div', { style: 'display:flex;justify-content:center;gap:10px' },
        h('button', {
          class: 'btn sm',
          'data-f': true,
          style: 'padding:6px 16px;font-size:.85rem;background:rgba(0,229,255,0.15);color:#00e5ff;border:1px solid rgba(0,229,255,0.3)',
          onclick: copyCode
        }, '📋 Copiar Código')
      )
    ),

    // Status animado de espera
    h('div', {
      style: 'display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:20px;font-size:.9rem;color:#f59e0b;font-weight:600'
    },
      h('span', { style: 'display:inline-block;width:10px;height:10px;border-radius:50%;background:#f59e0b;box-shadow:0 0 10px #f59e0b;animation:pulse 1.5s infinite' }),
      'Aguardando ativação à distância…'
    ),

    h('p', { class: 'dim', style: 'font-size:.85rem;text-align:center;margin-bottom:22px;line-height:1.4' },
      'Informe este código para ativar à distância de qualquer outro aparelho/computador, ou clique abaixo para ativar agora mesmo com o Link da Lista M3U.'
    ),

    btnOpenActivation
  )));
}

async function gate() {
  clear(app).append(spinner());

  // Registra o device e confere se já está ativado
  try {
    const r = await api('/register', {
      method: 'POST',
      body: { mac: identity.mac, key: identity.key, appVersion: 'web-1.0', model: navigator.platform || 'Web' }
    });
    if (r && r.status === 'active') return r;
  } catch { }

  // Caso contrário, aguarda a ativação
  return new Promise((resolve) => {
    activationScreen((statusInfo) => {
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
    h('button', {
      class: 'pill',
      'data-f': true,
      style: 'background:rgba(255,0,85,0.15);border:1px solid rgba(255,0,85,0.3);color:#ff0055;font-weight:700;display:inline-flex;align-items:center;gap:4px',
      onclick: () => openDevicesModal()
    }, '🏧 Ativações'),
    h('button', {
      class: 'keybtn', 'data-f': true, title: `Usuário conectado: ${loggedUser}${expHint} (clique para sair)`, 'aria-label': 'Conta do usuário',
      style: 'margin-left:auto;display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:999px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);color:var(--txt);font-size:.85rem',
      onclick: () => {
        if (confirm('Deseja sair da conta?')) logout();
      }
    },
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
  status = await gate();
  try { await ensureToken(); } catch { /* imagens http ficam sem capa */ }
  shell();
})();
