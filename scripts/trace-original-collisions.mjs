// 单查 c0205-08 与 c0302-12：两个"原始重复"的来龙去脉
// c0205-08 涉及 v8（线上）与 v9/v10，最要紧：说明正式版之间的合并可能出错
import { readFileSync, existsSync } from 'node:fs';

const FILES = [
  'data\\questions-authoring-v8.jsonl',
  'data\\questions-authoring-v9.jsonl',
  'data\\questions-authoring-v10.jsonl',
  'data\\questions-ai-m02-m03-fill-v1.jsonl',
];

const TARGETS = ['c0205-08', 'c0302-12'];

for (const id of TARGETS) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`【${id}】`);
  console.log('='.repeat(60));
  for (const p of FILES) {
    if (!existsSync(p)) continue;
    const qs = readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
    const q = qs.find((x) => x.id === id);
    if (!q) continue;
    console.log(`\n  ${p.split('\\').pop()}`);
    console.log(`    题干: ${q.stem}`);
    console.log(`    答案: ${q.answer}  类型: ${q.type}`);
    console.log(`    选项: ${(q.options || []).join(' / ')}`);
    if (q.explanation) console.log(`    解析: ${String(q.explanation).slice(0, 90)}`);
    if (q.source) console.log(`    source: ${q.source}`);
  }
}
