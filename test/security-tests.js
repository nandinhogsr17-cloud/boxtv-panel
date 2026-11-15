// Garante que as rotas antigas e públicas de gerenciamento não voltem e que o admin exija login.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server.js';

let passed = 0;
let failed = 0;
const check = (name, cond, extra = '') => {
  if (cond) { passed++; console.log('  ok     ' + name); }
  else { failed++; console.log('  FALHOU ' + name + (extra ? '  -> ' + extra : '')); }
};

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'boxtv-sec-'));
const app = createApp({ dataDir: dir, port: 0, adminPassword: 'segredo-teste', autoRegister: true });
const port = await app.listen();
const base = `http://127.0.0.1:${port}`;
const call = async (method, p, body, headers = {}) => {
  const res = await fetch(base + p, { method, headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, text: await res.text() };
};

console.log('\nRotas públicas antigas removidas');
for (const [m, p, b] of [
  ['GET', '/api/v1/devices'],
  ['POST', '/api/v1/devices/activate', { code: 'BOX-02AABBCCDDEE', m3uUrl: 'http://x.com/get.php?username=a&password=b' }],
  ['PUT', '/api/v1/devices/02:AA:BB:CC:DD:EE', { name: 'x' }],
  ['DELETE', '/api/v1/devices/02:AA:BB:CC:DD:EE'],
  ['GET', '/api/v1/config/server'],
  ['POST', '/api/v1/config/server', { serverHost: 'http://evil.example' }],
]) {
  const r = await call(m, p, b);
  check(`${m} ${p} => 404`, r.status === 404, `status ${r.status}`);
}

console.log('\nAdmin exige senha');
for (const p of ['/admin/api/devices', '/admin/api/integrations', '/admin/api/games']) {
  const r = await call('GET', p);
  check(`GET ${p} sem senha => 401`, r.status === 401, `status ${r.status}`);
}
const auth = { authorization: 'Basic ' + Buffer.from('admin:segredo-teste').toString('base64') };
const ok = await call('GET', '/admin/api/devices', null, auth);
check('GET /admin/api/devices com senha => 200', ok.status === 200, `status ${ok.status}`);
const csrf = await call('POST', '/admin/api/games', { date: '2026-01-01', time: '10:00', home: 'A', away: 'B' }, auth);
check('POST do admin sem cabeçalho CSRF => 403', csrf.status === 403, `status ${csrf.status}`);

await app.close();
fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${passed} verificações ok, ${failed} falharam`);
process.exit(failed ? 1 : 0);
