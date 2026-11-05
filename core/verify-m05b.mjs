// m05 计算题复算（按题干定位，不猜题号）
import { readFileSync } from 'node:fs';
import { parseAnswerKey } from '../core/grade.mjs';

const qs = readFileSync('data\\questions-ai-m05-v1.jsonl', 'utf8')
  .split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
const byId = new Map(qs.map((q) => [q.id, q]));

let pass = 0;
let fail = 0;
const show = (id) => {
  const q = byId.get(id);
  const a = parseAnswerKey(q.answer)[0];
  return `答案 ${a}. ${q.options[a.charCodeAt(0) - 65]}`;
};

function check(id, mine, note) {
  const q = byId.get(id);
  if (!q) { console.log(`  跳过 ${id}`); return; }
  const a = parseAnswerKey(q.answer)[0];
  const text = String(q.options[a.charCodeAt(0) - 65]);
  const okNorm = (s) => String(s).replace(/−/g, '-').replace(/\s/g, '');
  const ok = okNorm(text).includes(okNorm(mine));
  if (ok) pass += 1; else fail += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${id}`);
  console.log(`       题干：${q.stem.slice(0, 60)}`);
  console.log(`       我算：${mine}`);
  console.log(`       ${show(id)}`);
  if (note) console.log(`       依据：${note}`);
  return ok;
}

console.log('== 卷积输出尺寸：floor((H + 2P − K) / S) + 1 ==\n');

// c0502-04: 32×32, K=3, P=1, S=1
check('c0502-04', `${Math.floor((32 + 2 * 1 - 3) / 1) + 1}×${Math.floor((32 + 2 * 1 - 3) / 1) + 1}`,
  '(32+2×1−3)/1+1 = 32');

// c0502-05: 32×32, K=3, P=0, S=2
check('c0502-05', `${Math.floor((32 + 0 - 3) / 2) + 1}×${Math.floor((32 + 0 - 3) / 2) + 1}`,
  '(32−3)/2+1 = 14.5→14+1 = 15');

// c0502-06: 3 通道, 16 个 3×3, 含偏置
check('c0502-06', String(3 * 3 * 3 * 16 + 16), '3×3×3×16 + 16 = 448');

// c0502-09: 32×32 做 2×2 步幅 2 池化 → 16×16（判断题，答"正确"）
{
  const q = byId.get('c0502-09');
  const out = Math.floor((32 - 2) / 2) + 1;
  const a = parseAnswerKey(q.answer)[0];
  const isRight = a === 'A';
  const ok = out === 16 && isRight;
  if (ok) pass += 1; else fail += 1;
  console.log(`\n  ${ok ? 'ok  ' : 'FAIL'} c0502-09`);
  console.log(`       我算：(32−2)/2+1 = ${out}×${out}，所以该判「${out === 16 ? '正确' : '错误'}」`);
  console.log(`       ${show('c0502-09')}`);
}

// c0503-07: 隐藏 64，输入 32，拼接后 → 64×(64+32)
check('c0503-07', '64×96', '隐藏态与输入拼接 = 64+32 = 96 维，输出 64 维 → 形状 64×96');

console.log('\n== 批归一化：(x − mean) / std（这里 std 用总体标准差）==\n');

// c0505-03: 3,5,7
{
  const xs = [3, 5, 7];
  const mean = xs.reduce((a, b) => a + b) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
  const out = xs.map((x) => +((x - mean) / sd).toFixed(2));
  console.log(`  均值 ${mean}，标准差 ${sd.toFixed(4)}`);
  check('c0505-03', `(${out[0]}, ${out[1]}, ${out[2]})`.replace(/-/g, '−'),
    '3,5,7 → mean 5, sd 1.633 → (−1.22, 0, 1.22)');
}

// c0505-10: 2,4,6,8 第一个值
{
  const xs = [2, 4, 6, 8];
  const mean = xs.reduce((a, b) => a + b) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
  const first = +((xs[0] - mean) / sd).toFixed(2);
  console.log(`\n  均值 ${mean}，标准差 ${sd.toFixed(4)}`);
  check('c0505-10', String(first).replace('-', '−'),
    '2,4,6,8 → mean 5, sd 2.236 → (2−5)/2.236 = −1.34');
}

console.log(`\n复算：通过 ${pass}，不通过 ${fail}`);
if (fail) process.exitCode = 1;
