const S=process.argv[2] || '.';
import http from 'node:http';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { createApp } = await import('../server.js');
let ok=0,bad=0; const check=(n,c,x='')=>{c?ok++:bad++;console.log((c?'  ok     ':'  FALHOU ')+n+(c?'':'  -> '+x));};
const prov = http.createServer((q,r)=>{ if(q.url==='/g.m3u'){r.writeHead(200);return r.end('#EXTM3U\n'+[1,2,3,4].map(i=>`#EXTINF:-1 group-title="TV",Canal ${i}\nhttp://127.0.0.1:1/l${i}.ts\n`).join(''));} if(q.url==='/h'){r.writeHead(200,{'content-type':'text/html'});return r.end('<html>x</html>');} r.writeHead(404);r.end();});
await new Promise(r=>prov.listen(0,'127.0.0.1',r)); const P=`http://127.0.0.1:${prov.address().port}`;
const app=createApp({port:0,dataDir:fs.mkdtempSync(path.join(os.tmpdir(),'a-')),adminPassword:'pw',allowPrivate:true,activateMax:1000});
const B=`http://127.0.0.1:${await app.listen()}`;
const br=await chromium.launch(); const ctx=await br.newContext({viewport:{width:1000,height:800}}); const pg=await ctx.newPage();
const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
await pg.goto(B+'/'); await pg.waitForSelector('.act .big .val');
const mac=await pg.locator('.act .big .val').first().innerText(); const key=await pg.locator('.act .big .val').nth(1).innerText();
check('tela do app mostra campo da lista e o endereço /ativar', await pg.locator('.act input[placeholder*="link"]').count()===1 && (await pg.locator('.act').innerText()).includes('/ativar'));
await pg.screenshot({path:S+'/20-app-ativacao.png'});
// 1) lista ruim no app
await pg.fill('.act input[placeholder*="link"]', P+'/h'); await pg.click('text=Verificar e ativar');
await pg.waitForSelector('.act .err:has-text("página da web")',{timeout:8000}); check('app mostra erro claro para link que é página web',true);
// 2) outra pessoa ativa de /ativar com MAC+chave
const p2=await ctx.newPage(); await p2.goto(`${B}/ativar?mac=${encodeURIComponent(mac)}&key=${key}`);
check('/ativar preenche MAC e chave do link', (await p2.inputValue('#mac'))===mac && (await p2.inputValue('#key'))===key);
await p2.fill('#url', P+'/h'); await p2.click('#go'); await p2.waitForSelector('.bad');
check('/ativar mostra falha', (await p2.locator('.bad').innerText()).includes('página da web'));
await p2.screenshot({path:S+'/21-ativar-erro.png'});
await p2.fill('#url', '  '+P+'/g.m3u  '); await p2.click('#go'); await p2.waitForSelector('.ok:has-text("ativada")',{timeout:30000});
check('/ativar ativa e mostra 4 canais', (await p2.locator('.stats').innerText()).includes('4'));
await p2.screenshot({path:S+'/22-ativar-ok.png'});
// 3) o app abre sozinho
await pg.waitForSelector('.top .pill',{timeout:12000}); check('app que estava aguardando abre sozinho depois da ativação de outra pessoa',true);
// 4) fluxo Xtream na página
check('sem erros JS', errs.length===0, errs.join('|'));
await br.close(); await app.close(); prov.close();
console.log(`\n${ok} ok, ${bad} falharam`); process.exit(bad?1:0);
