// 一次性改：把条带里"掌握度可算 0"改成一句人话
import { readFileSync, writeFileSync } from 'node:fs';

const F = 'data';
let src = readFileSync(F, 'utf8');

// 服务端：band 里的 band-gap 文案
const oldMain = '· 离“每节点 10 道”还缺 <b>${lackQuestions}</b> 道</div>';
const newMain = '· ${scoredNodes === 0 ? `还没做过题，做满 ${MIN_SAMPLES} 道后这个数才会动` : `掌握度算得出 <b>${scoredNodes}</b> 个节点`} · 离“每节点 10 道”还缺 <b>${lackQuestions}</b> 道</div>';

if (src.includes(oldMain)) {
  src = src.replace(oldMain, newMain);
  console.log('服务端条带：已改');
} else {
  console.log('服务端条带：未找到，需人工看');
}

// 客户端：同名文案
const oldClient = "· 离“每节点 10 道”还缺 <b>'+lack+'</b> 道</div></div>'";
const newClient = "· '+(scored===0?'还没做过题，做满 3 道后这个数才会动':('掌握度算得出 <b>'+scored+'</b> 个节点'))+' · 离“每节点 10 道”还缺 <b>'+lack+'</b> 道</div></div>'";

if (src.includes(oldClient)) {
  src = src.replace(oldClient, newClient);
  console.log('客户端条带：已改');
} else {
  console.log('客户端条带：未找到，看实际写法');
  const m = src.match(/band-gap[^']*/);
  if (m) console.log('  附近内容：', m[0].slice(0, 120));
}

writeFileSync(F, src, 'utf8');
console.log('已写回', F);
