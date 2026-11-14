import fs from 'node:fs';

const cachePath = './data/cache/d63fcec4422216bedd9d389dbaf3349c09376c00.m3u';
console.log('Reading:', cachePath);
const content = fs.readFileSync(cachePath, 'utf8');

const liveCats = JSON.parse(fs.readFileSync('./data/xtream_categories.json'));
const liveMap = JSON.parse(fs.readFileSync('./data/xtream_live_mapping.json'));
const liveCatNames = Object.fromEntries(liveCats.map(c => [String(c.category_id), c.category_name]));

const vodCats = JSON.parse(fs.readFileSync('./data/xtream_vod_categories.json'));
const vodMap = JSON.parse(fs.readFileSync('./data/xtream_vod_mapping.json'));
const vodCatNames = Object.fromEntries(vodCats.map(c => [String(c.category_id), c.category_name]));

const seriesCats = JSON.parse(fs.readFileSync('./data/xtream_series_categories.json'));
const seriesMap = JSON.parse(fs.readFileSync('./data/xtream_series_mapping.json'));
const seriesCatNames = Object.fromEntries(seriesCats.map(c => [String(c.category_id), c.category_name]));

const lines = content.split('\n');
console.log('Total lines to process:', lines.length);

let liveCount = 0, vodCount = 0, seriesCount = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.startsWith('#EXTINF')) {
    const nextLine = lines[i + 1] || '';
    
    // Extrai o nome do canal/filme
    const commaIdx = line.indexOf(',');
    const title = commaIdx !== -1 ? line.substring(commaIdx + 1).trim() : '';
    
    let realCat = null;
    if (nextLine.includes('/live/')) {
      const cid = liveMap[title];
      if (cid && liveCatNames[String(cid)]) {
        realCat = liveCatNames[String(cid)];
        liveCount++;
      }
    } else if (nextLine.includes('/movie/')) {
      const cid = vodMap[title];
      if (cid && vodCatNames[String(cid)]) {
        realCat = vodCatNames[String(cid)];
        vodCount++;
      }
    } else if (nextLine.includes('/series/')) {
      const base = title.replace(/\s+S\d+\s*E\d+.*$/i, '').trim();
      const cid = seriesMap[base] || seriesMap[title];
      if (cid && seriesCatNames[String(cid)]) {
        realCat = seriesCatNames[String(cid)];
        seriesCount++;
      }
    }

    if (realCat) {
      const safe = realCat.replace(/"/g, '').trim();
      const grpIdx = line.indexOf('group-title="');
      if (grpIdx !== -1) {
        const quoteEnd = line.indexOf('"', grpIdx + 13);
        if (quoteEnd !== -1) {
          lines[i] = line.substring(0, grpIdx + 13) + safe + line.substring(quoteEnd);
        }
      }
    }
  }
}

console.log('Matches -> Live:', liveCount, 'VOD:', vodCount, 'Series:', seriesCount);
fs.writeFileSync(cachePath, lines.join('\n'), 'utf8');
console.log('Cache successfully updated with beautiful folders!');

