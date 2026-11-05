// FB-02 掌握度证据链 basis 测试 —— 纯 Node，无第三方依赖
// 跑法：node core/mastery-basis.test.mjs
//
// 对应施工图 FB-02 的 A-02-1 ~ A-02-5
//
// 三条硬约束：
//   1. excluded 每条必须有 why —— 铁律 4 知情权：要让用户看到"我做过但没算进去"的题
//   2. formula 是**参数快照**，不是当前参数 —— 改完 DECAY，旧记录仍显示旧参数
//   3. projectionVersion 必须写 —— 这是 §9 "双跑对比" 的数据基础
import assert from 'node:assert/strict';
import { masteryOfNode, DECAY, MIN_SAMPLES, WINDOW, MASTERED, WEAK, PROJECTION_VERSION } from './mastery.mjs';

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

const at = (i) => new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString();
const rec = (id, correct, extra = {}) => ({ questionId: id, nodeCode: 'c0001', correct, at: at(1), ...extra });

console.log('== basis 结构完整性 ==');

t('返回体带 basis，且五个字段都在', () => {
  const r = masteryOfNode([rec('q1', true), rec('q2', false), rec('q3', true)]);
  assert.ok(r.basis, '缺 basis');
  for (const k of ['attempts', 'excluded', 'formula', 'projectionVersion', 'asOf']) {
    assert.ok(k in r.basis, `basis 缺字段 ${k}`);
  }
});

t('projectionVersion 是非空字符串', () => {
  const r = masteryOfNode([rec('q1', true)]);
  assert.equal(typeof r.basis.projectionVersion, 'string');
  assert.ok(r.basis.projectionVersion.length > 0);
  assert.equal(r.basis.projectionVersion, PROJECTION_VERSION);
});

t('asOf 是合法 ISO 时间', () => {
  const r = masteryOfNode([rec('q1', true)]);
  assert.ok(!Number.isNaN(Date.parse(r.basis.asOf)), `asOf=${r.basis.asOf} 不是合法时间`);
});

t('零记录也返回 basis（空数组，不是 undefined）', () => {
  const r = masteryOfNode([]);
  assert.ok(r.basis);
  assert.deepEqual(r.basis.attempts, []);
  assert.deepEqual(r.basis.excluded, []);
});

console.log('\n== A-02-1 attempts.length === samples ==');

t('3 条有效记录 → attempts 3 条，samples 3', () => {
  const r = masteryOfNode([rec('q1', true), rec('q2', false), rec('q3', true)]);
  assert.equal(r.samples, 3);
  assert.equal(r.basis.attempts.length, 3);
});

t('5 条有效记录（过 MIN_SAMPLES）→ 仍是 5 条', () => {
  const rs = [1, 2, 3, 4, 5].map((i) => rec(`q${i}`, i % 2 === 0));
  const r = masteryOfNode(rs);
  assert.equal(r.samples, 5);
  assert.equal(r.basis.attempts.length, 5);
});

t('attempts 只放有效记录，不含被排除的', () => {
  const r = masteryOfNode([
    rec('q1', true),
    rec('bad', true, { qkind: 'unanswerable' }),
    rec('q2', false),
  ]);
  assert.equal(r.samples, 2);
  assert.equal(r.basis.attempts.length, 2);
  assert.ok(!r.basis.attempts.includes('bad'));
});

console.log('\n== A-02-3 每条 excluded 都有非空 why ==');

t('unanswerable 被排除时进 excluded，且带 why', () => {
  const r = masteryOfNode([
    rec('q1', true),
    rec('q2', false),
    rec('bad', true, { qkind: 'unanswerable' }),
  ]);
  assert.equal(r.basis.excluded.length, 1);
  const e = r.basis.excluded[0];
  assert.equal(e.id, 'bad');
  assert.ok(typeof e.why === 'string' && e.why.trim().length > 0, `why 为空：${JSON.stringify(e)}`);
});

t('每条 excluded 的 why 都非空（多条排除）', () => {
  const r = masteryOfNode([
    rec('q1', true),
    rec('bad1', true, { qkind: 'unanswerable' }),
    rec('bad2', false, { qkind: 'unanswerable' }),
  ]);
  assert.equal(r.basis.excluded.length, 2);
  for (const e of r.basis.excluded) {
    assert.ok(e.why && e.why.trim().length > 0);
  }
});

