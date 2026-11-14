// Testes da ativação pelo cliente (POST /api/v1/activate e página /ativar).
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server.js';
import { cleanPlaylistUrl, buildXtreamUrl, validatePlaylistText, PlaylistError } from '../src/playlist.js';

let passed = 0, failed = 0;
const check = (name, cond, extra = '') => {
  if (cond) { passed++; console.log('  ok     ' + name); } else { failed++; console.log('  FALHOU ' + name + (extra ? '  -> ' + extra : '')); }
};
const section = (t) => console.log('\n' + t);

// ---------------------------------------------------------------- provedor falso
const good = (n) => '#EXTM3U\n' + Array.from({ length: n }, (_, i) => `#EXTINF:-1 group-title="CANAIS",Canal ${i + 1}\n__P__/live/${i + 1}.ts\n`).join('') +
  '#EXTINF:-1 group-title="FILMES",Filme X (2020)\n__P__/movie/x.mp4\n';
const hits = { list: 0, auth: [] };
let streamsOk = true;
const prov = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const P = `http://127.0.0.1:${prov.address().port}`;
  if (u.pathname === '/good.m3u') { hits.list++; res.writeHead(200, { 'content-type': 'audio/x-mpegurl' }); return res.end(good(6).replaceAll('__P__', P)); }
  if (u.pathname === '/other.m3u') { res.writeHead(200); return res.end(good(9).replaceAll('__P__', P)); }
  if (u.pathname === '/get.php') {
    hits.auth.push(u.searchParams.get('username') + ':' + u.searchParams.get('password'));
    if (u.searchParams.get('username') === 'joao' && u.searchParams.get('password') === 's3nha') { res.writeHead(200); return res.end(good(4).replaceAll('__P__', P)); }
    res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"user_info":{"auth":0}}');
  }
  if (u.pathname === '/page.html') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<!DOCTYPE html><html><body>Login</body></html>'); }
  if (u.pathname === '/empty.m3u') { res.writeHead(200); return res.end('#EXTM3U\n'); }
  if (u.pathname === '/text.txt') { res.writeHead(200); return res.end('olá mundo'); }
  if (u.pathname === '/bom.m3u') { res.writeHead(200); return res.end('﻿' + good(3).replaceAll('__P__', P)); }
  if (u.pathname === '/err500') { res.writeHead(500); return res.end('x'); }
  if (u.pathname === '/redir') { res.writeHead(302, { location: '/good.m3u' }); return res.end(); }
  if (u.pathname === '/slow') { return; } // nunca responde
  if (u.pathname.startsWith('/live/') || u.pathname.startsWith('/movie/')) {
    if (!streamsOk) { res.writeHead(403); return res.end(); }
    res.writeHead(200, { 'content-type': 'video/mp2t' }); return res.end(Buffer.alloc(2048, 0x47));
  }
  res.writeHead(404); res.end();
});
await new Promise((r) => prov.listen(0, '127.0.0.1', r));
const P = `http://127.0.0.1:${prov.address().port}`;

// ---------------------------------------------------------------- unidade
section('Entrada do usuário');
check('limpa espaços/quebras/aspas', cleanPlaylistUrl('  "http://a.com/x.m3u\n" ') === 'http://a.com/x.m3u');
check('adiciona http:// se faltar', cleanPlaylistUrl('a.com:8080/get.php?u=1') === 'http://a.com:8080/get.php?u=1');
check('recusa ftp/file/javascript', !cleanPlaylistUrl('ftp://a.com/x') && !cleanPlaylistUrl('file:///etc/passwd') && !cleanPlaylistUrl('javascript:alert(1)'));
check('recusa vazio e lixo', !cleanPlaylistUrl('') && !cleanPlaylistUrl('   ') && !cleanPlaylistUrl('abc'));
check('recusa URL gigante', !cleanPlaylistUrl('http://a.com/' + 'x'.repeat(2100)));
check('Xtream vira link M3U', buildXtreamUrl({ host: 'servidor.com:8080', user: 'joão', pass: 'p&s s' }) === 'http://servidor.com:8080/get.php?username=jo%C3%A3o&password=p%26s%20s&type=m3u_plus&output=ts', buildXtreamUrl({ host: 'servidor.com:8080', user: 'joão', pass: 'p&s s' }));
check('Xtream sem senha = nulo', buildXtreamUrl({ host: 'a.com', user: 'x', pass: '' }) === null);
const reason = (t) => { try { validatePlaylistText(t); return 'ok'; } catch (e) { return e instanceof PlaylistError ? e.reason : 'erro:' + e.message; } };
check('valida M3U boa', reason(good(2).replaceAll('__P__', 'http://h')) === 'ok');
check('HTML recusado', reason('<html>x</html>') === 'html_page');
check('JSON de login recusado (auth 0)', reason('{"user_info":{"auth":0}}') === 'auth_failed');
check('JSON qualquer = não é M3U', reason('{"a":1}') === 'not_m3u');
check('M3U vazia', reason('#EXTM3U\n') === 'no_entries');
check('texto solto', reason('oi') === 'not_m3u');

