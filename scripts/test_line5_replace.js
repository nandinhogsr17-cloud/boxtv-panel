import fs from 'node:fs';

const targetFile = 'C:\\Users\\box\\Downloads\\iptv-project\\panel\\data\\cache\\d63fcec4422216bedd9d389dbaf3349c09376c00.m3u';
const content = fs.readFileSync(targetFile, 'utf8');
const lines = content.split('\n');

const line5 = lines[5];
const vodCats = JSON.parse(fs.readFileSync('C:\\Users\\box\\Downloads\\iptv-project\\panel\\data\\xtream_vod_categories.json'));
const vodCatNames = Object.fromEntries(vodCats.map(c => [String(c.category_id), c.category_name]));

const cat = vodCatNames['313'];
console.log('cat 313:', cat);

const safe = cat.replace(/"/g, '').trim();
const replaced = line5.replace(/group-title="[^"]*"/, `group-title="${safe}"`);
console.log('Original line 5:');
console.log(line5);
console.log('Replaced line 5:');
console.log(replaced);
