// 出处合规检查的自测 —— 用造出来的违规样本，确认每条规则真能拦住
import assert from 'node:assert/strict';
import { checkProvenance, auditPack } from './check-provenance.mjs';

let pass = 0;
let fail = 0;
function t(name, fn) {
  try { fn(); pass += 1; console.log(`  ok  ${name}`); }
  catch (e) { fail += 1; console.log(`  FAIL ${name}: ${e.message}`); }
}

const base = { id: 'c0301-01', tags: [], basis: 'd2l-zh 3.1 线性回归', needs_review: false };

console.log('== 合规的应放行 ==');
t('d2l-zh 带章节号', () => {
  assert.equal(checkProvenance(base).ok, true);
});
t('self-authored', () => {
  assert.equal(checkProvenance({ ...base, basis: 'self-authored' }).ok, true);
});
t('MMLU', () => {
  assert.equal(checkProvenance({ ...base, basis: 'MMLU' }).ok, true);
});

console.log('\n== 黑名单应拦截 ==');
t('李宏毅教程', () => {
  const r = checkProvenance({ ...base, basis: 'leedl-tutorial 第3讲' });
  assert.equal(r.ok, false);
  assert.match(r.problems.join(), /已排除的源/);
});
t('CMMLU', () => {
  assert.equal(checkProvenance({ ...base, basis: 'CMMLU 数据集' }).ok, false);
});
t('MMLU-Pro', () => {
  assert.equal(checkProvenance({ ...base, basis: 'MMLU-Pro' }).ok, false);
});
t('AGIEval', () => {
  assert.equal(checkProvenance({ ...base, basis: 'AGIEval 官方' }).ok, false);
});
t('AI训练师（按 id 前缀抓）', () => {
  const r = checkProvenance({ ...base, id: 'ait-j-001', basis: 'self-authored' });
  assert.equal(r.ok, false);
  assert.match(r.problems.join(), /AI训练师/);
});
t('黑名单藏在 tags 里也能抓', () => {
  const r = checkProvenance({ ...base, basis: 'self-authored', tags: ['CMMLU'] });
  assert.equal(r.ok, false);
});

console.log('\n== basis 缺失或不合规 ==');
t('没有 basis', () => {
  const r = checkProvenance({ ...base, basis: '' });
  assert.equal(r.ok, false);
  assert.match(r.problems.join(), /没有 basis/);
});
t('d2l-zh 但没章节号', () => {
  const r = checkProvenance({ ...base, basis: 'd2l-zh' });
  assert.equal(r.ok, false);
  assert.match(r.problems.join(), /缺章节号/);
});
t('乱写来源', () => {
  assert.equal(checkProvenance({ ...base, basis: '某教材' }).ok, false);
});

console.log('\n== 整包统计 ==');
t('混合样本统计正确', () => {
  const qs = [
    base,
    { ...base, id: 'x-1', basis: 'leedl' },
    { ...base, id: 'x-2', basis: '' },
    { ...base, id: 'x-3', basis: 'self-authored' },
  ];
  const r = auditPack(qs);
  assert.equal(r.total, 4);
  assert.equal(r.violationCount, 2);
});

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
if (fail) process.exitCode = 1;
