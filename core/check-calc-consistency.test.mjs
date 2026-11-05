// check-calc-consistency 的测试：按 Chief 的三条规矩
// ① 喂坏数据必须报  ② 喂好数据不能报  ③ 在完整真实数据（v9，323 道）上跑
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkCalcFormulaConsistency } from './check-calc-consistency.mjs';

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass += 1; console.log(`  ok  ${name}`); }
  catch (e) { fail += 1; console.log(`  FAIL ${name}: ${e.message}`); }
}

const codes = (r) => r.violations.map((v) => v.code);

const q = (over = {}) => ({
  id: 'x-01', type: 'single_choice', stem: '题干', tags: [], ...over,
});

console.log('== ① 喂坏数据必须报 ==');
t('打「计算」标签但没 formula → 报', () => {
  const r = checkCalcFormulaConsistency([q({ tags: ['计算'] })]);
  assert.ok(r.violations.length > 0, '应该有违规');
});
t('有 formula 但没「计算」标签 → 报', () => {
  const r = checkCalcFormulaConsistency([q({ formula: 'x = 1' })]);
  assert.ok(r.violations.length > 0, '应该有违规');
});
t('场景题挂了「计算」标签 → 报', () => {
  const r = checkCalcFormulaConsistency([q({ type: 'scenario', tags: ['计算'], formula: 'x=1' })]);
  assert.ok(r.violations.length > 0, '场景题不许挂计算标签');
});
t('场景题带 formula → 报', () => {
  const r = checkCalcFormulaConsistency([q({ type: 'scenario', tags: [], formula: 'x=1' })]);
  assert.ok(r.violations.length > 0, '场景题不许有 formula');
});

console.log('== ② 喂好数据不能报 ==');
t('「计算」标签 + formula 成对 → 不报', () => {
  const r = checkCalcFormulaConsistency([q({ tags: ['计算'], formula: '2*3=6' })]);
  assert.equal(r.violations.length, 0, JSON.stringify(codes(r)));
});
t('既无标签也无 formula → 不报', () => {
  const r = checkCalcFormulaConsistency([q({ tags: ['单选题'] })]);
  assert.equal(r.violations.length, 0, JSON.stringify(codes(r)));
});
t('普通场景题（无计算标签、无 formula）→ 不报', () => {
  const r = checkCalcFormulaConsistency([q({ type: 'scenario', tags: ['场景'] })]);
  assert.equal(r.violations.length, 0, JSON.stringify(codes(r)));
});
t('空题包 → 不报', () => {
  const r = checkCalcFormulaConsistency([]);
  assert.equal(r.violations.length, 0);
});

console.log('== ③ 完整真实数据集 ==');
t('v9 全部 323 道 → 0 违规', () => {
  const lines = readFileSync('data\\questions-authoring-v9.jsonl', 'utf8')
    .split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
  const r = checkCalcFormulaConsistency(lines);
  assert.equal(r.violations.length, 0, JSON.stringify(codes(r)));
  assert.equal(r.stats.total, 323, `统计题数应为 323，实际 ${r.stats.total}`);
});
t('v9 统计里「计算」标签与 formula 数量一致', () => {
  const lines = readFileSync('data\\questions-authoring-v9.jsonl', 'utf8')
    .split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
  const r = checkCalcFormulaConsistency(lines);
  assert.equal(r.stats.calcTag, r.stats.withFormula, `计算标签 ${r.stats.calcTag} vs formula ${r.stats.withFormula}`);
});

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
process.exit(fail ? 1 : 0);
