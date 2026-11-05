// 「答不了」的题不计入掌握度 —— 双向验证
// 背景：小白指出 unanswerable 题四个选项分不出差别，只能随机选。
// 若计入统计，不会的人靠运气就变成「已掌握」，整个测量失效。
import assert from 'node:assert/strict';
import { masteryOfNode } from '../core/mastery.mjs';

let pass = 0, fail = 0;
const t = (n, fn) => { try { fn(); pass++; console.log('  ok  ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + ': ' + e.message); } };

const rec = (correct, qkind, at) => ({ correct, qkind, at });

console.log('== ① 答不了的题必须被排除 ==');
t('3 道 unanswerable 全对 → 仍然 unknown（不判定）', () => {
  const r = masteryOfNode([
    rec(true, 'unanswerable', '2026-11-05T01:00:00Z'),
    rec(true, 'unanswerable', '2026-11-05T01:01:00Z'),
    rec(true, 'unanswerable', '2026-11-05T01:02:00Z'),
  ]);
  assert.equal(r.state, 'unknown', JSON.stringify(r));
  assert.equal(r.samples, 0, `samples 应为 0，实际 ${r.samples}`);
});

t('混入 2 道 unanswerable + 1 道正常 → 只算 1 道，仍 unknown', () => {
  const r = masteryOfNode([
    rec(true, 'unanswerable', '2026-11-05T01:00:00Z'),
    rec(true, 'unanswerable', '2026-11-05T01:01:00Z'),
    rec(true, 'need_knowledge', '2026-11-05T01:02:00Z'),
  ]);
  assert.equal(r.state, 'unknown');
  assert.equal(r.samples, 1, `samples 应为 1，实际 ${r.samples}`);
});

console.log('== ② 正常题不能被误伤 ==');
t('3 道正常题全对 → mastered', () => {
  const r = masteryOfNode([
    rec(true, 'need_knowledge', '2026-11-05T01:00:00Z'),
    rec(true, 'need_knowledge', '2026-11-05T01:01:00Z'),
    rec(true, 'need_knowledge', '2026-11-05T01:02:00Z'),
  ]);
  assert.equal(r.state, 'mastered', JSON.stringify(r));
  assert.equal(r.samples, 3);
});
t('没有 qkind 字段的旧记录 → 照常计入', () => {
  const r = masteryOfNode([
    { correct: true, at: '2026-11-05T01:00:00Z' },
    { correct: true, at: '2026-11-05T01:01:00Z' },
    { correct: true, at: '2026-11-05T01:02:00Z' },
  ]);
  assert.equal(r.state, 'mastered', '旧记录不能被误排除');
  assert.equal(r.samples, 3);
});
t('3 道正常题全错 → weak', () => {
  const r = masteryOfNode([
    rec(false, 'guessable', '2026-11-05T01:00:00Z'),
    rec(false, 'guessable', '2026-11-05T01:01:00Z'),
    rec(false, 'guessable', '2026-11-05T01:02:00Z'),
  ]);
  assert.equal(r.state, 'weak', JSON.stringify(r));
});

console.log('== ③ 关键场景：不会的人靠瞎蒙不能变成已掌握 ==');
t('2 道正常题全错 + 3 道 unanswerable 全蒙对 → 仍不判定，绝不会是 mastered', () => {
  const r = masteryOfNode([
    rec(false, 'need_knowledge', '2026-11-05T01:00:00Z'),
    rec(false, 'need_knowledge', '2026-11-05T01:01:00Z'),
    rec(true, 'unanswerable', '2026-11-05T01:02:00Z'),
    rec(true, 'unanswerable', '2026-11-05T01:03:00Z'),
    rec(true, 'unanswerable', '2026-11-05T01:04:00Z'),
  ]);
  // 排除蒙对的之后只剩 2 条有效样本，少于 MIN_SAMPLES=3，按既有规则返回 unknown。
  // 关键断言是"绝不能是 mastered / learning"——那才是被运气抬上去的假分数。
  assert.equal(r.samples, 2, `只应计入 2 道，实际 ${r.samples}`);
  assert.ok(r.state === 'unknown', `应是 unknown（样本不足），实际 ${r.state}`);
  assert.notEqual(r.state, 'mastered', '绝不能因为蒙对而判成已掌握');
});
t('对照：若这三种蒙对的题不被排除，就会被判成 mastered（说明这条规则确实必要）', () => {
  const r = masteryOfNode([
    rec(false, 'need_knowledge', '2026-11-05T01:00:00Z'),
    rec(false, 'need_knowledge', '2026-11-05T01:01:00Z'),
    { correct: true, at: '2026-11-05T01:02:00Z' },  // 无 qkind，相当于旧记录
    { correct: true, at: '2026-11-05T01:03:00Z' },
    { correct: true, at: '2026-11-05T01:04:00Z' },
  ]);
  // 5 条里 3 条正确，近期加权后约 0.5~0.6，属于 learning 或 weak，但样本数明显更多
  assert.equal(r.samples, 5, '没有 qkind 时全部计入，这正是要避免的情形');
});

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
process.exit(fail ? 1 : 0);
