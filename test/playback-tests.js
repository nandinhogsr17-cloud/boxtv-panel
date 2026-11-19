// Reprodução e sinopse: provedor Xtream falso, sem chave do TMDB.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server.js';

let passed = 0, failed = 0;
const check = (name, cond, extra = '') => {
  if (cond) { passed++; console.log('  ok     ' + name); } else { failed++; console.log('  FALHOU ' + name + (extra ? '  -> ' + extra : '')); }
};
const section = (t) => console.log('\n' + t);

const up = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'); const q = u.searchParams;
  const j = (o) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (u.pathname === '/player_api.php') {
    const a = q.get('action');
    if (!a) return j({ user_info: { auth: 1, status: 'Active', exp_date: String(Math.floor(Date.now() / 1000) + 86400 * 300), max_connections: '3', active_cons: '1' }, server_info: {} });
    if (a === 'get_live_categories') return j([{ category_id: '1', category_name: 'Abertos' }]);
    if (a === 'get_vod_categories') return j([{ category_id: '2', category_name: 'Lançamentos' }, { category_id: '9', category_name: 'ADULTOS +18' }]);
    if (a === 'get_series_categories') return j([{ category_id: '3', category_name: 'Drama' }]);
    if (a === 'get_live_streams') return j([{ stream_id: 11, name: 'Canal Um', category_id: '1', stream_icon: '' }]);
    if (a === 'get_vod_streams') return j(q.get('category_id') === '9' ? [{ stream_id: 99, name: 'Filme Adulto', category_id: '9', container_extension: 'mp4' }] : [{ stream_id: 21, name: 'Filme Teste (2024)', category_id: '2', container_extension: 'mp4', stream_icon: '' }]);
    if (a === 'get_series') return j([{ series_id: 31, name: 'Serie Teste', category_id: '3', cover: '' }]);
    if (a === 'get_series_info') return j({ info: { name: 'Serie Teste', plot: 'Sinopse da série.' }, episodes: { 1: [{ id: '301', episode_num: 1, title: 'Ep 1', container_extension: 'mp4', info: {} }] } });
    if (a === 'get_vod_info') return j({ info: { plot: 'Sinopse real do servidor.', genre: 'Drama, Suspense', rating: '7.1', releasedate: '2024-01-01', cast: 'Ator A' } });
    return j([]);
  }
  if (/^\/(live|movie|series)\//.test(u.pathname)) {
    if (u.pathname.includes('/blocked')) { res.writeHead(403); return res.end(); }
    res.writeHead(200, { 'content-type': 'video/mp4', 'accept-ranges': 'bytes' }); return res.end(Buffer.alloc(4096, 1));
  }
  res.writeHead(404); res.end();
});
await new Promise((r) => up.listen(0, '127.0.0.1', r));
const UP = `http://127.0.0.1:${up.address().port}`;
const app = createApp({ port: 0, dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'iptv-play-')), adminPassword: 'pw', allowPrivate: true, autoRegister: true });
const B = `http://127.0.0.1:${await app.listen()}`;
const H = { 'x-mac': '02:AA:BB:CC:DD:09', 'x-key': 'KEYE2E01', 'content-type': 'application/json' };
const call = async (m, p, b) => { const r = await fetch(B + p, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined }); let j = null; try { j = await r.json(); } catch {} return { s: r.status, j, r }; };

await call('POST', '/api/v1/register', { mac: H['x-mac'], key: H['x-key'] });
let r = await call('POST', '/api/v1/auth/login', { username: 'u', password: 'p', mac: H['x-mac'], key: H['x-key'], serverHost: UP });
check('login Xtream', r.s === 200 && r.j.ok, JSON.stringify(r.j));
check('login não devolve o link M3U com a senha', !('m3u_url' in r.j) && !JSON.stringify(r.j).includes('password=') && !JSON.stringify(r.j).includes('/u/p/'), JSON.stringify(r.j).slice(0, 160));
const movie = (await call('GET', '/api/v1/browse?type=movie&offset=0&limit=60')).j.items[0];
const live = (await call('GET', '/api/v1/browse?type=live&offset=0&limit=60')).j.items[0];
const serie = (await call('GET', '/api/v1/browse?type=series&offset=0&limit=60')).j.items[0];
const ep = (await call('GET', '/api/v1/series/' + serie.id)).j.seasons[0].episodes[0];

section('Sinopse sem chave do TMDB');
r = await call('GET', '/api/v1/meta?id=' + movie.id);
check('filme: sinopse vem do servidor Xtream', r.j.overview === 'Sinopse real do servidor.' && r.j.source === 'servidor', JSON.stringify(r.j));
check('filme: gêneros, nota e ano', r.j.genres === 'Drama · Suspense' && r.j.rating === 7.1 && r.j.year === 2024, JSON.stringify(r.j));
r = await call('GET', '/api/v1/meta?id=' + serie.id);
check('série: sinopse vem do servidor Xtream', r.j.overview === 'Sinopse da série.', JSON.stringify(r.j));
r = await call('GET', '/api/v1/meta?id=' + ep.id);
check('episódio usa a sinopse da série', r.j.overview === 'Sinopse da série.', JSON.stringify(r.j));

section('Reprodução (canal, filme, episódio)');
for (const [n, it] of [['canal', live], ['filme', movie], ['episódio', ep]]) {
  const p = await call('GET', '/api/v1/web/play?id=' + encodeURIComponent(it.id));
  check(n + ': /web/play devolve endereço', p.s === 200 && p.j.src.startsWith('/p/v?'), JSON.stringify(p.j));
  const pr = await fetch(B + p.j.src, { headers: { range: 'bytes=0-99' } });
  check(n + ': proxy entrega o vídeo', (pr.status === 200 || pr.status === 206) && (await pr.arrayBuffer()).byteLength > 0, 'status ' + pr.status);
}

