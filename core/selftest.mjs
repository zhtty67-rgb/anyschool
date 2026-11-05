// 自测：判题 + 掌握度 + 知识树解析 + 题库读取。node core/selftest.mjs
import assert from 'node:assert/strict';
import { grade, normalizeChoice, resolveTrueFalse, isTrueFalseShape } from './grade.mjs';
import { masteryOfNode, masteryOfTree, pickNext, MIN_SAMPLES } from './mastery.mjs';
import { parseTree, validatePrereq } from './tree.mjs';
import { loadQuestions, selectPack, sourceOf, isAiSubject, questionsForNode, drawQuestions, FALLBACK_QBOOK } from './qbook.mjs';

let pass = 0;
function t(name, fn) {
  try {
    fn();
    pass += 1;
    console.log(`  ok  ${name}`);
  } catch (e) {
    console.log(`  FAIL ${name}: ${e.message}`);
    process.exitCode = 1;
  }
}

console.log('== 判题 ==');
t('单选正确', () => {
  const g = grade({ type: 'single_choice', options: ['a','b','c'], answer: 'B' }, 'B');
  assert.equal(g.correct, true);
});
t('单选错误', () => {
  const g = grade({ type: 'single_choice', options: ['a','b','c'], answer: 'B' }, 'C');
  assert.equal(g.correct, false);
  assert.match(g.note, /正确选项为 B/);
});
t('多选全对', () => {
  const g = grade({ type: 'multi_choice', options: ['a','b','c','d'], answer: 'ABC' }, ['C','A','B']);
  assert.equal(g.correct, true);
});
t('多选漏选不算对但记 partial', () => {
  const g = grade({ type: 'multi_choice', options: ['a','b','c','d'], answer: 'ABC' }, 'AB');
  assert.equal(g.correct, false);
  assert.equal(g.partial, 0.6667);
  assert.match(g.note, /漏选 C/);
});
t('多选多选', () => {
  const g = grade({ type: 'multi_choice', options: ['a','b','c','d'], answer: 'AB' }, 'ABD');
  assert.equal(g.correct, false);
  assert.match(g.note, /多选 D/);
});
t('判断题点"正确"映射到 A', () => {
  const q = { type: 'single_choice', options: ['正确 √','错误 ×'], answer: 'A' };
  assert.equal(isTrueFalseShape(q), true);
  const g = grade(q, '正确');
  assert.equal(g.correct, true);
  const g2 = grade(q, '错误 ×');
  assert.equal(g2.correct, false);
});
t('判断题点 B 也认', () => {
  const q = { type: 'single_choice', options: ['正确 √','错误 ×'], answer: 'B' };
  assert.equal(grade(q, 'B').correct, true);
});
t('未作答', () => {
  const g = grade({ type: 'single_choice', options: ['a','b'], answer: 'A' }, null);
  assert.equal(g.ok, false);
  assert.match(g.note, /未作答/);
});
t('答案缺失不崩', () => {
  const g = grade({ type: 'single_choice', options: ['a','b'], answer: '' }, 'A');
  assert.equal(g.ok, false);
  assert.match(g.note, /缺少有效答案/);
});
t('大小写与小写字母', () => {
  assert.deepEqual(normalizeChoice('a,b'), ['A','B']);
  assert.deepEqual(normalizeChoice(['b','a','a']), ['A','B']);
});

console.log('== 掌握度 ==');
t('零记录 → unknown', () => {
  const m = masteryOfNode([]);
  assert.equal(m.state, 'unknown');
  assert.equal(m.score, null);
});
t(`少于 ${MIN_SAMPLES} 次不给分`, () => {
  const m = masteryOfNode([
    { correct: true, at: '2026-11-01T00:00:00Z' },
    { correct: true, at: '2026-11-02T00:00:00Z' },
  ]);
  assert.equal(m.state, 'unknown');
  assert.equal(m.score, null);
  assert.equal(m.samples, 2);
});
t('全对 → mastered', () => {
  const recs = [1,2,3].map((i) => ({ correct: true, at: `2026-11-0${i}T00:00:00Z` }));
  const m = masteryOfNode(recs);
  assert.equal(m.state, 'mastered');
  assert.ok(m.score > 0.99);
});
t('全错 → weak', () => {
  const recs = [1,2,3].map((i) => ({ correct: false, at: `2026-11-0${i}T00:00:00Z` }));
  assert.equal(masteryOfNode(recs).state, 'weak');
});
t('近期加权：先错后对分数高于先对后错', () => {
  const up = [
    { correct: false, at: '2026-11-01T00:00:00Z' },
    { correct: false, at: '2026-11-02T00:00:00Z' },
    { correct: true, at: '2026-11-03T00:00:00Z' },
    { correct: true, at: '2026-11-04T00:00:00Z' },
  ];
  const down = [
    { correct: true, at: '2026-11-01T00:00:00Z' },
    { correct: true, at: '2026-11-02T00:00:00Z' },
    { correct: false, at: '2026-11-03T00:00:00Z' },
    { correct: false, at: '2026-11-04T00:00:00Z' },
  ];
  assert.ok(masteryOfNode(up).score > masteryOfNode(down).score);
  assert.equal(masteryOfNode(up).trend, 'up');
  assert.equal(masteryOfNode(down).trend, 'down');
});
t('只取最近 WINDOW 次：早期连错不影响当前', () => {
  const recs = [
    ...Array.from({length: 10}, (_, i) => ({ correct: false, at: `2026-10-${String(i+1).padStart(2,'0')}T00:00:00Z` })),
    ...Array.from({length: 5}, (_, i) => ({ correct: true, at: `2026-11-0${i+1}T00:00:00Z` })),
  ];
  const m = masteryOfNode(recs);
  assert.equal(m.state, 'mastered');
});

