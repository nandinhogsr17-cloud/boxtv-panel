import fs from 'node:fs';

const cachePath = './data/cache/d63fcec4422216bedd9d389dbaf3349c09376c00.m3u';
const content = fs.readFileSync(cachePath, 'utf8');

const vodCats = JSON.parse(fs.readFileSync('./data/xtream_vod_categories.json'));
const vodMap = JSON.parse(fs.readFileSync('./data/xtream_vod_mapping.json'));
const vodCatNames = Object.fromEntries(vodCats.map(c => [String(c.category_id), c.category_name]));

const lines = content.split('\n');
const line = lines.find(l => l.includes('A Morte do Demônio'));
console.log('Line in memory:', line);

const m = line.match(/tvg-name="([^"]*)"/);
const title = m ? m[1].trim() : '';
console.log('Extracted title:', title);

const cid = vodMap[title];
console.log('Category ID:', cid);
console.log('Category name:', vodCatNames[String(cid)]);

const replaced = line.replace(/group-title="[^"]*"/, `group-title="${vodCatNames[String(cid)]}"`);
console.log('Replaced line:', replaced);
