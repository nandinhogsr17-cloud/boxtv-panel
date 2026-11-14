import fs from 'node:fs';

const liveCats = JSON.parse(fs.readFileSync('./panel/data/xtream_categories.json'));
const liveMap = JSON.parse(fs.readFileSync('./panel/data/xtream_live_mapping.json'));
const liveCatNames = Object.fromEntries(liveCats.map(c => [String(c.category_id), c.category_name]));

const vodCats = JSON.parse(fs.readFileSync('./panel/data/xtream_vod_categories.json'));
const vodMap = JSON.parse(fs.readFileSync('./panel/data/xtream_vod_mapping.json'));
const vodCatNames = Object.fromEntries(vodCats.map(c => [String(c.category_id), c.category_name]));

const seriesCats = JSON.parse(fs.readFileSync('./panel/data/xtream_series_categories.json'));
const seriesMap = JSON.parse(fs.readFileSync('./panel/data/xtream_series_mapping.json'));
const seriesCatNames = Object.fromEntries(seriesCats.map(c => [String(c.category_id), c.category_name]));

console.log('Categorias carregadas na memória:');
console.log('Live:', Object.keys(liveCatNames).length, 'VOD:', Object.keys(vodCatNames).length, 'Series:', Object.keys(seriesCatNames).length);
