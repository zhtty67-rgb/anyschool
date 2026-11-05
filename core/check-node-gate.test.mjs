// 节点级"答不了占比"规则的双向验证（2026-11-05 降级后）
//
// 规则已从"阻断构建"降成"信息级提示"，因为判据（guessable_class 标注）本身还没定稳。
// 所以这组测试验的不再是"必须拦下"，而是三件事：
//   ① 超线的节点必须被标出来（不能漏报——漏报等于这个工具白装）
//   ② 没超线的不许乱报（乱报多了，检查器就没人看了）
//   ③ 无论哪种情况，都不许影响退出码（信息级不阻断构建）
import assert from 'node:assert/strict';
import { readFileSync, existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkNodeGate, UNANSWERABLE_LIMIT } from './check-node-gate.mjs';

let pass = 0, fail = 0;
const t = (n, fn) => { try { fn(); pass++; console.log('  ok  ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + ': ' + e.message); } };

const q = (node, cls) => ({ id: `${node}-${Math.random().toString(36).slice(2, 6)}`, nodes: [node], guessable_class: cls });

console.log('== ① 超线的节点必须被标出来 ==');
t('12 道里 7 道答不了（58%）→ 立项提示', () => {
  const qs = [];
  for (let i = 0; i < 7; i++) qs.push(q('c1103', 'unanswerable'));
  for (let i = 0; i < 3; i++) qs.push(q('c1103', 'guessable'));
  for (let i = 0; i < 2; i++) qs.push(q('c1103', 'need_knowledge'));
  const r = checkNodeGate(qs);
  assert.equal(r.flagged.length, 1, JSON.stringify(r.flagged));
  assert.equal(r.flagged[0].node, 'c1103');
  assert.equal(r.flagged[0].unanswerable, 7);
});
t('全节点答不了 → 立项提示', () => {
  const qs = Array.from({ length: 12 }, () => q('x', 'unanswerable'));
  assert.equal(checkNodeGate(qs).flagged.length, 1);
});

console.log('== ② 边界：正好 50% 不报（规则是"超过"） ==');
t('12 道里 6 道答不了（50%）→ 不报', () => {
  const qs = [];
  for (let i = 0; i < 6; i++) qs.push(q('y', 'unanswerable'));
  for (let i = 0; i < 6; i++) qs.push(q('y', 'need_knowledge'));
  const r = checkNodeGate(qs);
  assert.equal(r.flagged.length, 0, `50% 不该报，实际 ${JSON.stringify(r.flagged)}`);
});

console.log('== ③ 低比例与正常节点不能误报 ==');
t('12 道里 5 道答不了（42%）→ 不报', () => {
  const qs = [];
  for (let i = 0; i < 5; i++) qs.push(q('z', 'unanswerable'));
  for (let i = 0; i < 7; i++) qs.push(q('z', 'need_knowledge'));
  assert.equal(checkNodeGate(qs).flagged.length, 0);
});
t('全部需掌握 → 不报，且计入 passed', () => {
  const qs = Array.from({ length: 12 }, () => q('w', 'need_knowledge'));
  const r = checkNodeGate(qs);
  assert.equal(r.flagged.length, 0);
  assert.equal(r.passed.length, 1);
});
t('多节点混合：只报超线那个', () => {
  const qs = [];
  for (let i = 0; i < 12; i++) qs.push(q('bad', i < 8 ? 'unanswerable' : 'need_knowledge'));
  for (let i = 0; i < 12; i++) qs.push(q('good', 'need_knowledge'));
  const r = checkNodeGate(qs);
  assert.equal(r.flagged.length, 1);
  assert.equal(r.flagged[0].node, 'bad');
  assert.equal(r.passed.length, 1);
  assert.equal(r.passed[0].node, 'good');
});

console.log('== ④ 没标注的题不能被当成"通过" ==');
t('未标 guessable_class 的题不计入，且单独计数', () => {
  const qs = [
    { id: 'a', nodes: ['n1'] },
    { id: 'b', nodes: ['n1'] },
    { id: 'c', nodes: ['n1'], guessable_class: 'need_knowledge' },
  ];
  const r = checkNodeGate(qs);
  assert.equal(r.noClass, 2, `未标注数应为 2，实际 ${r.noClass}`);
  assert.equal(r.flagged.length, 0, '未标注不应触发提示');
});

console.log('== ⑤ 降级验证：超线也不许影响退出码 ==');
t('CLI 跑一个超线题包，退出码必须是 0', () => {
  const p = join(tmpdir(), `__gate_test_${Date.now()}.jsonl`);
  const qs = [];
  for (let i = 0; i < 9; i++) qs.push({ id: `t${i}`, nodes: ['c1103'], stem: 'x', guessable_class: 'unanswerable' });
  qs.push({ id: 't9', nodes: ['c1103'], stem: 'x', guessable_class: 'need_knowledge' });
  writeFileSync(p, qs.map((x) => JSON.stringify(x)).join('\n'), 'utf8');
  const cli = fileURLToPath(new URL('./check-node-gate.mjs', import.meta.url));
  const r = spawnSync(process.execPath, [cli, p], { encoding: 'utf8' });
  unlinkSync(p);
  assert.equal(r.status, 0, `超线时退出码应为 0（信息级），实际 ${r.status}；输出：${r.stdout}`);
  assert.match(r.stdout, /信息级/, '输出里应写明这是信息级');
});

console.log('== ⑥ 真实数据：Qbank 的 88 道三类标注 ==');
const real = 'data\\questions-m09-m11-threeway-v1.jsonl';
if (existsSync(real)) {
  t('跑通真实标注文件并能识别超线节点', () => {
    const qs = readFileSync(real, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
    assert.ok(qs.length > 0, '真实文件读出来是空的');
    const r = checkNodeGate(qs);
    console.log(`       共 ${qs.length} 道，${r.flagged.length + r.passed.length} 个节点`);
    for (const x of [...r.flagged, ...r.passed]) {
      console.log(`       ${x.node}: ${x.unanswerable}/${x.total} = ${Math.round(x.ratio * 100)}%${x.ratio > UNANSWERABLE_LIMIT ? ' ← 提示' : ''}`);
    }
    // 真实数据上的预期必须是"算出来的"，不是"记得的"：
    // 小白复核后 c1103 是 5/12 = 42%，低于 50%，本就不该被提示。
    // 若以后有人用旧口径去断言"c1103 必被拦"，这条会立刻失败——那正是要它失败的地方。
    assert.equal(
      r.flagged.some((x) => x.node === 'c1103'),
      false,
      'c1103 现为 5/12=42%，低于 50% 线，不该被提示；若被提示说明算错了',
    );
    const c1103 = [...r.flagged, ...r.passed].find((x) => x.node === 'c1103');
    assert.equal(c1103.unanswerable, 5, 'c1103 答不了应为 5 道（按表计，不含 c1103-09）');
    assert.equal(c1103.total, 12, 'c1103 总题数应为 12 道');
  });
} else {
  console.log('  skip 真实文件不存在');
}

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
process.exit(fail ? 1 : 0);
