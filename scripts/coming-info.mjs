// 查折叠区在页面上的实际位置：它上面是什么、下面是什么、是不是最后一个元素
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 19731;
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

  const info = await ev(`(function(){
    var main=document.querySelector('main.tree');
    if(!main) return {noMain:true};
    var kids=[].slice.call(main.children);
    var idx=kids.findIndex(function(k){return k.classList.contains('coming')});
    var c=document.querySelector('details.coming');
    var r=c?c.getBoundingClientRect():null;
    var docH=document.documentElement.scrollHeight;
    // coming 之前紧邻的三个兄弟
    var before = idx>0 ? kids.slice(Math.max(0,idx-3),idx).map(function(k){return {tag:k.tagName,cls:String(k.className),title:(k.querySelector('h2')||{}).innerText||''}}) : [];
    return {
      mainChildren: kids.length,
      comingIndex: idx,
      isLast: idx === kids.length-1,
      afterCount: kids.length-1-idx,
      childrenKinds: kids.map(function(k){return k.tagName+'.'+String(k.className).split(' ')[0]}),
      comingTop: r?Math.round(r.top):null,
      pageHeight: docH,
      before: before
    };
  })()`);
  console.log(JSON.stringify(info, null, 1));
  writeFileSync('data', JSON.stringify(info, null, 2), 'utf8');
  cdp.close();
} catch (e) { console.log('异常: ' + e.message); } finally { proc.kill(); }
