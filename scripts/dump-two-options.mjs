// 把 c0603-05 和 c0802-10 原样打出来，供两边对同一份文件
// 2026-11-05：Qbank 报 c0603-05 长度 15/6/6/29，我算 14/6/6/28，差 2 字。
// 同一文件同一题号不可能差 2，所以要么文件不同、要么计数方式不同。
// 这里把每个选项的原始字符串和它的长度一起打出来，谁都能对着看。
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const P = 'D:/jiaoyu/outputs/questions-authoring-v11.jsonl';
const buf = readFileSync(P);
console.log('文件：' + P);
console.log('md5：' + createHash('md5').update(buf).digest('hex'));
console.log('字节：' + buf.length);
console.log('');

const rows = buf.toString('utf8').split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));

for (const id of ['c0603-05', 'c0802-10']) {
  const q = rows.find((x) => x.id === id);
  if (!q) { console.log(id + '：文件里没有'); continue; }
  console.log('=== ' + id + '  答案=' + q.answer + ' ===');
  q.options.forEach((o, i) => {
    const raw = typeof o === 'string' ? o : (o.text ?? '');
    const noSpace = String(raw).replace(/\s+/g, '');
    console.log('  ' + 'ABCD'[i] + ' 原文（' + raw.length + ' 字符）：' + JSON.stringify(raw));
    console.log('    去空白后长度：' + noSpace.length);
  });
  console.log('');
}
