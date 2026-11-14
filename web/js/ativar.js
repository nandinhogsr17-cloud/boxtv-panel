// Página pública de ativação: MAC + chave + lista. O painel confere a lista antes de gravar.
const API = ((window.IPTV_CONFIG || {}).apiBase || '').replace(/\/$/, '');
const $ = (id) => document.getElementById(id);
const out = $('out');
let mode = 'url';

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function show(node) { out.replaceChildren(node); node.scrollIntoView?.({ block: 'nearest' }); }

function setMode(m) {
  mode = m;
  $('tabLogin').classList.toggle('on', m === 'login');
  $('tabUrl').classList.toggle('on', m === 'url');
  $('tabX').classList.toggle('on', m === 'x');
  $('boxLogin').style.display = m === 'login' ? 'grid' : 'none';
  $('boxUrl').style.display = m === 'url' ? 'block' : 'none';
  $('boxX').style.display = m === 'x' ? 'grid' : 'none';
}
$('boxX').style.display = 'none';
$('tabLogin').onclick = () => setMode('login');
$('tabUrl').onclick = () => setMode('url');
$('tabX').onclick = () => setMode('x');
// Servidor fixo configurado pelo fornecedor: o cliente só digita usuário e senha.
fetch(API + '/api/v1/activate/config').then((r) => r.json()).then((c) => {
  if (c.loginMode === 'userpass') {
    $('tabLogin').classList.remove('hidden');
    $('tabX').classList.add('hidden');
    setMode('login');
  }
}).catch(() => {});

// MAC e chave podem vir no endereço: /ativar?mac=...&key=...
const q = new URLSearchParams(location.search);
if (q.get('mac')) $('mac').value = q.get('mac');
if (q.get('key')) $('key').value = q.get('key');

// formata o MAC enquanto digita
$('mac').addEventListener('input', () => {
  const h = $('mac').value.toUpperCase().replace(/[^0-9A-F]/g, '').slice(0, 12);
  $('mac').value = h.match(/.{1,2}/g)?.join(':') || '';
});

const MSG = {
  invalid_identity: 'MAC ou chave inválidos. Confira o que aparece na tela do aplicativo.',
  device_not_found: 'Esse MAC ainda não apareceu no sistema. Abra o aplicativo no aparelho uma vez (com internet) e tente de novo.',
  key_mismatch: 'A chave não confere com este MAC.',
  device_blocked: 'Este aparelho está bloqueado. Fale com o seu fornecedor.',
  too_many_attempts: 'Muitas tentativas. Aguarde alguns minutos.',
  busy: 'Servidor ocupado. Tente de novo em 30 segundos.',
  self_activation_disabled: 'A ativação pelo cliente está desligada. Fale com o seu fornecedor.',
  already_activated: 'Este aparelho já tem uma lista. Peça ao fornecedor para trocar.',
};

$('f').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const body = { mac: $('mac').value, key: $('key').value };
  if (mode === 'login') body.login = { user: $('luser').value, pass: $('lpass').value };
  else if (mode === 'url') body.m3uUrl = $('url').value;
  else body.xtream = { host: $('host').value, user: $('user').value, pass: $('pass').value };
  $('go').disabled = true;
  const wait = el('div', 'ok');
  wait.append(el('b', null, 'Verificando a lista…'), el('div', 'dim', 'Estou baixando e conferindo. Listas grandes podem levar até 1 minuto.'));
  show(wait);
  try {
    const res = await fetch(API + '/api/v1/activate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    let j = {};
    try { j = await res.json(); } catch { /* sem corpo */ }
    if (!res.ok) {
      const bad = el('div', 'bad');
      bad.append(el('b', null, 'Não foi possível ativar'), el('div', null, j.message || MSG[j.error] || 'Erro inesperado (' + res.status + ').'));
      return show(bad);
    }
    const ok = el('div', 'ok');
    const expired = j.status === 'expired';
    ok.append(el('b', null, expired ? 'Lista gravada, mas a validade do aparelho está vencida' : '✓ Lista verificada e ativada'));
    ok.append(el('div', null, expired ? 'Fale com o seu fornecedor para renovar.' : 'O aplicativo abre sozinho em até 5 segundos. Se estiver fechado, abra-o.'));
    const st = el('div', 'stats');
    for (const [k, label] of [['live', 'canais'], ['movie', 'filmes'], ['series', 'séries']]) {
      const d = el('div'); d.append(el('b', null, String(j.counts[k])), document.createTextNode(label)); st.append(d);
    }
    ok.append(st);
    if (j.account) ok.append(el('div', 'dim', 'Conta: ' + [j.account.status, j.account.expiresAt ? 'vence em ' + new Date(j.account.expiresAt).toLocaleDateString('pt-BR') : null, j.account.maxConnections ? j.account.maxConnections + ' tela(s)' : null].filter(Boolean).join(' · ')));
    if (j.expiresAt) ok.append(el('div', 'dim', 'Validade: ' + new Date(j.expiresAt).toLocaleDateString('pt-BR')));
    for (const w of j.warnings || []) ok.append(el('div', 'warn', '⚠ ' + w.message));
    show(ok);
  } catch {
    const bad = el('div', 'bad');
    bad.append(el('b', null, 'Sem conexão'), el('div', null, 'Não consegui falar com o servidor. Confira a internet e tente de novo.'));
    show(bad);
  } finally {
    $('go').disabled = false;
  }
});
