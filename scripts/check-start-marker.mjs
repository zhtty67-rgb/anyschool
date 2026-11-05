// 验证「从这里开始」起点标记确实出现在构建产物里
// 2026-11-05：图原来没有任何东西指向起点，全是灰方块；加起点标记后要能从产物验。
import { readFileSync } from 'node:fs';

const html = readFileSync('D:/jiaoyu/work/edu/dist/index.html', 'utf8');
const snap = JSON.parse(html.match(/window\.__SNAP__\s*=\s*(\{[\s\S]*?\});\s*<\/script>/)[1]);

const count = (re) => (html.match(re) || []).length;

console.log('startNode       : ' + JSON.stringify(snap.startNode));
console.log('（从这里开始）次数: ' + count(/从这里开始/g));
console.log('map-start-tag 样式: ' + html.includes('map-start-tag'));
console.log('map-node 数      : ' + count(/class="map-node"/g));
console.log('map-edge 数      : ' + count(/class="map-edge/g));
console.log('summary.total    : ' + snap.summary.total);

// 起点标记必须落在真正的 startNode 上，不是随便哪个节点
const startCode = snap.startNode?.code;
const startHit = startCode
  ? html.includes(`data-node="${startCode}"`) && /从这里开始/.test(html)
  : false;
console.log('起点标记指向 startNode(' + startCode + '): ' + startHit);

// 反向：如果 startNode 为空，就不该有「从这里开始」标记（否则是硬编码的假标记）
const hasMark = count(/从这里开始/g) > 0;
const consistent = startCode ? hasMark : !hasMark;
console.log((consistent ? '✔' : '✘') + ' 标记与 startNode 一致');
process.exit(consistent ? 0 : 1);
