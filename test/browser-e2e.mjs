// Teste de navegador (Playwright + ffmpeg): node --disable-warning=ExperimentalWarning test/browser-e2e.mjs ./capturas
// Precisa de playwright instalado e ffmpeg no PATH. Sem hls.js/mpegts.js locais, o canal .ts mostra a mensagem de erro (esperado).
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { createApp } = await import('../server.js');
const SHOTS = process.argv[2];
fs.mkdirSync(SHOTS, { recursive: true });

let ok = 0, bad = 0;
const check = (n, c, x = '') => { c ? ok++ : bad++; console.log((c ? '  ok     ' : '  FALHOU ') + n + (c ? '' : '  -> ' + x)); };

// mídia
const media = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-'));
execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=25:duration=30', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=30', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-g', '25', '-c:a', 'aac', '-movflags', '+faststart', path.join(media, 'v.mp4')]);
execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=25:duration=4', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-f', 'mpegts', path.join(media, 'live.ts')]);
const png = (c) => execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `color=c=${c}:s=300x450`, '-frames:v', '1', path.join(media, c + '.png')]);
['0x3b82f6', '0xe11d48', '0x10b981', '0xf59e0b'].forEach(png);
const prov = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.endsWith('.png')) { res.writeHead(200, { 'content-type': 'image/png' }); return fs.createReadStream(path.join(media, path.basename(u.pathname))).pipe(res); }
  if (u.pathname.startsWith('/live/')) { res.writeHead(200, { 'content-type': 'video/mp2t' }); return fs.createReadStream(path.join(media, 'live.ts')).pipe(res); }
  if (u.pathname.startsWith('/v/')) {
    const f = path.join(media, 'v.mp4'), st = fs.statSync(f);
    const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
    if (m) { const a = +m[1], b = m[2] ? +m[2] : st.size - 1; res.writeHead(206, { 'content-type': 'video/mp4', 'content-range': `bytes ${a}-${b}/${st.size}`, 'content-length': b - a + 1, 'accept-ranges': 'bytes' }); return fs.createReadStream(f, { start: a, end: b }).pipe(res); }
    res.writeHead(200, { 'content-type': 'video/mp4', 'content-length': st.size, 'accept-ranges': 'bytes' }); return fs.createReadStream(f).pipe(res);
  }
  res.writeHead(404); res.end();
});
await new Promise((r) => prov.listen(0, '127.0.0.1', r));
const P = `http://127.0.0.1:${prov.address().port}`;
const cols = ['0x3b82f6', '0xe11d48', '0x10b981', '0xf59e0b'];
let m3u = '#EXTM3U\n';
const movieNames = ['Matrix (1999)', 'Interestelar (2014)', 'Gladiador (2000)', 'Duna (2021)', 'Parasita (2019)', 'Coringa (2019)'];
movieNames.forEach((n, i) => { m3u += `#EXTINF:-1 tvg-logo="${P}/${cols[i % 4]}.png" group-title="FILMES | AÇÃO",${n}\n${P}/v/movie${i}.mp4\n`; });
for (const s of [1, 2]) for (const e of [1, 2, 3]) m3u += `#EXTINF:-1 tvg-logo="${P}/${cols[1]}.png" group-title="SÉRIES | DRAMA",Breaking Bad S0${s}E0${e} - Ep ${e}\n${P}/v/bb${s}${e}.mp4\n`;
['Globo SP FHD', 'SporTV 1 HD', 'ESPN Brasil HD', 'Premiere 1'].forEach((n, i) => { m3u += `#EXTINF:-1 tvg-logo="${P}/${cols[i]}.png" group-title="CANAIS | ESPORTES",${n}\n${P}/live/u/p/${i}\n`; });
const lst = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'audio/x-mpegurl' }); r.end(m3u); });
await new Promise((r) => lst.listen(0, '127.0.0.1', r));
const listUrl = `http://127.0.0.1:${lst.address().port}/l.m3u`;