t('没有排除时 excluded 是空数组', () => {
  const r = masteryOfNode([rec('q1', true)]);
  assert.deepEqual(r.basis.excluded, []);
});

console.log('\n== A-02-5 一排除两有效 ==');

t('1 条排除 + 2 条有效 → samples 2，excluded 1', () => {
  const r = masteryOfNode([
    rec('ok1', true),
    rec('ok2', true),
    rec('ex', false, { qkind: 'unanswerable' }),
  ]);
  assert.equal(r.samples, 2);
  assert.equal(r.basis.attempts.length, 2);
  assert.equal(r.basis.excluded.length, 1);
  assert.equal(r.basis.excluded[0].id, 'ex');
});

console.log('\n== A-02-4 参数快照：改 DECAY 后旧 formula 不变 ==');

t('basis.formula 记录的是**本次计算用的参数**', () => {
  const r1 = masteryOfNode([rec('q1', true)], { decay: 0.78 });
  assert.ok(r1.basis.formula.includes('0.78'), `formula=${r1.basis.formula}`);
});

t('用 0.5 算完再用默认算，各自 formula 不同且都对', () => {
  const rs = [1, 2, 3, 4].map((i) => rec(`q${i}`, true));
  const a = masteryOfNode(rs, { decay: 0.5 });
  const b = masteryOfNode(rs, { decay: 0.99 });
  assert.notEqual(a.basis.formula, b.basis.formula);
  assert.ok(a.basis.formula.includes('0.5'));
  assert.ok(b.basis.formula.includes('0.99'));
});

t('旧结果的 basis 是冻结值：事后再改全局参数，已算出的对象不变', () => {
  const rs = [1, 2, 3, 4].map((i) => rec(`q${i}`, i % 2 === 0));
  const old = masteryOfNode(rs, { decay: 0.78 });
  const snapshot = JSON.stringify(old.basis);
  // 用完全不同的参数再算一次（模拟“改了 DECAY”）
  masteryOfNode(rs, { decay: 0.2 });
  assert.equal(JSON.stringify(old.basis), snapshot, '旧 basis 被后续计算改动了');
});

t('formula 含全部三个影响结果的参数', () => {
  const r = masteryOfNode([rec('q1', true)]);
  for (const k of ['decay', 'window', 'minSamples']) {
    assert.ok(r.basis.formula.includes(k), `formula 缺参数 ${k}: ${r.basis.formula}`);
  }
});

console.log('\n== 排除理由的具体内容 ==');

t('unanswerable 的 why 说明为什么排除（含关键词）', () => {
  const r = masteryOfNode([rec('q1', true), rec('u', false, { qkind: 'unanswerable' })]);
  const why = r.basis.excluded[0].why;
  assert.ok(/答不了|unanswerable|无法判断|读不懂/.test(why), `why 语义不清：${why}`);
});

t('缺 correct 字段的记录也进 excluded 并给理由', () => {
  const r = masteryOfNode([rec('q1', true), { questionId: 'x', nodeCode: 'c0001', at: at(1) }]);
  assert.equal(r.basis.excluded.length, 1);
  assert.ok(r.basis.excluded[0].why.trim().length > 0);
});

console.log('\n== 不改坏原有导出 ==');

t('原有字段 state/score/samples/recent/trend 仍在', () => {
  const rs = [1, 2, 3, 4, 5].map((i) => rec(`q${i}`, true));
  const r = masteryOfNode(rs);
  for (const k of ['state', 'score', 'samples', 'recent', 'trend']) {
    assert.ok(k in r, `缺字段 ${k}`);
  }
});

t('state 判定规则未变：全对 → mastered', () => {
  const rs = [1, 2, 3, 4].map((i) => rec(`q${i}`, true));
  assert.equal(masteryOfNode(rs).state, 'mastered');
});

t('state 判定规则未变：样本不足 → unknown', () => {
  assert.equal(masteryOfNode([rec('q1', true)]).state, 'unknown');
});

t('PROJECTION_VERSION 导出且是字符串', () => {
  assert.equal(typeof PROJECTION_VERSION, 'string');
  assert.ok(PROJECTION_VERSION.length > 0);
});

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
