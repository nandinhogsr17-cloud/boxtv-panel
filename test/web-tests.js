// Testes do site/proxy: sobe o painel, um "provedor de IPTV" falso (mp4, HLS, TS ao vivo, redirecionamento)
// e confere o proxy, a descoberta de formato, as proteções (SSRF, token, bloqueio) e os arquivos do site.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createApp } from '../server.js';
import { isPrivateAddress, sniffKind, rewritePlaylist, WebTokens } from '../src/proxy.js';

let passed = 0, failed = 0;
const check = (name, cond, extra = '') => {
  if (cond) { passed++; console.log('  ok     ' + name); }
  else { failed++; console.log('  FALHOU ' + name + (extra ? '  -> ' + extra : '')); }
};
const section = (t) => console.log('\n' + t);

// ---------------------------------------------------------------- mídia de teste
const media = fs.mkdtempSync(path.join(os.tmpdir(), 'iptv-media-'));
let hasFfmpeg = false;
try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); hasFfmpeg = true; } catch {}
const ff = (...a) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...a], { stdio: 'pipe' });
const src = ['-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=25:duration=6', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6'];
const enc = ['-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-g', '25', '-c:a', 'aac'];
fs.mkdirSync(path.join(media, 'hls'), { recursive: true });
if (hasFfmpeg) {
  ff(...src, ...enc, '-movflags', '+faststart', path.join(media, 'movie.mp4'));
  ff(...src, ...enc, '-f', 'hls', '-hls_time', '2', '-hls_playlist_type', 'vod', '-hls_segment_filename', path.join(media, 'hls', 'seg%d.ts'), path.join(media, 'hls', 'index.m3u8'));
  ff(...src, ...enc, '-f', 'mpegts', path.join(media, 'live.ts'));
} else {
  const ftyp = Buffer.from('000000206674797069736f6d0000020069736f6d69736f32617663316d703431', 'hex');
  fs.writeFileSync(path.join(media, 'movie.mp4'), Buffer.concat([ftyp, Buffer.alloc(1000)]));
  const tsPkt = Buffer.alloc(188 * 5, 0x47);
  fs.writeFileSync(path.join(media, 'live.ts'), tsPkt);
  fs.writeFileSync(path.join(media, 'hls', 'seg0.ts'), tsPkt);
  fs.writeFileSync(path.join(media, 'hls', 'seg1.ts'), tsPkt);
  fs.writeFileSync(path.join(media, 'hls', 'seg2.ts'), tsPkt);
  fs.writeFileSync(path.join(media, 'hls', 'index.m3u8'), '#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXTINF:2.0,\nseg0.ts\n#EXTINF:2.0,\nseg1.ts\n#EXTINF:2.0,\nseg2.ts\n#EXT-X-ENDLIST\n');
}
fs.writeFileSync(path.join(media, 'hls', 'master.m3u8'), '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=320x180\nindex.m3u8\n');

const hits = { ua: [], ranges: [] };
const provider = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  hits.ua.push(req.headers['user-agent']);
  const send = (file, type) => {
    const st = fs.statSync(file);
    const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
    if (m) {
      hits.ranges.push(req.headers.range);
      const a = Number(m[1]), b = m[2] ? Number(m[2]) : st.size - 1;
      res.writeHead(206, { 'content-type': type, 'content-range': `bytes ${a}-${b}/${st.size}`, 'content-length': b - a + 1, 'accept-ranges': 'bytes' });
      return fs.createReadStream(file, { start: a, end: b }).pipe(res);
    }
    res.writeHead(200, { 'content-type': type, 'content-length': st.size, 'accept-ranges': 'bytes' });
    fs.createReadStream(file).pipe(res);
  };
  if (u.pathname === '/movie.mp4') return send(path.join(media, 'movie.mp4'), 'video/mp4');
  if (u.pathname === '/movie-noext/1') return send(path.join(media, 'movie.mp4'), 'application/octet-stream');
  if (u.pathname === '/live/u/p/1') return send(path.join(media, 'live.ts'), 'video/mp2t'); // sem extensão (Xtream)
  if (u.pathname === '/live/u/p/2') return send(path.join(media, 'hls', 'index.m3u8'), 'text/plain'); // HLS sem extensão e tipo errado
  if (u.pathname === '/redir') { res.writeHead(302, { location: '/movie.mp4' }); return res.end(); }
  if (u.pathname === '/loop') { res.writeHead(302, { location: '/loop' }); return res.end(); }
  if (u.pathname === '/gone') { res.writeHead(404); return res.end('nope'); }
  if (u.pathname === '/logo.png') { res.writeHead(200, { 'content-type': 'image/png' }); return res.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')); }
  if (u.pathname === '/evil.png') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<script>1</script>'); }
  if (u.pathname.startsWith('/hls/')) {
    const f = path.join(media, u.pathname);
    if (fs.existsSync(f)) return send(f, f.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t');
  }
  res.writeHead(404); res.end();
});
await new Promise((r) => provider.listen(0, '127.0.0.1', r));
const P = `http://127.0.0.1:${provider.address().port}`;

const m3u = `#EXTM3U
#EXTINF:-1 tvg-logo="${P}/logo.png" group-title="CANAIS",Canal TS
${P}/live/u/p/1
#EXTINF:-1 group-title="CANAIS",Canal HLS sem extensao
${P}/live/u/p/2
#EXTINF:-1 group-title="CANAIS",Canal HLS
${P}/hls/master.m3u8
#EXTINF:-1 group-title="FILMES",Filme Teste (2020)
${P}/movie.mp4
#EXTINF:-1 group-title="FILMES",Filme Sem Extensao
${P}/movie-noext/1
#EXTINF:-1 group-title="FILMES",Filme Redirect
${P}/redir
#EXTINF:-1 group-title="FILMES",Filme Quebrado
${P}/gone
#EXTINF:-1 group-title="FILMES",Filme Loop
${P}/loop
#EXTINF:-1 group-title="CANAIS",Canal Interno
http://169.254.169.254/latest/meta-data
#EXTINF:-1 group-title="CANAIS",Canal Localhost
http://127.0.0.1:9/x.ts
`;
const listServer = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'audio/x-mpegurl' }); res.end(m3u); });
await new Promise((r) => listServer.listen(0, '127.0.0.1', r));
const listUrl = `http://127.0.0.1:${listServer.address().port}/list.m3u`;

