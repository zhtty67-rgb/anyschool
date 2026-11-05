// 把首次使用引导接进 render.mjs（幂等，重复跑不会重复插入）
import { readFileSync, writeFileSync } from 'node:fs';

const F = 'data';
let s = readFileSync(F, 'utf8');
let changed = [];

// 1) 引入
if (!s.includes('./onboarding.mjs')) {
  const anchor = "import { briefFor } from './node-details.mjs';";
  s = s.replace(anchor, anchor + "\nimport { renderOnboarding, pickStartNode, ONBOARD_CSS } from './onboarding.mjs';");
  changed.push('import');
}

// 2) 样式拼接
if (!s.includes('ONBOARD_CSS +')) {
  s = s.replace('const CSS = `', 'const CSS = ONBOARD_CSS + `');
  changed.push('css');
}

// 3) 页面里插引导条：放在 band 之后、tree 之前
const treeAnchor = '  return `${head}${band}<main class="tree">${groups}</main>`;';
if (s.includes(treeAnchor) && !s.includes('renderOnboarding(snap.startNode')) {
  s = s.replace(
    treeAnchor,
    '  const onboard = renderOnboarding(snap.startNode, snap.stats);\n' +
    '  return `${head}${onboard}${band}<main class="tree">${groups}</main>`;'
  );
  changed.push('page');
}

// 4) 客户端：引导条 + 收起按钮
if (!s.includes("act==='onboard-dismiss'")) {
  const clientAnchor = "    if(act==='submit'){submit(t.getAttribute('data-node'));return}";
  s = s.replace(
    clientAnchor,
    "    if(act==='onboard-dismiss'){var ob=document.getElementById('onboard');if(ob)ob.remove();return}\n" + clientAnchor
  );
  changed.push('client-dismiss');
}

writeFileSync(F, s, 'utf8');
console.log(changed.length ? `已改：${changed.join(', ')}` : '无变化（已是最新）');
