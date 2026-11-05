// 排除清单的双向验证
//
// 这个文件接在两处最容易"静默出错"的地方上：
//   ① 清单读不到 / 理由缺项 —— 必须报错，不能当成"没有排除"
//   ② 生效版本判错 —— v9 上不该去 c1103 的题，v10 上必须去
// 两次都出现过同一类事故：出错时输出仍然"看起来正常"，只是全错。
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadExcluded, activeFor, filterExcluded, versionNum } from './excluded-nodes.mjs';

let pass = 0, fail = 0;
const t = (n, fn) => { try { fn(); pass++; console.log('  ok  ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + ': ' + e.message); } };
const mk = (obj) => {
  const p = join(mkdtempSync(join(tmpdir(), 'excl-')), 'excluded-nodes.json');
  writeFileSync(p, JSON.stringify(obj), 'utf8');
  return p;
};
const GOOD = {
  node: 'c1103', reason: '前置缺失', decided_by: 'Chief', decided_at: '2026-11-05', evidence: '小白原话',
};

console.log('== ① 清单缺失必须报错，不能当成"没有排除" ==');
t('文件不存在 → 抛错', () => {
  assert.throws(() => loadExcluded('D:\\__不存在__\\excluded-nodes.json'), /排除清单缺失/);
});
t('空清单（excluded: []）→ 正常通过，nodes 为空', () => {
  const r = loadExcluded(mk({ excluded: [] }));
  assert.equal(r.nodes.size, 0);
});
t('JSON 坏了 → 抛错', () => {
  const p = join(mkdtempSync(join(tmpdir(), 'excl-')), 'bad.json');
  writeFileSync(p, '{ 不是 json', 'utf8');
  assert.throws(() => loadExcluded(p), /不是合法 JSON/);
});

console.log('== ② 无理由的排除必须拒绝 ==');
for (const k of ['node', 'reason', 'decided_by', 'decided_at', 'evidence']) {
  t(`缺 ${k} → 抛错`, () => {
    const e = { ...GOOD };
    delete e[k];
    assert.throws(() => loadExcluded(mk({ excluded: [e] })), new RegExp(`缺少 ${k}`));
  });
}
t('effective_from 写错格式 → 抛错（否则这条永远不生效且没人知道）', () => {
  assert.throws(() => loadExcluded(mk({ excluded: [{ ...GOOD, effective_from: '第10版' }] })), /effective_from/);
});

console.log('== ③ 生效版本判定 ==');
t('不写 effective_from → 立即生效', () => {
  const r = activeFor(loadExcluded(mk({ excluded: [GOOD] })), 'v9');
  assert.deepEqual([...r.nodes], ['c1103']);
});
t('effective_from=v10，构建 v9 → 不生效、进 pending', () => {
  const r = activeFor(loadExcluded(mk({ excluded: [{ ...GOOD, effective_from: 'v10' }] })), 'v9');
  assert.equal(r.nodes.size, 0, 'v9 上不该生效');
  assert.equal(r.pending.length, 1);
});
t('effective_from=v10，构建 v10 → 生效', () => {
  const r = activeFor(loadExcluded(mk({ excluded: [{ ...GOOD, effective_from: 'v10' }] })), 'v10');
  assert.deepEqual([...r.nodes], ['c1103']);
  assert.equal(r.pending.length, 0);
});
t('effective_from=v10，构建 v11 → 仍然生效（不回溯撤销）', () => {
  const r = activeFor(loadExcluded(mk({ excluded: [{ ...GOOD, effective_from: 'v10' }] })), 'v11');
  assert.deepEqual([...r.nodes], ['c1103']);
});
t('版本号认不出（如 "local"）→ 宁可按生效算，不放过', () => {
  const r = activeFor(loadExcluded(mk({ excluded: [{ ...GOOD, effective_from: 'v10' }] })), 'local');
  assert.deepEqual([...r.nodes], ['c1103']);
});
t('versionNum 基本解析', () => {
  assert.equal(versionNum('v9'), 9);
  assert.equal(versionNum('V10'), 10);
  assert.equal(versionNum('9'), null);
  assert.equal(versionNum(''), null);
});

console.log('== ④ 去题：一个节点命中，整道题都去掉 ==');
t('多挂节点题只要命中一个就整题去掉', () => {
  const qs = [
    { id: 'a', nodes: ['c1103'] },
    { id: 'b', nodes: ['c1103', 'c0903'] },
    { id: 'c', nodes: ['c0903'] },
  ];
  const r = filterExcluded(qs, new Set(['c1103']));
  assert.deepEqual(r.kept.map((q) => q.id), ['c']);
  assert.deepEqual(r.dropped.map((q) => q.id), ['a', 'b']);
});
t('空排除集 → 一道都不动', () => {
  const qs = [{ id: 'a', nodes: ['c1103'] }];
  assert.equal(filterExcluded(qs, new Set()).kept.length, 1);
});

console.log('== ⑤ 真实清单 ==');
t('项目里的 excluded-nodes.json 合法，且 c1103 标了 v10 起生效', () => {
  const f = loadExcluded();
  assert.ok(f.all.length >= 1, '真实清单不该是空的');
  const e = f.all.find((x) => x.node === 'c1103');
  assert.ok(e, '真实清单里应有 c1103');
  assert.equal(e.effective_from, 'v10');
});

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
process.exit(fail ? 1 : 0);
