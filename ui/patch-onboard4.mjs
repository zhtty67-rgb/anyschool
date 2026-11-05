// 在客户端结尾插入：渲染后按 localStorage 决定引导条显隐
import { readFileSync, writeFileSync } from 'node:fs';

const F = 'data';
const lines = readFileSync(F, 'utf8').split('\n');

if (readFileSync(F, 'utf8').includes('applyOnboardState')) {
  console.log('已经加过了');
  process.exit(0);
}

// 找 "  paint();" 后紧跟 "})();" 的位置
let target = -1;
for (let i = 0; i < lines.length - 1; i += 1) {
  if (lines[i].trim() === 'paint();' && lines[i + 1].trim() === '})();') {
    target = i;
    break;
  }
}

if (target < 0) {
  console.error('没找到插入点');
  process.exit(1);
}

const block = `  function applyOnboardState(){
    var ob=document.getElementById('onboard');
    if(!ob) return;
    var seen=false;
    try{seen=localStorage.getItem('anylearn.onboarded')==='1'}catch(e){}
    ob.style.display = seen ? 'none' : '';
  }

  var __paint = paint;
  paint = function(){ __paint(); applyOnboardState(); };
`;

// 插在 paint(); 之前，并保持最后的 paint() 调用
lines.splice(target, 0, block);
writeFileSync(F, lines.join('\n'), 'utf8');
console.log(`已在第 ${target + 1} 行前插入 applyOnboardState`);
