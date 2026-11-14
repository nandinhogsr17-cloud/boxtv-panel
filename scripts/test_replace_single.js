import fs from 'node:fs';

const targetFile = 'C:\\Users\\box\\Downloads\\iptv-project\\panel\\data\\cache\\d63fcec4422216bedd9d389dbaf3349c09376c00.m3u';
const content = fs.readFileSync(targetFile, 'utf8');

const sampleTarget = '#EXTINF:-1 tvg-id="" tvg-name="+ A Morte do Demônio: Em Chamas (2026)" tvg-logo="https://image.tmdb.org/t/p/w400/fteLdvfRnltfLjAEnsl5E3vImnW.jpg" group-title="FILMES",+ A Morte do Demônio: Em Chamas (2026)';
const sampleReplacement = '#EXTINF:-1 tvg-id="" tvg-name="+ A Morte do Demônio: Em Chamas (2026)" tvg-logo="https://image.tmdb.org/t/p/w400/fteLdvfRnltfLjAEnsl5E3vImnW.jpg" group-title="Filmes | Cinema",+ A Morte do Demônio: Em Chamas (2026)';

console.log('Includes sampleTarget?', content.includes(sampleTarget));

const updated = content.replace(sampleTarget, sampleReplacement);
fs.writeFileSync(targetFile, updated, 'utf8');

const test = fs.readFileSync(targetFile, 'utf8');
console.log('Includes sampleReplacement?', test.includes(sampleReplacement));
