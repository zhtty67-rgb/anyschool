// 截图：提交后的真实画面，存成 PNG 让能看图的人确认「下一题」真的在屏幕上
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 19601;
const PROFILE = 'data';
const OUT = 'data';

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
  // 选 C，和 小白 一样
  await ev(`(()=>{const els=document.querySelectorAll('.opt,.option,[data-opt]');if(els[2])els[2].click()})()`);
  await sleep(250);
  await ev(`(()=>{const b=document.querySelector('[data-act="submit"]');if(b)b.click()})()`);
  await sleep(900);

  // 打印按钮在屏幕上的精确位置，供对照截图
  const geo = await ev(`(()=>{const b=document.querySelector('[data-act="next"]');if(!b)return null;const r=b.getBoundingClientRect();return {text:b.innerText.trim(),x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),insideViewport:(r.top>=0&&r.bottom<=window.innerHeight)}})()`);
  console.log('「下一题」按钮实际几何位置:', JSON.stringify(geo));

  const shot = await cdp.call('Page.captureScreenshot', { format: 'png' });
  writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
  console.log('截图已保存:', OUT);

  cdp.close();
} catch (e) { console.log('异常: ' + e.message); } finally { proc.kill(); }
