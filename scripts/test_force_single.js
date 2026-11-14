import fs from 'node:fs';

const targetFile = 'C:\\Users\\box\\Downloads\\iptv-project\\panel\\data\\cache\\d63fcec4422216bedd9d389dbaf3349c09376c00.m3u';
const content = fs.readFileSync(targetFile, 'utf8');

const vodCats = JSON.parse(fs.readFileSync('C:\\Users\\box\\Downloads\\iptv-project\\panel\\data\\xtream_vod_categories.json'));
const vodCatNames = Object.fromEntries(vodCats.map(c => [String(c.category_id), c.category_name]));

const line5 = '#EXTINF:-1 tvg-id="" tvg-name="+ A Morte do Demônio: Em Chamas (2026)" tvg-logo="https://image.tmdb.org/t/p/w400/fteLdvfRnltfLjAEnsl5E3vImnW.jpg" group-title="FILMES",+ A Morte do Demônio: Em Chamas (2026)';
const replaced = line5.replace(/group-title="[^"]*"/, `group-title="${vodCatNames['313']}"`);

const newContent = content.replace(line5, replaced);
fs.writeFileSync(targetFile, newContent, 'utf8');

const test = fs.readFileSync(targetFile, 'utf8');
console.log('Includes replaced?', test.includes('group-title="Filmes | Cinema⚡PLUS"'));