// ---------------------------------------------------------------- painel
const mk = (extra = {}) => createApp({ activateMax: 1000, port: 0, dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'iptv-act-')), adminPassword: 'pw', allowPrivate: true, ...extra });
const app = mk();
const port = await app.listen();
const B = `http://127.0.0.1:${port}`;
const adm = { authorization: 'Basic ' + Buffer.from('admin:pw').toString('base64'), 'content-type': 'application/json', 'x-admin-csrf': '1' };
const MAC = '02:AA:BB:CC:DD:01', KEY = 'KEYK2345';
const post = async (p, body, headers = {}) => { const r = await fetch(B + p, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }); let j = null; try { j = await r.json(); } catch {} return { status: r.status, json: j }; };
const act = (body) => post('/api/v1/activate', { mac: MAC, key: KEY, ...body });
const devStatus = async (mac = MAC, key = KEY) => (await (await fetch(B + '/api/v1/status', { headers: { 'x-mac': mac, 'x-key': key } })).json());
const adminDev = async (mac = MAC) => (await (await fetch(B + '/admin/api/devices', { headers: adm })).json()).devices.find((d) => d.mac === mac);

section('Identidade');
{
  let r = await act({ m3uUrl: P + '/good.m3u' });
  check('MAC que nunca abriu o app → 404 device_not_found', r.status === 404 && r.json.error === 'device_not_found' && /Abra o aplicativo/.test(r.json.message), JSON.stringify(r.json));
  await post('/api/v1/register', { mac: MAC, key: KEY });
  r = await post('/api/v1/activate', { mac: 'xx', key: KEY, m3uUrl: P + '/good.m3u' });
  check('MAC inválido → 400', r.status === 400 && r.json.error === 'invalid_identity');
  r = await act({ key: 'ERRADA22', m3uUrl: P + '/good.m3u' });
  check('chave errada → 403 key_mismatch (nada muda)', r.status === 403 && r.json.error === 'key_mismatch' && (await devStatus()).status === 'pending');
  r = await post('/api/v1/activate', { m3uUrl: P + '/good.m3u' }, { 'x-mac': MAC, 'x-key': KEY });
  check('aceita MAC/chave nos cabeçalhos (app)', r.status === 200 && r.json.ok, JSON.stringify(r.json));
  await fetch(B + '/admin/api/devices/' + encodeURIComponent(MAC), { method: 'PATCH', headers: adm, body: JSON.stringify({ m3uUrl: '', resetKey: false }) });
}

section('Lista inválida não ativa e não muda nada');
{
  const bad = async (body, wantReason) => {
    const before = await adminDev();
    const r = await act(body);
    const after = await adminDev();
    check(`${wantReason}: 422 com mensagem em português`, r.status === 422 && r.json.error === 'playlist_invalid' && r.json.reason === wantReason && r.json.message.length > 10, JSON.stringify(r.json));
    check(`${wantReason}: lista do aparelho não mudou`, before.m3uUrl === after.m3uUrl);
  };
  await bad({ m3uUrl: P + '/page.html' }, 'html_page');
  await bad({ m3uUrl: P + '/empty.m3u' }, 'no_entries');
  await bad({ m3uUrl: P + '/text.txt' }, 'not_m3u');
  await bad({ m3uUrl: P + '/err500' }, 'http_error');
  await bad({ m3uUrl: P + '/nada' }, 'http_error');
  await bad({ m3uUrl: 'http://127.0.0.1:9/x.m3u' }, 'unreachable');
  await bad({ m3uUrl: '' }, 'invalid_url');
  await bad({ m3uUrl: 'file:///etc/passwd' }, 'invalid_url');
  await bad({ xtream: { host: P, user: 'joao', pass: 'errada' } }, 'auth_failed');
  await bad({ xtream: { host: P, user: '', pass: '' } }, 'invalid_url');
  check('aparelho segue pendente depois das falhas', (await devStatus()).status === 'pending');
}

