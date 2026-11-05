// 走完 c0101 全部 12 道题（含 1 道只有 A/B 的判断题），每一步都记录状态
// 目的：证明翻页能一路走到最后，并暴露判断题与单选题交替时的表现
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 19651;
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
  // 真实鼠标点击
  const click = async (sel, idx = 0) => {
    const b = await ev(`(()=>{const e=document.querySelectorAll(${JSON.stringify(sel)})[${idx}];if(!e)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);
    if (!b) return false;
    await sleep(180);
    await cdp.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: b.x, y: b.y });
    await cdp.call('Input.dispatchMouseEvent', { type: 'mousePressed', x: b.x, y: b.y, button: 'left', clickCount: 1 });
    await cdp.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b.x, y: b.y, button: 'left', clickCount: 1 });
    await sleep(420);
    return true;
  };
  const state = async () => await ev(`(()=>{
    var c=(document.querySelector('.quiz-count')||{}).innerText||'-';
    var opts=document.querySelectorAll('.opt,.option,[data-opt]').length;
    var hasSubmit=!!document.querySelector('[data-act="submit"]');
    var hasNext=!!document.querySelector('[data-act="next"]');
    var barBtn=(document.querySelector('.quiz-actions button')||{}).innerText||'';
    var fb=!!document.querySelector('.feedback');
    var stem=((document.querySelector('.stem')||{}).innerText||'').slice(0,30);
    return {count:c,opts:opts,submit:hasSubmit,next:hasNext,barBtn:barBtn.trim(),feedback:fb,stem:stem};
  })()`);

  await ev(`localStorage.clear()`);
  await cdp.call('Page.reload'); await sleep(2000);
  await click('[data-act="study"]:not([disabled])', 0);
  await sleep(400);

  const rows = [];
  for (let i = 0; i < 13; i++) {
    const before = await state();
    rows.push({ step: `第${i + 1}题 提交前`, ...before });
    if (!before || before.count === '-' ) break;
    // 选第一个选项
    await click('.opt,.option,[data-opt]', 0);
    await click('[data-act="submit"]', 0);
    const after = await state();
    rows.push({ step: `第${i + 1}题 提交后`, ...after });
    if (!after || !after.next) { rows.push({ step: '没有下一题按钮，停止', stop: true }); break; }
    await click('[data-act="next"]', 0);
    const nextState = await state();
    rows.push({ step: `第${i + 1}题 点下一题后`, ...nextState });
    if (!nextState || nextState.count === before.count) { rows.push({ step: '翻页未生效', fail: true }); break; }
    if (nextState.count.startsWith('1')) break; // 回到第一题说明做完了
  }

  console.log('步骤 | 进度 | 选项数 | 提交 | 下一题 | 底部按钮文字 | 反馈');
  rows.forEach((r) => {
    console.log(`${r.step} | ${r.count || ''} | ${r.opts === undefined ? '' : r.opts} | ${r.submit === undefined ? '' : r.submit} | ${r.next === undefined ? '' : r.next} | ${r.barBtn || ''} | ${r.feedback === undefined ? '' : r.feedback}`);
  });
  writeFileSync('data', JSON.stringify(rows, null, 2), 'utf8');
  cdp.close();
} catch (e) { console.log('异常: ' + e.message); } finally { proc.kill(); }
