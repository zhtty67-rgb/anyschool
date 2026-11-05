// 提交后的屏幕事实检查：每一块文字是否真的出现在视口内、且没有被固定操作条遮住
// 判据来自群里的教训：元素"存在"不等于"用户看得见"
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 19621;
const SIZES = [{ w: 1400, h: 900 }, { w: 1280, h: 720 }, { w: 1024, h: 640 }];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getJson(p, port) {
  for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://127.0.0.1:${port}${p}`); return await r.json(); } catch { await sleep(250); } }
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

const out = { pass: [], fail: [], notes: [] };
const check = (n, ok, d) => (ok ? out.pass : out.fail).push(d === undefined ? n : `${n}=${d}`);

for (let i = 0; i < SIZES.length; i++) {
  const { w, h } = SIZES[i];
  const PORT_ = PORT + i;
  const PROFILE = `data
  const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${PORT_}`, `--user-data-dir=${PROFILE}`, `--window-size=${w},${h}`,
    'file:///D:/jiaoyu/work/edu/dist/index.html'], { stdio: 'ignore' });
  try {
    const list = await getJson('/json/list', PORT_);
    const page = list.find((t) => t.type === 'page');
    const cdp = await connect(page.webSocketDebuggerUrl);
    await cdp.call('Runtime.enable'); await cdp.call('Page.enable');
    await sleep(2400);
    const ev = async (x) => {
      const r = await cdp.call('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) return '__ERR__' + (r.exceptionDetails.text || '');
      return r.result.value;
    };
    await ev(`localStorage.clear()`);
    await cdp.call('Page.reload'); await sleep(2000);
    await ev(`(()=>{const b=[...document.querySelectorAll('[data-act="study"]')].find(x=>!x.disabled);if(b)b.click()})()`);
    await sleep(650);
    await ev(`(()=>{const els=document.querySelectorAll('.opt,.option,[data-opt]');if(els[2])els[2].click()})()`);
    await sleep(220);
    await ev(`(()=>{const b=document.querySelector('[data-act="submit"]');if(b)b.click()})()`);
    await sleep(850);

    // 滚到底后再检查——用户必然会滚下去看解析
    const result = await ev(`(function(){
      var bar=document.querySelector('.quiz-actions');
      var barTop = bar ? bar.getBoundingClientRect().top : window.innerHeight;
      function visible(txt){
        var all=document.querySelectorAll('.quiz *, .quiz');
        for(var i=0;i<all.length;i++){
          var e=all[i];
          if(e.children.length===0 && e.textContent.trim().indexOf(txt)>=0){
            var r=e.getBoundingClientRect();
            if(r.width>0&&r.height>0){
              // 完全在视口内，且没有被固定条压住
              var inV = r.top>=0 && r.bottom<=window.innerHeight;
              var aboveBar = r.bottom <= barTop;
              // 在中心点确实能命中自己（没有被别的元素盖住）
              var hit=document.elementFromPoint(Math.min(r.left+r.width/2,window.innerWidth-1), Math.min(r.top+r.height/2, window.innerHeight-1));
              return {found:true, y:Math.round(r.top), bottom:Math.round(r.bottom), inViewport:inV, aboveBar:aboveBar, hitSelf: hit?(hit===e||e.contains(hit)||hit.contains(e)):false};
            }
          }
        }
        return {found:false};
      }
      var barRect = bar?{top:Math.round(bar.getBoundingClientRect().top),h:Math.round(bar.getBoundingClientRect().height)}:null;
      return {barRect:barRect, vh:window.innerHeight,
        items:{答对了:visible('答对了'),解析:visible('解析'),下一题:visible('下一题'),同学:visible('同学')}};
    })()`);
    out.notes.push(`${w}x${h}: ` + JSON.stringify(result));

    check(`${w}x${h} 操作条不遮挡正文(留白足够)`, result && result.barRect && result.barRect.top > 0);
    for (const key of ['答对了', '解析', '下一题', '同学']) {
      const it = result && result.items && result.items[key];
      check(`${w}x${h} 「${key}」存在`, !!(it && it.found), it ? `y=${it.y}` : '未找到');
    }
    const nb = result && result.items && result.items['下一题'];
    check(`${w}x${h} 「下一题」在屏幕内可见`, !!(nb && nb.found && nb.inViewport), nb ? `y=${nb.y} vh=${result.vh}` : '');
    check(`${w}x${h} 「下一题」未被遮挡`, !!(nb && nb.hitSelf), nb ? String(nb.hitSelf) : '');

    // 滚到底，确认解析和同学可见
    await ev(`window.scrollTo(0,document.documentElement.scrollHeight)`);
    await sleep(400);
    const after = await ev(`(function(){
      var bar=document.querySelector('.quiz-actions');
      var barTop=bar?bar.getBoundingClientRect().top:window.innerHeight;
      function vis(txt){
        var all=document.querySelectorAll('.quiz *');
        for(var i=0;i<all.length;i++){var e=all[i];
          if(e.children.length===0&&e.textContent.trim().indexOf(txt)>=0){var r=e.getBoundingClientRect();
            if(r.width>0&&r.height>0)return {y:Math.round(r.top),bottom:Math.round(r.bottom),inView:r.top>=0&&r.bottom<=window.innerHeight,aboveBar:r.bottom<=barTop};}}
        return null;
      }
      return {解析:vis('解析'),同学:vis('同学'),barTop:Math.round(barTop)};
    })()`);
    check(`${w}x${h} 滚到底后「解析」可见且不被遮`, !!(after && after.解析 && after.解析.inView && after.解析.aboveBar), after && after.解析 ? `y=${after.解析.y} barTop=${after.barTop}` : '未找到');
    check(`${w}x${h} 滚到底后「同学」可见且不被遮`, !!(after && after.同学 && after.同学.aboveBar), after && after.同学 ? `y=${after.同学.y} barTop=${after.barTop}` : '未找到');

    cdp.close();
  } catch (e) { out.fail.push(`${w}x${h} 异常=${e.message}`); }
  finally { proc.kill(); }
}

writeFileSync('data', JSON.stringify(out, null, 2), 'utf8');
console.log(`通过 ${out.pass.length} 项，失败 ${out.fail.length} 项`);
out.pass.forEach((p) => console.log('  [OK] ' + p));
out.fail.forEach((f) => console.log('  [FAIL] ' + f));
out.notes.forEach((n) => console.log('  [注] ' + n));
