const readline = require('readline');
const fs = require('fs');
const path = require('path');

async function run() {
  const p = path.resolve(__dirname, '../data/cache/d63fcec4422216bedd9d389dbaf3349c09376c00.m3u');
  if (!fs.existsSync(p)) return console.log('File not found');
  const rl = readline.createInterface({ input: fs.createReadStream(p) });
  const groups = new Set();
  let count = 0;
  for await (const line of rl) {
    if (line.includes('group-title=')) {
      const m = line.match(/group-title="([^"]+)"/);
      if (m) groups.add(m[1]);
    }
    if (++count > 50000) break;
  }
  console.log('Sample groups in d63f:', Array.from(groups).slice(0, 20));
}
run();