section('Lista boa ativa');
let first;
{
  hits.list = 0;
  first = await act({ m3uUrl: '  ' + P + '/good.m3u\n' });
  check('200 ok + contagens', first.status === 200 && first.json.ok && first.json.counts.live === 6 && first.json.counts.movie === 1, JSON.stringify(first.json));
  check('status active na hora', first.json.status === 'active' && (await devStatus()).status === 'active');
  check('sem validade quando SELF_DAYS=0', first.json.expiresAt === null);
  check('sem aviso quando os streams respondem', first.json.warnings.length === 0, JSON.stringify(first.json.warnings));
  check('lista baixada só uma vez (já fica em cache)', hits.list === 1, String(hits.list));
  const before = hits.list;
  const h = await fetch(B + '/api/v1/home', { headers: { 'x-mac': MAC, 'x-key': KEY } });
  check('home abre direto com a lista ativada', h.status === 200 && hits.list === before);
  const d = await adminDev();
  check('admin vê nota "pelo próprio cliente"', /pelo próprio cliente/.test(d.notes), d.notes);
}

section('Variantes');
{
  const r = await act({ m3uUrl: P + '/other.m3u' });
  check('trocar lista (SELF_REPLACE=1) funciona', r.status === 200 && r.json.counts.live === 9);
  check('redirecionamento da lista é seguido', (await act({ m3uUrl: P + '/redir' })).status === 200);
  check('BOM no começo não atrapalha', (await act({ m3uUrl: P + '/bom.m3u' })).json.counts.live === 3);
  hits.auth = [];
  const x = await act({ xtream: { host: P, user: 'joao', pass: 's3nha' } });
  check('Xtream servidor/usuário/senha ativa', x.status === 200 && x.json.counts.live === 4 && hits.auth.includes('joao:s3nha'), JSON.stringify(x.json));
  const dry = await act({ m3uUrl: P + '/other.m3u', dryRun: true });
  check('dryRun confere mas não grava', dry.status === 200 && dry.json.dryRun === true && (await adminDev()).m3uUrl.includes('/get.php'));
  const slowFast = await act({ m3uUrl: P + '/good.m3u' });
  check('volta para a lista boa', slowFast.status === 200);
  streamsOk = false;
  const w = await act({ m3uUrl: P + '/other.m3u' });
  check('streams fora do ar = ativa mas AVISA', w.status === 200 && w.json.warnings.some((x) => x.code === 'streams_unreachable') && w.json.status === 'active', JSON.stringify(w.json));
  streamsOk = true;
}

