import fs from 'node:fs';

console.log('Iniciando enriquecimento da lista com categorias reais...');
const cachePath = './data/cache/d63fcec4422216bedd9d389dbaf3349c09376c00.m3u';
const content = fs.readFileSync(cachePath, 'utf8');

const liveCats = JSON.parse(fs.readFileSync('./data/xtream_categories.json'));
const liveMap = JSON.parse(fs.readFileSync('./data/xtream_live_mapping.json'));
const liveCatNames = Object.fromEntries(liveCats.map(c => [c.category_id, c.category_name]));

const vodCats = JSON.parse(fs.readFileSync('./data/xtream_vod_categories.json'));
const vodMap = JSON.parse(fs.readFileSync('./data/xtream_vod_mapping.json'));
const vodCatNames = Object.fromEntries(vodCats.map(c => [c.category_id, c.category_name]));

const seriesCats = JSON.parse(fs.readFileSync('./data/xtream_series_categories.json'));
const seriesMap = JSON.parse(fs.readFileSync('./data/xtream_series_mapping.json'));
const seriesCatNames = Object.fromEntries(seriesCats.map(c => [c.category_id, c.category_name]));

const lines = content.split('\n');
const newLines = [];
let enrichedCount = 0;

for (let i = 0; i < lines.length; i++) {
  let line = lines[i];
  if (line.startsWith('#EXTINF')) {
    const nextLine = lines[i + 1] || '';
    const nameMatch = line.match(/tvg-name="([^"]*)"/);
    const title = nameMatch ? nameMatch[1] : '';

    let realGroup = null;
    if (nextLine.includes('/live/')) {
      const catId = liveMap[title];
      if (catId && liveCatNames[catId]) realGroup = liveCatNames[catId];
    } else if (nextLine.includes('/movie/')) {
      const catId = vodMap[title];
      if (catId && vodCatNames[catId]) realGroup = vodCatNames[catId];
    } else if (nextLine.includes('/series/')) {
      let baseSeries = title.replace(/\s+S\d+\s*E\d+.*$/i, '').trim();
      const catId = seriesMap[baseSeries] || seriesMap[title];
      if (catId && seriesCatNames[catId]) realGroup = seriesCatNames[catId];
    }

    if (realGroup) {
      const safeGroup = realGroup.replace(/"/g, "'").trim();
      line = line.replace(/group-title="[^"]*"/, `group-title="${safeGroup}"`);
      enrichedCount++;
    }
  }
  newLines.push(line);
}

console.log(`Enriquecidos ${enrichedCount} itens com categorias detalhadas!`);
fs.writeFileSync(cachePath, newLines.join('\n'), 'utf8');
console.log('Lista salva com sucesso com todas as pastas organizadas!');

