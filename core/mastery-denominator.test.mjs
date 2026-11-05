// FB-09 掌握度分母修正测试 —— 纯 Node，无第三方依赖
// 跑法：node core/mastery-denominator.test.mjs
//
// 对应施工图 A-09-1 ~ A-09-3
// 核心命题：分母应该是「有题节点数」，不是「整棵树节点数」。
// 33 个空节点混在分母里，会让所有人掌握度凭空掉一档。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { masteryOfTree, masteryOfNode, MIN_SAMPLES, DECAY } from './mastery.mjs';
import { parseTree } from './tree.mjs';
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

const tree = parseTree();
const rawQs = readFileSync(defaultQbook(), 'utf8')
  .split(/\r?\n/)
  .filter(Boolean)
  .map((l) => JSON.parse(l));
const withQ = nodesWithQuestions(rawQs);

// 造记录：给每个有题节点 3 次全对（够 MIN_SAMPLES）
const GOOD_RECORDS = [];
let seq = 0;
for (const code of withQ) {
  for (let i = 0; i < MIN_SAMPLES; i += 1) {
    seq += 1;
    GOOD_RECORDS.push({
      questionId: `${code}-q${i}`,
      nodeCode: code,
      correct: true,
      at: new Date(Date.UTC(2026, 0, 1, 0, 0, seq)).toISOString(),
    });
  }
}

console.log('== 分母口径修正：total ==');

t('传 nodeCodesWithQuestions 后，total = 有题节点数（46）', () => {
  const r = masteryOfTree(tree.concepts, GOOD_RECORDS, { nodeCodesWithQuestions: withQ });
  assert.equal(r.summary.total, withQ.size, `实际 ${r.summary.total}，应为 ${withQ.size}`);
});

t('不传时退化为全树分母（79），保证老调用不炸', () => {
  const r = masteryOfTree(tree.concepts, GOOD_RECORDS);
  assert.equal(r.summary.total, tree.total, `实际 ${r.summary.total}，应为 ${tree.total}`);
});

console.log('\n== A-09-2 加一个无题节点，total 不变 ==');

t('树里塞入一个无题节点，total 仍是 46', () => {
  const extra = {
    code: 'c9999',
    name: '虚构的空白概念',
    module: 'm01-ai-overview',
    prereq: ['c0101'],
    def: '测试用',
  };
  const bigger = [...tree.concepts, extra];
  const r = masteryOfTree(bigger, GOOD_RECORDS, { nodeCodesWithQuestions: withQ });
  assert.equal(r.summary.total, withQ.size, `加节点后 total 变成 ${r.summary.total}`);
});

t('同一个无题节点在旧口径下确实会让 total 变（对照组）', () => {
  const extra = { code: 'c9999', name: '虚构', module: 'm01-ai-overview', prereq: [] };
  const a = masteryOfTree(tree.concepts, GOOD_RECORDS).summary.total;
  const b = masteryOfTree([...tree.concepts, extra], GOOD_RECORDS).summary.total;
  assert.equal(b, a + 1, '对照组应证明旧口径确实会漂移');
});

console.log('\n== 分母修正：coverage ==');

t('coverage 用有题节点做分母', () => {
  const r = masteryOfTree(tree.concepts, GOOD_RECORDS, { nodeCodesWithQuestions: withQ });
  const answered = r.nodes.filter(
    (n) => withQ.has(n.code) && n.mastery.state !== 'unknown',
  ).length;
  const expect = Number((answered / withQ.size).toFixed(4));
  assert.equal(r.summary.coverage, expect, `实际 ${r.summary.coverage}，应为 ${expect}`);
});

t('加无题节点后 coverage 不变', () => {
  const extra = { code: 'c9999', name: '虚构', module: 'm01-ai-overview', prereq: ['c0101'] };
  const a = masteryOfTree(tree.concepts, GOOD_RECORDS, { nodeCodesWithQuestions: withQ }).summary.coverage;
  const b = masteryOfTree([...tree.concepts, extra], GOOD_RECORDS, { nodeCodesWithQuestions: withQ })
    .summary.coverage;
  assert.equal(b, a, `coverage 从 ${a} 漂到 ${b}`);
});

t('空 Set 时 coverage 不除零', () => {
  const r = masteryOfTree(tree.concepts, GOOD_RECORDS, { nodeCodesWithQuestions: new Set() });
  assert.equal(r.summary.total, 0);
  assert.ok(Number.isFinite(r.summary.coverage), `coverage=${r.summary.coverage} 不是有限数`);
});

console.log('\n== A-09-3 mean 不许被改坏 ==');

t('mean 在修正前后完全一致', () => {
  const oldR = masteryOfTree(tree.concepts, GOOD_RECORDS);
  const newR = masteryOfTree(tree.concepts, GOOD_RECORDS, { nodeCodesWithQuestions: withQ });
  assert.equal(newR.summary.mean, oldR.summary.mean, `旧 ${oldR.summary.mean} / 新 ${newR.summary.mean}`);
});

t('mean 仍等于已作答节点的算术平均', () => {
  const r = masteryOfTree(tree.concepts, GOOD_RECORDS, { nodeCodesWithQuestions: withQ });
  const scored = r.nodes.filter((n) => n.mastery.score != null);
  const expect = Number((scored.reduce((s, n) => s + n.mastery.score, 0) / scored.length).toFixed(4));
  assert.equal(r.summary.mean, expect);
});

t('全部答对时 mean 应为 1', () => {
  const r = masteryOfTree(tree.concepts, GOOD_RECORDS, { nodeCodesWithQuestions: withQ });
  assert.equal(r.summary.mean, 1, `实际 ${r.summary.mean}`);
});

console.log('\n== A-09-1 四层聚合叶子之和等于全局 ==');

t('所有模块下的 concept 数之和 = 树总数', () => {
  const byModule = new Map();
  for (const c of tree.concepts) {
    const m = c.module ?? '(none)';
    byModule.set(m, (byModule.get(m) || 0) + 1);
  }
  const sum = [...byModule.values()].reduce((a, b) => a + b, 0);
  assert.equal(sum, tree.total);
});

t('有题节点的模块分布之和 = 有题节点总数', () => {
  const byModule = new Map();
  for (const c of tree.concepts) {
    if (!withQ.has(c.code)) continue;
    const m = c.module ?? '(none)';
    byModule.set(m, (byModule.get(m) || 0) + 1);
  }
  const sum = [...byModule.values()].reduce((a, b) => a + b, 0);
  assert.equal(sum, withQ.size);
});

t('summary 各状态计数之和 = 树总数（状态覆盖完整）', () => {
  const r = masteryOfTree(tree.concepts, GOOD_RECORDS, { nodeCodesWithQuestions: withQ });
  const s = r.summary;
  assert.equal(s.unknown + s.weak + s.learning + s.mastered, tree.total);
});

console.log('\n== 回归保护：原有行为不变 ==');

t('零记录时 mean 为 null', () => {
  const r = masteryOfTree(tree.concepts, [], { nodeCodesWithQuestions: withQ });
  assert.equal(r.summary.mean, null);
});

t('nodes 数组长度恒等于树总数（节点本身不裁）', () => {
  const r = masteryOfTree(tree.concepts, GOOD_RECORDS, { nodeCodesWithQuestions: withQ });
  assert.equal(r.nodes.length, tree.total, '分母修正不应裁剪 nodes 数组');
});

t('nextUp 仍能正常产出', () => {
  const r = masteryOfTree(tree.concepts, GOOD_RECORDS, { nodeCodesWithQuestions: withQ });
  assert.ok(r.nextUp === null || typeof r.nextUp.code === 'string');
});

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
