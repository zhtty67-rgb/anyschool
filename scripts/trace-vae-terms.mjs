// 反查：VAE 的核心术语，在整棵知识树里该由哪个节点引入？
// 如果答案是不在任何节点，那就是概念树缺节点，补题解决不了。
import { readFileSync } from 'node:fs';
import { parseTree } from '../core/tree.mjs';

const tree = parseTree();
const concepts = tree.concepts;

// c1103 题目里用到、但自身没讲的 6 个核心术语
const TERMS = ['解码器', '先验', 'KL', '潜在空间', '后验', '重参数化'];

console.log('反查：这些术语在整棵概念树里出现过几次、在哪出现\n');
console.log('术语 | 出现的节点（name / def / misconceptions 任一含该词）');
console.log('---');

for (const t of TERMS) {
  const hits = [];
  for (const c of concepts) {
    const text = [c.name, c.def, ...(c.misconceptions || [])].join(' ');
    if (text.includes(t)) hits.push(`${c.code}(${c.name})`);
  }
  const where = hits.length ? hits.join('、') : '**没有任何节点提到**';
  console.log(`${t} | ${where}`);
}

console.log('\n=== c1103 自身的 def 与误解 ===');
const vae = concepts.find((c) => c.code === 'c1103');
console.log('def:', vae.def);
console.log('misconceptions:', JSON.stringify(vae.misconceptions));
console.log('prereq:', JSON.stringify(vae.prereq));

console.log('\n=== 概念树里有没有"潜空间/编码/解码"这类节点 ===');
const related = concepts.filter((c) => /(编码|解码|潜|表示|嵌入|向量)/.test(c.name + c.def));
if (related.length) related.forEach((c) => console.log(`  ${c.code} ${c.name}: ${c.def.slice(0, 50)}`));
else console.log('  没有');

console.log('\n=== c1103 的完整前置链 ===');
function chain(code, seen = new Set(), depth = 0) {
  if (seen.has(code)) return;
  seen.add(code);
  const c = concepts.find((x) => x.code === code);
  if (!c) return;
  console.log('  '.repeat(depth + 1) + `${c.code} ${c.name}`);
  for (const p of c.prereq || []) chain(p, seen, depth + 1);
}
chain('c1103');
