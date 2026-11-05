// 验证首次使用引导
import { readFileSync } from 'node:fs';
import { parseTree } from '../core/tree.mjs';
import { pickStartNode } from './onboarding.mjs';

const html = readFileSync('data', 'utf8');
const tree = parseTree();
const pack = readFileSync('data\\questions-authoring-v8.jsonl', 'utf8')
  .split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
const covered = pack.flatMap((q) => q.nodes || []);

console.log('== 起点选择 ==');
const start = pickStartNode(tree, covered);
console.log('  选中的起点：', start ? `${start.code} ${start.name}` : '（无）');
console.log('  先修：', JSON.stringify(start?.prereq || []));

console.log('\n== 页面核对 ==');
const checks = {
  '引导区块存在': html.includes('class="onboard"'),
  '标题': html.includes('第一次来？从这里开始'),
  '三步说明': html.includes('先看概念讲解') && html.includes('做几道题') && html.includes('掌握度就会显示'),
  '起点按钮': html.includes('从「'),
  '收起按钮': html.includes('我先自己看看'),
  '统计文字': html.includes('个节点可以练习'),
  '收起逻辑': html.includes("act==='onboard-dismiss'"),
  '样式存在': html.includes('.onboard{'),
};
let bad = 0;
for (const [k, v] of Object.entries(checks)) {
  console.log(`  ${v ? 'ok  ' : 'FAIL'} ${k}`);
  if (!v) bad += 1;
}

console.log('\n== 入口数检查（Chief 关心的"砍到 1 个"）==');
console.log('  认知点树为唯一入口：', !html.includes('<nav') && !html.includes('class="sidebar"'));
console.log('  无等级档位 L0-L5 赤裸展示：', !html.includes('L0') && !html.includes('L4'));

console.log(`\n结论：${bad === 0 ? '引导完整接入' : `${bad} 项缺失`}`);
if (bad) process.exitCode = 1;
