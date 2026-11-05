// 验证：按钮位置在提交前后是否变化
// 小白说"底部横条里的按钮没有变成下一题"——如果他按提交前的坐标去点，
// 而提交后按钮位置变了，就会点空。这里把两个位置的坐标都量出来对比。
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 19671;
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
  const click = async (x, y) => {
    await cdp.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await cdp.call('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await cdp.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    await sleep(450);
  };
  // 量出底部那个按钮的位置和文字
  const btnInfo = async () => await ev(`(function(){
    var vh=window.innerHeight, vw=window.innerWidth;
    // 从屏幕最底部往上扫，找第一块有字的按钮区域
    for(var y=vh-6; y>vh-120; y-=3){
      var el=document.elementFromPoint(vw/2, y);
      if(!el) continue;
      var btn=el.closest('button')||el;
      var t=(btn.innerText||'').trim();
      if(t){ var r=btn.getBoundingClientRect();
        return {text:t, cx:Math.round(r.x+r.width/2), cy:Math.round(r.y+r.height/2), top:Math.round(r.top), bottom:Math.round(r.bottom), w:Math.round(r.width), h:Math.round(r.height), vw:vw, vh:vh};
      }
    }
    return null;
  })()`);

  await ev(`localStorage.clear()`);
  await cdp.call('Page.reload'); await sleep(2000);
  // 点开始学
  const sp = await ev(`(function(){var bs=document.querySelectorAll('button');for(var i=0;i<bs.length;i++){var b=bs[i];if(!b.disabled&&b.innerText.trim().indexOf('开始学')>=0){var r=b.getBoundingClientRect();if(r.width>0)return{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}}}return null})()`);
  if (sp) await click(sp.x, sp.y);
  await sleep(600);

  const before = await btnInfo();
  console.log('提交前按钮:', JSON.stringify(before));

  // 点第一个选项
  const op = await ev(`(function(){var o=document.querySelectorAll('.opt,.option,[data-opt]')[0];if(!o)return null;var r=o.getBoundingClientRect();return{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);
  await click(op.x, op.y);

  // 用"提交前量到的坐标"去点提交
  await click(before.cx, before.cy);
  await sleep(700);

  const after = await btnInfo();
  console.log('提交后按钮:', JSON.stringify(after));

  console.log('\n位置是否变化:',
    before.cx === after.cx && before.cy === after.cy
      ? `没变，都是 (${before.cx},${before.cy})`
      : `变了！提交前 (${before.cx},${before.cy}) → 提交后 (${after.cx},${after.cy})，用旧坐标点会点空`);
  console.log('文字:', before.text, '->', after.text);

  // 用提交前的老坐标再点一次，看会不会点空（复现小白的场景）
  await click(before.cx, before.cy);
  await sleep(500);
  const prog = await ev(`(document.querySelector('.quiz-count')||{}).innerText||'-'`);
  console.log('用提交前的老坐标点一次后，进度:', prog);

  writeFileSync('data', JSON.stringify({ before, after, prog }, null, 2), 'utf8');
  cdp.close();
} catch (e) { console.log('异常: ' + e.message); } finally { proc.kill(); }
