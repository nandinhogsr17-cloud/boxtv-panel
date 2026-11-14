// Painel de ativação (janela): mostra MAC e chave e deixa colar a lista. Abre pelo ícone 🔑 na tela inicial.
import { api, ApiError, identity } from './api.js';
import { h, toast } from './dom.js';
import { setScope } from './nav.js';

let current = null;
export const activationOpen = () => !!current;
export const closeActivation = () => current && current.close();

async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast('Copiado'); } catch { prompt('Copie:', text); }
}

/** @param {{status?:string, onDone?:(r:object)=>void}} opts */
export function openActivation({ status = 'active', onDone } = {}) {
  if (current) return current;
  let mode = 'url';
  const mac = identity.mac, key = identity.key;

  const valBox = (label, value) => h('div', { style: 'flex:1;min-width:200px' },
    h('div', { class: 'lbl' }, label),
    h('div', { class: 'val mono', style: 'font-size:1.25rem;margin:2px 0 6px' }, value),
    h('button', { class: 'btn sm', 'data-f': true, onclick: () => copy(value) }, '⧉ Copiar'));

  const inp = (attrs) => h('input', { spellcheck: 'false', autocomplete: 'off', 'data-f': true, style: 'width:100%;padding:11px 12px;border-radius:10px;border:2px solid var(--line);background:var(--bg2);text-transform:none', ...attrs });
  const url = inp({ placeholder: 'http://servidor.com:8080/get.php?username=…&password=…&type=m3u_plus' });
  const host = inp({ placeholder: 'Servidor (http://servidor.com:8080)' });
  const user = inp({ placeholder: 'Usuário' });
  const pass = inp({ placeholder: 'Senha' });
  const luser = inp({ placeholder: 'Usuário', autocapitalize: 'none', inputmode: 'text', name: 'iptv-user' });
  const lpass = inp({ placeholder: 'Senha', autocapitalize: 'none', name: 'iptv-pass' });
  const boxLogin = h('div', { style: 'display:grid;gap:8px' }, h('label', { class: 'dim', style: 'font-size:.85rem' }, 'Entre com o usuário e a senha da sua lista'), luser, lpass);
  const boxUrl = h('div', {}, h('label', { class: 'dim', style: 'font-size:.85rem' }, 'Link da lista (M3U)'), url);
  const boxX = h('div', { style: 'display:grid;gap:8px' }, host, user, pass);
  const tLogin = h('button', { class: 'chip', 'data-f': true, onclick: () => set('login') }, 'Usuário e senha');
  const tUrl = h('button', { class: 'chip on', 'data-f': true, onclick: () => set('url') }, 'Link M3U');
  const tX = h('button', { class: 'chip', 'data-f': true, onclick: () => set('x') }, 'Servidor + usuário + senha');
  const tabs = h('div', { class: 'chips', style: 'padding:0 0 10px' }, tUrl, tX);
  function set(m) {
    mode = m;
    tLogin.classList.toggle('on', m === 'login'); tUrl.classList.toggle('on', m === 'url'); tX.classList.toggle('on', m === 'x');
    boxLogin.style.display = m === 'login' ? 'grid' : 'none';
    boxUrl.style.display = m === 'url' ? 'block' : 'none';
    boxX.style.display = m === 'x' ? 'grid' : 'none';
    (m === 'login' ? luser : m === 'url' ? url : host).focus?.();
  }
  set('url');
  // Se o fornecedor configurou um servidor fixo, o cliente só digita usuário e senha.
  api('/activate/config').then((c) => {
    if (c && c.loginMode === 'userpass' && current) { tabs.replaceChildren(tLogin, tUrl); set('login'); }
  }).catch(() => {});

  const out = h('div', { style: 'margin-top:12px;text-align:left', role: 'status', 'aria-live': 'polite' });
  const go = h('button', { class: 'btn primary', 'data-f': true, style: 'margin-top:12px' }, '✓ Verificar e ativar');
  const closeBtn = h('button', { class: 'btn', 'data-f': true, 'aria-label': 'Fechar', onclick: () => close() }, '✕ Fechar');

  go.addEventListener('click', async () => {
    const payload = mode === 'login' ? { login: { user: luser.value, pass: lpass.value } }
      : mode === 'url' ? { m3uUrl: url.value } : { xtream: { host: host.value, user: user.value, pass: pass.value } };
    if (mode === 'url' && !url.value.trim()) { out.replaceChildren(h('div', { class: 'err' }, 'Cole o link da lista.')); return; }
    if (mode === 'login' && !luser.value.trim()) { out.replaceChildren(h('div', { class: 'err' }, 'Digite o usuário e a senha.')); return; }
    go.disabled = true;
    out.replaceChildren(h('div', { class: 'dim' }, 'Verificando a lista… listas grandes podem levar até 1 minuto.'));
    try {
      const r = await api('/activate', { method: 'POST', body: { mac, key, ...payload } });
      out.replaceChildren(
        h('div', { style: 'color:#6ee7a8;font-weight:700' }, r.status === 'expired' ? 'Lista gravada, mas a validade está vencida. Fale com o fornecedor.' : '✓ Lista verificada e ativada'),
        h('div', {}, `${r.counts.live} canais · ${r.counts.movie} filmes · ${r.counts.series} séries`),
        r.account ? h('div', { class: 'dim', style: 'font-size:.9rem' }, 'Conta: ' + [r.account.status, r.account.expiresAt ? 'vence em ' + new Date(r.account.expiresAt).toLocaleDateString('pt-BR') : null, r.account.maxConnections ? r.account.maxConnections + ' tela(s)' : null].filter(Boolean).join(' · ')) : null,
        ...(r.warnings || []).map((w) => h('div', { class: 'dim', style: 'font-size:.85rem;margin-top:6px' }, '⚠ ' + w.message)));
      onDone?.(r);
      if (r.status === 'active') setTimeout(() => { if (current) close(); }, 1800);
    } catch (e) {
      out.replaceChildren(h('div', { class: 'err' }, (e instanceof ApiError && (e.body.message || e.code)) || 'Não foi possível ativar.'));
    } finally { go.disabled = false; }
  });

  const statusText = { active: 'Ativo', pending: 'Aguardando lista', expired: 'Vencido', blocked: 'Bloqueado' }[status] || status;
  const modal = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Painel de ativação',
    onclick: (e) => { if (e.target === modal) close(); } },
    h('div', { class: 'sheet' },
      h('div', { style: 'display:flex;align-items:center;gap:10px;margin-bottom:12px' },
        h('h2', { style: 'flex:1;font-size:1.3rem' }, '🔑 Painel de ativação'), closeBtn),
      h('div', { class: 'big', style: 'margin:0 0 14px;padding:16px' },
        h('div', { style: 'display:flex;gap:16px;flex-wrap:wrap' }, valBox('MAC', mac), valBox('Chave', key)),
        h('div', { class: 'dim', style: 'margin-top:8px;font-size:.9rem' }, 'Status: ', h('b', { style: 'color:var(--txt)' }, statusText))),
      tabs,
      boxLogin, boxUrl, boxX, go, out,
      h('p', { class: 'dim', style: 'font-size:.82rem;margin-top:14px' },
        'Outra pessoa também pode ativar de qualquer lugar em ', h('b', {}, location.origin.replace(/^https?:\/\//, '') + '/ativar'), ' usando este MAC e esta chave.')));

  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
  document.addEventListener('keydown', onKey, true);
  document.body.append(modal);
  document.body.style.overflow = 'hidden';
  setScope(modal);
  url.focus();

  function close() {
    document.removeEventListener('keydown', onKey, true);
    modal.remove();
    document.body.style.overflow = '';
    setScope(document);
    current = null;
  }
  current = { close };
  return current;
}