const app = createApp({ port: 0, dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-d-')), adminPassword: 'pw', allowPrivate: true });
const port = await app.listen();
const B = `http://127.0.0.1:${port}`;
const adm = { authorization: 'Basic ' + Buffer.from('admin:pw').toString('base64'), 'content-type': 'application/json', 'x-admin-csrf': '1' };

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|\/vendor\//.test(m.text())) errors.push('console: ' + m.text()); });
const shot = (n) => page.screenshot({ path: path.join(SHOTS, n + '.png') });

console.log('\nAtivação');
await page.goto(B + '/');
await page.waitForSelector('.act .big .val');
const mac = await page.locator('.act .big .val').first().innerText();
const key = await page.locator('.act .big .val').nth(1).innerText();
check('mostra MAC local (bit local, unicast)', /^[0-9A-F]{2}(:[0-9A-F]{2}){5}$/.test(mac) && (parseInt(mac.slice(0, 2), 16) & 3) === 2, mac);
check('mostra chave de 8 caracteres', /^[A-HJ-NP-Z2-9]{8}$/.test(key), key);
check('guardou no localStorage', await page.evaluate(() => localStorage.getItem('iptv.mac')) === mac);
await shot('01-ativacao');
let rr = await (await fetch(B + '/admin/api/devices', { headers: adm })).json();
check('painel já listou o aparelho como pendente', rr.devices.some((d) => d.mac === mac && d.status === 'pending'));
await page.reload();
await page.waitForSelector('.act .big .val');
check('MAC igual depois de recarregar', (await page.locator('.act .big .val').first().innerText()) === mac);

console.log('\nAtivar pelo painel e liberar sozinho');
const t0 = Date.now();
await fetch(B + '/admin/api/devices/' + encodeURIComponent(mac), { method: 'PATCH', headers: adm, body: JSON.stringify({ m3uUrl: listUrl, expiresAt: Date.now() + 30 * 864e5, name: 'Teste' }) });
await page.waitForSelector('.top .pill', { timeout: 12000 });
check('liberou sozinho em poucos segundos', Date.now() - t0 < 11000, String(Date.now() - t0));
await page.waitForSelector('.row .card');
await page.waitForTimeout(600);
check('tem hero', await page.locator('.hero h1').count() === 1);
check('tem fileiras de filmes e séries', (await page.locator('.row h2').allInnerTexts()).some((t) => /AÇÃO/.test(t)) && (await page.locator('.row h2').allInnerTexts()).some((t) => /DRAMA/.test(t)));
const loaded = await page.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth > 0).length);
check('capas http carregam pelo proxy', loaded >= 3, String(loaded));
await shot('02-home');

console.log('\nNavegação por teclado (setas)');
await page.locator('.pill[data-tab=home]').focus();
await page.keyboard.press('ArrowDown');
const onCard = await page.evaluate(() => document.activeElement && document.activeElement.className);
check('↓ sai do menu e vai para o conteúdo', /btn|card/.test(onCard || ''), onCard);
await page.keyboard.press('ArrowRight');
await page.keyboard.press('ArrowUp');
await page.keyboard.press('ArrowUp');
const back = await page.evaluate(() => document.activeElement.className);
check('↑ volta ao menu', /pill/.test(back), back);

console.log('\nFilmes + detalhe + player');
await page.click('.pill[data-tab=movies]');
await page.waitForSelector('.grid .card');
check('grade de filmes com 6 itens e filtros', (await page.locator('.grid .card').count()) === 6 && (await page.locator('.chip').count()) >= 2);
await shot('03-filmes');
await page.locator('.grid .card', { hasText: 'Matrix' }).click();
await page.waitForSelector('.detail h1');
check('detalhe do filme', (await page.locator('.detail h1').innerText()) === 'Matrix');
await shot('04-detalhe');
await page.getByRole('button', { name: /Assistir/ }).first().click();
await page.waitForSelector('#player video');
await page.waitForFunction(() => { const v = document.querySelector('#player video'); return v && v.currentTime > 1.2; }, null, { timeout: 15000 });
check('vídeo tocando (mp4 pelo proxy, via Range)', true);
await page.waitForTimeout(800);
await shot('05-player');
const before = await page.evaluate(() => document.querySelector('#player video').currentTime);
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(400);
const after = await page.evaluate(() => document.querySelector('#player video').currentTime);
check('→ avança ~10 s', after - before > 7, `${before} -> ${after}`);
await page.keyboard.press('Space');
check('espaço pausa', await page.evaluate(() => document.querySelector('#player video').paused));
await page.keyboard.press('Space');
await page.waitForTimeout(600);
check('espaço continua', !(await page.evaluate(() => document.querySelector('#player video').paused)));
await page.keyboard.press('Escape');
await page.waitForSelector('#player', { state: 'detached' });
check('Esc fecha o player', true);
const mid = (await (await fetch(B + '/api/v1/browse?type=movie&limit=50', { headers: { 'x-mac': mac, 'x-key': key } })).json()).items.find((i) => i.title === 'Matrix').id;
const prog = await (await fetch(B + '/api/v1/item/' + encodeURIComponent(mid), { headers: { 'x-mac': mac, 'x-key': key } })).json();
check('progresso salvo ao sair', prog.positionMs > 8000 && prog.durationMs > 25000, JSON.stringify([prog.positionMs, prog.durationMs]));
await page.waitForTimeout(500);

