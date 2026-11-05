// 验证 clientSource() 生成的代码能独立跑，且行为与真源一致
// 这是"单一真源"的核心断言：同一份输入，客户端算出的结果必须等于真源算出的结果。
import { clientSource, masteryOfTree, masteryOfNode, MIN_SAMPLES, DECAY, WINDOW } from '../core/mastery.mjs';

const src = clientSource();

const tests = [];
const t = (name, fn) => {
  try { fn(); tests.push({ name, pass: true }); console.log('  ok  ' + name); } catch (e) { tests.push({ name, pass: false, err: e.message }); console.log('  FAIL ' + name + ': ' + e.message); }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

// 用 Function 构造一个沙箱，把生成的源码跑起来，取回它定义的函数
function bootClient() {
  const factory = new Function(src + '\nreturn { masteryOfNode, pickNext, reasonFor, masteryOfTreeClient, MIN_SAMPLES, DECAY, WINDOW };');
  return factory();
}

console.log('== ① 生成的源码能独立执行 ==');
t('能 boot 出客户端函数', () => {
  const c = bootClient();
  assert(typeof c.masteryOfNode === 'function', 'masteryOfNode 不是函数');
  assert(typeof c.masteryOfTreeClient === 'function', 'masteryOfTreeClient 不是函数');
});

console.log('== ② 客户端参数 = 真源参数（改 DECAY 会跟着变）==');
t('客户端 MIN_SAMPLES 等于真源', () => {
  const c = bootClient();
  assert(c.MIN_SAMPLES === MIN_SAMPLES, `客户端 ${c.MIN_SAMPLES} != 真源 ${MIN_SAMPLES}`);
});
t('客户端 DECAY 等于真源', () => {
  const c = bootClient();
  assert(c.DECAY === DECAY, `客户端 ${c.DECAY} != 真源 ${DECAY}`);
});
t('客户端 WINDOW 等于真源', () => {
  const c = bootClient();
  assert(c.WINDOW === WINDOW, `客户端 ${c.WINDOW} != 真源 ${WINDOW}`);
});
t('源码里没有硬编码之外的第二处 DECAY 字面量', () => {
  const hits = src.match(/DECAY\s*=/g) || [];
  assert(hits.length === 1, `DECAY= 出现 ${hits.length} 次，应该只有 1 次`);
});

console.log('== ③ 同一输入，客户端与真源算出同一结果 ==');
const recs = [
  { node: 'c0101', correct: true, at: '2026-11-05T01:00:00Z' },
  { node: 'c0101', correct: true, at: '2026-11-05T02:00:00Z' },
  { node: 'c0101', correct: false, at: '2026-11-05T03:00:00Z' },
];
t('3 条记录：分数一致', () => {
  const c = bootClient();
  const a = masteryOfNode(recs.map((r) => ({ ...r, nodeCode: r.node })));
  const b = c.masteryOfNode(recs);
  assert(a.score === b.score, `真源 ${a.score} vs 客户端 ${b.score}`);
  assert(a.state === b.state, `真源 ${a.state} vs 客户端 ${b.state}`);
});
t('样本不足时两边都是 unknown', () => {
  const c = bootClient();
  const few = recs.slice(0, 1);
  const a = masteryOfNode(few.map((r) => ({ ...r, nodeCode: r.node })));
  const b = c.masteryOfNode(few);
  assert(a.state === 'unknown' && b.state === 'unknown', `真源 ${a.state} / 客户端 ${b.state}`);
});
t('unanswerable 记录两边都排除', () => {
  const c = bootClient();
  const withUnans = [...recs, { node: 'c0101', correct: true, at: '2026-11-05T04:00:00Z', qkind: 'unanswerable' }];
  const a = masteryOfNode(withUnans.map((r) => ({ ...r, nodeCode: r.node })));
  const b = c.masteryOfNode(withUnans);
  assert(a.score === b.score && a.samples === b.samples, `真源 ${a.samples}/${a.score} vs 客户端 ${b.samples}/${b.score}`);
});

console.log('== ④ 分母：客户端也用有题节点数，不用整棵树 ==');
const concepts = [
  { code: 'c0101', name: 'A', prereq: [] },
  { code: 'c0102', name: 'B', prereq: [] },
  { code: 'c9999', name: 'X 无题', prereq: [] },
];
const withQ = new Set(['c0101', 'c0102']);
t('真源传了集合 → total 用集合大小', () => {
  const r = masteryOfTree(concepts, [], { nodeCodesWithQuestions: withQ });
  assert(r.summary.total === 2, `真源 total=${r.summary.total}，应为 2`);
});
t('客户端同样传集合 → total 也等于 2', () => {
  const c = bootClient();
  const nodes = concepts.map((x) => ({ ...x }));
  const r = c.masteryOfTreeClient(nodes, [], withQ);
  assert(r.summary.total === 2, `客户端 total=${r.summary.total}，应为 2`);
});
t('两边都不传集合时，都退化为整棵树（3）', () => {
  const c = bootClient();
  const a = masteryOfTree(concepts, []);
  const nodes = concepts.map((x) => ({ ...x }));
  const b = c.masteryOfTreeClient(nodes, [], null);
  assert(a.summary.total === 3 && b.summary.total === 3, `真源 ${a.summary.total} / 客户端 ${b.summary.total}`);
});

const bad = tests.filter((x) => !x.pass);
// 统一输出格式：其它测试都写「通过 N 项，失败 M 项」，回归脚本按这个正则统计总数。
// 写「通过 N / M」会被当成 NO-RESULT 漏掉，11 项一条都进不了合计。
console.log(`\n通过 ${tests.length - bad.length} 项，失败 ${bad.length} 项`);
process.exit(bad.length ? 1 : 0);
