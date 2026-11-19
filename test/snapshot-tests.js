import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server.js';

let ok = 0, bad = 0;
const check = (n, c) => { if (c) ok++; else { bad++; console.log('FALHOU:', n); } };

let stored = null, auth = '';
const ext = http.createServer((req, res) => {
  auth = req.headers.authorization || '';
  if (req.method === 'PUT') { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => { stored = b; res.end('ok'); }); }
  else if (stored) res.end(stored); else { res.statusCode = 404; res.end(); }
});
await new Promise((r) => ext.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${ext.address().port}/snap`;
const mk = () => createApp({ port: 0, dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'snap-')), adminPassword: 'x', webSecret: 'segredo-fixo', snapshotUrl: url, snapshotToken: 'tok', snapshotFetch: (u, o) => fetch(u, o) });

const a = mk();
await a.listen();
const mac = 'AA:BB:CC:00:11:22';
a.store.db.prepare("INSERT INTO devices (mac, name, status, created_at) VALUES (?,?,?,?)").run(mac, 'TV', 'active', Date.now());
a.store.db.prepare("INSERT INTO favorites (mac,item_id,type,title,created_at) VALUES (?,?,?,?,?)").run(mac, 'm1', 'movie', 'Filme', 1);
a.store.db.prepare("INSERT INTO progress (mac,item_id,type,title,position_ms,duration_ms,updated_at) VALUES (?,?,?,?,?,?,?)").run(mac, 'm1', 'movie', 'Filme', 5000, 9000, 2);
check('salva', await a.snapshot.save(true));
check('token enviado', auth === 'Bearer tok');
check('conteúdo cifrado', stored.startsWith('s1.') && !stored.includes('Filme'));
check('sem mudança não reenvia', (await a.snapshot.save()) === false);
await a.close();

const b = mk(); // disco novo e vazio, como após reinício no Render
await b.listen();
check('aparelho restaurado', b.store.db.prepare('SELECT status FROM devices WHERE mac=?').get(mac)?.status === 'active');
check('favorito restaurado', !!b.store.db.prepare('SELECT 1 FROM favorites WHERE item_id=?').get('m1'));
check('progresso restaurado', b.store.db.prepare('SELECT position_ms p FROM progress WHERE item_id=?').get('m1')?.p === 5000);
await b.close();

stored = 's1.xx.yy.zz';
const c = mk(); await c.listen();
check('snapshot inválido é ignorado', c.store.db.prepare('SELECT COUNT(*) n FROM devices').get().n === 0);
await c.close();
ext.close();
console.log(`snapshot: ${ok} ok, ${bad} falhas`);
process.exit(bad ? 1 : 0);
