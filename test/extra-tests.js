// Lista extra (EXTRA_M3U_URL): filmes/séries/canais por fora do Xtream, somados ao catálogo.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server.js';

let ok = 0, bad = 0;
const check = (n, c, x = '') => { if (c) ok++; else { bad++; console.log('FALHOU:', n, x); } };

let extraOn = true;
const up = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'); const q = u.searchParams;
  const j = (o) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (u.pathname === '/extra.m3u') {
    if (!extraOn) { res.writeHead(500); return res.end(); }
    res.writeHead(200, { 'content-type': 'text/plain' });
    return res.end(`#EXTM3U
#EXTINF:-1 group-title="Meus Filmes" tvg-logo="http://x/p.jpg",Meu Filme Extra (2023)
http://127.0.0.1:${up.address().port}/files/filme.mp4
#EXTINF:-1 group-title="Minhas Séries",Minha Serie S01E01 Piloto
http://127.0.0.1:${up.address().port}/files/s1e1.mp4
#EXTINF:-1 group-title="Minhas Séries",Minha Serie S01E02 Segundo
http://127.0.0.1:${up.address().port}/files/s1e2.mp4
`);
  }
  if (u.pathname === '/player_api.php') {
    const a = q.get('action');
    if (!a) return j({ user_info: { auth: 1, status: 'Active', exp_date: String(Math.floor(Date.now() / 1000) + 86400 * 300) }, server_info: {} });
    if (a === 'get_live_categories') return j([{ category_id: '1', category_name: 'Abertos' }]);
    if (a === 'get_vod_categories') return j([{ category_id: '2', category_name: 'Lançamentos' }]);
    if (a === 'get_series_categories') return j([{ category_id: '3', category_name: 'Drama' }]);
    if (a === 'get_live_streams') return j([{ stream_id: 11, name: 'Canal Um', category_id: '1' }]);
    if (a === 'get_vod_streams') return j([{ stream_id: 21, name: 'Filme Xtream (2024)', category_id: '2', container_extension: 'mp4' }]);
    if (a === 'get_series') return j([{ series_id: 31, name: 'Serie Xtream', category_id: '3' }]);
    return j([]);
  }
  if (u.pathname.startsWith('/files/') || /^\/(live|movie|series)\//.test(u.pathname)) {
    res.writeHead(200, { 'content-type': 'video/mp4', 'accept-ranges': 'bytes' }); return res.end(Buffer.alloc(2048, 1));
  }
  res.writeHead(404); res.end();
});
await new Promise((r) => up.listen(0, '127.0.0.1', r));
const UP = `http://127.0.0.1:${up.address().port}`;
const mk = () => createApp({ port: 0, dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'iptv-extra-')), adminPassword: 'pw', allowPrivate: true, autoRegister: true, extraUrl: UP + '/extra.m3u', webSecret: 's' });

const app = mk();
const B = `http://127.0.0.1:${await app.listen()}`;
const H = { 'x-mac': '02:AA:BB:CC:DD:0A', 'x-key': 'KEYEXTRA1', 'content-type': 'application/json' };
const call = async (m, p, b) => { const r = await fetch(B + p, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined }); let j = null; try { j = await r.json(); } catch {} return { s: r.status, j }; };
await call('POST', '/api/v1/register', { mac: H['x-mac'], key: H['x-key'] });
await call('POST', '/api/v1/auth/login', { username: 'u', password: 'p', mac: H['x-mac'], key: H['x-key'], serverHost: UP });

let r = await call('GET', '/api/v1/browse?type=movie&offset=0&limit=60');
const titles = r.j.items.map((i) => i.title);
check('filmes do Xtream continuam', titles.includes('Filme Xtream'), titles);
check('filme extra aparece', titles.includes('Meu Filme Extra'), titles);
r = await call('GET', '/api/v1/browse?type=movie&offset=0&limit=1');
check('categoria do filme extra listada', JSON.stringify(r.j.groups).includes('Meus Filmes'), JSON.stringify(r.j).slice(0, 300));
r = await call('GET', '/api/v1/browse?type=movie&group=' + encodeURIComponent('Meus Filmes') + '&offset=0&limit=60');
check('abrir a categoria extra mostra o filme', r.s === 200 && r.j.items.length === 1, JSON.stringify(r.j));
const extraMovie = r.j.items[0];
r = await call('GET', '/api/v1/web/play?id=' + encodeURIComponent(extraMovie.id));
check('filme extra tem endereço de reprodução', r.s === 200 && r.j.src?.startsWith('/p/v?'), JSON.stringify(r.j));
const pr = await fetch(B + r.j.src, { headers: H });
check('filme extra toca (proxy 200)', pr.status === 200, pr.status);

r = await call('GET', '/api/v1/browse?type=series&offset=0&limit=60');
const s = r.j.items.find((i) => i.title === 'Minha Serie');
check('série extra aparece', !!s, JSON.stringify(r.j.items.map((i) => i.title)));
r = await call('GET', '/api/v1/series/' + s.id);
check('série extra tem episódios', r.s === 200 && r.j.seasons?.[0]?.episodes?.length === 2, JSON.stringify(r.j).slice(0, 200));
r = await call('GET', '/api/v1/search?q=extra');
check('busca encontra o extra', JSON.stringify(r.j).includes('Meu Filme Extra'), JSON.stringify(r.j).slice(0, 200));
await app.close();

extraOn = false; // lista extra fora do ar: o catálogo do Xtream segue funcionando
const app2 = mk();
const B2 = `http://127.0.0.1:${await app2.listen()}`;
const H2 = { ...H, 'x-mac': '02:AA:BB:CC:DD:0B', 'x-key': 'KEYEXTRA2' };
const c2 = async (m, p, b) => { const r = await fetch(B2 + p, { method: m, headers: H2, body: b ? JSON.stringify(b) : undefined }); let j = null; try { j = await r.json(); } catch {} return { s: r.status, j }; };
await c2('POST', '/api/v1/register', { mac: H2['x-mac'], key: H2['x-key'] });
await c2('POST', '/api/v1/auth/login', { username: 'u', password: 'p', mac: H2['x-mac'], key: H2['x-key'], serverHost: UP });
r = await c2('GET', '/api/v1/browse?type=movie&offset=0&limit=60');
check('com a lista extra fora do ar, o Xtream segue', r.s === 200 && r.j.items.some((i) => i.title === 'Filme Xtream'), JSON.stringify(r.j).slice(0, 160));
await app2.close();
up.close();
console.log(`extra: ${ok} ok, ${bad} falhas`);
process.exit(bad ? 1 : 0);
