// 验证引导条的 localStorage 记忆 + 回看入口
import { readFileSync } from 'node:fs';

const html = readFileSync('data', 'utf8');

const checks = {
  '顶部回看链接（服务端）': html.includes('data-act="onboard-show"'),
  '回看链接文字': html.includes('新手引导'),
  'localStorage 写入（关闭时）': html.includes("localStorage.setItem('anylearn.onboarded','1')"),
  'localStorage 读取（渲染后）': html.includes("localStorage.getItem('anylearn.onboarded')"),
  '回看时清除标记': html.includes("localStorage.removeItem('anylearn.onboarded')"),
  'applyOnboardState 函数': html.includes('function applyOnboardState'),
  'paint 包装生效': html.includes('__paint = paint'),
  '回看链接样式': html.includes('.onboard-link{'),
  'try/catch 保护（无痕模式）': (html.match(/try\{seen=localStorage/g) || []).length > 0,
};

let bad = 0;
console.log('== localStorage 记忆与回看入口 ==');
for (const [k, v] of Object.entries(checks)) {
  console.log(`  ${v ? 'ok  ' : 'FAIL'} ${k}`);
  if (!v) bad += 1;
}

// 逻辑一致性：点关闭 → 写标记；重开 → 读标记隐藏；点回看 → 清标记再显示
console.log('\n== 逻辑闭环 ==');
const flow = [
  ['首次打开：无标记 → 显示引导',
    html.includes("ob.style.display = seen ? 'none' : ''")],
  ['点「我先自己看看」→ 移除 + 写标记',
    html.includes("act==='onboard-dismiss'") && html.includes("setItem('anylearn.onboarded','1')")],
  ['再次打开 → 读到标记 → 隐藏',
    html.includes("seen=localStorage.getItem")],
  ['点「新手引导」→ 清标记 → 重新显示',
    html.includes("act==='onboard-show'") && html.includes("removeItem('anylearn.onboarded')")],
];
for (const [k, v] of flow) {
  console.log(`  ${v ? 'ok  ' : 'FAIL'} ${k}`);
  if (!v) bad += 1;
}

console.log(`\n结论：${bad === 0 ? '闭环完整' : `${bad} 项缺失`}`);
if (bad) process.exitCode = 1;
