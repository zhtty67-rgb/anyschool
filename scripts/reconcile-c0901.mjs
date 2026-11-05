// 对账：c0901-01 在几个文件里分别是什么题干
import { readFileSync, existsSync } from 'node:fs';

const FILES = [
  'data\\questions-ai-c0901-rewrite-v1.jsonl',
  'data\\questions-ai-c0901-guessable-v1.jsonl',
  'data\\questions-authoring-v10.jsonl',
  'data\\questions-authoring-v9.jsonl',
  'data\\questions-ai-m09-m11-v1.jsonl',
];

for (const p of FILES) {
  if (!existsSync(p)) { console.log(`\n${p.split('\\').pop()}: 不存在`); continue; }
  const qs = readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
  const q = qs.find((x) => x.id === 'c0901-01');
  console.log(`\n=== ${p.split('\\').pop()}（${qs.length} 道）===`);
  if (!q) { console.log('  没有 c0901-01'); continue; }
  console.log('  题干:', q.stem);
  console.log('  选项:', (q.options || []).slice(0, 2).join(' / '), '...');
  if ('guessable' in q) console.log('  guessable:', q.guessable);
  if ('qkind' in q) console.log('  qkind:', q.qkind);
}

// 再查 c0901 在 v10 里的第一道题是什么（可能是别的 id）
console.log('\n=== v10 里 c0901 节点的全部题号与题干 ===');
if (existsSync('data\\questions-authoring-v10.jsonl')) {
  const qs = readFileSync('data\\questions-authoring-v10.jsonl', 'utf8')
    .split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
  qs.filter((q) => (q.nodes || []).includes('c0901')).forEach((q) => {
    console.log(`  ${q.id}: ${String(q.stem).slice(0, 50)}`);
  });
}
