import fs from 'node:fs';
import readline from 'node:readline';

const targetFile = 'C:\\Users\\box\\Downloads\\iptv-project\\panel\\data\\cache\\d63fcec4422216bedd9d389dbaf3349c09376c00.m3u';
const tmpFile = targetFile + '.stream.tmp';

console.log('Carregando categorias...');
const liveCats = JSON.parse(fs.readFileSync('C:\\Users\\box\\Downloads\\iptv-project\\panel\\data\\xtream_categories.json'));
const liveMap = JSON.parse(fs.readFileSync('C:\\Users\\box\\Downloads\\iptv-project\\panel\\data\\xtream_live_mapping.json'));
const liveCatNames = Object.fromEntries(liveCats.map(c => [String(c.category_id), c.category_name]));

const vodCats = JSON.parse(fs.readFileSync('C:\\Users\\box\\Downloads\\iptv-project\\panel\\data\\xtream_vod_categories.json'));
const vodMap = JSON.parse(fs.readFileSync('C:\\Users\\box\\Downloads\\iptv-project\\panel\\data\\xtream_vod_mapping.json'));
const vodCatNames = Object.fromEntries(vodCats.map(c => [String(c.category_id), c.category_name]));

const seriesCats = JSON.parse(fs.readFileSync('C:\\Users\\box\\Downloads\\iptv-project\\panel\\data\\xtream_series_categories.json'));
const seriesMap = JSON.parse(fs.readFileSync('C:\\Users\\box\\Downloads\\iptv-project\\panel\\data\\xtream_series_mapping.json'));
const seriesCatNames = Object.fromEntries(seriesCats.map(c => [String(c.category_id), c.category_name]));

console.log('Streamando arquivo e categorizando...');

const inputStream = fs.createReadStream(targetFile, { encoding: 'utf8' });
const outputStream = fs.createWriteStream(tmpFile, { encoding: 'utf8' });

const rl = readline.createInterface({
  input: inputStream,
  crlfDelay: Infinity,
});

let pendingExtinf = null;
let replaced = 0;

rl.on('line', (line) => {
  if (line.startsWith('#EXTINF')) {
    pendingExtinf = line;
  } else if (pendingExtinf) {
    const urlLine = line;
    const m = pendingExtinf.match(/tvg-name="([^"]*)"/);
    const title = m ? m[1].trim() : '';

    let cat = null;
    if (urlLine.includes('/live/')) {
      const cid = liveMap[title];
      if (cid && liveCatNames[String(cid)]) cat = liveCatNames[String(cid)];
    } else if (urlLine.includes('/movie/')) {
      const cid = vodMap[title];
      if (cid && vodCatNames[String(cid)]) cat = vodCatNames[String(cid)];
    } else if (urlLine.includes('/series/')) {
      const base = title.replace(/\s+S\d+\s*E\d+.*$/i, '').trim();
      const cid = seriesMap[base] || seriesMap[title];
      if (cid && seriesCatNames[String(cid)]) cat = seriesCatNames[String(cid)];
    }

    if (cat) {
      const safe = cat.replace(/"/g, '').trim();
      pendingExtinf = pendingExtinf.replace(/group-title="[^"]*"/, `group-title="${safe}"`);
      replaced++;
    }

    outputStream.write(pendingExtinf + '\n');
    outputStream.write(urlLine + '\n');
    pendingExtinf = null;
  } else {
    outputStream.write(line + '\n');
  }
});

rl.on('close', () => {
  outputStream.end(() => {
    fs.renameSync(tmpFile, targetFile);
    console.log(`Sucesso absoluto! Substituídos: ${replaced}`);
  });
});
