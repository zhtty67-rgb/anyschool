// 列出极差 >8 的具体题号，供两边核对
// 判法：去掉正确答案那一项，其余三个的极差
import { readFileSync } from 'node:fs';

const rows = readFileSync('D:/jiaoyu/outputs/questions-authoring-v11.jsonl', 'utf8')
  .split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));

const four = rows.filter((q) => Array.isArray(q.options) && q.options.length === 4);
const lensOf = (q) => q.options.map((o) => String(typeof o === 'string' ? o : (o.text ?? '')).replace(/\s+/g, '').length);
const ansIdx = (q) => {
  const a = String(q.answer ?? '').trim().toUpperCase();
  if (a.length !== 1 || a < 'A' || a > 'D') return null;
  const i = a.charCodeAt(0) - 65;
  return i < q.options.length ? i : null;
};

const over8 = [];
for (const q of four) {
  const L = lensOf(q);
  const i = ansIdx(q);
  if (i === null) continue;
  const others = L.filter((_, j) => j !== i);
  const sp = Math.max(...others) - Math.min(...others);
  if (sp > 8) over8.push({ id: q.id, lens: L, ans: String(q.answer).toUpperCase(), othersSpread: sp });
}

console.log('极差 >8 的题：' + over8.length + ' 道');
console.log('');
for (const r of over8) {
  console.log('  ' + r.id.padEnd(12) + ' 答案=' + r.ans + '  长度=' + r.lens.join('/') + '  其余三项极差=' + r.othersSpread);
}
