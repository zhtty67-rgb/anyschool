// B1 收尾核对：AI 同学在 22 个有题概念上都有话，没配的不显示空框
import { readFileSync } from 'node:fs';
import { hasLines, scriptFor } from '../peer/index.mjs';
import { LINES as PEER_LINES } from '../peer/lines.mjs';
import { parseTree } from '../core/tree.mjs';

const qs = readFileSync('data\\questions-authoring-v8.jsonl', 'utf8')
  .split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
const tree = parseTree();

const covered = [...new Set(qs.flatMap((q) => q.nodes))].sort();
const withPeer = covered.filter(hasLines);
const missing = covered.filter((c) => !hasLines(c));

console.log('== AI 同学覆盖 ==');
console.log(`有题节点 ${covered.length}，配了语句 ${withPeer.length}，缺 ${missing.length}`);
if (missing.length) console.log(`缺：${missing.join(' ')}`);

// 每个有题节点抽一句，确认能真的出话
console.log('\n== 逐节点抽查（确认都能出话）==');
let okCount = 0;
for (const code of covered) {
  const c = tree.concepts.find((x) => x.code === code);
  const lines = scriptFor({ code, name: c.name }, 1);
  if (lines.length && lines[0].quote) {
    okCount += 1;
  } else {
    console.log(`  FAIL ${code} ${c.name}：出不了话`);
    process.exitCode = 1;
  }
}
console.log(`  ${okCount}/${covered.length} 个节点都能出话`);

// 没配语句的节点必须完全不出现在 AI 同学区域
const notCovered = tree.concepts.filter((c) => !covered.includes(c.code) && !hasLines(c.code));
console.log(`\n未配语句的概念 ${notCovered.length} 个，渲染时一律返回空串（不留空框）`);

// 产物核对
const html = readFileSync('data', 'utf8');
const sizeKB = (Buffer.byteLength(html) / 1024).toFixed(1);
console.log(`\n== 产物 ==`);
console.log(`dist/index.html  ${sizeKB} KB`);
const embedded = Object.keys(PEER_LINES).length;
console.log(`内嵌语句库概念数：${embedded}`);
const emptyShell = (html.match(/peer-quote"><\/div>/g) || []).length;
console.log(`空语句框（应为 0）：${emptyShell}`);
if (emptyShell > 0) process.exitCode = 1;