console.log('== 整树与推荐 ==');
const concepts = [
  { code: 'c0101', name: '人工智能定义', prereq: [] },
  { code: 'c0102', name: '图灵测试', prereq: ['c0101'] },
  { code: 'c0103', name: '智能体概念', prereq: ['c0101'] },
];
t('汇总计数正确', () => {
  const recs = [1,2,3].map((i) => ({ nodeCode: 'c0101', correct: true, at: `2026-11-0${i}T00:00:00Z` }));
  const r = masteryOfTree(concepts, recs);
  assert.equal(r.summary.total, 3);
  assert.equal(r.summary.mastered, 1);
  assert.equal(r.summary.unknown, 2);
});
t('已暴露的薄弱节点优先于未开始的节点', () => {
  const recs = [1,2,3].map((i) => ({ nodeCode: 'c0102', correct: false, at: `2026-11-0${i}T00:00:00Z` }));
  const r = masteryOfTree(concepts, recs);
  // c0102 已 weak，优先补；c0101 只是 unknown
  assert.ok(r.nextUp);
  assert.equal(r.nextUp.code, 'c0102');
  assert.equal(r.nextUp.state, 'weak');
});
t('先修已掌握后推荐下层', () => {
  const recs = [
    ...Array.from({length: 3}, (_, i) => ({ nodeCode: 'c0101', correct: true, at: `2026-11-0${i+1}T00:00:00Z` })),
    ...Array.from({length: 3}, (_, i) => ({ nodeCode: 'c0103', correct: false, at: `2026-11-0${i+1}T00:00:00Z` })),
  ];
  const r = masteryOfTree(concepts, recs);
  assert.equal(r.nextUp.code, 'c0103');
  assert.equal(r.nextUp.state, 'weak');
});

console.log('== 知识树解析 ==');
let tree;
t('能解析 concepts-ai.yaml', () => {
  tree = parseTree();
  assert.ok(tree.total > 0, '概念数为 0');
  assert.equal(tree.modules.length, 20);
  assert.equal(tree.total, tree.concepts.length);
  console.log(`     → 模块 ${tree.modules.length}，概念 ${tree.total}`);
});
t('先修关系无悬空引用', () => {
  const v = validatePrereq(tree);
  assert.equal(v.ok, true, `悬空 ${JSON.stringify(v.dangling.slice(0,5))}`);
});
t('概念字段完整', () => {
  const bad = tree.concepts.filter((c) => !c.code || !c.name || !c.module);
  assert.equal(bad.length, 0, `缺字段 ${bad.length} 个`);
});
t('概念 code 唯一', () => {
  const seen = new Set();
  const dup = [];
  for (const c of tree.concepts) { if (seen.has(c.code)) dup.push(c.code); seen.add(c.code); }
  assert.equal(dup.length, 0, `重复 ${dup.join(',')}`);
});

console.log('== 题库读取 ==');
// 注意：本节校验的是「老题库」（questions-ai-foundations，1311 题、MMLU 557 题、0 挂载）
// 的数据特征，属于数据校验而非路径校验，所以显式指定，不跟随 defaultQbook()。
// 新版题库（questions-authoring-v*.jsonl）的校验在 core/qbook.test.mjs。
let qb;
t('能读取题库 JSONL', () => {
  qb = loadQuestions(FALLBACK_QBOOK);
  assert.equal(qb.errors.length, 0, `解析错误 ${qb.errors.length}`);
  assert.equal(qb.total, 1311);
});
t('来源判定正确', () => {
  const m = qb.questions.find((q) => q.id.startsWith('mmlu-'));
  const a = qb.questions.find((q) => q.id.startsWith('ait-'));
  assert.equal(sourceOf(m).publicOk, true);
  assert.equal(sourceOf(a).publicOk, false);
});
t('公开包只留 MIT', () => {
  const pub = selectPack(qb.questions, 'public');
  assert.equal(pub.length, 557);
  assert.ok(pub.every((q) => q._source.license === 'MIT'));
});
t('本地包全量', () => {
  assert.equal(selectPack(qb.questions, 'local').length, 1311);
});
t('AI 学科判定剔除电子工程', () => {
  const pub = selectPack(qb.questions, 'public');
  const ai = pub.filter(isAiSubject);
  const ee = pub.filter((q) => !isAiSubject(q));
  console.log(`     → 公开包 ${pub.length} 道，其中 AI 学科 ${ai.length} 道，电子工程 ${ee.length} 道`);
  assert.equal(ai.length, 412);
  assert.equal(ee.length, 145);
});
t('AI 学科细分合计对得上', () => {
  const pub = selectPack(qb.questions, 'public');
  const ai = pub.filter(isAiSubject);
  const bySub = {};
  for (const q of ai) {
    const sub = q.tags.find((x) => x !== 'MMLU' && x !== '英文');
    bySub[sub] = (bySub[sub] || 0) + 1;
  }
  console.log(`     → ${JSON.stringify(bySub)}`);
  assert.equal(Object.values(bySub).reduce((a, b) => a + b, 0), 412);
});
t('未挂载时按节点取题返回空', () => {
  assert.equal(questionsForNode(qb.questions, 'c0101').length, 0);
});
t('组卷在无题时不崩', () => {
  assert.deepEqual(drawQuestions(qb.questions, 'c0101', 5), []);
});

console.log(`\n通过 ${pass} 项${process.exitCode ? '，有失败' : '，全部通过'}`);