section('Regras do fornecedor');
{
  await fetch(B + '/admin/api/devices/' + encodeURIComponent(MAC), { method: 'PATCH', headers: adm, body: JSON.stringify({ blocked: true }) });
  let r = await act({ m3uUrl: P + '/good.m3u' });
  check('bloqueado não ativa (403 device_blocked)', r.status === 403 && r.json.error === 'device_blocked');
  await fetch(B + '/admin/api/devices/' + encodeURIComponent(MAC), { method: 'PATCH', headers: adm, body: JSON.stringify({ blocked: false, expiresAt: Date.now() - 1000 }) });
  r = await act({ m3uUrl: P + '/good.m3u' });
  check('vencido NÃO é revivido pelo cliente', r.status === 200 && r.json.status === 'expired' && (await devStatus()).status === 'expired', JSON.stringify(r.json));
}
{
  // SELF_DAYS: validade automática só quando o admin não definiu uma
  const a2 = mk({ selfDays: 3 });
  const p2 = await a2.listen();
  const B2 = `http://127.0.0.1:${p2}`;
  await fetch(B2 + '/api/v1/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mac: MAC, key: KEY }) });
  const r = await (await fetch(B2 + '/api/v1/activate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mac: MAC, key: KEY, m3uUrl: P + '/good.m3u' }) })).json();
  const days = (r.expiresAt - Date.now()) / 86400000;
  check('SELF_DAYS=3 dá ~3 dias de validade', days > 2.9 && days < 3.1, String(days));
  await a2.close();

  const a3 = mk({ selfActivate: false });
  const p3 = await a3.listen();
  const r3 = await fetch(`http://127.0.0.1:${p3}/api/v1/activate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mac: MAC, key: KEY, m3uUrl: P + '/good.m3u' }) });
  check('SELF_ACTIVATE=0 desliga (403)', r3.status === 403 && (await r3.json()).error === 'self_activation_disabled');
  await a3.close();

  const a4 = mk({ selfReplace: false });
  const p4 = await a4.listen();
  const B4 = `http://127.0.0.1:${p4}`;
  const j4 = (b) => fetch(B4 + '/api/v1/activate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mac: MAC, key: KEY, ...b }) });
  await fetch(B4 + '/api/v1/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mac: MAC, key: KEY }) });
  const f1 = await j4({ m3uUrl: P + '/good.m3u' });
  const f2 = await j4({ m3uUrl: P + '/other.m3u' });
  check('SELF_REPLACE=0: primeira ativa, segunda recusada', f1.status === 200 && f2.status === 403 && (await f2.json()).error === 'already_activated');
  await a4.close();
}

section('Segurança');
{
  const a5 = mk({ allowPrivate: false });
  const p5 = await a5.listen();
  const B5 = `http://127.0.0.1:${p5}`;
  const j5 = (b) => fetch(B5 + '/api/v1/activate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mac: MAC, key: KEY, ...b }) });
  await fetch(B5 + '/api/v1/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mac: MAC, key: KEY }) });
  for (const t of [P + '/good.m3u', 'http://169.254.169.254/latest/meta-data/', 'http://[::1]/x.m3u', 'http://localhost:8080/x.m3u', 'http://10.0.0.5/x.m3u']) {
    const r = await j5({ m3uUrl: t });
    const j = await r.json();
    check('rede interna recusada: ' + t, r.status === 422 && ['blocked_address', 'unreachable'].includes(j.reason), JSON.stringify(j));
  }
  check('nada foi gravado', (await (await fetch(B5 + '/api/v1/status', { headers: { 'x-mac': MAC, 'x-key': KEY } })).json()).status === 'pending');
  await a5.close();
}
{
  // limite de tentativas por IP
  const a6 = mk({ activateMax: 15 });
  const p6 = await a6.listen();
  let last;
  for (let i = 0; i < 17; i++) last = await fetch(`http://127.0.0.1:${p6}/api/v1/activate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mac: '02:00:00:00:00:0' + (i % 9), key: 'ABCDEFGH', m3uUrl: 'x' }) });
  check('muitas tentativas → 429', last.status === 429);
  await a6.close();
}
{
  const slow = await Promise.race([act({ m3uUrl: P + '/slow' }).then(() => 'respondeu'), new Promise((r) => setTimeout(() => r('ainda esperando'), 1500))]);
  check('lista que não responde não trava o painel (outras rotas seguem)', slow === 'ainda esperando' && (await fetch(B + '/healthz')).status === 200);
}

section('Login só com usuário e senha (servidor fixo)');
{
  const acct = { ok: { auth: 1, status: 'Active', exp_date: String(Math.floor(Date.now() / 1000) + 20 * 86400), max_connections: '2', is_trial: '0' },
    exp: { auth: 1, status: 'Expired', exp_date: String(Math.floor(Date.now() / 1000) - 86400) },
    pastdate: { auth: 1, status: 'Active', exp_date: String(Math.floor(Date.now() / 1000) - 5) },
    dis: { auth: 1, status: 'Disabled', exp_date: null } };
  const users = { '159943616': { pass: '885381176', acct: 'ok' }, expirado: { pass: 'x1', acct: 'exp' }, vencido2: { pass: 'x2', acct: 'pastdate' }, banido: { pass: 'x3', acct: 'dis' }, semapi: { pass: 'x4', acct: 'ok', noApi: true }, soTs: { pass: 'x5', acct: 'ok', onlyTs: true } };
  const seen = [];
  const px = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const user = u.searchParams.get('username'), pass = u.searchParams.get('password');
    const rec = users[user];
    const origin = `http://127.0.0.1:${px.address().port}`;
    if (u.pathname === '/player_api.php') {
      seen.push('api:' + user);
      if (rec && rec.noApi) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'content-type': 'application/json' });
      if (!rec || rec.pass !== pass) return res.end('{"user_info":{"auth":0}}');
      return res.end(JSON.stringify({ user_info: acct[rec.acct] }));
    }
    if (u.pathname === '/get.php') {
      seen.push('get:' + user + ':' + u.searchParams.get('output'));
      if (!rec || rec.pass !== pass) { res.writeHead(200); return res.end(''); }
      if (rec.onlyTs && u.searchParams.get('output') === 'mpegts') { res.writeHead(404); return res.end(); }
      res.writeHead(200); return res.end(good(5).replaceAll('__P__', origin));
    }
    if (u.pathname.startsWith('/live/')) { res.writeHead(200, { 'content-type': 'video/mp2t' }); return res.end(Buffer.alloc(2048, 0x47)); }
    if (u.pathname.startsWith('/movie/')) { res.writeHead(200, { 'content-type': 'video/mp4' }); return res.end(Buffer.alloc(2048)); }
    res.writeHead(404); res.end();
  });
  await new Promise((r) => px.listen(0, '127.0.0.1', r));
  const X = `http://127.0.0.1:${px.address().port}`;

  const a7 = mk({ xtreamHost: '', xtreamOutput: 'mpegts' });
  const p7 = await a7.listen();
  const B7 = `http://127.0.0.1:${p7}`;
  const reg = (mac) => fetch(B7 + '/api/v1/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mac, key: KEY }) });
  const login = async (body, mac = MAC) => { const r = await fetch(B7 + '/api/v1/activate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mac, key: KEY, ...body }) }); return { status: r.status, json: await r.json() }; };
  const admin7 = { authorization: adm.authorization, 'content-type': 'application/json', 'x-admin-csrf': '1' };
  const saved = async (mac = MAC) => ((await (await fetch(B7 + '/admin/api/devices', { headers: admin7 })).json()).devices.find((d) => d.mac === mac) || {}).m3uUrl;
  await reg(MAC);

  let cfg = await (await fetch(B7 + '/api/v1/activate/config')).json();
  check('sem servidor fixo: modo "link"', cfg.loginMode === 'link');
  let r = await login({ login: { user: '159943616', pass: '885381176' } });
  check('login sem servidor configurado → no_default_server', r.status === 422 && r.json.reason === 'no_default_server', JSON.stringify(r.json));

  let pr = await fetch(B7 + '/admin/api/integrations', { method: 'PUT', headers: admin7, body: JSON.stringify({ xtreamHost: '  ' + X + '/get.php?x=1 ', xtreamOutput: 'mpegts' }) });
  check('admin salva o servidor (guarda só o endereço base)', pr.status === 200 && (await (await fetch(B7 + '/admin/api/integrations', { headers: admin7 })).json()).xtream.host === X);
  check('servidor inválido → 400', (await fetch(B7 + '/admin/api/integrations', { method: 'PUT', headers: admin7, body: JSON.stringify({ xtreamHost: 'ftp://x' }) })).status === 400);
  check('formato inválido → 400', (await fetch(B7 + '/admin/api/integrations', { method: 'PUT', headers: admin7, body: JSON.stringify({ xtreamOutput: 'rtmp' }) })).status === 400);
  cfg = await (await fetch(B7 + '/api/v1/activate/config')).json();
  check('com servidor fixo: modo "userpass"', cfg.loginMode === 'userpass');

  seen.length = 0;
  r = await login({ login: { user: '159943616', pass: '885381176' } });
  check('login correto ativa', r.status === 200 && r.json.ok && r.json.counts.live === 5 && r.json.status === 'active', JSON.stringify(r.json));
  check('conta consultada no servidor antes da lista', seen[0] === 'api:159943616' && seen[1] === 'get:159943616:mpegts', JSON.stringify(seen));
  check('mostra dados da conta (vence, telas)', r.json.account && r.json.account.maxConnections === 2 && r.json.account.expiresAt > Date.now(), JSON.stringify(r.json.account));
  check('link salvo no formato configurado (mpegts)', (await saved()) === `${X}/get.php?username=159943616&password=885381176&type=m3u_plus&output=mpegts`, await saved());

  const before = await saved();
  r = await login({ login: { user: '159943616', pass: 'errada' } });
  check('senha errada → mensagem clara', r.status === 422 && r.json.reason === 'auth_failed' && /incorretos/.test(r.json.message), JSON.stringify(r.json));
  check('senha errada não troca a lista', (await saved()) === before);
  r = await login({ login: { user: 'naoexiste', pass: 'x' } });
  check('usuário inexistente → auth_failed', r.json.reason === 'auth_failed');
  r = await login({ login: { user: 'expirado', pass: 'x1' } });
  check('conta vencida (status Expired) → account_expired', r.json.reason === 'account_expired', JSON.stringify(r.json));
  r = await login({ login: { user: 'vencido2', pass: 'x2' } });
  check('conta vencida (exp_date no passado) → account_expired', r.json.reason === 'account_expired' && r.json.expiresAt > 0, JSON.stringify(r.json));
  r = await login({ login: { user: 'banido', pass: 'x3' } });
  check('conta desativada → account_disabled', r.json.reason === 'account_disabled');
  check('nada disso gravou lista', (await saved()) === before);

  r = await login({ login: { user: 'semapi', pass: 'x4' } });
  check('servidor sem player_api: segue só com a lista', r.status === 200 && r.json.account === null && r.json.counts.live === 5, JSON.stringify(r.json));
  seen.length = 0;
  r = await login({ login: { user: 'soTs', pass: 'x5' } });
  check('formato mpegts recusado → tenta ts sozinho', r.status === 200 && seen.includes('get:soTs:mpegts') && seen.includes('get:soTs:ts') && /output=ts$/.test(await saved()), JSON.stringify(seen));

  r = await login({ login: { user: '159943616:885381176', pass: '' } });
  check('"usuario:senha" num campo só funciona', r.status === 200 && /username=159943616&password=885381176/.test(await saved()), JSON.stringify(r.json));
  r = await login({ login: { user: '159943616 885381176', pass: '' } });
  check('"usuario senha" separados por espaço funciona', r.status === 200);
  r = await login({ login: { user: `${X}/get.php?username=159943616&password=885381176&type=m3u_plus&output=mpegts`, pass: '' } });
  check('link inteiro colado no campo de usuário funciona', r.status === 200 && r.json.counts.live === 5, JSON.stringify(r.json));
  r = await login({ login: { user: '   ', pass: '' } });
  check('campos vazios → invalid_login', r.status === 422 && r.json.reason === 'invalid_login');
  r = await login({ login: { user: 'só-um-campo', pass: '' } });
  check('só o usuário → invalid_login', r.json.reason === 'invalid_login');
  r = await login({ m3uUrl: `${X}/get.php?username=159943616&password=errada&type=m3u_plus&output=ts` });
  check('link get.php colado também confere a conta (senha errada)', r.json.reason === 'auth_failed', JSON.stringify(r.json));
  r = await login({ login: { user: '1599 43616', pass: 'x y' } });
  check('espaços no meio viram campos (sem quebrar)', [200, 422].includes(r.status));

  // limite de senhas erradas por aparelho
  const MAC2 = '02:AA:BB:CC:DD:02';
  await reg(MAC2);
  let last;
  for (let i = 0; i < 12; i++) last = await login({ login: { user: '159943616', pass: 'chute' + i } }, MAC2);
  check('muitas senhas erradas no mesmo aparelho → 429', last.status === 429 && last.json.error === 'too_many_attempts', JSON.stringify(last.json));
  r = await login({ login: { user: '159943616', pass: '885381176' } }, MAC2);
  check('…e o bloqueio vale mesmo com a senha certa (por 1 h)', r.status === 429);
  r = await login({ login: { user: '159943616', pass: '885381176' } });
  check('outro aparelho não é afetado', r.status === 200);
  await a7.close();
  px.close();
}

section('Página /ativar');
{
  const r = await fetch(B + '/ativar');
  const html = await r.text();
  check('/ativar abre a página pública', r.status === 200 && html.includes('id="f"') && html.includes('js/ativar.js'));
  check('/ativar tem CSP', (r.headers.get('content-security-policy') || '').includes("script-src 'self'"));
  check('/js/ativar.js existe', (await fetch(B + '/js/ativar.js')).status === 200);
}

await app.close();
prov.close(); prov.closeAllConnections?.();
console.log(`\n${passed} verificações ok, ${failed} falharam`);
process.exit(failed ? 1 : 0);
