import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

/**
 * Enriquece o arquivo M3U com as categorias reais extraídas da API Xtream Codes:
 * - Live: xtream_categories.json + xtream_live_mapping.json
 * - VOD: xtream_vod_categories.json + xtream_vod_mapping.json
 * - Séries: xtream_series_categories.json + xtream_series_mapping.json
 */
export async function enrichM3uWithXtream(inputM3uPath, outputM3uPath, dataDir) {
  const liveCats = JSON.parse(fs.readFileSync(path.join(dataDir, 'xtream_categories.json'), 'utf8'));
  const liveCatMap = Object.fromEntries(liveCats.map(c => [c.category_id, c.category_name]));
  const liveMap = JSON.parse(fs.readFileSync(path.join(dataDir, 'xtream_live_mapping.json'), 'utf8'));

  const vodCats = JSON.parse(fs.readFileSync(path.join(dataDir, 'xtream_vod_categories.json'), 'utf8'));
  const vodCatMap = Object.fromEntries(vodCats.map(c => [c.category_id, c.category_name]));
  const vodMap = JSON.parse(fs.readFileSync(path.join(dataDir, 'xtream_vod_mapping.json'), 'utf8'));

  const seriesCats = JSON.parse(fs.readFileSync(path.join(dataDir, 'xtream_series_categories.json'), 'utf8'));
  const seriesCatMap = Object.fromEntries(seriesCats.map(c => [c.category_id, c.category_name]));
  const seriesMap = JSON.parse(fs.readFileSync(path.join(dataDir, 'xtream_series_mapping.json'), 'utf8'));

  const cleanName = (n) => String(n || '').trim();

  const rl = readline.createInterface({
    input: fs.createReadStream(inputM3uPath, { encoding: 'utf8' }),
    crlfDelay: Infinity
  });

  const out = fs.createWriteStream(outputM3uPath, { encoding: 'utf8' });

  let pendingInf = null;
  let enrichedCount = 0;

  for await (const line of rl) {
    if (line.startsWith('#EXTINF:')) {
      pendingInf = line;
      continue;
    }

    if (pendingInf) {
      const url = line.trim();
      const isUrl = /^[a-z][a-z0-9+.-]*:\/\//i.test(url);

      if (isUrl) {
        // Tentar extrair o nome do canal/filme/série do EXTINF
        const commaIdx = pendingInf.indexOf(',');
        const title = commaIdx >= 0 ? cleanName(pendingInf.slice(commaIdx + 1)) : '';

        let targetCategory = null;

        if (url.includes('/series/')) {
          // É uma série
          const catId = seriesMap[title];
          if (catId && seriesCatMap[catId]) targetCategory = seriesCatMap[catId];
        } else if (url.includes('/movie/')) {
          // É um filme
          const catId = vodMap[title];
          if (catId && vodCatMap[catId]) targetCategory = vodCatMap[catId];
        } else if (url.includes('/live/')) {
          // É TV ao vivo
          const catId = liveMap[title];
          if (catId && liveCatMap[catId]) targetCategory = liveCatMap[catId];
        }

        if (targetCategory) {
          enrichedCount++;
          // Se já tem group-title, substitui; se não, insere
          if (pendingInf.includes('group-title="')) {
            pendingInf = pendingInf.replace(/group-title="[^"]*"/, `group-title="${targetCategory.replace(/"/g, "'")}"`);
          } else {
            pendingInf = pendingInf.replace('#EXTINF:-1', `#EXTINF:-1 group-title="${targetCategory.replace(/"/g, "'")}"`);
          }
        }

        out.write(pendingInf + '\n');
        out.write(url + '\n');
        pendingInf = null;
        continue;
      } else {
        out.write(pendingInf + '\n');
        pendingInf = null;
      }
    }

    out.write(line + '\n');
  }

  out.end();
  await new Promise(r => out.on('finish', r));
  console.log(`Enrichment complete: ${enrichedCount} items updated with real categories.`);
}
