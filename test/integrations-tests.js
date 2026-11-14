// Integrações: chaves salvas no admin, teste de chamada real (aqui com a API externa simulada) e efeito nos serviços.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server.js';

let passed = 0, failed = 0;
const check = (n, c, x = '') => { if (c) { passed++; console.log('  ok     ' + n); } else { failed++; console.log('  FALHOU ' + n + (x ? '  -> ' + x : '')); } };

const calls = [];
let footballStatus = 200, tmdbStatus = 200, netDown = false;
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const fakeFetch = async (url, opts = {}) => {
  calls.push({ url: String(url), headers: opts.headers || {} });
  if (netDown) throw new Error('net');
  const u = String(url);
  if (u.startsWith('https://api.football-data.org/')) {
    if (footballStatus !== 200) return new Response('{}', { status: footballStatus });
    return Response.json({ matches: [{ utcDate: today + 'T22:00:00Z', status: 'TIMED', competition: { name: 'Série A' }, homeTeam: { name: 'Flamengo', crest: 'https://c/f.png' }, awayTeam: { name: 'Palmeiras', crest: 'https://c/p.png' }, score: { fullTime: {} } }] });
  }
  if (u.startsWith('https://api.themoviedb.org/')) {
    if (tmdbStatus !== 200) return new Response('{}', { status: tmdbStatus });
    return Response.json({ results: [{ overview: 'Sinopse', poster_path: '/p.jpg', vote_average: 8.7, release_date: '1999-03-30' }] });
  }
  if (u.startsWith('http://lista.invalid/')) return new Response('#EXTM3U\n#EXTINF:-1 group-title="CANAIS",SporTV 1 HD\nhttp://x.invalid/1.ts\n', { status: 200 });
  return new Response('', { status: 404 });
};

const app = createApp({ port: 0, dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'iptv-int-')), adminPassword: 'pw', fetchFn: fakeFetch });
const port = await app.listen();
const B = `http://127.0.0.1:${port}`;
const H = { authorization: 'Basic ' + Buffer.from('admin:pw').toString('base64'), 'content-type': 'application/json', 'x-admin-csrf': '1' };
const j = async (method, p, body) => { const r = await fetch(B + p, { method, headers: H, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => null) }; };

console.log('\nIntegrações');
let r = await j('GET', '/admin/api/integrations');
check('começa sem nada configurado', r.status === 200 && !r.body.football.configured && !r.body.tmdb.configured);
check('exige login de admin', (await fetch(B + '/admin/api/integrations')).status === 401);
check('exige cabeçalho CSRF no PUT', (await fetch(B + '/admin/api/integrations', { method: 'PUT', headers: { authorization: H.authorization, 'content-type': 'application/json' }, body: '{}' })).status >= 400);
r = await j('POST', '/admin/api/integrations/test', { which: 'football' });
check('testar sem token avisa, sem chamar a API', r.body.ok === false && /token/i.test(r.body.message) && calls.length === 0);

r = await j('PUT', '/admin/api/integrations', { footballToken: ' ABC123SEGREDO456 ', competitions: 'bsa, cl', tmdbKey: 'tmdbkey1234567890' });
check('salva', r.status === 200);
r = await j('GET', '/admin/api/integrations');
check('token aparece mascarado (nunca inteiro)', r.body.football.configured && r.body.football.token.includes('••') && !JSON.stringify(r.body).includes('SEGREDO') && !JSON.stringify(r.body).includes('tmdbkey1234567890'));
check('campeonatos limpos e em maiúsculas', r.body.football.competitions === 'BSA,CL');
check('origem = painel', r.body.football.source === 'painel' && r.body.tmdb.source === 'painel');

r = await j('POST', '/admin/api/integrations/test', { which: 'football' });
const fc = calls.at(-1);
check('teste do football: ok com contagem de jogos', r.body.ok === true && r.body.matches === 1, JSON.stringify(r.body));
check('chamada real usa X-Auth-Token e filtro de campeonatos', fc.headers['X-Auth-Token'] === 'ABC123SEGREDO456' && fc.url.includes('competitions=BSA%2CCL') && fc.url.includes(`dateFrom=${today}`), JSON.stringify(fc));
footballStatus = 403;
r = await j('POST', '/admin/api/integrations/test', { which: 'football' });
check('403 → mensagem clara (token/plano)', r.body.ok === false && r.body.httpStatus === 403 && /plano|recusado/i.test(r.body.message));
footballStatus = 429;
r = await j('POST', '/admin/api/integrations/test', { which: 'football' });
check('429 → limite por minuto', r.body.ok === false && /minuto/i.test(r.body.message));
footballStatus = 200; netDown = true;
r = await j('POST', '/admin/api/integrations/test', { which: 'football' });
check('sem internet → mensagem, sem quebrar', r.status === 200 && r.body.ok === false && /internet|falar/i.test(r.body.message));
netDown = false;

r = await j('POST', '/admin/api/integrations/test', { which: 'tmdb' });
check('teste do TMDB ok (v3 por api_key)', r.body.ok === true && calls.at(-1).url.includes('api_key=tmdbkey1234567890'));
await j('PUT', '/admin/api/integrations', { tmdbKey: 'x'.repeat(60) });
await j('POST', '/admin/api/integrations/test', { which: 'tmdb' });
check('chave longa vai como Bearer (v4)', calls.at(-1).headers.authorization === 'Bearer ' + 'x'.repeat(60) && !calls.at(-1).url.includes('api_key'));
tmdbStatus = 401;
r = await j('POST', '/admin/api/integrations/test', { which: 'tmdb' });
check('TMDB 401 → chave recusada', r.body.ok === false && /recusada/i.test(r.body.message));
tmdbStatus = 200;
check('alvo inválido → 400', (await j('POST', '/admin/api/integrations/test', { which: 'xx' })).status === 400);

console.log('\nEfeito nos serviços');
await j('PUT', '/admin/api/integrations', { footballToken: 'TOKENNOVO12345' });
const MAC = '02:00:00:00:00:99', KEY = 'ZZZZ2222';
await fetch(B + '/api/v1/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mac: MAC, key: KEY }) });
await j('PATCH', '/admin/api/devices/' + encodeURIComponent(MAC), { m3uUrl: 'http://lista.invalid/l.m3u', expiresAt: Date.now() + 864e5 });
calls.length = 0;
const games = await (await fetch(B + '/api/v1/games', { headers: { 'x-mac': MAC, 'x-key': KEY } })).json();
const gcall = calls.find((c) => c.url.includes('football-data'));
check('jogos usam o token novo salvo no painel (sem reiniciar)', gcall && gcall.headers['X-Auth-Token'] === 'TOKENNOVO12345', JSON.stringify(calls));
check('jogo da API aparece com escudos', games.games.some((g) => g.home === 'Flamengo' && g.homeCrest === 'https://c/f.png'), JSON.stringify(games));
await j('PUT', '/admin/api/integrations', { footballToken: '' });
calls.length = 0;
await fetch(B + '/api/v1/games', { headers: { 'x-mac': MAC, 'x-key': KEY } });
check('apagar o token desliga a API de jogos', !calls.some((c) => c.url.includes('football-data')));
r = await j('GET', '/admin/api/integrations');
check('após apagar: não configurado', !r.body.football.configured);

await app.close();
console.log(`\n${passed} verificações ok, ${failed} falharam`);
process.exit(failed ? 1 : 0);
