import fs from 'node:fs';

const cachePath = './data/cache/d63fcec4422216bedd9d389dbaf3349c09376c00.m3u';
console.log('Lendo cache:', cachePath);
const raw = fs.readFileSync(cachePath, 'utf8');

const liveCats = JSON.parse(fs.readFileSync('./data/xtream_categories.json'));
const liveMap = JSON.parse(fs.readFileSync('./data/xtream_live_mapping.json'));
const liveCatNames = Object.fromEntries(liveCats.map(c => [String(c.category_id), c.category_name]));

const vodCats = JSON.parse(fs.readFileSync('./data/xtream_vod_categories.json'));
const vodMap = JSON.parse(fs.readFileSync('./data/xtream_vod_mapping.json'));
const vodCatNames = Object.fromEntries(vodCats.map(c => [String(c.category_id), c.category_name]));

const seriesCats = JSON.parse(fs.readFileSync('./data/xtream_series_categories.json'));
const seriesMap = JSON.parse(fs.readFileSync('./data/xtream_series_mapping.json'));
const seriesCatNames = Object.fromEntries(seriesCats.map(c => [String(c.category_id), c.category_name]));

const lines = raw.replace(/\r/g, '').split('\n');
console.log('Linhas totais:', lines.length);

let totalReplaced = 0;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.startsWith('#EXTINF')) {
    const nextLine = lines[i + 1] || '';
    
    // Pega o nome do item
    const m = line.match(/tvg-name="([^"]*)"/);
    const title = m ? m[1].trim() : '';
    
    let cat = null;
    if (nextLine.includes('/live/')) {
      const cid = liveMap[title];
      if (cid && liveCatNames[String(cid)]) {
        cat = liveCatNames[String(cid)];
      }
    } else if (nextLine.includes('/movie/')) {
      const cid = vodMap[title];
      if (cid && vodCatNames[String(cid)]) {
        cat = vodCatNames[String(cid)];
      }
    } else if (nextLine.includes('/series/')) {
      const base = title.replace(/\s+S\d+\s*E\d+.*$/i, '').trim();
      const cid = seriesMap[base] || seriesMap[title];
      if (cid && seriesCatNames[String(cid)]) {
        cat = seriesCatNames[String(cid)];
      }
    }

    if (cat) {
      const safe = cat.replace(/"/g, '').trim();
      lines[i] = line.replace(/group-title="[^"]*"/, `group-title="${safe}"`);
      totalReplaced++;
    }
  }
}

console.log('Itens categorizados com sucesso:', totalReplaced);
fs.writeFileSync(cachePath, lines.join('\n'), 'utf8');
console.log('Salvo com sucesso!');
