// Testes de ponta a ponta do painel: sobe o servidor de verdade, um servidor de playlist falso
// e uma "API de futebol"/"TMDB" falsas, e exercita o fluxo completo do app e do admin.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server.js';
import { parseEpisode, cleanTitle, classify } from '../src/m3u.js';
import { localDate } from '../src/util.js';

const here = path.dirname(fileURLToPath(import.meta.url));
let passed = 0;
let failed = 0;
const check = (name, cond, extra = '') => {
  if (cond) {
    passed++;
    console.log('  ok     ' + name);
  } else {
    failed++;
    console.log('  FALHOU ' + name + (extra ? '  -> ' + extra : ''));
  }
};
const section = (t) => console.log('\n' + t);

// ---------------------------------------------------------------- unidade: parser
section('Parser M3U');
{
  const e1 = parseEpisode('Breaking Bad S01E02 - O Gato');
  check('episódio SxxExx', e1 && e1.series === 'Breaking Bad' && e1.season === 1 && e1.episode === 2 && e1.rest === 'O Gato', JSON.stringify(e1));
  const e2 = parseEpisode('The Office US 1x02 Diversidade');
  check('episódio 1x02', e2 && e2.series === 'The Office US' && e2.season === 1 && e2.episode === 2, JSON.stringify(e2));
  check('sem episódio', parseEpisode('Matrix (1999)') === null);
  const c1 = cleanTitle('Matrix (1999) [DUB] FHD');
  check('limpa título + ano', c1.title === 'Matrix' && c1.year === 1999, JSON.stringify(c1));
  const c2 = cleanTitle('Inception 2010 LEG');
  check('ano no fim', c2.title === 'Inception' && c2.year === 2010, JSON.stringify(c2));
  const c3 = cleanTitle('Blade Runner 2049 4K');
  check('não corta 2049 (não é ano)', c3.title === 'Blade Runner 2049' && c3.year === null, JSON.stringify(c3));
  const c4 = cleanTitle('FBI: Most Wanted');
  check('não corta "FBI:"', c4.title === 'FBI: Most Wanted', JSON.stringify(c4));
  check('classifica /movie/', classify({ name: 'x', group: '', url: 'http://h/movie/u/p/1.mp4' }) === 'movie');
  check('classifica 24h como ao vivo', classify({ name: 'Filmes 24h', group: 'FILMES 24H', url: 'http://h/1.m3u8' }) === 'live');
}

