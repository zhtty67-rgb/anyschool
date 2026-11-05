// 检查 22 个有题节点的定义长度，找出对小白的理解门槛
import { parseTree } from '../core/tree.mjs';
import { readFileSync } from 'node:fs';

const tree = parseTree();
const pack = readFileSync('data\\questions-authoring-v8.jsonl', 'utf8')
  .split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
const covered = [...new Set(pack.flatMap((q) => q.nodes))];

const rows = covered.map((code) => {
  const c = tree.concepts.find((x) => x.code === code);
  const def = String(c.def || '');
  return { code, name: c.name, len: def.length, def, mis: c.misconceptions.length };
}).sort((a, b) => a.len - b.len);

console.log('== 22 个节点的定义长度（从短到长）==\n');
for (const r of rows) {
  const flag = r.len < 25 ? '⚠' : ' ';
  console.log(`${flag} ${String(r.len).padStart(3)}字  ${r.code} ${r.name}`);
  console.log(`        ${r.def}`);
}

const short = rows.filter((r) => r.len < 25);
console.log(`\n短于 25 字的：${short.length} 个 → ${short.map((r) => r.code).join(' ')}`);
console.log(`误解齐全（≥1 条）的：${rows.filter((r) => r.mis > 0).length}/${rows.length}`);
