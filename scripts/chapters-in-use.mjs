// 拿已标章节的题反查：到底有哪些独立章节被真正使用过
//
// 起因（2026-11-05，Qbank 提）：
//   Chief 说"79 个节点绝大部分有对应章节"，Searcher 数出来只有 24 个有正章，
//   两边差得远。争总数没有用，先看**现有题实际引用了哪些章节**——
//   这是已经落在数据里的事实，不用人判断。
//
// 注意：这里数的是"题里写了哪个章节"，不是"这个节点该对应哪个章节"。
// 后者要建映射表，前者只用现有数据。两者不能混为一谈。
import { readFileSync } from 'node:fs';

const rows = readFileSync('D:/jiaoyu/outputs/questions-authoring-v11.jsonl', 'utf8')
  .split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));

const ev = (q) => String(q.basis_evidence ?? '').trim();
const hasRealEv = (q) => ev(q) !== '' && ev(q) !== 'pre-policy';

// basis 形如 "d2l-zh 4.1 多层感知机"
const chapterOf = (q) => {
  const b = String(q.basis ?? '');
  if (b === 'self-authored' || !b) return null;
  const m = b.match(/^d2l-zh\s+([\d.]+)\s*(.*)$/);
  return m ? { num: m[1], title: m[2].trim() } : { num: b, title: '' };
};

const byChapter = new Map();   // "4.1 多层感知机" -> {total, realEv, nodes:Set}
for (const q of rows) {
  const c = chapterOf(q);
  if (!c) continue;
  const key = c.num + (c.title ? ' ' + c.title : '');
  if (!byChapter.has(key)) byChapter.set(key, { total: 0, realEv: 0, nodes: new Set() });
  const rec = byChapter.get(key);
  rec.total += 1;
  if (hasRealEv(q)) rec.realEv += 1;
  for (const n of q.nodes || []) rec.nodes.add(typeof n === 'string' ? n : (n.id ?? ''));
}

const chapters = [...byChapter].sort((a, b) => {
  const pa = a[0].split(' ')[0].split('.').map(Number);
  const pb = b[0].split(' ')[0].split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
});

console.log('题里出现过 ' + chapters.length + ' 个不同章节：');
console.log('');
console.log('章节'.padEnd(28) + '题数'.padStart(6) + '  其中有真证据'.padStart(12) + '  涉及节点');
for (const [k, v] of chapters) {
  console.log(k.padEnd(28) + String(v.total).padStart(6) + String(v.realEv).padStart(12)
    + '  ' + [...v.nodes].sort().join(','));
}

const allNodes = new Set();
for (const [, v] of chapters) for (const n of v.nodes) allNodes.add(n);
const realEvChapters = chapters.filter(([, v]) => v.realEv > 0);

console.log('');
console.log('汇总：');
console.log('  有题标了章节的节点：' + allNodes.size + ' 个');
console.log('  章节总数：' + chapters.length + ' 个');
console.log('  其中至少有一道题写了真证据的章节：' + realEvChapters.length + ' 个');
