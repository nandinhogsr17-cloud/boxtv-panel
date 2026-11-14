const readline = require('readline');
const fs = require('fs');
const path = require('path');

async function run() {
  const p = path.resolve(__dirname, '../data/cache/b5a966a6c76e85a11bf3e7ae6ee46cd797d50fc0.m3u');
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
