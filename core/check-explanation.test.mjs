// check-explanation 的双向验证：按群里定的三条规矩
// ① 喂坏数据必须报  ② 喂好数据不能报  ③ 在完整真实数据集上跑
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { checkExplanation } from './check-explanation.mjs';

let pass = 0, fail = 0;
const t = (n, fn) => { try { fn(); pass++; console.log('  ok  ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + ': ' + e.message); } };

const opts = ['算的是乙', '都算，因为用了计算机', '都不算，因为没实体', '算的是甲，因为更精确'];
const q = (over = {}) => ({
  id: 'c0101-02', options: opts,
  explanation: '正确答案是「算的是乙」：判据是完成任务的能力从哪来。错项「都算，因为用了计算机」不成立，因为：用计算机是任何软件的共性。',
  ...over,
});

console.log('== ① 喂坏数据必须报 ==');
t('解析里出现「对照选项：」→ 报机器标记', () => {
  const r = checkExplanation([q({ explanation: q().explanation + ' 对照选项：错项A「都算」；错项B「都不算」' })]);
  assert.ok(r.machine.length > 0, JSON.stringify(r));
});
t('解析里出现「选项A：」→ 报机器标记', () => {
  const r = checkExplanation([q({ explanation: '正确答案是 选项A：算的是乙' })]);
  assert.ok(r.machine.length > 0);
});
t('引用的错项在 options 里找不到 → 报', () => {
  const r = checkExplanation([q({ explanation: '错项「一个根本不存在的选项文本」不成立，因为：xxxxx' })]);
  assert.ok(r.missing.length > 0, JSON.stringify(r));
});
t('字母指代与实际答案不符 → 报（学生按解析会做错）', () => {
  // 本文件的 opts 里 A 是「算的是乙」、C 是「都不算，因为没实体」。
  // 设正确答案为 C，解析却写"正确答案是 A"——字母指向的选项不是答案，必须报。
  const r = checkExplanation([{
    id: 'x', options: opts, answer: 'C', answer_text: '都不算，因为没实体',
    explanation: '正确答案是 A：因为……',
  }]);
  assert.ok(r.letterMismatch.length > 0, JSON.stringify(r));
});

console.log('== ② 喂好数据不能报 ==');
t('正常解析（引用真实选项）→ 不报', () => {
  const r = checkExplanation([q()]);
  assert.equal(r.machine.length, 0, JSON.stringify(r.machine));
  assert.equal(r.missing.length, 0, JSON.stringify(r.missing));
});
t('字母指代与实际答案一致 → 不报', () => {
  const r = checkExplanation([{
    id: 'x', options: opts, answer: 'C', answer_text: '算的是乙',
    explanation: '正确答案是 C：因为能力从数据里学来。',
  }]);
  assert.equal(r.letterMismatch.length, 0, JSON.stringify(r.letterMismatch));
});
t('解析完全不用字母指代 → 不报', () => {
  const r = checkExplanation([q({ explanation: '答案是把能力从数据里学出来的那个。错项「都算，因为用了计算机」不成立。' })]);
  assert.equal(r.letterMismatch.length, 0);
});
t('无解析的题 → 跳过，不报', () => {
  const r = checkExplanation([{ id: 'x', options: opts, explanation: '' }]);
  assert.equal(r.machine.length + r.missing.length + r.letterMismatch.length, 0);
  assert.equal(r.checked, 0);
});

console.log('== ③ 完整真实数据集 ==');
for (const p of [
  'data\\questions-authoring-v10.jsonl',
  'data\\questions-ai-c0101-rewrite-v1.jsonl',
]) {
  if (!existsSync(p)) { console.log(`  skip  ${p}（不存在）`); continue; }
  t(`跑通 ${p.split('\\').pop()}`, () => {
    const qs = readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
    const r = checkExplanation(qs);
    console.log(`       共 ${r.total} 道，有解析 ${r.checked} 道；机器标记 ${r.machine.length} 道，引用对不上 ${r.missing.length} 道`);
    // 不强制 0，只要求能跑通并给出结果；真实数据的具体数量在群里报
    assert.ok(r.total > 0);
  });
}

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
process.exit(fail ? 1 : 0);