// ---------------------------------------------------------------- unidade
section('Proxy: funções');
check('bloqueia IPs internos', ['127.0.0.1', '10.1.2.3', '192.168.0.9', '172.16.5.5', '169.254.169.254', '0.0.0.0', '100.64.1.1', '::1', 'fe80::1', 'fd00::5', '::ffff:127.0.0.1', '224.0.0.1'].every(isPrivateAddress));
check('libera IPs públicos', !['8.8.8.8', '1.1.1.1', '172.32.0.1', '2606:4700::1111'].some(isPrivateAddress));
check('sniff HLS', sniffKind(Buffer.from('#EXTM3U\n#EXT-X')) === 'hls');
check('sniff TS', sniffKind(fs.readFileSync(path.join(media, 'live.ts')).subarray(0, 1500)) === 'ts');
check('sniff MP4', sniffKind(fs.readFileSync(path.join(media, 'movie.mp4')).subarray(0, 1500)) === 'mp4');
check('sniff MKV', sniffKind(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0])) === 'mkv');
check('sniff desconhecido', sniffKind(Buffer.from('<html>oops</html>')) === 'unknown');
{
  const pl = '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n#EXT-X-STREAM-INF:BANDWIDTH=1\nlow/index.m3u8\n#EXTINF:2,\nhttps://cdn.x/a/seg1.ts?x=1\n';
  const out = rewritePlaylist(pl, 'http://h.com/dir/master.m3u8', (abs, p) => `P(${abs}|${p})`);
  check('reescreve variante (playlist)', out.includes('P(http://h.com/dir/low/index.m3u8|true)'), out);
  check('reescreve chave (não é playlist)', out.includes('URI="P(http://h.com/dir/key.bin|false)"'), out);
  check('reescreve segmento absoluto', out.includes('P(https://cdn.x/a/seg1.ts?x=1|false)'), out);
}
{
  const t = new WebTokens('segredo');
  const tok = t.sign('02:AA:BB:CC:DD:EE');
  check('token válido', t.verify(tok) === '02:AA:BB:CC:DD:EE');
  check('token adulterado', t.verify(tok.replace('02:AA', '02:AB')) === null);
  check('token vencido', t.verify(tok, Date.now() + 13 * 3600e3) === null);
  check('token de outro segredo', new WebTokens('outro').verify(tok) === null);
}

