import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server.js';

let ok = 0, bad = 0;
const check = (n, c) => { if (c) { ok++; } else { bad++; console.log('FALHOU:', n); } };

// "provedor" novo que responde
const prov = http.createServer((q, r) => r.end('{}'));
await new Promise((r) => prov.listen(0, '127.0.0.1', r));
const newHost = `http://127.0.0.1:${prov.address().port}`;

const app = createApp({ port: 0, dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'sw-')), adminPassword: 'x', webSecret: 'seg', xtreamHost: 'http://velho.exemplo:80' });
const port = await app.listen();
const base = `http://127.0.0.1:${port}`;
const call = async (method, p, body) => {
  const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
};

app.store.createDevice({ mac: 'AA:BB:CC:00:11:22', key: 'KEY12345', m3uUrl: 'http://velho.exemplo:80/get.php?username=u&password=p&type=m3u_plus&output=ts' });
app.store.createDevice({ mac: 'AA:BB:CC:00:11:33', key: 'KEY12346', m3uUrl: 'http://outro.exemplo:80/get.php?username=a&password=b&type=m3u_plus&output=ts' });

let g = await call('GET', '/api/v1/server');
check('GET mostra o servidor atual', g.status === 200 && g.json.host === 'http://velho.exemplo:80' && g.json.rev === 0);

let r = await call('POST', '/api/v1/server', { password: 'errada', host: newHost });
check('senha errada é recusada', r.status === 401);
r = await call('POST', '/api/v1/server', { password: 'box54321', host: 'isso não é endereço' });
check('endereço inválido é recusado', r.status === 400);
r = await call('POST', '/api/v1/server', { password: 'box54321', host: 'http://127.0.0.1:1' });
check('servidor fora do ar é recusado', r.status === 422 && r.json.error === 'unreachable');
r = await call('POST', '/api/v1/server', { password: 'box54321', host: newHost });
check('troca com a senha certa', r.status === 200 && r.json.host === newHost && r.json.rev === 1 && r.json.migrated === 1);
g = await call('GET', '/api/v1/server');
check('GET reflete a troca', g.json.host === newHost && g.json.rev === 1);
const d1 = app.store.getDevice('AA:BB:CC:00:11:22');
check('aparelho migrado mantém usuário/senha', d1.m3u_url.startsWith(newHost + '/get.php?username=u&password=p'));
const d2 = app.store.listDevices().find((d) => d.mac === 'AA:BB:CC:00:11:33');
check('aparelho de outro servidor fica como estava', d2.m3u_url.startsWith('http://outro.exemplo:80/'));
r = await call('POST', '/api/v1/server', { password: 'box54321', host: 'http://forcado.exemplo:80', force: true });
check('force salva sem testar', r.status === 200 && r.json.rev === 2);
for (let i = 0; i < 5; i++) await call('POST', '/api/v1/server', { password: 'x' + i, host: newHost });
r = await call('POST', '/api/v1/server', { password: 'box54321', host: newHost });
check('depois de 5 erros espera (429)', r.status === 429);

await app.close();
prov.close();
console.log(`servidor único: ${ok} ok, ${bad} falhas`);
if (bad) process.exitCode = 1;
