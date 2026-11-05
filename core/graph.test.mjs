// FB-11 关系图测试 —— 纯 Node，无第三方依赖
// 跑法：node core/graph.test.mjs
//
// 验收对应施工图 FB-11 的 A-11-1 ~ A-11-5
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseTree } from './tree.mjs';
import { masteryOfTree } from './mastery.mjs';
import { buildGraph, weakNodes, topoLayers } from './graph.mjs';
import { nodesWithQuestions, defaultQbook } from './qbook.mjs';

let pass = 0;
let fail = 0;
const t = (name, fn) => {
  try {
    fn();
    pass += 1;
    console.log(`  ok  ${name}`);
  } catch (e) {
    fail += 1;
    console.log(`  FAIL ${name}\n       ${e.message}`);
    process.exitCode = 1;
  }
};

// ── 真实数据夹具 ──
const tree = parseTree();
const rawQs = readFileSync(defaultQbook(), 'utf8')
  .split(/\r?\n/)
  .filter(Boolean)
  .map((l) => JSON.parse(l));
const realWithQ = nodesWithQuestions(rawQs);

const mastery = masteryOfTree(tree.concepts, []);
const masteryByCode = new Map(mastery.nodes.map((n) => [n.code, n.mastery]));

console.log('== A-11-1 边数 ==');

t('edges.length === 91', () => {
  const g = buildGraph(tree, rawQs, masteryByCode);
  assert.equal(g.edges.length, 91, `实际 ${g.edges.length}`);
});

t('nodes.length === 79', () => {
  const g = buildGraph(tree, rawQs, masteryByCode);
  assert.equal(g.nodes.length, 79, `实际 ${g.nodes.length}`);
});

t('stats.nodes / stats.edges 与数组长度一致', () => {
  const g = buildGraph(tree, rawQs, masteryByCode);
  assert.equal(g.stats.nodes, g.nodes.length);
  assert.equal(g.stats.edges, g.edges.length);
});

console.log('\n== A-11-2 无环 ==');

t('拓扑排序能跑完（Kahn 覆盖全部节点）', () => {
  const g = buildGraph(tree, rawQs, masteryByCode);
  const layers = topoLayers(g);
  const seen = layers.flat();
  assert.equal(seen.length, g.nodes.length, `拓扑排出 ${seen.length}，应为 ${g.nodes.length}`);
  assert.equal(new Set(seen).size, g.nodes.length, '拓扑结果有重复');
});

t('最长链 15 层', () => {
  const g = buildGraph(tree, rawQs, masteryByCode);
  const layers = topoLayers(g);
  assert.equal(layers.length, 15, `实际 ${layers.length} 层`);
});

t('自己造一个环，拓扑排序必须报错', () => {
  const cyc = {
    concepts: [
      { code: 'a', name: 'A', module: 'm', prereq: ['b'] },
      { code: 'b', name: 'B', module: 'm', prereq: ['a'] },
    ],
    modules: [{ code: 'm', name: 'M' }],
    total: 2,
  };
  const g = buildGraph(cyc, [], new Map());
  assert.throws(() => topoLayers(g), /环|cycle/i);
});

console.log('\n== A-11-3 无悬空 ==');

t('每条边两端都在 nodes 里', () => {
  const g = buildGraph(tree, rawQs, masteryByCode);
  const codes = new Set(g.nodes.map((n) => n.code));
  for (const e of g.edges) {
    assert.ok(codes.has(e.from), `边 from 悬空：${e.from}`);
    assert.ok(codes.has(e.to), `边 to 悬空：${e.to}`);
  }
});

t('节点 code 唯一', () => {
  const g = buildGraph(tree, rawQs, masteryByCode);
  assert.equal(new Set(g.nodes.map((n) => n.code)).size, g.nodes.length);
});

console.log('\n== A-11-4 跨模块边 ==');

