// 检查界面结构：入口数、是否暴露等级、首次使用引导
import { readFileSync } from 'node:fs';

const h = readFileSync('data', 'utf8');

const count = (re) => (h.match(re) || []).length;
const report = {
  顶部导航条: count(/class="top"/g),
  进度条带: count(/class="band"/g),
  模块分组: count(/class="module"/g),
  知识树主屏: count(/class="tree"/g),
  出现L0_L5等级: /L[0-5]/.test(h),
  独立nav标签: count(/<nav/g),
  侧边栏: count(/class="sidebar"/g),
  标签页tabs: count(/class="tab"/g),
};
console.log(JSON.stringify(report, null, 2));

// 首屏用户看到什么
const bodyMatch = h.match(/<div id="app">([\s\S]{0,600})/);
if (bodyMatch) {
  const txt = bodyMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  console.log('\n首屏可见文字（前 200 字）:');
  console.log(' ', txt.slice(0, 200));
}
