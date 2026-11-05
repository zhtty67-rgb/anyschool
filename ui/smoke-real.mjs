// 用第一批真实题跑通 UI 与掌握度链路。
// node ui/smoke-real.mjs
import { readFileSync, existsSync } from 'node:fs';
import { parseTree } from '../core/tree.mjs';
import { masteryOfTree, masteryOfNode, pickNext } from '../core/mastery.mjs';
import { grade, parseAnswerKey } from '../core/grade.mjs';
import { checkPack } from '../core/check-pack.mjs';

const PACK = process.argv[2] || 'data\\questions-authoring-stage12-v1.jsonl';

if (!existsSync(PACK)) {
  console.error(`题包不存在：${PACK}`);
  process.exit(2);
}

const tree = parseTree();
const questions = readFileSync(PACK, 'utf8').split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));

console.log(`题包：${PACK}`);
console.log(`题量：${questions.length}`);
console.log(`概念树：${tree.total} 个概念\n`);

// —— 1. 格式检查 ——
console.log('== 1. 格式检查 ==');
const chk = checkPack(PACK);
const errByCode = {};
for (const e of chk.errors) errByCode[e.code] = (errByCode[e.code] || 0) + 1;
const warnByCode = {};
for (const w of chk.warnings) warnByCode[w.code] = (warnByCode[w.code] || 0) + 1;
console.log(`错误 ${chk.errors.length}：${JSON.stringify(errByCode)}`);
console.log(`警告 ${chk.warnings.length}：${JSON.stringify(warnByCode)}`);
console.log(`类型分布：${JSON.stringify(chk.stats.byType)}`);
console.log(`节点分布：${JSON.stringify(chk.stats.byNode)}`);

// —— 2. 判题 ——
console.log('\n== 2. 判题（标准答案当作答必须全对）==');
let gradeBad = 0;
for (const q of questions) {
  if (!grade(q, q.answer).correct) {
    gradeBad += 1;
    console.log(`  判错：${q.id}`);
  }
}
console.log(gradeBad === 0 ? '  全部正确' : `  ${gradeBad} 道出错`);

// 模拟答错：每道题换一个错误选项，必须判错
let wrongBad = 0;
for (const q of questions) {
  const expected = parseAnswerKey(q.answer);
  const other = ['A', 'B', 'C', 'D', 'E']
    .slice(0, q.options.length)
    .find((l) => !expected.includes(l));
  if (other && grade(q, other).correct) {
    wrongBad += 1;
    console.log(`  错答被判对：${q.id}`);
  }
}
console.log(wrongBad === 0 ? '  错答全部判错' : `  ${wrongBad} 道错答被判对`);

// —— 3. 掌握度：模拟一次完整学习 ——
console.log('\n== 3. 掌握度（模拟学生每个节点做 5 题，答对率 80%）==');
const coveredNodes = [...new Set(questions.flatMap((q) => q.nodes))];
const records = [];
let t = Date.parse('2026-11-04T09:00:00Z');
for (const node of coveredNodes) {
  const pool = questions.filter((q) => q.nodes.includes(node));
  pool.slice(0, 5).forEach((q, i) => {
    records.push({
      questionId: q.id,
      nodeCode: node,
      correct: i !== 1, // 第 2 题错，其余对 => 4/5
      at: new Date(t + records.length * 3600e3).toISOString(),
    });
  });
}

const result = masteryOfTree(tree.concepts, records);
console.log(`  汇总：总数 ${result.summary.total}，已掌握 ${result.summary.mastered}，在学 ${result.summary.learning}，薄弱 ${result.summary.weak}，未开始 ${result.summary.unknown}`);
console.log(`  覆盖率 ${(result.summary.coverage * 100).toFixed(1)}%`);
for (const n of result.nodes.filter((x) => x.mastery.score != null)) {
  console.log(`    ${n.code} ${n.name}: ${Math.round(n.mastery.score * 100)}% (${n.mastery.state}, ${n.mastery.samples} 次)`);
}
console.log(`  推荐下一步：${result.nextUp ? `${result.nextUp.code} ${result.nextUp.name} — ${result.nextUp.reason}` : '无'}`);

// —— 4. 边界：样本不足 ——
console.log('\n== 4. 边界：只做 2 题不给百分比 ==');
const two = records.filter((r) => r.nodeCode === coveredNodes[0]).slice(0, 2);
const m2 = masteryOfNode(two);
console.log(`  ${coveredNodes[0]}：state=${m2.state}, score=${m2.score}（应为 unknown / null）`);

// —— 5. 结论 ——
console.log('\n== 结论 ==');
const blocker = chk.errors.length > 0;
console.log(`  格式：${blocker ? '不通过，有 ' + chk.errors.length + ' 个错误' : '通过'}`);
console.log(`  判题：${gradeBad === 0 && wrongBad === 0 ? '通过' : '不通过'}`);
console.log(`  掌握度：${result.summary.coverage > 0 ? '跑起来了，覆盖 ' + coveredNodes.length + ' 个节点' : '没有可算的节点'}`);
console.log(`  UI：可以用这 ${questions.length} 道替换 mock（${coveredNodes.length} 个节点有题，其余 ${tree.total - coveredNodes.length} 个节点显示"无题"）`);

if (blocker) process.exitCode = 1;
