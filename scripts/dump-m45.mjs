// m04/m05 的 121 道：逐节点统计"不学也能猜对"的题
//
// 判据来自小白（外行视角，比正则可靠）：
//   把题干念一遍。第一反应是"这不就是书上那句定义吗" → 算进去。
//   第一反应是"等一下，这两种情况差在哪" → 不算。
//
// 这里先把每个节点的全部题干打印出来，我逐条按上述判据人工判断，
// 同时列出正则的机械判定做对照（只作参考，不作结论）。
import { readFileSync } from 'node:fs';

const qs = readFileSync('data\\questions-authoring-v10.jsonl', 'utf8')
  .split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));

const m45 = qs.filter((q) => (q.nodes || []).some((n) => /^c0[45]/.test(n)));
const nodes = [...new Set(m45.flatMap((q) => q.nodes))].sort();

// 机械判据（仅作参照）：题干是不是直接问一个名词的定义/作用/描述
const LOOKUP = /(指的是|作用是|描述的是|的说法[是正确]|的特征是|包括哪些|主要目的是|核心思想是|基本结构是|基本机制是|定义了|的含义是|是用来|主要是为了)/;

console.log(`m04/m05 共 ${m45.length} 道，${nodes.length} 个节点\n`);

for (const n of nodes) {
  const list = m45.filter((q) => q.nodes.includes(n));
  console.log(`\n${'='.repeat(60)}`);
  console.log(`【${n}】${list.length} 道`);
  console.log('='.repeat(60));
  list.forEach((q) => {
    const flag = LOOKUP.test(q.stem) ? ' [机械判:查定义]' : '';
    console.log(`\n[${q.id}]${flag}`);
    console.log(`  题干：${q.stem}`);
    const opts = q.options || [];
    const ansIdx = String(q.answer || '').toUpperCase().charCodeAt(0) - 65;
    console.log(`  选项：${opts.map((o, i) => (i === ansIdx ? `★${o}` : o)).join(' / ')}`);
  });
}
