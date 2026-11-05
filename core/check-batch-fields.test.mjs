// check-batch-fields 的测试：按 Chief 的三条规矩
// ① 喂坏数据必须报  ② 喂好数据不能报  ③ 在完整真实数据（v9，323 道）上跑
//
// 重点回归：pre-policy 是统一占位符，262 道老题全填它是对的，
// 去重规则必须排除它——否则会把老题全判成"整批复制"（Qbank 踩过这个坑）。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { auditBatchFields } from './check-batch-fields.mjs';

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass += 1; console.log(`  ok  ${name}`); }
  catch (e) { fail += 1; console.log(`  FAIL ${name}: ${e.message}`); }
}

const mk = (id, evidence, node = 'c0101') => ({
  id, nodes: [node], basis_evidence: evidence,
});

console.log('== ① 喂坏数据必须报 ==');
t('同一节点 12 道全填完全相同证据 → 报整批复制', () => {
  const qs = Array.from({ length: 12 }, (_, i) => mk(`c0101-${String(i + 1).padStart(2, '0')}`, '完全一样的一条证据文本'));
  const r = auditBatchFields(qs);
  assert.ok(r.errors.some((e) => e.code === 'EVIDENCE_BATCH_COPIED'), JSON.stringify(r.errors.map((e) => e.code)));
});
t('12 道里 8 道重复（超 30%）→ 报', () => {
  const qs = [];
  for (let i = 0; i < 8; i++) qs.push(mk(`c0101-${i}`, '重复的证据'));
  for (let i = 8; i < 12; i++) qs.push(mk(`c0101-${i}`, `第 ${i} 道独有的证据，内容各不相同`));
  const r = auditBatchFields(qs);
  assert.ok(r.errors.some((e) => e.code === 'EVIDENCE_BATCH_COPIED'));
});

console.log('== ② 喂好数据不能报 ==');
t('12 道各填不同证据 → 不报', () => {
  const qs = Array.from({ length: 12 }, (_, i) => mk(`c0101-${i}`, `第 ${i} 道题依据教材第 ${i + 1} 段的具体表述，内容各不相同`));
  const r = auditBatchFields(qs);
  assert.equal(r.errors.length, 0, JSON.stringify(r.errors));
});
t('全部填 pre-policy 的老题 → 不报（这是合法统一占位符）', () => {
  const qs = Array.from({ length: 12 }, (_, i) => mk(`c0101-${i}`, 'pre-policy'));
  const r = auditBatchFields(qs);
  assert.equal(r.errors.length, 0, 'pre-policy 是规定统一值，相同才是对的');
});
t('题数不足阈值（<3）→ 不判定', () => {
  const qs = [mk('a', '相同证据'), mk('b', '相同证据')];
  const r = auditBatchFields(qs);
  assert.equal(r.errors.length, 0);
});
t('证据里有 pre-policy 混合真证据 → pre-policy 不参与去重', () => {
  const qs = [];
  for (let i = 0; i < 6; i++) qs.push(mk(`old-${i}`, 'pre-policy'));
  for (let i = 0; i < 6; i++) qs.push(mk(`new-${i}`, `新题第 ${i} 道的独立证据文本`));
  const r = auditBatchFields(qs);
  assert.equal(r.errors.length, 0, 'pre-policy 不应被计入重复');
});

console.log('== ③ 完整真实数据集 ==');
t('v9 全部 323 道 → 0 错误', () => {
  const lines = readFileSync('data\\questions-authoring-v9.jsonl', 'utf8')
    .split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
  const r = auditBatchFields(lines);
  assert.equal(r.errors.length, 0, JSON.stringify(r.errors.slice(0, 3)));
});
t('v9 上 m05 那 60 道（真证据）不误报', () => {
  const lines = readFileSync('data\\questions-authoring-v9.jsonl', 'utf8')
    .split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
  const r = auditBatchFields(lines);
  const m05Err = r.errors.filter((e) => /^c05/.test(e.node || ''));
  assert.equal(m05Err.length, 0, `m05 五节点不应有错误，实际 ${JSON.stringify(m05Err)}`);
});

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
process.exit(fail ? 1 : 0);