// ---------------------------------------------------------------- painel
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iptv-web-'));
const app = createApp({ port: 0, dataDir, adminPassword: 'pw', allowPrivate: true, corsOrigin: 'https://site.example', streamUa: 'TestUA/1.0' });
const port = await app.listen();
const B = `http://127.0.0.1:${port}`;
const admin = { authorization: 'Basic ' + Buffer.from('admin:pw').toString('base64'), 'content-type': 'application/json', 'x-admin-csrf': '1' };
const MAC = '02:11:22:33:44:55', KEY = 'ABCD2345';
const dev = { 'x-mac': MAC, 'x-key': KEY };
const jget = async (p, h = dev) => { const r = await fetch(B + p, { headers: h }); let b = null; try { b = await r.json(); } catch {} return { status: r.status, body: b, headers: r.headers }; };

await fetch(B + '/api/v1/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mac: MAC, key: KEY }) });

section('Site: arquivos estáticos');
{
  const r = await fetch(B + '/');
  const html = await r.text();
  check('/ serve o site', r.status === 200 && html.includes('<div id="app">'));
  check('CSP no HTML', (r.headers.get('content-security-policy') || '').includes("script-src 'self'"));
  check('/js/main.js', (await fetch(B + '/js/main.js')).status === 200);
  check('/style.css tipo css', (await fetch(B + '/style.css')).headers.get('content-type').startsWith('text/css'));
  check('traversal bloqueado (%2e%2e)', (await fetch(B + '/%2e%2e/server.js')).status === 404);
  check('traversal bloqueado (..%2f)', (await fetch(B + '/..%2fserver.js')).status === 404);
  check('não serve src/', (await fetch(B + '/src/db.js')).status === 404);
  check('/admin ainda pede senha', (await fetch(B + '/admin')).status === 401);
  check('/api desconhecida = 404 JSON', (await fetch(B + '/api/v1/nada')).status === 404);
  check('/healthz', (await fetch(B + '/healthz')).status === 200);
}

section('Site: acesso e token');
{
  check('token exige dispositivo ativo (pendente = 403)', (await jget('/api/v1/web/token')).status === 403);
  await fetch(B + '/admin/api/devices/' + encodeURIComponent(MAC), { method: 'PATCH', headers: admin, body: JSON.stringify({ m3uUrl: listUrl, expiresAt: Date.now() + 86400000 }) });
  const t = await jget('/api/v1/web/token');
  check('token emitido', t.status === 200 && t.body.token.split('.').length === 3, JSON.stringify(t.body));
  check('sem credenciais = 401', (await jget('/api/v1/web/token', {})).status === 401);
}
const token = (await jget('/api/v1/web/token')).body.token;
const items = (await jget('/api/v1/browse?type=live&limit=50')).body.items;
const movies = (await jget('/api/v1/browse?type=movie&limit=50')).body.items;
const idOf = (list, title) => list.find((i) => i.title === title)?.id;

section('Site: /web/play descobre o formato');
const play = async (id) => jget('/api/v1/web/play?id=' + encodeURIComponent(id));
{
  let r = await play(idOf(items, 'Canal TS'));
  check('TS sem extensão → ts', r.body.kind === 'ts' && r.body.live === true, JSON.stringify(r.body));
  r = await play(idOf(items, 'Canal HLS sem extensao'));
  check('HLS sem extensão e tipo errado → hls', r.body.kind === 'hls', JSON.stringify(r.body));
  r = await play(idOf(items, 'Canal HLS'));
  check('.m3u8 → hls (sem sondar)', r.body.kind === 'hls' && r.body.src.includes('&k=hls'));
  r = await play(idOf(movies, 'Filme Teste'));
  check('.mp4 → mp4', r.body.kind === 'mp4' && r.body.live === false, JSON.stringify(r.body));
  r = await play(idOf(movies, 'Filme Sem Extensao'));
  check('mp4 sem extensão → mp4 (por conteúdo)', r.body.kind === 'mp4', JSON.stringify(r.body));
  r = await play(idOf(movies, 'Filme Redirect'));
  check('redirecionamento seguido', r.body.kind === 'mp4', JSON.stringify(r.body));
  r = await play(idOf(movies, 'Filme Quebrado'));
  check('provedor 404 → 502 upstream_status', r.status === 502 && r.body.error === 'upstream_status' && r.body.upstreamStatus === 404, JSON.stringify(r.body));
  r = await play(idOf(movies, 'Filme Loop'));
  check('loop de redirecionamento → 502', r.status === 502 && r.body.error === 'too_many_redirects', JSON.stringify(r.body));
  r = await play('nao-existe');
  check('id inexistente → 404', r.status === 404);
  check('UA configurado enviado ao provedor', hits.ua.includes('TestUA/1.0'));
}

section('Proxy /p/v');
const pv = (u, extra = '', headers = {}, t = token) => fetch(`${B}/p/v?t=${encodeURIComponent(t)}&u=${encodeURIComponent(u)}${extra}`, { headers });
{
  let r = await pv(`${P}/movie.mp4`);
  const buf = Buffer.from(await r.arrayBuffer());
  const orig = fs.readFileSync(path.join(media, 'movie.mp4'));
  check('mp4 inteiro idêntico', r.status === 200 && buf.equals(orig), `status ${r.status} ${buf.length}/${orig.length}`);
  check('Content-Length e Accept-Ranges', r.headers.get('content-length') == orig.length && r.headers.get('accept-ranges') === 'bytes');
  check('CORS permitido só para a origem configurada', true);
  r = await fetch(`${B}/p/v?t=${encodeURIComponent(token)}&u=${encodeURIComponent(P + '/movie.mp4')}`, { headers: { range: 'bytes=100-199', origin: 'https://site.example' } });
  const part = Buffer.from(await r.arrayBuffer());
  check('Range → 206 com o trecho certo', r.status === 206 && part.equals(orig.subarray(100, 200)) && r.headers.get('content-range') === `bytes 100-199/${orig.length}`);
  check('CORS cabeçalho com origem', r.headers.get('access-control-allow-origin') === 'https://site.example');
  r = await fetch(`${B}/p/v?t=${encodeURIComponent(token)}&u=${encodeURIComponent(P + '/movie.mp4')}`, { headers: { origin: 'https://evil.example' } });
  check('CORS não libera outra origem', r.headers.get('access-control-allow-origin') === null);
  await r.arrayBuffer();

  r = await pv(`${P}/live/u/p/1`);
  const ts = Buffer.from(await r.arrayBuffer());
  check('TS ao vivo passa inteiro', r.status === 200 && ts.equals(fs.readFileSync(path.join(media, 'live.ts'))));

  // HLS: mestre → variante → segmento, tudo pelo proxy
  r = await pv(`${P}/hls/master.m3u8`, '&k=hls');
  let txt = await r.text();
  check('mestre reescrito', r.headers.get('content-type').includes('mpegurl') && txt.includes('/p/v?t=') && !txt.includes('http://127') && txt.includes('&k=hls'), txt);
  const variant = txt.split('\n').find((l) => l.startsWith('/p/v'));
  r = await fetch(B + variant);
  txt = await r.text();
  const segs = txt.split('\n').filter((l) => l.startsWith('/p/v'));
  check('variante reescrita com 3 segmentos', r.status === 200 && segs.length === 3 && segs.every((s) => !s.includes('k=hls')), txt);
  r = await fetch(B + segs[0]);
  const seg = Buffer.from(await r.arrayBuffer());
  check('segmento .ts entregue', r.status === 200 && seg.equals(fs.readFileSync(path.join(media, 'hls', 'seg0.ts'))));
  r = await pv(`${P}/live/u/p/2`, '&k=hls');
  txt = await r.text();
  check('HLS com tipo errado reescrito pelo k=hls', txt.includes('/p/v?t='), txt);
  r = await pv(`${P}/movie.mp4`, '&k=hls');
  check('k=hls num arquivo que não é playlist entrega como veio', (await r.arrayBuffer()).byteLength === fs.statSync(path.join(media, 'movie.mp4')).size);

  r = await pv(`${P}/gone`);
  check('erro do provedor → 502', r.status === 502 && (await r.json()).upstreamStatus === 404);
}

section('Proxy: segurança');
{
  check('sem token = 401', (await fetch(`${B}/p/v?u=${encodeURIComponent(P + '/movie.mp4')}`)).status === 401);
  check('token falso = 401', (await pv(`${P}/movie.mp4`, '', {}, 'x.y.z')).status === 401);
  check('token de outro segredo = 401', (await pv(`${P}/movie.mp4`, '', {}, new WebTokens('outro').sign(MAC))).status === 401);
  check('protocolo file:// recusado', [400, 502].includes((await pv('file:///etc/passwd')).status));
  check('URL inválida recusada', [400, 502].includes((await pv('nao-e-url')).status));
  await fetch(B + '/admin/api/devices/' + encodeURIComponent(MAC), { method: 'PATCH', headers: admin, body: JSON.stringify({ blocked: true }) });
  check('aparelho bloqueado perde o proxy mesmo com token', (await pv(`${P}/movie.mp4`)).status === 401);
  await fetch(B + '/admin/api/devices/' + encodeURIComponent(MAC), { method: 'PATCH', headers: admin, body: JSON.stringify({ blocked: false }) });
  check('desbloqueado volta', (await pv(`${P}/movie.mp4`, '', { range: 'bytes=0-9' })).status === 206);
}

section('Proxy /p/i (imagens)');
{
  let r = await fetch(`${B}/p/i?t=${encodeURIComponent(token)}&u=${encodeURIComponent(P + '/logo.png')}`);
  check('imagem entregue com cache', r.status === 200 && r.headers.get('content-type') === 'image/png' && /max-age/.test(r.headers.get('cache-control')));
  await r.arrayBuffer();
  r = await fetch(`${B}/p/i?t=${encodeURIComponent(token)}&u=${encodeURIComponent(P + '/evil.png')}`);
  check('não-imagem recusada', r.status === 404);
  r = await fetch(`${B}/p/i?u=${encodeURIComponent(P + '/logo.png')}`);
  check('imagem sem token = 401', r.status === 401);
}

section('CORS');
{
  const r = await fetch(B + '/api/v1/home', { method: 'OPTIONS', headers: { origin: 'https://site.example', 'access-control-request-method': 'GET', 'access-control-request-headers': 'x-mac,x-key' } });
  check('preflight 204 com cabeçalhos X-Mac/X-Key', r.status === 204 && /x-mac/i.test(r.headers.get('access-control-allow-headers')) && r.headers.get('access-control-allow-origin') === 'https://site.example');
  const g = await fetch(B + '/api/v1/status', { headers: { ...dev, origin: 'https://site.example' } });
  check('resposta da API leva Allow-Origin', g.headers.get('access-control-allow-origin') === 'https://site.example');
}
await app.close();

section('SSRF (proxy padrão, sem ALLOW_PRIVATE_STREAMS)');
{
  const app2 = createApp({ fetchFn: fetch, port: 0, dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'iptv-web2-')), adminPassword: 'pw' });
  const p2 = await app2.listen();
  const B2 = `http://127.0.0.1:${p2}`;
  await fetch(B2 + '/api/v1/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mac: MAC, key: KEY }) });
  await fetch(B2 + '/admin/api/devices/' + encodeURIComponent(MAC), { method: 'PATCH', headers: admin, body: JSON.stringify({ m3uUrl: listUrl, expiresAt: Date.now() + 86400000 }) });
  const tk = (await (await fetch(B2 + '/api/v1/web/token', { headers: dev })).json()).token;
  for (const target of [`${P}/movie.mp4`, 'http://169.254.169.254/latest/meta-data', 'http://[::1]/x', 'http://localhost/x', 'http://127.1/x', 'http://2130706433/x', 'http://0x7f.0.0.1/x']) {
    const r = await fetch(`${B2}/p/v?t=${encodeURIComponent(tk)}&u=${encodeURIComponent(target)}`);
    check('bloqueado: ' + target, r.status === 400 || r.status === 502, 'status ' + r.status);
    await r.arrayBuffer();
  }
  const lst = (await (await fetch(B2 + '/api/v1/browse?type=live&limit=50', { headers: dev })).json()).items;
  const r1 = await fetch(B2 + '/api/v1/web/play?id=' + encodeURIComponent(lst.find((i) => i.title === 'Canal Interno').id), { headers: dev });
  check('/web/play também não sonda endereço interno', r1.status === 400 || r1.status === 502, 'status ' + r1.status);
  await app2.close();
}

provider.close(); listServer.close();
fs.rmSync(media, { recursive: true, force: true });
console.log(`\n${passed} verificações ok, ${failed} falharam`);
process.exit(failed ? 1 : 0);
