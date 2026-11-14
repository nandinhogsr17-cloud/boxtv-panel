const readline = require('readline');
const fs = require('fs');
const path = require('path');

async function run() {
  const p = path.resolve(__dirname, '../data/cache/d63fcec4422216bedd9d389dbaf3349c09376c00.m3u');
  const rl = readline.createInterface({ input: fs.createReadStream(p) });
  const groups = new Set();
  for await (const line of rl) {
    if (line.includes('group-title=')) {
      const m = line.match(/group-title="([^"]+)"/);
      if (m) groups.add(m[1]);
    }
  }
  console.log('Total unique groups across ENTIRE b5a9 file:', groups.size);
  console.log(Array.from(groups).slice(0, 30));
}
run();
