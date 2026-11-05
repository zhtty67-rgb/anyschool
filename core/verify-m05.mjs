// m05 计算题复算 —— 按题干参数独立算，跟题里的答案比
import { readFileSync } from 'node:fs';
import { parseAnswerKey } from '../core/grade.mjs';

const PACK = 'data\\questions-ai-m05-v1.jsonl';
const qs = readFileSync(PACK, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
const byId = new Map(qs.map((q) => [q.id, q]));

let pass = 0;
let fail = 0;

function verify(id, computed, desc) {
  const q = byId.get(id);
  if (!q) { console.log(`  跳过 ${id}（不存在）`); return; }
  const ans = parseAnswerKey(q.answer)[0];
  const ansText = String(q.options[ans.charCodeAt(0) - 65]);
  // 从答案文本里抠数字/尺寸，跟算出来的比
  const ok = String(computed).split(/[×x,，\s]+/).filter(Boolean)
    .every((part) => ansText.includes(part));
  if (ok) pass += 1; else fail += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${id}`);
  console.log(`       我算：${computed}`);
  console.log(`       答案：${ans}. ${ansText}`);
  if (desc) console.log(`       依据：${desc}`);
}

console.log('== 独立复算（卷积输出尺寸公式 floor((H+2P-K)/S)+1）==\n');

// 1) 32×32, K=3, P=1, S=1 → (32+2-3)/1+1 = 32
{
  const H = 32, K = 3, P = 1, S = 1;
  const out = Math.floor((H + 2 * P - K) / S) + 1;
  verify('c0502-' + String(qs.filter((q) => q.nodes.includes('c0502')).findIndex((q) => /32/.test(q.stem) && /填充 1|padding 1/.test(q.stem)) + 1).padStart(2, '0'),
    `${out}×${out}`, `(${H}+2×${P}−${K})/${S}+1 = ${out}`);
}

// 2) 32×32, K=3, P=0, S=2 → (32-3)/2+1 = floor(14.5)+1 = 15
{
  const H = 32, K = 3, P = 0, S = 2;
  const out = Math.floor((H + 2 * P - K) / S) + 1;
  verify('c0502-08', `${out}×${out}`, `(${H}+2×${P}−${K})/${S}+1 = floor(14.5)+1 = ${out}`);
}

// 3) 3 通道，16 个 3×3 卷积核 → 3×3×3×16 + 16 = 432+16 = 448
{
  const params = 3 * 3 * 3 * 16 + 16;
  verify('c0502-11', String(params), `3×3×3×16 + 16 = ${params}`);
}

// 4) 批归一化：输入 3,5,7 → mean 5, std ≈ 1.633 → (3-5)/1.633 ≈ -1.225
{
  const xs = [3, 5, 7];
  const n = xs.length;
  const mean = xs.reduce((a, b) => a + b) / n;
  const varP = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const sd = Math.sqrt(varP);
  const norm = xs.map((x) => +((x - mean) / sd).toFixed(2));
  console.log(`   复算：mean=${mean}, var=${varP}, sd=${sd.toFixed(4)}, 归一化后=${JSON.stringify(norm)}`);
  const q = byId.get('c0505-' + '08');
  if (q) {
    const ans = parseAnswerKey(q.answer)[0];
    const ansText = String(q.options[ans.charCodeAt(0) - 65]);
    const ok = norm.every((v) => ansText.includes(String(v)) || ansText.includes(String(v).replace('-', '−')));
    if (ok) pass += 1; else fail += 1;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} c0505-08  我算 ${JSON.stringify(norm)}，答案「${ansText}」`);
  }
}

// 5) 批归一化：2,4,6,8 → mean 5, var 5, sd 2.236 → (2-5)/2.236 ≈ -1.34
{
  const xs = [2, 4, 6, 8];
  const n = xs.length;
  const mean = xs.reduce((a, b) => a + b) / n;
  const varP = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const sd = Math.sqrt(varP);
  const first = +((xs[0] - mean) / sd).toFixed(2);
  console.log(`   复算：mean=${mean}, var=${varP}, sd=${sd.toFixed(4)}, 第一个值=${first}`);
  const q = byId.get('c0505-11');
  if (q) {
    const ans = parseAnswerKey(q.answer)[0];
    const ansText = String(q.options[ans.charCodeAt(0) - 65]);
    const ok = ansText.includes(String(first)) || ansText.includes(String(first).replace('-', '−'));
    if (ok) pass += 1; else fail += 1;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} c0505-11  我算 ${first}，答案「${ansText}」`);
  }
}

console.log(`\n复算结果：通过 ${pass}，不通过 ${fail}`);
console.log('（注：批归一化的标准差按总体方差算，与常见实现一致）');
if (fail) process.exitCode = 1;
