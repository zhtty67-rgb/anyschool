// 完全按小白的视角验证：不用任何选择器
// 1. 按钮位置 = 屏幕底部白色横条里那块区域
// 2. 按钮文字 = 屏幕上肉眼能读到的那段字
// 3. 点击 = 在该坐标做真实鼠标点击
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 19661;
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

const out = { log: [] };
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

  // 用户视角：看屏幕底部横条里有什么字（不用选择器，直接读可视区文字）
  const readBottomBar = async () => await ev(`(function(){
    var vw=window.innerWidth, vh=window.innerHeight;
    // 在底部 100px 高的带状区域，从上到下扫，读那里的文字
    var hits=[];
    var seen={};
    for(var y=vh-1; y>vh-120; y-=4){
      for(var x=40; x<vw-40; x+=40){
        var el=document.elementFromPoint(x,y);
        if(!el) continue;
        var t=(el.innerText||el.textContent||'').trim();
        if(t && !seen[t] && t.length<20){ seen[t]=1; var r=el.getBoundingClientRect(); hits.push({text:t, x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2), rectY:Math.round(r.y)}); }
      }
    }
    return {vh:vh, items:hits};
  })()`);

  // 用户视角：读当前进度文字（答题区那个 "N / 12"，不是顶部条带的 "27/79"）
  const readProgress = async () => await ev(`(function(){
    var qc=document.querySelector('.quiz-count');
    if(qc&&qc.innerText.trim())return qc.innerText.trim();
    // 兜底：在答题区文本里找
    var main=document.querySelector('.quiz');
    if(!main)return null;
    var m=main.innerText.match(/(\\d+)\\s*\\/\\s*(\\d+)/);
    return m?m[0]:null;
  })()`);

  const clickAt = async (x, y) => {
    await cdp.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await cdp.call('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await cdp.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    await sleep(450);
  };

  await ev(`localStorage.clear()`);
  await cdp.call('Page.reload'); await sleep(2000);

  // 进入答题：找屏幕上「开始学」这几个字的位置
  const startPos = await ev(`(function(){
    var bs=document.querySelectorAll('button');
    for(var i=0;i<bs.length;i++){var b=bs[i];if(!b.disabled&&b.innerText.trim().indexOf('开始学')>=0){var r=b.getBoundingClientRect();if(r.width>0)return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}}}
    return null;
  })()`);
  if (startPos) await clickAt(startPos.x, startPos.y);
  await sleep(600);

  out.log.push('进入答题页进度: ' + (await readProgress()));
  const bar1 = await readBottomBar();
  out.log.push('进入后底部横条读到的字: ' + JSON.stringify(bar1.items.map((i) => i.text)));

  // 选第一个选项（按屏幕上的选项位置点）
  const optPos = await ev(`(function(){
    var os=document.querySelectorAll('.opt,.option,[data-opt]');
    if(!os.length)return null; var r=os[0].getBoundingClientRect();
    return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};
  })()`);
  await clickAt(optPos.x, optPos.y);

  // 点底部横条里的按钮（文字应是「提交」）
  let bar = await readBottomBar();
  let submitItem = bar.items.find((i) => i.text === '提交');
  out.log.push('提交前底部横条按钮: ' + JSON.stringify(submitItem ? submitItem.text : '没找到提交'));
  if (submitItem) await clickAt(submitItem.x, submitItem.y);
  await sleep(700);

  // 关键：提交后再读底部横条——用户看到的到底是什么字
  bar = await readBottomBar();
  out.log.push('提交后底部横条读到的字: ' + JSON.stringify(bar.items.map((i) => i.text)));
  const nextItem = bar.items.find((i) => i.text === '下一题');
  out.log.push('提交后底部有没有「下一题」: ' + (nextItem ? '有，位置 ' + nextItem.x + ',' + nextItem.y : '没有'));

  // 按文字点「下一题」
  const progBefore = await readProgress();
  if (nextItem) await clickAt(nextItem.x, nextItem.y);
  await sleep(600);
  const progAfter = await readProgress();
  out.log.push(`点「下一题」前后进度: ${progBefore} -> ${progAfter}`);

  console.log(out.log.join('\n'));
  writeFileSync('data', JSON.stringify(out, null, 2), 'utf8');
  cdp.close();
} catch (e) { console.log('异常: ' + e.message); } finally { proc.kill(); }
