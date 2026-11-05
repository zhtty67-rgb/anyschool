// 查术语在知识树里有没有被讲过
// 背景：c1103 的题外行读不懂，判断依据是"核心术语在整条路径上前置缺失"。
// 这个结论决定知识树要不要扩（用户才能决定），所以数必须能复现，不能凭印象。
import { readFileSync } from 'node:fs';

const TREE = 'data\\concepts-ai.yaml';

const terms = ['解码器', '先验', 'KL', '潜空间', '潜在空间', '后验', '重参数化', '编码器'];

const raw = readFileSync(TREE, 'utf8');
const lines = raw.split(/\r?\n/);

// 把 yaml 切成节点块：每个 "- code: cXXXX" 开始一个新节点，直到下一个
const blocks = [];
let cur = null;
for (const l of lines) {
  const m = /^\s*-\s*code:\s*(\S+)/.exec(l);
  if (m) {
    if (cur) blocks.push(cur);
    cur = { code: m[1], text: [] };
  } else if (cur) {
    cur.text.push(l);
  }
}
if (cur) blocks.push(cur);

const concepts = blocks.filter((b) => /^c\d{4}$/.test(b.code));
console.log(`知识树里形如 cNNNN 的节点：${concepts.length} 个\n`);

console.log('=== 术语在节点正文里出现的情况 ===');
for (const t of terms) {
  const hits = concepts.filter((b) => b.text.join('\n').includes(t));
  const where = hits.map((h) => h.code);
  console.log(`  ${t.padEnd(6, '　')} 出现 ${hits.length} 个节点${hits.length ? '：' + where.join(', ') : '（全树没有）'}`);
}

// 关键判断：术语出现的节点里，有没有一个"专门讲它"的节点（code 的名字或 def 开头就是它）
console.log('\n=== 有没有专门的节点解释它 ===');
for (const t of terms) {
  const own = concepts.filter((b) => {
    const text = b.text.join('\n');
    const nameLine = /name:\s*(.+)/.exec(text);
    const name = nameLine ? nameLine[1] : '';
    return name.includes(t);
  });
  console.log(`  ${t.padEnd(6, '　')} ${own.length ? '有：' + own.map((x) => x.code).join(', ') : '没有专门节点'}`);
}
