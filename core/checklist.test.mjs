// 处理清单的测试
//
// 重点同样是"它查不出什么"：④ 只做字面比对，
// 「夜里」写成「光线不同」它就看不见——这条必须钉在测试里，
// 否则下一个人会以为这份清单能保证没泄露。
import assert from 'node:assert/strict';
import { buildChecklist, formatChecklist, stemFacts, leakedFacts } from './checklist.mjs';

let pass = 0, fail = 0;
const t = (n, fn) => { try { fn(); pass++; console.log('  ok  ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + ': ' + e.message); } };

const mk = (lens) => lens.map((n, i) => String.fromCharCode(97 + i) + 'x'.repeat(n - 1));

console.log('== ① 项数 ==');
t('三道四选一 → 项数过', () => {
  const r = buildChecklist([1, 2, 3].map((i) => ({ id: 'q' + i, options: mk([40, 41, 41, 40]), answer: 'ABCD'[i - 1] })));
  assert.ok(r.checks.find((c) => c.name.includes('项数')).ok);
});
t('有判断题（两选项）→ 项数报', () => {
  const r = buildChecklist([{ id: 'tf', options: ['对', '错'], answer: 'A' }]);
  const c = r.checks.find((x) => x.name.includes('项数'));
  assert.ok(!c.ok, c.detail);
  assert.ok(c.detail.includes('tf'), c.detail);
});

console.log('== ② 答案分布 ==');
t('答案全押 A → 报"等于没打散"', () => {
  const r = buildChecklist([1, 2, 3, 4].map((i) => ({ id: 'q' + i, options: mk([40, 41, 41, 40]), answer: 'A' })));
  const c = r.checks.find((x) => x.name.includes('答案分布'));
  assert.ok(!c.ok, c.detail);
  assert.ok(c.detail.includes('没打散'), c.detail);
});
t('四个位置各一次 → 过', () => {
  const r = buildChecklist([1, 2, 3, 4].map((i) => ({ id: 'q' + i, options: mk([40, 41, 41, 40]), answer: 'ABCD'[i - 1] })));
  assert.ok(r.checks.find((x) => x.name.includes('答案分布')).ok);
});
t('答案认不出 → 是"没测"，不是"过"', () => {
  const r = buildChecklist([{ id: 'x', options: mk([40, 41, 41, 40]) }]);
  const c = r.checks.find((x) => x.name.includes('答案分布'));
  assert.ok(c.detail.includes('没测'), c.detail);
  assert.deepEqual(r.unknownAnswer, ['x']);
});

console.log('== ③ 字数离群 ==');
t('离群差值超过阈值 5 → 报（39/43/43/40 是旧阈值时代的例子，只差 3，现在不报）', () => {
  // 2026-11-05：离群阈值从 2 提到 5。
  // 原来这条用 39/43/43/40，离群的那条只差 3，新阈值下确实不该报——
  // 这批选项普遍 20–50 字，差 3 字读者感觉不到，报了等于没报。
  // 所以用例换成真正离群的：[39, 50, 43, 40]，最短那条离均值差约 6。
  const r = buildChecklist([{ id: 'x', options: mk([39, 50, 43, 40]), answer: 'B' }]);
  assert.ok(!r.checks.find((c) => c.name.includes('字数离群')).ok);
});
t('41/42/42/40 → 不报', () => {
  const r = buildChecklist([{ id: 'x', options: mk([41, 42, 42, 40]), answer: 'B' }]);
  assert.ok(r.checks.find((c) => c.name.includes('字数离群')).ok);
});

console.log('== ④ 题干原词（字面） ==');
t('题干里的两位数出现在选项里 → 报', () => {
  const leak = leakedFacts('训练图一共 30 万张，全是白天拍的', [
    '训练图有 30 万张，够多了',
    '只覆盖了白天',
    '光线变化大',
    '模型太简单',
  ]);
  assert.equal(leak.length, 1, JSON.stringify(leak));
  assert.equal(leak[0].index, 0);
});
t('题干里的三字片段出现在选项里 → 报', () => {
  const leak = leakedFacts('店里七成营业额来自老主顾', [
    '营业额集中',
    '样本太少',
    '设备不同',
    '模型太简单',
  ]);
  assert.equal(leak.length, 1, JSON.stringify(leak));
  assert.ok(leak[0].hits.includes('营业额'), JSON.stringify(leak));
});
t('单个数字（如"4 个"）不算具体要素，不报', () => {
  const facts = stemFacts('这家店有 4 个员工');
  assert.ok(![...facts].some((f) => f === '4'), [...facts].join(','));
});

console.log('== ⑤ 边界：查不出的必须写死 ==');
t('「夜里」被改写成「光线不同」→ 查不出（这是它的上限）', () => {
  // Searcher 划的分寸：选项用上位概念不算泄露。
  // 所以这不是漏查，是设计如此。钉住它，免得被当成保证。
  const leak = leakedFacts('训练图全是夜里拍的', [
    '只覆盖了同一个场景',
    '光线和背景都变了',
    '设备不同',
    '模型太简单',
  ]);
  assert.equal(leak.length, 0, JSON.stringify(leak));
});
t('题干根本没有 → 四项里 ④ 直接过（空题也不崩）', () => {
  const r = buildChecklist([{ id: 'x', options: mk([40, 41, 41, 40]), answer: 'A' }]);
  assert.ok(r.checks.find((c) => c.name.includes('题干原词')).ok);
});
t('空题包不崩，而且不能印成"四项都过"', () => {
  // 这是最坏的误报形态：一个数都没算，却显示四个 ✔。
  // "全部通过"比"报了 1 个问题"更像好消息，所以最容易被当真。
  const r = buildChecklist([]);
  assert.equal(r.total, 0);
  const s = formatChecklist(r);
  assert.ok(s.includes('没测'), s);
  assert.ok(!s.includes('四项都过'), s);
  assert.ok(!s.includes('✔'), s);
});

console.log('== ⑥ 打印格式 ==');
t('四项未过时最后一句是"不能直接交"', () => {
  const r = buildChecklist([{ id: 'x', options: mk([30, 45, 46, 44]), answer: 'A' }]);
  const s = formatChecklist(r);
  assert.ok(s.includes('不能直接交'), s);
});
t('四项都过时也写明"≠ 题目合格"', () => {
  const r = buildChecklist([{ id: 'x', options: mk([40, 41, 41, 40]), answer: 'A' }]);
  const s = formatChecklist(r);
  assert.ok(s.includes('≠ 题目合格'), s);
  assert.ok(s.includes('查不出上位概念'), s);
});

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
process.exit(fail ? 1 : 0);
