// m04 计算题严格复算 —— 按题干给的参数独立算，跟题里的答案比。
import { readFileSync } from 'node:fs';
import { parseAnswerKey } from '../core/grade.mjs';

const PACK = 'data\\questions-ai-m04-v1.jsonl';
const qs = readFileSync(PACK, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
const byId = new Map(qs.map((q) => [q.id, q]));

const sigmoid = (x) => 1 / (1 + Math.exp(-x));
const relu = (x) => Math.max(0, x);

let pass = 0;
let fail = 0;

function verify(id, computed, expected, note) {
  const q = byId.get(id);
  if (!q) { console.log(`  跳过 ${id}（不存在）`); return; }
  const ans = parseAnswerKey(q.answer)[0];
  const ansText = q.options[ans.charCodeAt(0) - 65];
  const ok =
    (typeof expected === 'string' && String(ansText).includes(expected)) ||
    (typeof computed === 'number' && Math.abs(computed - expected) < 1e-2 && String(ansText).includes(String(expected)));
  if (ok) pass += 1; else fail += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${id}`);
  console.log(`       我算：${computed}${typeof expected === 'number' ? ` （题里写 ${expected}）` : ''}`);
  console.log(`       答案：${ans}. ${ansText}`);
  if (note) console.log(`       说明：${note}`);
}

console.log('== 逐道复算 ==\n');

// c0401-03：w=(0.5,1.0), b=-1, x=(1,2) → 0.5*1+1.0*2-1
verify('c0401-03', 0.5 * 1 + 1.0 * 2 - 1, 1.5, '0.5×1 + 1.0×2 − 1 = 1.5 ≥ 0 判正类');

// c0401-12：两感知机，找被两者判为相同类别的点
{
  const s1 = (x, y) => x + y - 0.5;   // 权重 (1,1) 偏置 -0.5
  const s2 = (x, y) => -x - y + 1.5;  // 权重 (-1,-1) 偏置 1.5
  const pts = { A: [0, 0], B: [2, 2], C: [3, 0], D: [1, 0] };
  const same = [];
  for (const [k, [x, y]] of Object.entries(pts)) {
    const a = s1(x, y) >= 0, b = s2(x, y) >= 0;
    console.log(`   点${k}(${x},${y})：式1=${s1(x, y).toFixed(2)} 判${a ? '正' : '负'}，式2=${s2(x, y).toFixed(2)} 判${b ? '正' : '负'} → ${a === b ? '相同' : '相反'}`);
    if (a === b) same.push(k);
  }
  const q = byId.get('c0401-12');
  const ans = parseAnswerKey(q.answer)[0];
  const ok = same.length === 1 && same[0] === ans;
  if (ok) pass += 1; else fail += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} c0401-12：唯一相同的点是 ${same.join(',') || '无'}，答案 ${ans}`);
}

// c0402-06：4→3→2 全连接含偏置，参数 = 4*3+3 + 3*2+2
{
  const p = 4 * 3 + 3 + 3 * 2 + 2;
  verify('c0402-06', p, 23, '输入隐藏 12 + 隐藏偏置 3 + 隐藏输出 6 + 输出偏置 2 = 23');
}

// c0403-04：sigmoid(0)
verify('c0403-04', sigmoid(0), 0.5, 'sigmoid(0) = 1/(1+e^0) = 0.5');

// c0403-05：ReLU(-3)
verify('c0403-05', relu(-3), 0, 'ReLU(x)=max(0,x)，负数输出 0');

// c0405-05：z=2*1=2, a=sigmoid(2), L=(a-y)^2/2, y=1
// dL/dw = (a-y)*a*(1-a)*x
{
  const w = 2, x = 1, y = 1;
  const z = w * x;
  const a = sigmoid(z);
  const L = ((a - y) ** 2) / 2;
  const dLdw = (a - y) * a * (1 - a) * x;
  console.log(`   复算：a=${a.toFixed(4)}, L=${L.toFixed(5)}, dL/dw=${dLdw.toFixed(5)}`);
  const q = byId.get('c0405-05');
  const ans = parseAnswerKey(q.answer)[0];
  const ansText = q.options[ans.charCodeAt(0) - 65];
  const m = String(ansText).match(/[−-]?0\.\d+/);
  const claimed = m ? parseFloat(m[0].replace('−', '-')) : NaN;
  const ok = Math.abs(dLdw - claimed) < 0.005;
  if (ok) pass += 1; else fail += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} c0405-05：我算 ${dLdw.toFixed(5)}，答案「${ansText}」`);
}

console.log(`\n复算结果：通过 ${pass}，不通过 ${fail}`);
if (fail) process.exitCode = 1;
