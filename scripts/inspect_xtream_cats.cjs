const fs = require('fs');
const path = require('path');

function inspectCategories() {
  const cats = ['xtream_categories.json', 'xtream_vod_categories.json', 'xtream_series_categories.json'];
  for (const c of cats) {
    const p = path.resolve(__dirname, '../data', c);
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      console.log(`${c}: ${data.length} categories found. Sample:`, data.slice(0, 5));
    } else {
      console.log(`${c}: Not found`);
    }
  }
}
inspectCategories();
