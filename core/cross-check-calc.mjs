// 核对"哪些题是真计算题"：把我识别出的 12 道逐条列出来，看漏没漏
import { readFileSync } from 'node:fs';
import { looksNumeric } from './check-calc-tags.mjs';

const qs = readFileSync('data\\questions-authoring-v9.jsonl', 'utf8')
  .split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));

const detected = qs.filter(looksNumeric).map((q) => q.id).sort();
console.log(`我的判据识别出 ${detected.length} 道：`);
for (const id of detected) {
  const q = qs.find((x) => x.id === id);
  console.log(`  ${id}  ${q.stem.slice(0, 42)}`);
}

// Qbank 提到的那些，逐一检查为什么没被识别
const qbankSaid = ['c0301-12', 'c0304-11', 'c0403-04', 'c0403-05', 'c0502-09',
  'c0503-07', 'c0903-02', 'c0903-05', 'c0903-10'];
console.log('\nQbank 特别提到的题，逐条核对：');
for (const id of qbankSaid) {
  const q = qs.find((x) => x.id === id);
  if (!q) { console.log(`  ${id}  ！题号不存在`); continue; }
  const hit = detected.includes(id);
  console.log(`  ${hit ? '已识别' : '未识别'}  ${id}  ${q.stem.slice(0, 46)}`);
}

console.log('\n=== 差异分析 ===');
const notDetected = qbankSaid.filter((id) => !detected.includes(id));
if (notDetected.length) {
  console.log(`Qbank 认为有、我没识别的：${notDetected.join(' ')}`);
  for (const id of notDetected) {
    const q = qs.find((x) => x.id === id);
    console.log(`\n  ${id}`);
    console.log(`  题干：${q.stem}`);
  }
} else {
  console.log('Qbank 提到的全部已被我的判据识别');
}
