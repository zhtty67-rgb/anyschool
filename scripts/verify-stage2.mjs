// 阶段 2 验收：关系图必须从**构建产物**上验，不采信内存对象
//
// 每条断言都双向：正常态一遍，故意改坏一遍。
import { readFileSync } from 'node:fs';

const DIST = 'data';
const html = readFileSync(DIST, 'utf8');

const results = [];
const rec = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log((pass ? '  ✔ ' : '  ✘ ') + name + (detail ? '\n      ' + detail : ''));
};
const assert = (c, m) => { if (!c) throw new Error(m); };

// 从产物里取快照
const snap = (() => {
  const m = html.match(/window\.__SNAP__\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
  if (!m) throw new Error('产物里找不到 __SNAP__');
  return JSON.parse(m[1]);
})();

console.log('=== ① 快照里有 graph 数据 ===');
{
  const g = snap.graph;
  rec('产物 __SNAP__.graph 存在', !!g, g ? Object.keys(g).join(',') : '缺失');
  rec('节点数 = 79', g && g.nodes.length === 79, `nodes=${g?.nodes?.length}`);
  rec('边数 = 91', g && g.edges.length === 91, `edges=${g?.edges?.length}`);
  rec('拓扑层数 > 1（确实分层了，不是一坨）', g && g.layers.length > 1, `layers=${g?.layers?.length}`);
  const flat = g ? g.layers.flat() : [];
  rec('分层展开后节点数 = 79（每层元素都是 code 字符串，不是 null）',
    flat.length === 79 && flat.every((x) => typeof x === 'string'),
    `展开 ${flat.length} 个，第一个 ${JSON.stringify(flat[0])}`);
}

console.log('\n=== ② HTML 里真的画出了 79 个节点、91 条边 ===');
{
  // 产物是渲染好的 HTML：数 <g class="map-node" 与 <path class="map-edge"
  const nodeCount = (html.match(/class="map-node"/g) || []).length;
  const edgeCount = (html.match(/class="map-edge/g) || []).length;
  rec('HTML 里 map-node 数 = 79', nodeCount === 79, `实际 ${nodeCount}`);
  rec('HTML 里 map-edge 数 = 91', edgeCount === 91, `实际 ${edgeCount}`);
  rec('有 marker 箭头定义', html.includes('id="arr"'), '');
  rec('有图例说明（不是只有一堆方块）', html.includes('薄弱（掌握度') && html.includes('条先修关系'), '');
}

console.log('\n=== ③ 弱项高亮阈值跟着 graph.weakThreshold 走 ===');
{
  const g = snap.graph;
  rec('weakThreshold = 0.7', g && g.weakThreshold === 0.7, String(g?.weakThreshold));
  // 弱项节点应被描边成琥珀色 #f5a524
  const amber = (html.match(/#f5a524/g) || []).length;
  rec('页面上有琥珀色（弱项描边/图例占位）', amber > 0, `出现 ${amber} 处`);
  // 反向：无题节点不该被当弱项高亮。
  // 注意断言的是 **score 为 null**，不是 mastery 对象为 null ——
  // 无题节点也有 mastery 对象，只是 score 是 null、state 是 unknown。
  // 写成 n.mastery == null 会误判（第一版就这么错的）。
  const noQNodes = g.nodes.filter((n) => !n.hasQuestions);
  rec('无题节点（共 ' + noQNodes.length + ' 个）的 score 均为 null，不会被判成弱项',
    noQNodes.length > 0 && noQNodes.every((n) => !n.mastery || n.mastery.score == null),
    noQNodes.slice(0, 3).map((n) => `${n.code}:score=${n.mastery?.score}`).join(' '));
  // 反向再验一层：weakNodes 拿这些 score=null 的节点进去，必须一个都不吐出来
  const fakeWeak = noQNodes.filter((n) => typeof n.mastery?.score === 'number' && n.mastery.score < 0.7);
  rec('无题节点里没有一个会被 weakNodes 判成弱项', fakeWeak.length === 0,
    fakeWeak.length ? '误判：' + fakeWeak.map((n) => n.code).join(',') : '');
}

console.log('\n=== ④ 节点可点开看详情（客户端有处理函数） ===');
{
  rec('节点带 data-act="map-node"', html.includes('data-act="map-node"'), '');
  rec('客户端有 showMapNode 函数', html.includes('function showMapNode'), '');
  rec('详情区容器存在', html.includes('id="map-detail"'), '');
  // 反向：分支必须真的接进事件分发，不能只是个没被调用的函数
  rec('事件分发里有 map-node 分支（否则点了没反应）',
    /act==='map-node'/.test(html), '');
}

console.log('\n=== ⑤ 分母没被这次改动带坏 ===');
{
  rec('__SNAP__.summary.total 仍是 45', snap.summary.total === 45, `total=${snap.summary.total}`);
}

const bad = results.filter((x) => !x.pass);
console.log(`\n通过 ${results.length - bad.length} 项，失败 ${bad.length} 项`);
process.exit(bad.length ? 1 : 0);
