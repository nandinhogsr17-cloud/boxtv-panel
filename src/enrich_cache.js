import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

export async function processFile(dataDir, inputName, outputName) {
  const masterMapPath = path.join(dataDir, 'title_to_group.json');
  let masterMap = {};
  if (fs.existsSync(masterMapPath)) {
    masterMap = JSON.parse(fs.readFileSync(masterMapPath, 'utf8'));
  }

  const inPath = path.join(dataDir, 'cache', inputName);
  const outPath = path.join(dataDir, 'cache', outputName);

  const rl = readline.createInterface({
    input: fs.createReadStream(inPath, { encoding: 'utf8' }),
    crlfDelay: Infinity
  });

  const out = fs.createWriteStream(outPath, { encoding: 'utf8' });

  let pendingInf = null;
  let updated = 0;

  for await (const line of rl) {
    if (line.startsWith('#EXTINF:')) {
      if (pendingInf) out.write(pendingInf + '\n');
      pendingInf = line;
      continue;
    }

    if (pendingInf) {
      const url = line.trim();
      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) {
        const comma = pendingInf.lastIndexOf(',');
        const title = comma >= 0 ? pendingInf.slice(comma + 1).trim() : '';

        const catName = masterMap[title];

        if (catName) {
          updated++;
          const safeCat = catName.replace(/"/g, "'");
          if (pendingInf.includes('group-title="')) {
            pendingInf = pendingInf.replace(/group-title="[^"]*"/, `group-title="${safeCat}"`);
          } else {
            pendingInf = pendingInf.replace('#EXTINF:-1', `#EXTINF:-1 group-title="${safeCat}"`);
          }
        }

        out.write(pendingInf + '\n');
        out.write(line + '\n');
        pendingInf = null;
        continue;
      } else {
        out.write(pendingInf + '\n');
        pendingInf = null;
      }
    }

    out.write(line + '\n');
  }

  if (pendingInf) out.write(pendingInf + '\n');
  out.end();
  await new Promise(res => out.on('finish', res));
  console.log(`Processed: ${updated} items matched real categories from master map.`);
}
