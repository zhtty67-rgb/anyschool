// 从产物 index.html 里实际数题数和节点数，不信 MANIFEST 的自述
//
// 为什么单独写这个（2026-11-05，Chief 要求"确认界面上打开是 531 道、46 个节点"）：
//   MANIFEST.json 是构建脚本自己写的，它说自己发了几道，不等于界面里真有那么多。
//   这一轮反复出现"报出来的数和实际对不上"，所以这里直接从最终产物里数。
import { readFileSync } from 'node:fs';

const HTML = 'dist/index.html';
const html = readFileSync(HTML, 'utf8');

// 构建脚本把题目以 window.__SNAP__ 注入页面（ui/render.mjs 里的
//   <script>window.__SNAP__ = ${JSON.stringify(snap)};</script>
// ）。整个数据在后面统一处理，pickQuestions 会从 snap 里取。
const snapMatch = html.match(/window\.__SNAP__\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
if (!snapMatch) {
  console.error('在 index.html 里没找到 window.__SNAP__。');
  console.error('不要把"没找到"当成"没问题"——这说明检查方式和产物格式对不上，得先看 ui/render.mjs 怎么注入数据。');
  process.exit(2);
}

let snap;
try {
  snap = JSON.parse(snapMatch[1]);
} catch (e) {
  console.error('window.__SNAP__ 解析失败：' + e.message);
  process.exit(2);
}

console.log('产物：' + HTML);
console.log('snap 顶层字段：' + Object.keys(snap).join(', '));

// snap 里存题目的那个字段：优先 questions，其次逐个字段找数组
let arr = Array.isArray(snap.questions) ? snap.questions : null;
let fieldName = 'questions';
if (!arr) {
  for (const [k, v] of Object.entries(snap)) {
    if (Array.isArray(v) && v.length && v[0] && typeof v[0] === 'object' && ('id' in v[0] || 'stem' in v[0])) {
      arr = v; fieldName = k; break;
    }
  }
}
if (!arr) {
  console.error('snap 里找不到题目数组。字段：' + Object.keys(snap).join(', '));
  process.exit(2);
}
console.log('题目数组字段：snap.' + fieldName);
const ids = arr.map((q) => String(q.id ?? ''));
const nodes = new Set();
for (const q of arr) {
  for (const n of q.nodes || []) nodes.add(typeof n === 'string' ? n : (n.id ?? JSON.stringify(n)));
}
const byType = {};
for (const q of arr) byType[q.type] = (byType[q.type] || 0) + 1;

console.log('产物：' + HTML);
console.log('题目数组字段：snap.' + fieldName);
console.log('题数：' + arr.length);
console.log('节点数：' + nodes.size);
console.log('题型：' + JSON.stringify(byType));
console.log('含 c1103 的题：' + ids.filter((x) => x.startsWith('c1103')).length + ' 道');
console.log('无 id 的题：' + ids.filter((x) => !x).length + ' 道');

// 和 MANIFEST 自述的数对一遍——两个数不一致就报出来，不要悄悄选一个说
const m = JSON.parse(readFileSync('dist/MANIFEST.json', 'utf8'));
const okQ = arr.length === m.questions;
const okN = nodes.size === m.nodes_covered;
console.log('');
console.log('MANIFEST 自述：' + m.questions + ' 道 / ' + m.nodes_covered + ' 节点');
console.log('实际产物：  ' + arr.length + ' 道 / ' + nodes.size + ' 节点');
console.log(okQ && okN ? '✅ 一致' : '❌ 不一致——以实际产物为准，MANIFEST 的数是错的');
process.exit(okQ && okN ? 0 : 1);