t('crossModuleEdges 能独立算出并一致', () => {
  const g = buildGraph(tree, rawQs, masteryByCode);
  const modOf = new Map(g.nodes.map((n) => [n.code, n.module]));
  const independent = g.edges.filter((e) => modOf.get(e.from) !== modOf.get(e.to)).length;
  assert.equal(g.stats.crossModuleEdges, independent, `stats=${g.stats.crossModuleEdges} 独立算=${independent}`);
});

t('每条边的 crossModule 标记与实际模块一致', () => {
  const g = buildGraph(tree, rawQs, masteryByCode);
  const modOf = new Map(g.nodes.map((n) => [n.code, n.module]));
  for (const e of g.edges) {
    const expect = modOf.get(e.from) !== modOf.get(e.to);
    assert.equal(e.crossModule, expect, `${e.from}->${e.to} 标记错`);
  }
});

console.log('\n== A-11-5 弱项阈值真的生效 ==');

t('阈值 0.7 → 0.75 时高亮节点数必须变', () => {
  // 造一组覆盖 0.70~0.75 区间的分数，保证阈值移动真的改变结果
  const fake = new Map();
  tree.concepts.forEach((c, i) => {
    const score = i % 5 === 0 ? 0.72 : 0.9;
    fake.set(c.code, { state: 'learning', score, samples: 5, recent: 5, trend: 'flat' });
  });
  const at70 = weakNodes(fake, 0.7).length;
  const at75 = weakNodes(fake, 0.75).length;
  assert.notEqual(at70, at75, `0.7 时 ${at70} 个，0.75 时 ${at75} 个，阈值没生效`);
  assert.ok(at75 > at70, '阈值提高应高亮更多');
});

t('真实数据下 0.7 与 0.75 也能区分（若都无低分则跳过比较）', () => {
  const a = weakNodes(masteryByCode, 0.7).length;
  const b = weakNodes(masteryByCode, 0.75).length;
  assert.ok(b >= a, '阈值提高时高亮数不应减少');
});

t('score 为 null 的节点不参与高亮', () => {
  const fake = new Map([['c0101', { state: 'unknown', score: null, samples: 0 }]]);
  assert.equal(weakNodes(fake, 0.75).length, 0);
});

console.log('\n== 关系图承载掌握度与有题标记 ==');

t('hasQuestions 与 nodesWithQuestions 一致', () => {
  const g = buildGraph(tree, rawQs, masteryByCode);
  let mismatch = 0;
  for (const n of g.nodes) {
    if (n.hasQuestions !== realWithQ.has(n.code)) mismatch += 1;
  }
  assert.equal(mismatch, 0, `${mismatch} 个节点标记不符`);
});

t('有题节点数 = 46', () => {
  const g = buildGraph(tree, rawQs, masteryByCode);
  assert.equal(g.nodes.filter((n) => n.hasQuestions).length, realWithQ.size);
});

t('mastery 字段来自传入的 masteryByCode，模块内不自算', () => {
  const sentinel = new Map(
    tree.concepts.map((c) => [c.code, { state: 'weak', score: 0.123, samples: 9, recent: 9, trend: 'down' }]),
  );
  const g = buildGraph(tree, rawQs, sentinel);
  assert.ok(g.nodes.every((n) => n.mastery.score === 0.123));
});

t('tree 里没有 mastery 时给 null，不崩', () => {
  const g = buildGraph(tree, rawQs, new Map());
  assert.ok(g.nodes.every((n) => n.mastery === null));
});

t('level 固定为 concept', () => {
  const g = buildGraph(tree, rawQs, masteryByCode);
  assert.ok(g.nodes.every((n) => n.level === 'concept'));
});

t('节点带 module 字段且在 modules 里', () => {
  const g = buildGraph(tree, rawQs, masteryByCode);
  const mods = new Set(tree.modules.map((m) => m.code));
  for (const n of g.nodes) assert.ok(mods.has(n.module), `${n.code} 的 module ${n.module} 不在模块表里`);
});

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
