// 逐步滚动，记录「下一题」按钮每一刻在屏幕上的位置与是否可见
// 小白反馈：滚下去看解析和同学之后就找不到按钮了
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 19631;
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

try {
  const list = await getJson('/json/list');
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

  const probe = `(function(){
    var bar=document.querySelector('.quiz-actions');
    var btn=document.querySelector('[data-act="next"]');
    if(!btn) return {noBtn:true, scrollY:Math.round(window.scrollY)};
    var br=btn.getBoundingClientRect();
    var barR=bar?bar.getBoundingClientRect():null;
    var cx=br.x+br.width/2, cy=br.y+br.height/2;
    var top=(cx>=0&&cy>=0&&cx<window.innerWidth&&cy<window.innerHeight)?document.elementFromPoint(cx,cy):null;
    return {
      scrollY: Math.round(window.scrollY),
      btnY: Math.round(br.top), btnBottom: Math.round(br.bottom),
      inViewport: br.top>=0 && br.bottom<=window.innerHeight,
      barTop: barR?Math.round(barR.top):null, barH: barR?Math.round(barR.height):null,
      barVisible: barR? (barR.top>=0 && barR.bottom<=window.innerHeight+1) : false,
      btnVisibleArea: Math.round(br.width)>0&&Math.round(br.height)>0,
      hit: top? (top.closest('[data-act=\\"next\\"]')?'btn':'other:'+top.className) : 'none',
      barZ: bar?getComputedStyle(bar).zIndex:null,
      barPos: bar?getComputedStyle(bar).position:null
    };
  })()`;

  const rows = [];
  rows.push({ step: '初始', ...(await ev(probe)) });
  // 逐屏向下滚
  for (let i = 1; i <= 4; i++) {
    await ev(`window.scrollBy(0, ${300})`);
    await sleep(350);
    rows.push({ step: `滚 ${i * 300}px`, ...(await ev(probe)) });
  }
  await ev(`window.scrollTo(0, document.documentElement.scrollHeight)`);
  await sleep(400);
  rows.push({ step: '滚到底', ...(await ev(probe)) });

  console.log('步骤 | scrollY | 按钮y | 在视口内 | 操作条top | 命中');
  rows.forEach((r) => {
    console.log(`${r.step} | ${r.scrollY} | ${r.btnY} | ${r.inViewport} | ${r.barTop} | ${r.hit}`);
  });
  console.log('\n完整数据:');
  console.log(JSON.stringify(rows, null, 1));
  writeFileSync('data', JSON.stringify(rows, null, 2), 'utf8');
  cdp.close();
} catch (e) { console.log('异常: ' + e.message); } finally { proc.kill(); }
