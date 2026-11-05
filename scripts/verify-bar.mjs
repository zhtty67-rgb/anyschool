// Chief 要求的三处验证：点横条最左端、最右端、正中，都要能翻页
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 19681;
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

const out = { pass: [], fail: [], notes: [] };
const check = (n, ok, d) => (ok ? out.pass : out.fail).push(d === undefined ? n : `${n}=${d}`);

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
    await sleep(500);
  };
  const bar = async () => await ev(`(function(){
    var b=document.querySelector('.quiz-actions');
    if(!b)return null;
    var r=b.getBoundingClientRect();
    return {left:Math.round(r.left), right:Math.round(r.right), top:Math.round(r.top), bottom:Math.round(r.bottom),
      cy:Math.round(r.top+r.height/2), text:b.innerText.trim(), act:b.getAttribute('data-act'),
      cursor:getComputedStyle(b).cursor};
  })()`);
  const progress = async () => await ev(`(document.querySelector('.quiz-count')||{}).innerText||'-'`);

  await ev(`localStorage.clear()`);
  await cdp.call('Page.reload'); await sleep(2000);
  const sp = await ev(`(function(){var bs=document.querySelectorAll('[data-act="study"]:not([disabled])');if(!bs.length)return null;var r=bs[0].getBoundingClientRect();return{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);
  if (sp) await click(sp.x, sp.y);
  await sleep(600);

  const b0 = await bar();
  out.notes.push('提交前横条: ' + JSON.stringify(b0));
  check('横条容器带 data-act=submit', b0 && b0.act === 'submit', b0 && b0.act);
  check('横条整条是手型光标', b0 && b0.cursor === 'pointer', b0 && b0.cursor);

  // 点最左端提交
  const optPos = await ev(`(function(){var o=document.querySelectorAll('.opt,.option,[data-opt]')[0];var r=o.getBoundingClientRect();return{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);
  await click(optPos.x, optPos.y);
  await click(b0.left + 8, b0.cy);   // 最左端
  const afterLeft = await bar();
  out.notes.push('左端点提交后横条: ' + JSON.stringify(afterLeft));
  check('点最左端能提交', afterLeft && afterLeft.act === 'next', afterLeft && afterLeft.act);
  check('提交后文字变「下一题」', afterLeft && afterLeft.text === '下一题', afterLeft && afterLeft.text);

  // 点最右端翻页
  const p1 = await progress();
  await click(afterLeft.right - 8, afterLeft.cy);
  const p2 = await progress();
  check('点最右端能翻页', p2 !== p1, `${p1} -> ${p2}`);

  // 下一题：点正中提交，再点左端翻页
  const b1 = await bar();
  check('第2题横条回到 submit', b1 && b1.act === 'submit', b1 && b1.act);
  const o2 = await ev(`(function(){var o=document.querySelectorAll('.opt,.option,[data-opt]')[0];var r=o.getBoundingClientRect();return{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);
  await click(o2.x, o2.y);
  await click(Math.round((b1.left + b1.right) / 2), b1.cy);  // 正中
  const afterMid = await bar();
  check('点正中能提交', afterMid && afterMid.act === 'next', afterMid && afterMid.act);

  const p3 = await progress();
  await click(afterMid.left + 8, afterMid.cy);
  const p4 = await progress();
  check('再次点左端能翻页', p4 !== p3, `${p3} -> ${p4}`);

  cdp.close();
} catch (e) { out.fail.push('异常=' + e.message); } finally { proc.kill(); }

writeFileSync('data', JSON.stringify(out, null, 2), 'utf8');
console.log(`通过 ${out.pass.length} 项，失败 ${out.fail.length} 项`);
out.pass.forEach((p) => console.log('  [OK] ' + p));
out.fail.forEach((f) => console.log('  [FAIL] ' + f));
out.notes.forEach((n) => console.log('  [注] ' + n));
