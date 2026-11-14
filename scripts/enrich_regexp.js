import fs from 'node:fs';

const targetFile = 'C:\\Users\\box\\Downloads\\iptv-project\\panel\\data\\cache\\d63fcec4422216bedd9d389dbaf3349c09376c00.m3u';
console.log('--- ENRIQUECENDO LISTA COM TODAS AS PASTAS ---');

const liveCats = JSON.parse(fs.readFileSync('C:\\Users\\box\\Downloads\\iptv-project\\panel\\data\\xtream_categories.json'));
const liveMap = JSON.parse(fs.readFileSync('C:\\Users\\box\\Downloads\\iptv-project\\panel\\data\\xtream_live_mapping.json'));
const liveCatNames = Object.fromEntries(liveCats.map(c => [String(c.category_id), c.category_name]));

const vodCats = JSON.parse(fs.readFileSync('C:\\Users\\box\\Downloads\\iptv-project\\panel\\data\\xtream_vod_categories.json'));
const vodMap = JSON.parse(fs.readFileSync('C:\\Users\\box\\Downloads\\iptv-project\\panel\\data\\xtream_vod_mapping.json'));
const vodCatNames = Object.fromEntries(vodCats.map(c => [String(c.category_id), c.category_name]));

const seriesCats = JSON.parse(fs.readFileSync('C:\\Users\\box\\Downloads\\iptv-project\\panel\\data\\xtream_series_categories.json'));
const seriesMap = JSON.parse(fs.readFileSync('C:\\Users\\box\\Downloads\\iptv-project\\panel\\data\\xtream_series_mapping.json'));
const seriesCatNames = Object.fromEntries(seriesCats.map(c => [String(c.category_id), c.category_name]));

const content = fs.readFileSync(targetFile, 'utf8');

// Regex global para pegar cada bloco: #EXTINF... com sua URL
const re = /(#EXTINF:[^\r\n]*tvg-name="([^"]*)"[^\r\n]*group-title=")([^"]*)("[^\r\n]*\r?\n)([^\r\n]+)/g;

let count = 0;
const updated = content.replace(re, (match, prefix, title, oldGroup, suffix, url) => {
  let cat = null;
  const t = title.trim();
  if (url.includes('/live/')) {
    const cid = liveMap[t];
    if (cid && liveCatNames[String(cid)]) cat = liveCatNames[String(cid)];
  } else if (url.includes('/movie/')) {
    const cid = vodMap[t];
    if (cid && vodCatNames[String(cid)]) cat = vodCatNames[String(cid)];
  } else if (url.includes('/series/')) {
    const base = t.replace(/\s+S\d+\s*E\d+.*$/i, '').trim();
    const cid = seriesMap[base] || seriesMap[t];
    if (cid && seriesCatNames[String(cid)]) cat = seriesCatNames[String(cid)];
  }

  if (cat) {
    count++;
    const safeCat = cat.replace(/"/g, '').trim();
    return `${prefix}${safeCat}${suffix}${url}`;
  }
  return match;
});

console.log(`Substituídos via RegExp com sucesso: ${count}`);
fs.writeFileSync(targetFile, updated, 'utf8');
console.log('Salvo com sucesso no disco!');
