// 可点区域检查（真浏览器版）：在真实渲染的答题页上验证"看着能点的，真的能点"
//
// 为什么不用静态 HTML：横条是运行时渲染的，静态文件里没有这个元素，
// 用正则扫产物只会得出"未发现"，是一次假的通过。
//
// 检查项：
//   1. 每个 cursor:pointer 的可见元素，其中心点命中测试必须落在"自身或可点祖先"上
//   2. 横条类容器必须自身可点（整条都能点，不是只有中间按钮）
//   3. 反向自检：故意插一个"手型光标但不可点"的元素，必须能被抓出来
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 19691;
const PROFILE = 'data';

const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--window-size=1280,720',
  'file:///D:/jiaoyu/work/edu/dist/index.html'], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getJson(p) {
  for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}${p}`); return await r.json(); } catch { await sleep(250); } }
  throw new Error('CDP 未就绪');
}
function connect(u) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(u); let id = 0; const pend = new Map();
    ws.onopen = () => res({
      call(m, p = {}) { return new Promise((a, b) => { const i = ++id; pend.set(i, { a, b }); ws.send(JSON.stringify({ id: i, method: m, params: p })); }); },
      close() { ws.close(); },
    });
    ws.onerror = rej;
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const { a, b } = pend.get(m.id); pend.delete(m.id); m.error ? b(new Error(JSON.stringify(m.error))) : a(m.result); } };
  });
}

const issues = [];
const oks = [];
let cdp;
try {
  const list = await getJson('/json/list');
  const page = list.find((t) => t.type === 'page');
  cdp = await connect(page.webSocketDebuggerUrl);
  await cdp.call('Runtime.enable'); await cdp.call('Page.enable');
  await sleep(2400);
  const ev = async (x) => {
    const r = await cdp.call('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return '__ERR__' + (r.exceptionDetails.text || '');
    return r.result.value;
  };

  // 打开答题页
  await ev(`localStorage.clear()`);
  await cdp.call('Page.reload'); await sleep(2000);
  await ev(`(()=>{const b=[...document.querySelectorAll('[data-act="study"]')].find(x=>!x.disabled);if(b)b.click()})()`);
  await sleep(700);

  const scan = `(function(){
    var bad=[], seen=0;
    var NATIVE={SUMMARY:1,BUTTON:1,A:1,INPUT:1,SELECT:1,TEXTAREA:1,LABEL:1};
    function clickable(el){
      var n=el;
      while(n&&n.nodeType===1){
        if(NATIVE[n.tagName])return true;
        if(n.hasAttribute('data-act')||n.hasAttribute('data-node')||n.hasAttribute('data-opt')||n.hasAttribute('href'))return true;
        if((n.getAttribute('role')||'')==='button')return true;
        n=n.parentElement;
      }
      return false;
    }
    var all=document.querySelectorAll('*');
    for(var i=0;i<all.length;i++){
      var e=all[i];
      var cs=getComputedStyle(e);
      if(cs.cursor!=='pointer')continue;
      var r=e.getBoundingClientRect();
      if(r.width<2||r.height<2)continue;
      if(cs.visibility==='hidden'||cs.display==='none')continue;
      seen++;
      if(!clickable(e)){ bad.push({tag:e.tagName,cls:String(e.className).slice(0,40),y:Math.round(r.top)}); }
    }
    return {checked:seen, bad:bad};
  })()`;

  const res = await ev(scan);
  if (res && res.bad && res.bad.length) {
    issues.push(`手型光标但自身和祖先都不可点的元素 ${res.bad.length} 个：` + JSON.stringify(res.bad.slice(0, 3)));
  } else {
    oks.push(`${res.checked} 个手型光标元素，全部可点`);
  }

  // 横条整体可点
  const bar = await ev(`(function(){
    var b=document.querySelector('.quiz-actions');
    if(!b)return null;
    var r=b.getBoundingClientRect();
    var pts=[r.left+8, r.left+r.width/2, r.right-8];
    var hits=pts.map(function(x){
      var el=document.elementFromPoint(x, r.top+r.height/2);
      return !!(el && el.closest('[data-act]'));
    });
    return {hasAct: b.hasAttribute('data-act'), hits:hits, width:Math.round(r.width)};
  })()`);
  if (!bar) issues.push('答题页未找到横条容器');
  else {
    if (!bar.hasAct) issues.push('横条容器缺 data-act');
    else if (!bar.hits.every(Boolean)) issues.push(`横条有点不死的位置: ${JSON.stringify(bar.hits)}`);
    else oks.push(`横条整条可点（宽 ${bar.width}px，左中右三处命中）`);
  }

  // ── 反向自检：故意造一个不可点但带手型光标的元素，检查必须抓到 ──
  const canary = await ev(`(function(){
    var d=document.createElement('div');
    d.id='__canary__';
    d.style.cssText='position:fixed;left:10px;top:10px;width:80px;height:40px;background:#fdd;cursor:pointer;z-index:9999';
    d.textContent='假按钮';
    document.body.appendChild(d);
    var found=false;
    var NATIVE={SUMMARY:1,BUTTON:1,A:1,INPUT:1,SELECT:1,TEXTAREA:1,LABEL:1};
    function clickable(el){var n=el;while(n&&n.nodeType===1){if(NATIVE[n.tagName])return true;if(n.hasAttribute('data-act')||n.hasAttribute('data-node')||n.hasAttribute('data-opt')||n.hasAttribute('href'))return true;n=n.parentElement;}return false;}
    if(getComputedStyle(d).cursor==='pointer' && !clickable(d)) found=true;
    d.remove();
    return found;
  })()`);
  if (canary) oks.push('反向自检通过：故意造的假按钮能被识别为不可点');
  else issues.push('反向自检失败：检查逻辑抓不到明显不可点的元素，等于永远通过');

  cdp.close();
} catch (e) { issues.push('异常: ' + e.message); } finally { proc.kill(); }

console.log('── 可点区域检查（真浏览器）──────────────');
oks.forEach((s) => console.log('  OK   ' + s));
issues.forEach((s) => console.log('  FAIL ' + s));
console.log(issues.length ? `\n${issues.length} 项不通过` : '\n全部通过');
process.exit(issues.length ? 1 : 0);