// ---------------------------------------------------------------- servidores falsos
const sample = fs.readFileSync(path.join(here, 'sample.m3u'));
const playlistServer = http.createServer((req, res) => {
  if (req.url === '/list.m3u') {
    res.writeHead(200, { 'content-type': 'audio/x-mpegurl' });
    res.end(sample);
  } else {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => playlistServer.listen(0, '127.0.0.1', r));
const playlistUrl = `http://127.0.0.1:${playlistServer.address().port}/list.m3u`;

const realFetch = fetch;
let tmdbCalls = 0;
const fakeFetch = async (url, opts) => {
  const u = String(url);
  if (u.startsWith('https://api.football-data.org/')) {
    if (opts?.headers?.['X-Auth-Token'] !== 'tok') return new Response('{}', { status: 403 });
    return new Response(
      JSON.stringify({
        matches: [
          {
            id: 77,
            utcDate: new Date().toISOString(),
            status: 'TIMED',
            competition: { name: 'Brasileirão Série A' },
            homeTeam: { shortName: 'Flamengo', name: 'CR Flamengo', crest: null },
            awayTeam: { shortName: 'Palmeiras', name: 'SE Palmeiras', crest: null },
            score: { fullTime: { home: null, away: null } },
          },
        ],
      }),
      { status: 200 }
    );
  }
  if (u.startsWith('https://api.themoviedb.org/')) {
    tmdbCalls++;
    return new Response(
      JSON.stringify({
        results: [{ overview: 'Um hacker descobre a verdade.', poster_path: '/p.jpg', backdrop_path: '/b.jpg', vote_average: 8.24, release_date: '1999-03-31' }],
      }),
      { status: 200 }
    );
  }
  return realFetch(url, opts);
};

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iptv-panel-test-'));
const app = createApp({
  port: 0,
  dataDir,
  adminPassword: 'segredo-teste',
  footballToken: 'tok',
  tmdbKey: 'tmdb-test-key',
  fetchFn: fakeFetch,
});
const port = await app.listen();
const base = `http://127.0.0.1:${port}`;

const MAC = 'AA:BB:CC:DD:EE:01';
const KEY = 'KEY12345';
const dev = { 'x-mac': MAC, 'x-key': KEY };
const adminHeaders = {
  authorization: 'Basic ' + Buffer.from('admin:segredo-teste').toString('base64'),
  'x-admin-csrf': '1',
};

async function call(method, p, { headers = {}, body } = {}) {
  const res = await realFetch(base + p, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* html */
  }
  return { status: res.status, json, text };
}
const D = (method, p, body) => call(method, p, { headers: dev, body });
const A = (method, p, body) => call(method, p, { headers: adminHeaders, body });

// ---------------------------------------------------------------- registro e ativação
section('Registro e ativação por MAC');
{
  const r = await call('GET', '/healthz');
  check('healthz', r.status === 200 && r.json.ok === true);

  const reg = await call('POST', '/api/v1/register', { body: { mac: 'aa-bb-cc-dd-ee-01', key: 'key12345', appVersion: '1.0.0', model: 'Test TV' } });
  check('registra MAC novo (aceita qualquer formato) => pending', reg.status === 200 && reg.json.status === 'pending', JSON.stringify(reg.json));

  const again = await call('POST', '/api/v1/register', { body: { mac: MAC, key: KEY } });
  check('registrar de novo com a mesma chave é ok', again.status === 200 && again.json.status === 'pending');

  const bad = await call('POST', '/api/v1/register', { body: { mac: MAC, key: 'OUTRACHAVE' } });
  check('outra chave no mesmo MAC => 403 key_mismatch', bad.status === 403 && bad.json.error === 'key_mismatch');

  const invalid = await call('POST', '/api/v1/register', { body: { mac: 'xyz', key: KEY } });
  check('MAC inválido => 400', invalid.status === 400);

  const st = await D('GET', '/api/v1/status');
  check('status pending antes da playlist', st.status === 200 && st.json.status === 'pending');

  const home0 = await D('GET', '/api/v1/home');
  check('home bloqueada enquanto pending (403 + status)', home0.status === 403 && home0.json.status === 'pending');

  const noauth = await call('GET', '/api/v1/home');
  check('sem credenciais => 401', noauth.status === 401);
}

// ---------------------------------------------------------------- admin
section('Admin');
{
  const r1 = await call('GET', '/admin/api/devices');
  check('admin sem login => 401', r1.status === 401);
  const r2 = await call('GET', '/admin/api/devices', { headers: { authorization: 'Basic ' + Buffer.from('admin:errada').toString('base64') } });
  check('admin senha errada => 401', r2.status === 401);
  const page = await call('GET', '/admin', { headers: adminHeaders });
  check('página do admin carrega', page.status === 200 && page.text.includes('Painel IPTV'));
  const csrf = await call('PATCH', `/admin/api/devices/${MAC}`, { headers: { authorization: adminHeaders.authorization }, body: { name: 'hack' } });
  check('ação sem cabeçalho anti-CSRF => 403', csrf.status === 403);

  const list = await A('GET', '/admin/api/devices');
  const row = list.json.devices.find((d) => d.mac === MAC);
  check('admin vê o dispositivo pendente', row && row.status === 'pending' && row.model === 'Test TV', JSON.stringify(row));

  const badUrl = await A('PATCH', `/admin/api/devices/${MAC}`, { m3uUrl: 'ftp://x' });
  check('rejeita URL que não é http(s)', badUrl.status === 400);

  const act = await A('PATCH', `/admin/api/devices/${MAC}`, { name: 'Cliente Teste', m3uUrl: playlistUrl, addDays: 30 });
  check('admin ativa: playlist + 30 dias => active', act.status === 200 && act.json.status === 'active', JSON.stringify(act.json));
  const days = (act.json.expiresAt - Date.now()) / 86400000;
  check('validade ~30 dias', days > 29.9 && days < 30.1, String(days));

  const st = await D('GET', '/api/v1/status');
  check('app vê status active', st.json.status === 'active');

  const prev = await A('GET', `/admin/api/devices/${MAC}/preview`);
  check('testar lista: 9 canais, 3 filmes, 2 séries', prev.json.live === 9 && prev.json.movie === 3 && prev.json.series === 2, JSON.stringify(prev.json));

  const dup = await A('POST', '/admin/api/devices', { mac: MAC });
  check('criar MAC repetido => 409', dup.status === 409);
  const created = await A('POST', '/admin/api/devices', { mac: '11:22:33:44:55:66', name: 'Teste 3h', days: 0.125, m3uUrl: playlistUrl });
  const hrs = (created.json.expiresAt - Date.now()) / 3600000;
  check('criar teste de 3 horas', created.status === 200 && hrs > 2.9 && hrs < 3.1, String(hrs));
  check('MAC criado pelo admin ainda sem chave (assumido pelo 1º app)', created.json.key === null);
  const claim = await call('POST', '/api/v1/register', { body: { mac: '112233445566', key: 'CLAIMKEY1' } });
  check('1º app assume o MAC pré-cadastrado e já nasce active', claim.status === 200 && claim.json.status === 'active', JSON.stringify(claim.json));
}

// ---------------------------------------------------------------- catálogo
section('Catálogo (home, browse, busca, séries)');
let matrixId;
let seriesId;
{
  const home = await D('GET', '/api/v1/home');
  check('home 200', home.status === 200);
  const titles = home.json.rows.map((r) => r.title);
  check('home tem linhas de filmes e séries', titles.includes('FILMES | ACAO') && titles.includes('SERIES | DRAMA'), titles.join(' / '));
  check('home tem destaque (hero)', !!home.json.hero && !!home.json.hero.logo);

  const live = await D('GET', '/api/v1/browse?type=live&limit=100');
  check('browse live: 9 canais, sem duplicata', live.json.total === 9);
  check('grupos ao vivo incluem "Sem grupo"', live.json.groups.some((g) => g.name === 'Sem grupo'));
  const sports = await D('GET', '/api/v1/browse?type=live&group=' + encodeURIComponent('CANAIS | ESPORTES'));
  check('filtra por grupo', sports.json.total === 4);
  const page2 = await D('GET', '/api/v1/browse?type=live&limit=4&offset=4');
  check('paginação', page2.json.items.length === 4 && !page2.json.groups);

  const movies = await D('GET', '/api/v1/browse?type=movie');
  const matrix = movies.json.items.find((m) => m.title === 'Matrix');
  matrixId = matrix?.id;
  check('filme com título limpo e ano', matrix && matrix.year === 1999 && matrix.url.endsWith('2001.mp4'), JSON.stringify(matrix));

  const series = await D('GET', '/api/v1/browse?type=series');
  check('séries agrupadas por nome (2)', series.json.total === 2);
  const bb = series.json.items.find((s) => s.title === 'Breaking Bad');
  seriesId = bb?.id;
  check('série mostra nº de episódios', bb && bb.episodeCount === 4);

  const det = await D('GET', `/api/v1/series/${seriesId}`);
  check('detalhe da série: 2 temporadas', det.json.seasons.length === 2 && det.json.seasons[0].episodes.length === 3 && det.json.seasons[1].episodes.length === 1);
  check('episódios ordenados', det.json.seasons[0].episodes.map((e) => e.episode).join() === '1,2,3');
  check('título de episódio sem nome vira "Episódio N"', det.json.seasons[0].episodes[2].title === 'Episódio 3');

  const s1 = await D('GET', '/api/v1/search?q=sportv');
  check('busca "sportv" acha 2 canais', s1.json.live.length === 2);
  const s2 = await D('GET', '/api/v1/search?q=breaking');
  check('busca "breaking" acha a série', s2.json.series.length === 1);
  const s3 = await D('GET', '/api/v1/search?q=a');
  check('busca curta devolve vazio', s3.json.live.length === 0);
  const s4 = await D('GET', '/api/v1/search?q=ACAO');
  check('busca ignora acento/maiúscula (nome de grupo não entra)', Array.isArray(s4.json.movie));
}

// ---------------------------------------------------------------- favoritos / progresso
section('Favoritos e continuar assistindo');
{
  const a1 = await D('POST', '/api/v1/favorites', { id: matrixId });
  const a2 = await D('POST', '/api/v1/favorites', { id: seriesId });
  check('favoritar filme e série', a1.status === 200 && a2.status === 200);
  const favs = await D('GET', '/api/v1/favorites');
  check('lista de favoritos (2, com flag)', favs.json.items.length === 2 && favs.json.items.every((i) => i.favorite));
  const home = await D('GET', '/api/v1/home');
  check('home mostra "Minha lista"', home.json.rows.some((r) => r.id === 'favorites'));
  const detEp = await D('GET', `/api/v1/series/${seriesId}`);
  const ep1 = detEp.json.seasons[0].episodes[0];
  const epFav = await D('POST', '/api/v1/favorites', { id: ep1.id });
  check('episódio não pode ser favoritado', epFav.status === 404);
  const del = await D('DELETE', `/api/v1/favorites/${matrixId}`);
  const favs2 = await D('GET', '/api/v1/favorites');
  check('remove favorito', del.status === 200 && favs2.json.items.length === 1);

  // continuar assistindo
  const p0 = await D('POST', '/api/v1/progress', { id: matrixId, positionMs: 600000, durationMs: 8160000 });
  check('salva progresso do filme', p0.status === 200);
  const live = await D('GET', '/api/v1/browse?type=live&limit=1');
  const pl = await D('POST', '/api/v1/progress', { id: live.json.items[0].id, positionMs: 5000, durationMs: 0 });
  check('canal ao vivo não guarda progresso', pl.json.ignored === true);
  const bad = await D('POST', '/api/v1/progress', { id: matrixId, positionMs: -5, durationMs: 10 });
  check('progresso inválido => 400', bad.status === 400);

  let cont = (await D('GET', '/api/v1/home')).json.rows.find((r) => r.id === 'continue');
  check('"Continuar assistindo" mostra o filme com posição', cont && cont.items[0].id === matrixId && cont.items[0].positionMs === 600000);

  // termina o ep 1 => sugere o ep 2
  await D('POST', '/api/v1/progress', { id: ep1.id, positionMs: 2900000, durationMs: 3000000 });
  cont = (await D('GET', '/api/v1/home')).json.rows.find((r) => r.id === 'continue');
  const next = cont.items.find((i) => i.type === 'episode');
  check('terminou o episódio 1 => sugere o episódio 2', next && next.episode === 2 && next.positionMs === 0 && next.title.includes('Breaking Bad'), JSON.stringify(next));

  // começa o ep 2 => continua de onde parou
  await D('POST', '/api/v1/progress', { id: next.id, positionMs: 1200000, durationMs: 3000000 });
  cont = (await D('GET', '/api/v1/home')).json.rows.find((r) => r.id === 'continue');
  const cur = cont.items.find((i) => i.type === 'episode');
  check('assistindo episódio 2 => continua de 20:00', cur && cur.episode === 2 && cur.positionMs === 1200000);
  check('só 1 item por série em "continuar"', cont.items.filter((i) => i.type === 'episode').length === 1);

  // filme quase no fim some
  await D('POST', '/api/v1/progress', { id: matrixId, positionMs: 8100000, durationMs: 8160000 });
  cont = (await D('GET', '/api/v1/home')).json.rows.find((r) => r.id === 'continue');
  check('filme terminado sai de "continuar"', !cont.items.some((i) => i.id === matrixId));

  const itemRes = await D('GET', `/api/v1/item/${matrixId}`);
  check('item devolve progresso salvo', itemRes.json.positionMs === 8100000);
}

// ---------------------------------------------------------------- jogos
section('Jogos de hoje');
{
  const today = localDate('America/Sao_Paulo');
  const add = await A('POST', '/admin/api/games', { date: today, time: '21:30', competition: 'Brasileirão', home: 'Vasco', away: 'Santos', channels: 'SporTV, Premiere' });
  check('admin cadastra jogo', add.status === 200 && add.json.id > 0);
  const badGame = await A('POST', '/admin/api/games', { date: 'hoje', time: '21:30', home: 'A', away: 'B' });
  check('jogo com data inválida => 400', badGame.status === 400);

  const g = await D('GET', '/api/v1/games');
  check('lista tem jogos (manual + API)', g.json.games.some((x) => x.home === 'Vasco') && g.json.games.some((x) => x.home === 'Flamengo'), JSON.stringify(g.json.games.map((x) => x.home)));
  const vasco = g.json.games.find((x) => x.home === 'Vasco');
  const names = vasco.channels.map((c) => c.title);
  check('jogo manual liga aos canais SporTV e Premiere da playlist', names.includes('SporTV 1 HD') && names.includes('SporTV 2 FHD') && names.includes('PREMIERE 1 FHD'), names.join(' | '));
  check('não inclui canal que não transmite', !names.includes('CNN Brasil'));
  const fla = g.json.games.find((x) => x.home === 'Flamengo');
  check('jogo da API liga ao canal de evento pelos nomes dos times', fla && fla.channels.some((c) => c.title.startsWith('Flamengo x Palmeiras')), JSON.stringify(fla?.channels?.map((c) => c.title)));
  check('jogos ordenados por horário', g.json.games[0].time <= g.json.games[1].time);
  const home = await D('GET', '/api/v1/home');
  check('home traz prévia dos jogos', home.json.games.length >= 2);
}

// ---------------------------------------------------------------- metadados
section('Metadados (TMDB) e atualização');
{
  const m1 = await D('GET', `/api/v1/meta?id=${matrixId}`);
  check('meta traz sinopse/capa/nota', m1.json.overview && m1.json.poster.endsWith('/p.jpg') && m1.json.rating === 8.2 && m1.json.year === 1999, JSON.stringify(m1.json));
  await D('GET', `/api/v1/meta?id=${matrixId}`);
  check('segunda consulta vem do cache (1 chamada ao TMDB)', tmdbCalls === 1, String(tmdbCalls));
  const ref = await D('POST', '/api/v1/refresh');
  const ref2 = await D('POST', '/api/v1/refresh');
  check('refresh funciona e tem limite de 1/min', ref.status === 200 && ref2.status === 429);
}

// ---------------------------------------------------------------- bloqueio e validade
section('Bloqueio, validade e falhas');
{
  await A('PATCH', `/admin/api/devices/${MAC}`, { blocked: true });
  const b = await D('GET', '/api/v1/home');
  check('bloqueado => 403 blocked', b.status === 403 && b.json.status === 'blocked');
  await A('PATCH', `/admin/api/devices/${MAC}`, { blocked: false, expiresAt: Date.now() - 1000 });
  const e = await D('GET', '/api/v1/home');
  check('vencido => 403 expired', e.status === 403 && e.json.status === 'expired');
  const st = await D('GET', '/api/v1/status');
  check('status ainda responde quando vencido (app mostra a tela de renovação)', st.status === 200 && st.json.status === 'expired');
  const renew = await A('PATCH', `/admin/api/devices/${MAC}`, { addDays: 30 });
  const days = (renew.json.expiresAt - Date.now()) / 86400000;
  check('renovar +30d a partir de hoje quando já venceu', renew.json.status === 'active' && days > 29.9 && days < 30.1, String(days));
  const ok = await D('GET', '/api/v1/home');
  check('volta a funcionar após renovar', ok.status === 200);

  // provedor fora do ar: serve a última cópia
  await new Promise((r) => playlistServer.close(r));
  playlistServer.closeAllConnections?.();
  const stale = await A('GET', `/admin/api/devices/${MAC}/preview?force=1`);
  check('playlist fora do ar: usa a última cópia conhecida', stale.status === 200 && stale.json.live === 9, JSON.stringify(stale.json));
  const fresh = await A('POST', '/admin/api/devices', { mac: '99:99:99:99:99:99', key: 'ZZZZZZ99', m3uUrl: 'http://127.0.0.1:1/nope.m3u', days: 1 });
  const dead = await call('GET', '/api/v1/home', { headers: { 'x-mac': fresh.json.mac, 'x-key': 'ZZZZZZ99' } });
  check('playlist inacessível e sem cópia => 502 playlist_unavailable', dead.status === 502 && dead.json.error === 'playlist_unavailable', JSON.stringify(dead.json));

  const reset = await A('PATCH', `/admin/api/devices/${MAC}`, { resetKey: true });
  check('resetar chave libera o MAC para o próximo app', reset.json.key === null);
  const old = await D('GET', '/api/v1/status');
  check('chave antiga deixa de valer', old.status === 401);
  const reclaim = await call('POST', '/api/v1/register', { body: { mac: MAC, key: 'NOVACHAVE9' } });
  check('novo app assume o MAC', reclaim.status === 200 && reclaim.json.status === 'active');

  const delRes = await A('DELETE', `/admin/api/devices/${MAC}`);
  const gone = await A('GET', '/admin/api/devices?q=aa:bb');
  check('excluir dispositivo', delRes.status === 200 && gone.json.devices.length === 0);
}

section('Proteção contra tentativas');
{
  let last = 0;
  for (let i = 0; i < 40; i++) {
    const r = await call('GET', '/api/v1/home', { headers: { 'x-mac': 'DE:AD:BE:EF:00:01', 'x-key': 'CHUTE' + i + '00' } });
    last = r.status;
  }
  check('muitas credenciais erradas => 429', last === 429, String(last));
}

await app.close();
fs.rmSync(dataDir, { recursive: true, force: true });
console.log(`\n${passed} ok, ${failed} falhas`);
process.exit(failed ? 1 : 0);
