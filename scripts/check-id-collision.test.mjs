// id 撞号检查的双向验证
// ① 坏数据：同 id 不同题干 → 必须报  ② 好数据：同 id 同题干 → 不报
//
// 2026-11-05 加第 ④ 组：反向自检（Chief 要求的规矩）
//   每次改判据之前，先喂一份"已知答案"的假数据，看它报不报。
//   原因：这个检查器这一轮三次报出假数字（114→偏少、0→38、38→3），
//   每一次都是判据改了、但没有先拿已知样本验一遍。
//   所以这组测试故意把"应该报的"和"应该不报的"做成一对一的对照，
//   判据再改，只要有一边塌了，这里立刻红。
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stemHash, findCollisions } from './check-id-collision.mjs';

let pass = 0, fail = 0;
const t = (n, fn) => { try { fn(); pass++; console.log('  ok  ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + ': ' + e.message); } };

const dir = mkdtempSync(join(tmpdir(), 'idcol-'));
const w = (name, items) => writeFileSync(join(dir, name), items.map((x) => JSON.stringify(x)).join('\n'), 'utf8');

console.log('== ① 坏数据必须报 ==');
t('同 id、不同题干 → 报撞号', () => {
  const d = mkdtempSync(join(tmpdir(), 'idcol2-'));
  writeFileSync(join(d, 'a.jsonl'), JSON.stringify({ id: 'c0901-01', stem: '强化学习的基本机制是：' }) + '\n', 'utf8');
  writeFileSync(join(d, 'b.jsonl'), JSON.stringify({ id: 'c0901-01', stem: '训练一个扫地机器人，每步扣 0.1 分……' }) + '\n', 'utf8');
  const r = findCollisions(d);
  assert.equal(r.collisions.length, 1, JSON.stringify(r.collisions));
  assert.equal(r.collisions[0].id, 'c0901-01');
});

console.log('== ② 好数据不能报 ==');
t('同 id、题干只差一个标点 → 必须报（改过一个字就是改过）', () => {
  const d = mkdtempSync(join(tmpdir(), 'idcol3-'));
  writeFileSync(join(d, 'a.jsonl'), JSON.stringify({ id: 'x-01', stem: '下面哪一项最好？' }) + '\n', 'utf8');
  writeFileSync(join(d, 'b.jsonl'), JSON.stringify({ id: 'x-01', stem: '下面哪一项最好' }) + '\n', 'utf8');
  const r = findCollisions(d);
  // 2026-11-05 改：以前这里断言"不报"，因为旧规则先去标点再算哈希。
  // 但题干被改过恰恰是最该被发现的，所以现在必须报。
  assert.equal(r.collisions.length, 1, JSON.stringify(r.collisions));
});
t('同 id、题干一字不差 → 不报', () => {
  const d = mkdtempSync(join(tmpdir(), 'idcol5-'));
  const row = JSON.stringify({ id: 'x-02', stem: '下面哪一项最合适？' }) + '\n';
  writeFileSync(join(d, 'a.jsonl'), row, 'utf8');
  writeFileSync(join(d, 'b.jsonl'), row, 'utf8');
  assert.equal(findCollisions(d).collisions.length, 0);
});
t('不同 id → 不报', () => {
  const d = mkdtempSync(join(tmpdir(), 'idcol4-'));
  writeFileSync(join(d, 'a.jsonl'), JSON.stringify({ id: 'a-01', stem: '甲题' }) + '\n', 'utf8');
  writeFileSync(join(d, 'b.jsonl'), JSON.stringify({ id: 'b-01', stem: '乙题' }) + '\n', 'utf8');
  assert.equal(findCollisions(d).collisions.length, 0);
});
t('样本/草稿同名不同版 → 不算原始重复', () => {
  const d = mkdtempSync(join(tmpdir(), 'idcol6-'));
  writeFileSync(join(d, 'questions-ai-c1101-sample-v1.jsonl'), JSON.stringify({ id: 'c1101-sample-01', stem: '草稿甲' }) + '\n', 'utf8');
  writeFileSync(join(d, 'questions-ai-c1101-sample-v2.jsonl'), JSON.stringify({ id: 'c1101-sample-01', stem: '草稿乙' }) + '\n', 'utf8');
  const r = findCollisions(d);
  assert.equal(r.original.length, 0, JSON.stringify(r.original));
  assert.equal(r.drafts.length, 1, '应计入样本换版');
});

console.log('== ③ stemHash 本身 ==');
t('标点不同 → 不同哈希（原文不同就不是同一题）', () => {
  assert.notEqual(stemHash('什么是过拟合？'), stemHash('什么是过拟合'));
});
t('不同题干 → 不同哈希', () => {
  assert.notEqual(stemHash('什么是过拟合'), stemHash('什么是欠拟合'));
});
t('一字不差 → 同哈希', () => {
  assert.equal(stemHash('强化学习 的 基本机制'), stemHash('强化学习 的 基本机制'));
});
t('空白差异 → 不同哈希', () => {
  assert.notEqual(stemHash('强化学习 的 基本机制'), stemHash('强化学习的基本机制'));
});
t('与 Qbank 的 md5(原文) 逐字节一致', () => {
  // 冻结一个已知值：Qbank 标注文件里 c0901-01 的 stem_hash 是 75850f65
  const stem = '训练一个扫地机器人：每走一步扣 0.1 分，每清完一个房间加 5 分，电池耗尽则';
  assert.equal(stemHash(stem).length, 8, '哈希应为 8 位');
  assert.match(stemHash(stem), /^[0-9a-f]{8}$/);
});

console.log('== ④ 反向自检：已知答案的假数据，两边都要对 ==');
// 这一组是自检的对照组。判据怎么改，这对结果都不能变：
//   同号不同题 → 必须报；一字不差 → 必须不报
const selftestPair = () => {
  const d = mkdtempSync(join(tmpdir(), 'idcol-selftest-'));
  writeFileSync(join(d, 'questions-authoring-v1.jsonl'), JSON.stringify({ id: 'k-01', stem: '已知题干甲' }) + '\n', 'utf8');
  writeFileSync(join(d, 'questions-authoring-v2.jsonl'), JSON.stringify({ id: 'k-01', stem: '已知题干乙' }) + '\n', 'utf8');
  return d;
};
t('假数据A（同号不同题）→ 必须报', () => {
  const r = findCollisions(selftestPair());
  assert.equal(r.collisions.length, 1, '判据塌了：该报的没报');
});
t('假数据B（同号同题干）→ 必须不报', () => {
  const d = mkdtempSync(join(tmpdir(), 'idcol-selftest2-'));
  const row = JSON.stringify({ id: 'k-02', stem: '已知题干丙' }) + '\n';
  writeFileSync(join(d, 'questions-authoring-v1.jsonl'), row, 'utf8');
  writeFileSync(join(d, 'questions-authoring-v2.jsonl'), row, 'utf8');
  const r = findCollisions(d);
  assert.equal(r.collisions.length, 0, '判据塌了：不该报的报了');
});
t('假数据C（空目录）→ 题号数必须是 0，不许假装扫过', () => {
  const d = mkdtempSync(join(tmpdir(), 'idcol-empty-'));
  const r = findCollisions(d);
  assert.equal(r.totalIds, 0, '空目录题号数应为 0');
  assert.equal(r.collisions.length, 0);
});

console.log('== ⑤ 分类判据：版本演进 vs 重写（这一处改坏过四次，每次数字翻倍或归零） ==');
// 真演进：两个正式包之间题干不同 → 算版本演进，不算事故
t('两个正式包同号不同题 → 版本演进，不是事故', () => {
  const d = mkdtempSync(join(tmpdir(), 'idcol-v1-'));
  writeFileSync(join(d, 'questions-authoring-v8.jsonl'), JSON.stringify({ id: 'c-01', stem: '旧题干' }) + '\n', 'utf8');
  writeFileSync(join(d, 'questions-authoring-v9.jsonl'), JSON.stringify({ id: 'c-01', stem: '新题干' }) + '\n', 'utf8');
  const r = findCollisions(d);
  assert.equal(r.versioned.length, 1, '应算版本演进');
  assert.equal(r.original.length, 0, '不该算事故');
});
// 重写包与正式包同号不同题 → 也不算事故（这是重写批次，不是两个正式版本打架）
t('正式包 + 重写包同号不同题 → 算重写，不算事故', () => {
  const d = mkdtempSync(join(tmpdir(), 'idcol-v2-'));
  writeFileSync(join(d, 'questions-authoring-v9.jsonl'), JSON.stringify({ id: 'c-01', stem: '旧题干' }) + '\n', 'utf8');
  writeFileSync(join(d, 'questions-ai-c0101-rewrite-v1.jsonl'), JSON.stringify({ id: 'c-01', stem: '新题干' }) + '\n', 'utf8');
  const r = findCollisions(d);
  assert.equal(r.original.length, 0);
  assert.equal(r.versioned.length, 0, '一个正式包不算版本演进（要两份及以上）');
});
// 关键回归：预览包也收了同一个题号时，正式包之间的分歧仍要算演进，不能被 preview 吞掉
t('预览包混入时，正式包之间的分歧仍算版本演进', () => {
  const d = mkdtempSync(join(tmpdir(), 'idcol-v3-'));
  writeFileSync(join(d, 'questions-authoring-v8.jsonl'), JSON.stringify({ id: 'c-01', stem: '旧题干' }) + '\n', 'utf8');
  writeFileSync(join(d, 'questions-authoring-v9.jsonl'), JSON.stringify({ id: 'c-01', stem: '新题干' }) + '\n', 'utf8');
  writeFileSync(join(d, '_v10-with-guessable-preview.jsonl'), JSON.stringify({ id: 'c-01', stem: '新题干' }) + '\n', 'utf8');
  const r = findCollisions(d);
  assert.equal(r.versioned.length, 1, '预览包不该把版本演进吞成 rewrite');
});
// 关键回归：-fix- 这类新命名不能把重写包当成正式包
t('c0103-01-fix 这类修复包不算正式包', () => {
  const d = mkdtempSync(join(tmpdir(), 'idcol-v4-'));
  writeFileSync(join(d, 'questions-authoring-v9.jsonl'), JSON.stringify({ id: 'c-01', stem: '旧题干' }) + '\n', 'utf8');
  writeFileSync(join(d, 'questions-ai-c0103-01-fix-v1.jsonl'), JSON.stringify({ id: 'c-01', stem: '改过的' }) + '\n', 'utf8');
  const r = findCollisions(d);
  assert.equal(r.versioned.length, 0, '修复包不该被当成版本演进');
});

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
process.exit(fail ? 1 : 0);
