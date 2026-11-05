// check-calc-tags 的测试：按 Chief 的三条规矩
// ① 喂坏数据必须报（真计算题没打标签）
// ② 喂好数据不能报（打了标签的、场景题、非计算题）
// ③ 在完整真实数据（v9，323 道）上跑一遍
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { looksNumeric, checkCalcTags } from './check-calc-tags.mjs';

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass += 1; console.log(`  ok  ${name}`); }
  catch (e) { fail += 1; console.log(`  FAIL ${name}: ${e.message}`); }
}

// 真计算题：有数值、要算结果
const calcQ = (over = {}) => ({
  id: 'x-01',
  stem: '一个卷积层输入尺寸 32×32，卷积核 3×3，无填充步幅 1，输出尺寸是多少？',
  tags: [],
  ...over,
});

// 场景题：有数字，但数字是情境描述，不是要算的量
const scenarioQ = (over = {}) => ({
  id: 'c0401-12',
  type: 'single_choice',
  stem: '有两个感知机：第一个权重 (1,1)、偏置 −0.5；第二个权重 (−1,−1)、偏置 1.5。规则都是加权和加偏置 ≥0 判正类。下列哪个点会被两者判为同一类别？',
  tags: ['单选题', '场景'],
  ...over,
});

console.log('== ① 喂坏数据必须报 ==');
t('真计算题没打标签 → 被报缺标签', () => {
  const r = checkCalcTags([calcQ()]);
  assert.equal(r.missing.length, 1, JSON.stringify(r));
});
t('场景标签优先于数字特征：打了场景就不要求计算标签', () => {
  // 这条不是"漏报"，是设计约定：规则规定场景题不许挂计算标签，
  // 所以只要带场景标签，就不再要求它补计算标签。
  const r = checkCalcTags([calcQ({ tags: ['场景'] })]);
  assert.equal(r.missing.length, 0, '场景标签应直接排除，不再要求计算标签');
});

console.log('== ② 喂好数据不能报 ==');
t('真计算题打了计算标签 → 不报', () => {
  const r = checkCalcTags([calcQ({ tags: ['计算'] })]);
  assert.equal(r.missing.length, 0, JSON.stringify(r));
});
t('场景题（有数字但不算）→ 不报', () => {
  const r = checkCalcTags([scenarioQ()]);
  assert.equal(r.missing.length, 0, '场景题被误报就是 v9 上 c0401-12 那个问题');
});
t('场景题带 type=scenario → 不报', () => {
  const r = checkCalcTags([scenarioQ({ tags: [], type: 'scenario' })]);
  assert.equal(r.missing.length, 0);
});
t('没有任何数字的题 → 不报', () => {
  const r = checkCalcTags([{ id: 'y', stem: '什么是过拟合？', tags: [] }]);
  assert.equal(r.missing.length, 0);
});
t('有数字但不要求算结果的题 → 不报', () => {
  const r = checkCalcTags([{ id: 'z', stem: '人工智能在 1956 年达特茅斯会议上正式成为学科。', tags: [] }]);
  assert.equal(r.missing.length, 0);
});

console.log('== ③ 完整真实数据集 ==');
t('v9 全部 323 道：场景题 c0401-12 不再被误报', () => {
  const lines = readFileSync('data\\questions-authoring-v9.jsonl', 'utf8')
    .split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
  const r = checkCalcTags(lines);
  const bad = r.missing.find((m) => m.id === 'c0401-12');
  assert.equal(bad, undefined, 'c0401-12 是场景题，不该再被判缺计算标签');
});
t('v9 全部 323 道：真计算题仍能被识别（不是全灭）', () => {
  const lines = readFileSync('data\\questions-authoring-v9.jsonl', 'utf8')
    .split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
  const r = checkCalcTags(lines);
  assert.ok(r.tagged >= 15, `打了计算标签且被识别出来的应有 15 道以上，实际 ${r.tagged}`);
  assert.ok(r.numericTotal >= 15, `识别出的计算题总数应 >= 15，实际 ${r.numericTotal}`);
});

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
process.exit(fail ? 1 : 0);
