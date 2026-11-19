import assert from 'node:assert/strict';
import { createMsx } from '../src/msx.js';

let ok = 0;
const t = (name, fn) => Promise.resolve().then(fn).then(() => { ok++; console.log('  ok    ' + name); }, (e) => { console.log('  FALHOU ' + name + ': ' + e.message); process.exitCode = 1; });

const data = {
  get_live_categories: [{ category_id: '1', category_name: 'Abertos' }],
  get_vod_categories: [{ category_id: '7', category_name: 'Ação' }],
  get_series_categories: [{ category_id: '9', category_name: 'Drama' }],
  get_live_streams: [{ stream_id: 5, name: 'Canal  Cinco', stream_icon: 'http://x/i.png' }],
  get_vod_streams: [{ stream_id: 11, name: 'Filme', container_extension: 'mkv', stream_icon: '' }],
  get_series: [{ series_id: 3, name: 'Série', cover: 'http://x/c.jpg' }],
  get_series_info: { info: { name: 'Série' }, episodes: { 2: [{ id: '22', episode_num: 1, title: 'B' }], 1: [{ id: '21', episode_num: 1, title: 'A', container_extension: 'mp4' }] } },
};
let calls = 0;
const fetchImpl = async (url) => {
  calls++;
  const action = new URL(url).searchParams.get('action');
  return { ok: action in data, status: 404, json: async () => data[action] };
};
const msx = createMsx({ host: 'http://prov:80/', user: 'u s', pass: 'p', fetchImpl });
const B = 'https://site.test';

await t('start.json aponta para o menu', async () => {
  const r = await msx.route(B, '/msx/start.json');
  assert.equal(r.parameter, 'menu:https://site.test/msx/menu.json');
});
await t('menu tem 3 entradas', async () => assert.equal((await msx.route(B, '/msx/menu.json')).menu.length, 3));
await t('categorias viram cartões', async () => {
  const r = await msx.route(B, '/msx/live.json');
  assert.equal(r.items[0].action, 'content:https://site.test/msx/live/1.json');
});
await t('canal usa m3u8 por padrão e ts se pedir', async () => {
  const a = (await msx.route(B, '/msx/live/1.json')).items[0];
  assert.equal(a.title, 'Canal Cinco');
  assert.equal(a.action, 'video:http://prov:80/live/u%20s/p/5.m3u8');
  const b = (await msx.route(B, '/msx/live/1.json', { fmt: 'ts' })).items[0];
  assert.ok(b.action.endsWith('/5.ts'));
});
await t('formato padrão dos canais pode ser ts', async () => {
  const m4 = createMsx({ host: 'http://prov', user: 'u', pass: 'p', liveFormat: 'ts', fetchImpl });
  assert.ok((await m4.route(B, '/msx/live/1.json')).items[0].action.endsWith('/5.ts'));
});
await t('filme usa a extensão do provedor', async () => {
  const r = await msx.route(B, '/msx/movies/7.json');
  assert.ok(r.items[0].action.endsWith('/movie/u%20s/p/11.mkv'));
  assert.equal(r.items[0].image, undefined);
});
await t('episódios saem em ordem de temporada', async () => {
  const r = await msx.route(B, '/msx/show/3.json');
  assert.equal(r.items.length, 2);
  assert.ok(r.items[0].title.startsWith('T1 E1'));
  assert.ok(r.items[1].action.endsWith('/series/u%20s/p/22.mp4'));
});
await t('episódios como lista de listas também funcionam', async () => {
  data.get_series_info = { info: { name: 'X' }, episodes: [[{ id: '1', episode_num: 1, title: 'a' }], [{ id: '2', episode_num: 1, title: 'b' }]] };
  const m2 = createMsx({ host: 'http://prov', user: 'u', pass: 'p', fetchImpl });
  assert.equal((await m2.route(B, '/msx/show/3.json')).items.length, 2);
});
await t('rota desconhecida devolve null', async () => assert.equal(await msx.route(B, '/msx/nada.json'), null));
await t('respostas ficam em cache', async () => {
  const before = calls;
  await msx.route(B, '/msx/live/1.json');
  assert.equal(calls, before);
});
await t('lista gigante é cortada', async () => {
  data.get_live_streams = Array.from({ length: 900 }, (_, i) => ({ stream_id: i, name: 'c' + i }));
  const m3 = createMsx({ host: 'http://prov', user: 'u', pass: 'p', fetchImpl });
  const r = await m3.route(B, '/msx/live/1.json');
  assert.equal(r.items.length, 600);
  assert.ok(r.headline.includes('900'));
});
console.log(`msx: ${ok} ok`);
