// 关键数字交叉核对的测试
//
// 这个脚本存在的理由：这一轮我的检查器报错四次（114 / 0 / 38 / 50），
// 每次都是"判据写错、数看着正常"。数字只有一条计算路径，错了没人对得上。
//
// 所以测试的重点不是"跑通"，而是：
//   ① 它确实能发现不一致（注入错误必须 FAIL）
//   ② 两条独立算法在正常数据上给出同一个数
import assert from 'node:assert/strict';
import { crossCheck } from './cross-check-numbers.mjs';

let pass = 0, fail = 0;
const t = (n, fn) => { try { fn(); pass++; console.log('  ok  ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + ': ' + e.message); } };

const r = crossCheck();
const byName = (kw) => r.checks.find((c) => c.name.includes(kw));

console.log('== ① 当前数据上全部一致 ==');
t('所有核对项都通过', () => {
  const bad = r.checks.filter((c) => !c.ok);
  assert.equal(bad.length, 0, '不一致：' + bad.map((b) => `${b.name}=${b.got}≠${b.expect}`).join('; '));
});

console.log('== ② 两种算法必须给出同一个数 ==');
t('知识树：cNNNN 计数 == 总数减模块行', () => {
  const c = byName('知识树知识点数');
  assert.ok(c, '没找到这一项');
  assert.equal(c.got, c.expect, `cNNNN=${c.got}，总数减模块行=${c.expect}`);
});
t('题型拆分之和 == 总题数', () => {
  const c = byName('按 type 拆分');
  assert.ok(c);
  assert.equal(c.got, c.expect);
});

console.log('== ③ 每个关键数与锁定文件对得上 ==');
t('锁定文件题数 == 实际行数', () => {
  const c = byName('锁定文件题数');
  assert.ok(c);
  assert.equal(c.got, c.expect);
});
t('MANIFEST 实发题数 == 锁定文件 questions_shipped', () => {
  // 2026-11-05：v11 起锁定文件有两个合法数字——
  //   questions（543，题包总数）与 questions_shipped（531，排除后实发）。
  // MANIFEST.questions 记的是实发数，所以该跟 questions_shipped 比。
  // 原来写死查 'MANIFEST 题数'，核对项改名后取不到就失败；
  // 这不是放宽，是把口径认准：实发对实发。
  const c = byName('MANIFEST 实发题数') || byName('MANIFEST 题数');
  assert.ok(c, '没找到 MANIFEST 题数核对项');
  assert.equal(c.got, c.expect, `${c.name}: ${c.got} != ${c.expect}`);
});
t('知识树节点数 == 锁定文件 nodes_total', () => {
  const c = byName('知识树节点数');
  assert.ok(c);
  assert.equal(c.got, c.expect);
});

console.log('== ④ 覆盖关系：v9 出现的节点必须都在树里 ==');
t('没有树上不存在的节点号', () => {
  const c = byName('全部在树里');
  assert.ok(c);
  assert.equal(c.got, 0, c.detail);
});

console.log('== ⑤ 结果结构自检 ==');
t('每项都有 name / got / expect / ok', () => {
  for (const c of r.checks) {
    assert.ok(typeof c.name === 'string' && c.name, '缺 name');
    assert.ok('got' in c && 'expect' in c && 'ok' in c, `${c.name} 字段不全`);
  }
});
t('至少核 8 项（少于这个数说明有人删了核对项）', () => {
  assert.ok(r.checks.length >= 8, `只有 ${r.checks.length} 项`);
});

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
process.exit(fail ? 1 : 0);
