// 对比三份 HTML 文件，找 #map 消失的原因
// 疑点：HTML 字符串里有 id="map"，浏览器 DOM 里却没有。所以先确认三份文件是否同一版。
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const FILES = [
  'D:/jiaoyu/work/edu/dist/index.html',
  'D:/jiaoyu/work/review/关系图-待测-20261105.html',
  'D:/jiaoyu/work/review/关系图-待测-v2-20261105.html',
];

const Q = String.fromCharCode(34); // "
const markerMapId = 'id=' + Q + 'map' + Q;
const markerNode = 'class=' + Q + 'map-node' + Q;

for (const p of FILES) {
  let s;
  try { s = readFileSync(p, 'utf8'); } catch (e) { console.log(p.split('/').pop() + ' 读不了'); continue; }
  const lines = s.split(/\r?\n/).length;
  const mapId = s.indexOf(markerMapId);
  const mapNodes = (s.match(/class="map-node"/g) || []).length;
  console.log(p.split('/').pop());
  console.log('  字节 ' + s.length + '  行数 ' + lines + '  md5 ' + createHash('md5').update(s).digest('hex').slice(0, 8));
  console.log('  id="map" 位置 ' + mapId + '   map-node 数 ' + mapNodes);
  // 看 map 块在不在 <body> 里，还是被塞进了别处
  const bodyAt = s.indexOf('<body');
  const headEnd = s.indexOf('</head>');
  console.log('  <body> 在 ' + bodyAt + '，</head> 在 ' + headEnd + '，map 在 body 之后? ' + (mapId > bodyAt));
  console.log('');
}
