import fs from 'node:fs';

const targetFile = 'C:\\Users\\box\\Downloads\\iptv-project\\panel\\data\\cache\\d63fcec4422216bedd9d389dbaf3349c09376c00.m3u';
const content = fs.readFileSync(targetFile, 'utf8');
const lines = content.split('\n');

const line5 = lines[5];
console.log('Line 5:', line5);
const m = line5.match(/tvg-name="([^"]*)"/);
console.log('Match m:', m ? m[1] : null);

const vodMap = JSON.parse(fs.readFileSync('C:\\Users\\box\\Downloads\\iptv-project\\panel\\data\\xtream_vod_mapping.json'));
const title = m ? m[1].trim() : '';
console.log('title in vodMap?', title in vodMap, 'val:', vodMap[title]);