console.log('\nContinuar assistindo');
await page.click('.pill[data-tab=home]');
await page.waitForSelector('.row h2');
await page.waitForTimeout(500);
const heads = await page.locator('.row h2').allInnerTexts();
check('fileira "Continuar assistindo" aparece primeiro', /Continuar/.test(heads[0] || ''), heads.join('|'));
check('hero vira o filme em andamento', (await page.locator('.hero h1').innerText()) === 'Matrix' && /Continuar/.test(await page.locator('.hero .btn.primary').innerText()));
await shot('06-continuar');
await page.locator('.hero .btn.primary').click();
await page.waitForFunction(() => { const v = document.querySelector('#player video'); return v && v.currentTime > 8; }, null, { timeout: 15000 });
check('retoma de onde parou', true);
await page.keyboard.press('Escape');
await page.waitForSelector('#player', { state: 'detached' });

console.log('\nSérie');
await page.click('.pill[data-tab=series]');
await page.waitForSelector('.grid .card');
await page.locator('.grid .card', { hasText: 'Breaking Bad' }).click();
await page.waitForSelector('.eps .ep');
check('2 temporadas, 3 episódios na primeira', (await page.locator('.eps .chip').count()) === 2 && (await page.locator('.eps .ep').count()) === 3);
await shot('07-serie');
await page.locator('.eps .ep').nth(1).click();
await page.waitForFunction(() => { const v = document.querySelector('#player video'); return v && v.currentTime > 1; }, null, { timeout: 15000 });
check('episódio toca', (await page.locator('#player .tt span').innerText()).includes('T1E2'));
await page.keyboard.press('Escape');
await page.waitForSelector('#player', { state: 'detached' });

console.log('\nFavoritos / busca / jogos / canais');
await page.goBack();
await page.click('.pill[data-tab=movies]');
await page.waitForSelector('.grid .card');
await page.locator('.grid .card', { hasText: 'Duna' }).click({ button: 'right' });
await page.waitForTimeout(400);
await page.click('.pill[data-tab=favs]');
await page.waitForSelector('.row .card');
check('favorito (clique direito) aparece em Favoritos', (await page.locator('.row .card', { hasText: 'Duna' }).count()) === 1);
await page.click('.pill[data-tab=search]');
await page.fill('.search input', 'inter');
await page.waitForSelector('.row .card');
check('busca acha Interestelar', (await page.locator('.row .card', { hasText: 'Interestelar' }).count()) === 1);
await shot('08-busca');

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
await fetch(B + '/admin/api/games', { method: 'POST', headers: adm, body: JSON.stringify({ date: today, time: '16:00', competition: 'Brasileirão', home: 'Flamengo', away: 'Palmeiras', channels: 'SporTV, Premiere' }) });
await page.click('.pill[data-tab=games]');
await page.waitForSelector('.game');
check('jogo manual com canais ligados', (await page.locator('.game .chs button').count()) >= 2);
await shot('09-jogos');
await page.locator('.game .chs button').first().click();
await page.waitForSelector('#player video');
await page.waitForSelector('#player .err', { timeout: 15000 });
const liveErr = await page.locator('#player .err').first().innerText();
check('canal TS sem mpegts.js (rede bloqueada aqui) mostra erro claro, sem travar', /player de vídeo|mpegts/i.test(liveErr), liveErr);
await shot('10-canal-erro');
await page.keyboard.press('Escape');
await page.waitForSelector('#player', { state: 'detached' });
await page.click('.pill[data-tab=live]');
await page.waitForSelector('.grid.live .card');
check('lista de canais', (await page.locator('.grid.live .card').count()) === 4);
await page.click('.pill[data-tab=account]');
await page.waitForSelector('.kv');
check('conta mostra MAC e validade', (await page.locator('.kv').innerText()).includes(mac));
await shot('11-conta');

console.log('\nCelular');
const mctx = await browser.newContext({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const mp = await mctx.newPage();
await mp.goto(B + '/');
await mp.waitForSelector('.act, .top', { timeout: 8000 });
await mp.screenshot({ path: path.join(SHOTS, '12-celular-ativacao.png') });
const noScroll = await mp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
check('sem rolagem horizontal no celular (ativação)', noScroll);
await fetch(B + '/admin/api/devices/' + encodeURIComponent(await mp.evaluate(() => localStorage.getItem('iptv.mac'))), { method: 'PATCH', headers: adm, body: JSON.stringify({ m3uUrl: listUrl, expiresAt: Date.now() + 864e5 }) });
await mp.waitForSelector('.top .pill', { timeout: 12000 });
await mp.waitForSelector('.row .card');
await mp.waitForTimeout(700);
await mp.screenshot({ path: path.join(SHOTS, '13-celular-home.png') });
check('sem rolagem horizontal no celular (home)', await mp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));

console.log('\nBloqueio em tempo real');
check('sem erros de JavaScript na página', errors.length === 0, errors.join(' || '));

await browser.close(); await app.close(); prov.close(); lst.close();
fs.rmSync(media, { recursive: true, force: true });
console.log(`\n${ok} ok, ${bad} falharam`);
process.exit(bad ? 1 : 0);
