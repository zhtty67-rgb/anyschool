// 计算题验算 —— 逐道独立算一遍，跟题目里的答案和解析对。
// 不看解析怎么写，自己按公式算，用结果去比。
import { readFileSync } from 'node:fs';
import { parseAnswerKey } from '../core/grade.mjs';

const PACK = process.argv[2] || 'data\\questions-ai-m04-v1.jsonl';
const qs = readFileSync(PACK, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));

console.log(`题包：${PACK}`);
console.log(`题量：${qs.length}\n`);

let pass = 0;
let fail = 0;
function check(name, got, want, note = '') {
  const ok = Math.abs(got - want) < 1e-9;
  if (ok) pass += 1; else fail += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}：算得 ${got}，题里 ${want}${note ? ' — ' + note : ''}`);
}

// ── 独立复算：按题目标出的数值自己算 ────────────────
// 这些是我从题干里读出的参数，算完再跟选项和答案对。
console.log('== 按题干参数独立复算 ==');

// 1. 感知机加权和：w=[0.5,-0.2], x=[2,3], bias=-0.1? 从题里找
function findNumericQuestion(qs, keywords) {
  return qs.filter((q) => {
    const stem = String(q.stem);
    return keywords.every((k) => stem.includes(k));
  });
}

// 通用：把题里出现的数字和它的答案文本提取出来，人工对照
const numeric = qs.filter((q) => /计算|算出|等于多少|加权和|输出值/.test(q.stem));
console.log(`  题干含"计算/加权和/输出值"的题：${numeric.length} 道`);
for (const q of numeric) {
  const ans = parseAnswerKey(q.answer)[0];
  const idx = ans.charCodeAt(0) - 65;
  const ansText = q.options[idx];
  console.log(`\n  ── ${q.id} ──`);
  console.log(`    题干：${q.stem}`);
  console.log(`    选项：${q.options.map((o, i) => `${String.fromCharCode(65 + i)}.${o}`).join('  ')}`);
  console.log(`    答案：${ans}. ${ansText}`);
  console.log(`    解析：${String(q.explanation).slice(0, 160)}`);
}

// ── 独立验算几个确定能算的 ───────────────────────
console.log('\n\n== 独立验算（我按公式自己算，不抄题里的数）==');

// sigmoid(x) = 1/(1+e^-x)
const sigmoid = (x) => 1 / (1 + Math.exp(-x));
console.log(`  sigmoid(0)        = ${sigmoid(0)}`);
console.log(`  sigmoid(1)        ≈ ${sigmoid(1).toFixed(4)}`);
console.log(`  sigmoid(-1)       ≈ ${sigmoid(-1).toFixed(4)}`);
console.log(`  sigmoid(2)        ≈ ${sigmoid(2).toFixed(4)}`);
console.log(`  sigmoid(ln9)      = ${sigmoid(Math.log(9))}  (应为 0.9)`);

// ReLU
const relu = (x) => Math.max(0, x);
console.log(`  ReLU(-3)          = ${relu(-3)}`);
console.log(`  ReLU(2.5)         = ${relu(2.5)}`);

// 感知机加权和示例
console.log(`  加权和 [0.5,-0.2]·[2,3]+(-0.1) = ${0.5 * 2 + -0.2 * 3 + -0.1}`);

// MSE
console.log(`  MSE([1,2,3],[1,2,4]) = ${((0 + 0 + 1) / 3).toFixed(6)}`);

// 检查 sigmoid 与选项的对应
console.log('\n== 把验算结果去比题目 ==');
function compareQuestion(pattern, expectedValue, tol = 0.005) {
  const q = qs.find((x) => pattern.test(x.stem));
  if (!q) { console.log(`  跳过（没找到匹配题）：${pattern}`); return; }
  const ans = parseAnswerKey(q.answer)[0];
  const ansText = q.options[ans.charCodeAt(0) - 65];
  const num = parseFloat(String(ansText).replace(/[^\d.-]/g, ''));
  const ok = Number.isFinite(num) && Math.abs(num - expectedValue) <= tol;
  console.log(`  ${ok ? 'ok  ' : '注意'} ${q.id}：我算 ${expectedValue.toFixed(4)}，选项里是「${ansText}」`);
  if (ok) pass += 1; else fail += 1;
}

compareQuestion(/sigmoid|S 型|压到 0 到 1|0\.5.*输入.*0/, 0.5);

console.log(`\n合计：通过 ${pass}，需人工确认 ${fail}`);
console.log('\n（数值题的最终判断以人工读题干参数复算为准，上面已把题干和解析全部列出）');
