import fs from 'node:fs';

console.log('--- ENRIQUECENDO CATEGORIAS DA LISTA M3U ---');
const cachePath = './data/cache/d63fcec4422216bedd9d389dbaf3349c09376c00.m3u';
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

const lines = content.split(/\r?\n/);
const newLines = [];
let matched = 0;

for (let i = 0; i < lines.length; i++) {
  let line = lines[i];
  if (line.startsWith('#EXTINF')) {
    const nextLine = lines[i + 1] || '';
    const m = line.match(/tvg-name="([^"]*)"/);
    const title = m ? m[1].trim() : '';

    let realCat = null;
    if (nextLine.includes('/live/')) {
      const cid = liveMap[title];
      if (cid && liveCatNames[String(cid)]) realCat = liveCatNames[String(cid)];
    } else if (nextLine.includes('/movie/')) {
      const cid = vodMap[title];
      if (cid && vodCatNames[String(cid)]) realCat = vodCatNames[String(cid)];
    } else if (nextLine.includes('/series/')) {
      const base = title.replace(/\s+S\d+\s*E\d+.*$/i, '').trim();
      const cid = seriesMap[base] || seriesMap[title];
      if (cid && seriesCatNames[String(cid)]) realCat = seriesCatNames[String(cid)];
    }

    if (realCat) {
      const safeCat = realCat.replace(/"/g, "'").trim();
      line = line.replace(/group-title="[^"]*"/, `group-title="${safeCat}"`);
      matched++;
    }
  }
  newLines.push(line);
}

console.log(`Itens enriquecidos com pastas detalhadas: ${matched}`);
fs.writeFileSync(cachePath, newLines.join('\n'), 'utf8');
console.log('Arquivo M3U atualizado com sucesso!');

