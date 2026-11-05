// 验证扩写定义是否真的进了产物
import { readFileSync } from 'node:fs';
import { loadExpanded } from './node-details.mjs';
import { parseTree } from '../core/tree.mjs';

const expanded = loadExpanded();
const tree = parseTree();
const pack = readFileSync('data\\questions-authoring-v8.jsonl', 'utf8')
  .split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
const covered = [...new Set(pack.flatMap((q) => q.nodes))];

console.log(`渲染层读到扩写定义：${Object.keys(expanded).length} 个`);
console.log(`有题节点：${covered.length} 个`);

const withExpanded = covered.filter((c) => expanded[c]);
const without = covered.filter((c) => !expanded[c]);
console.log(`其中有扩写版：${withExpanded.length} 个`);
console.log(`仍用原定义：${without.length} 个 → ${without.map((c) => {
  const x = tree.concepts.find((y) => y.code === c);
  return `${c}(${x.def.length}字)`;
}).join(' ')}`);

// 页面内是否真的带出去了
const html = readFileSync('data', 'utf8');
const hasExpandedCount = (html.match(/"hasExpanded":true/g) || []).length;
const exampleBlocks = (html.match(/brief-example/g) || []).length;
console.log(`\n产物核对：`);
console.log(`  hasExpanded:true 出现 ${hasExpandedCount} 次`);
console.log(`  例子折叠块 ${exampleBlocks} 处`);
console.log(`  文件大小 ${(Buffer.byteLength(html) / 1024).toFixed(1)} KB`);

// 抽查 c0205 是否进了页面
const ok = html.includes('把训练样本连同里面的噪声一起记下来');
console.log(`  c0205 扩写内容已进产物：${ok ? '是' : '否'}`);
if (!ok || withExpanded.length !== 14) process.exitCode = 1;
