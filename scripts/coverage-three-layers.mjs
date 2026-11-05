// 核 coverage 的三层数字：现状 / 学完有题节点 / 理论上限
//
// 起因（2026-11-05，Qbank 纠正）：
//   我说"学完也涨不到 100%"，把中间那层漏了。
//   coverage = (total - unknown) / total，total 是整棵树 79。
//   学完所有有题节点后 unknown 只剩没题的节点，那个数是天花板，不是 0。
//
// 数从 dist/index.html 内嵌的 window.__SNAP__ 里取，不采信 MANIFEST 自述。
// 注意 tree 的结构是 tree.modules[].concepts[]，不是 tree.concepts——
// 我第一次写错，取到 0 个概念还以为树是空的。
import { readFileSync } from 'node:fs';

const html = readFileSync('dist/index.html', 'utf8');
const snap = JSON.parse(html.match(/window\.__SNAP__\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/)[1]);

const codes = [];
for (const m of snap.tree.modules || []) {
  for (const c of m.concepts || []) codes.push(c.code);
}

const nodesQ = new Set();
for (const q of snap.questions) {
  for (const n of q.nodes || []) nodesQ.add(typeof n === 'string' ? n : (n.id ?? ''));
}

const empty = codes.filter((c) => !nodesQ.has(c));
const total = codes.length;

// coverage 的算法（mastery.mjs 第 120 行）：(nodes.length - counts.unknown) / nodes.length
// unknown 包括"没题的节点"和"有题但没作答的节点"
const now = snap.summary.coverage;
const ceiling = (total - empty.length) / total;

console.log('知识树总节点（tree.modules[].concepts[] 实点）：' + total);
console.log('  与 summary.total 一致？' + (total === snap.summary.total ? '✅' : '❌ summary 写的是 ' + snap.summary.total));
console.log('有题的节点：' + nodesQ.size);
console.log('没题的节点：' + empty.length);
console.log('  没题的是：' + empty.join(', '));
console.log('');
console.log('① 现在（新用户没作答）：coverage = ' + (now * 100).toFixed(0) + '%');
console.log('② 把有题节点全学完：unknown 只剩 ' + empty.length + ' 个没题的，coverage = '
  + (ceiling * 100).toFixed(1) + '%  ← 天花板，不是 0');
console.log('③ 到不了 100%：差的 ' + ((1 - ceiling) * 100).toFixed(1) + '% 就是那 ' + empty.length + ' 个没题的节点');
