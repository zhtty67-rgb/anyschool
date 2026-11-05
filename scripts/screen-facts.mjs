// 不依赖视觉的"屏幕事实"检查：列出所有可见元素的位置、是否被遮挡、是否在视口内
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 19611;
const PROFILE = 'data';

const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--window-size=1400,900',
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

try {
  const list = await getJson('/json/list');
  const page = list.find((t) => t.type === 'page');
  const cdp = await connect(page.webSocketDebuggerUrl);
  await cdp.call('Runtime.enable'); await cdp.call('Page.enable');
  await sleep(2500);
  const ev = async (x) => {
    const r = await cdp.call('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return '__ERR__' + (r.exceptionDetails.text || '');
    return r.result.value;
  };

  await ev(`localStorage.clear()`);
  await cdp.call('Page.reload'); await sleep(2200);
  await ev(`(()=>{const b=[...document.querySelectorAll('[data-act="study"]')].find(x=>!x.disabled);if(b)b.click()})()`);
  await sleep(700);
  await ev(`(()=>{const els=document.querySelectorAll('.opt,.option,[data-opt]');if(els[2])els[2].click()})()`);
  await sleep(250);
  await ev(`(()=>{const b=document.querySelector('[data-act="submit"]');if(b)b.click()})()`);
  await sleep(900);

  const report = await ev(`(()=>{
    var out={next:null,overlap:[],onScreenText:{},scroll:{}};
    var b=document.querySelector('[data-act="next"]');
    out.scroll={y:Math.round(window.scrollY),docH:document.documentElement.scrollHeight,vh:window.innerHeight};
    if(b){
      var r=b.getBoundingClientRect();
      var cx=r.x+r.width/2, cy=r.y+r.height/2;
      var top=document.elementFromPoint(cx,cy);
      out.next={rect:{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)},
        text:b.innerText.trim(),
        visible: r.width>0&&r.height>0,
        inViewport: r.top>=0&&r.bottom<=window.innerHeight,
        topElementAtCenter: top?{tag:top.tagName,cls:top.className,isButtonOrChild:!!top.closest('[data-act="next"]')}:null,
        computed:{display:getComputedStyle(b).display,visibility:getComputedStyle(b).visibility,opacity:getComputedStyle(b).opacity,zIndex:getComputedStyle(b.closest('.quiz-actions')||b).zIndex},
        parentRect:(function(){var p=b.closest('.quiz-actions');if(!p)return null;var pr=p.getBoundingClientRect();return {y:Math.round(pr.y),h:Math.round(pr.height),pos:getComputedStyle(p).position}})()
      };
    }
    // 检查常见的"被盖住"：取视口内若干高度采样，看每一层最上层元素
    var ys=[100,200,300,400,500,600,700,780];
    ys.forEach(function(y){
      var el=document.elementFromPoint(700,y);
      if(el) out.overlap.push({y:y,tag:el.tagName,cls:String(el.className).slice(0,60)});
    });
    // 屏幕上确实可见的文字块
    var wanted=['答对了','答错了','解析','下一题','同学','提交'];
    var all=document.querySelectorAll('body *');
    wanted.forEach(function(w){
      var found=false;
      for(var i=0;i<all.length;i++){
        var e=all[i];
        if(e.children.length===0 && e.textContent.indexOf(w)>=0){
          var r=e.getBoundingClientRect();
          if(r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).display!=='none'){
            // 是否真的在可视区（不完全滚出）
            var inV = r.bottom>0 && r.top<window.innerHeight;
            found={text:e.textContent.trim().slice(0,20),y:Math.round(r.top),inViewport:inV};
            break;
          }
        }
      }
      out.onScreenText[w]=found;
    });
    return out;
  })()`);

  console.log(JSON.stringify(report, null, 1));
  writeFileSync('data', JSON.stringify(report, null, 2), 'utf8');
  cdp.close();
} catch (e) { console.log('异常: ' + e.message); } finally { proc.kill(); }