section('Conteúdo adulto, histórico e conexões');
{
  const names = (j) => (j.groups || []).map((g) => g.name);
  r = await call('GET', '/api/v1/browse?type=movie&offset=0&limit=60');
  check('sem senha: categoria adulta aparece', names(r.j).includes('ADULTOS +18'), JSON.stringify(names(r.j)));
  r = await call('GET', '/api/v1/browse?type=movie&offset=0&limit=60&adult=hide');
  check('com senha: categoria adulta some da lista', !names(r.j).includes('ADULTOS +18') && names(r.j).includes('Lançamentos'), JSON.stringify(names(r.j)));
  r = await call('GET', '/api/v1/browse?type=movie&group=' + encodeURIComponent('ADULTOS +18') + '&offset=0&limit=60&adult=hide');
  check('com senha: abrir a categoria adulta direto vem vazio', r.j.total === 0 && r.j.items.length === 0, JSON.stringify(r.j).slice(0, 120));
  r = await call('GET', '/api/v1/browse?type=movie&offset=0&limit=60&adult=hide');
  check('com senha: "Todos" não traz filme adulto', !r.j.items.some((i) => /Adulto/.test(i.title)), JSON.stringify(r.j.items.map((i) => i.title)));
  r = await call('GET', '/api/v1/search?q=Filme&adult=hide');
  check('com senha: busca não traz filme adulto', !r.j.movie.some((i) => /Adulto/.test(i.title)), JSON.stringify(r.j.movie.map((i) => i.title)));
  r = await call('GET', '/api/v1/account');
  check('conexões do provedor', r.s === 200 && r.j.maxConnections === 3 && r.j.activeConnections === 1, JSON.stringify(r.j));
  await call('POST', '/api/v1/progress', { id: movie.id, positionMs: 60000, durationMs: 600000 });
  let home = (await call('GET', '/api/v1/home')).j;
  check('continuar assistindo tem o filme', home.rows.some((x) => x.kind === 'continue' && x.items.length), JSON.stringify(home.rows.map((x) => x.kind)));
  r = await call('DELETE', '/api/v1/history');
  home = (await call('GET', '/api/v1/home')).j;
  check('limpar histórico zera o continuar assistindo', r.s === 200 && !home.rows.some((x) => x.kind === 'continue'), JSON.stringify(home.rows.map((x) => x.kind)));
}

section('Diagnóstico de falha');
r = await call('GET', '/api/v1/web/diag?id=' + encodeURIComponent(movie.id));
check('diag: provedor respondendo', r.s === 200 && r.j.ok === true && r.j.status === 200, JSON.stringify(r.j));

section('Servidor reiniciou e perdeu o disco (Render grátis)');
{
  const secret = 'segredo-fixo-' + 'x'.repeat(24);
  const mk = () => createApp({ port: 0, dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'iptv-rec-')), adminPassword: 'pw', allowPrivate: true, autoRegister: true, webSecret: secret });
  const a1 = mk(); const B1 = `http://127.0.0.1:${await a1.listen()}`;
  const hdr = { 'x-mac': '02:AA:BB:CC:DD:77', 'x-key': 'KEYREC001', 'content-type': 'application/json' };
  const post = async (B, body) => { const r = await fetch(B + '/api/v1/auth/login', { method: 'POST', headers: hdr, body: JSON.stringify(body) }); return { s: r.status, j: await r.json().catch(() => null) }; };
  const first = await post(B1, { username: 'u', password: 'p', mac: hdr['x-mac'], key: hdr['x-key'], serverHost: UP });
  check('login devolve a chave de recuperação', first.s === 200 && /^r1\./.test(first.j.recovery || ''), JSON.stringify(first.j).slice(0, 120));
  check('a senha não aparece em texto na chave', !(first.j.recovery || '').includes('p') || !Buffer.from(first.j.recovery.split('.')[2] || '', 'base64url').toString().includes('"p"'));
  const a2 = mk(); const B2 = `http://127.0.0.1:${await a2.listen()}`; // "reinício": disco novo, mesmo segredo
  let st = await (await fetch(B2 + '/api/v1/home', { headers: hdr })).json();
  check('depois do reinício o aparelho está inativo', st.error === 'device_not_active', JSON.stringify(st));
  const rec = await post(B2, { recovery: first.j.recovery, mac: hdr['x-mac'], key: hdr['x-key'] });
  check('a chave reativa o aparelho sem senha', rec.s === 200 && rec.j.status === 'active', JSON.stringify(rec.j).slice(0, 120));
  const home = await fetch(B2 + '/api/v1/browse?type=movie&offset=0&limit=10', { headers: hdr });
  check('catálogo volta a abrir', home.status === 200, 'status ' + home.status);
  const bad = await post(B2, { recovery: first.j.recovery.slice(0, -3) + 'AAA', mac: hdr['x-mac'], key: hdr['x-key'] });
  check('chave adulterada é recusada', bad.s === 400 && bad.j.error === 'invalid_recovery', JSON.stringify(bad.j));
  const a3 = createApp({ port: 0, dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'iptv-rec-')), adminPassword: 'pw', allowPrivate: true, autoRegister: true, webSecret: 'outro-segredo-' + 'y'.repeat(24) });
  const B3 = `http://127.0.0.1:${await a3.listen()}`;
  const other = await post(B3, { recovery: first.j.recovery, mac: hdr['x-mac'], key: hdr['x-key'] });
  check('chave de outro servidor não funciona', other.s === 400, JSON.stringify(other.j));
}

console.log(`\n${passed} verificações ok, ${failed} falharam`);
process.exit(failed ? 1 : 0);
