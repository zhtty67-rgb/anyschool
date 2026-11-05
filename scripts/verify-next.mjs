// 专项：确认「下一题」到底能不能跳。分别用 程序化 click / 元素坐标点击 / 键盘 三种方式
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 19561;
const PROFILE = 'data';

const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--window-size=1400,1000',
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
  const progress = async () => (await ev(`(()=>{const e=document.querySelector('.quiz-count');return e?e.innerText.trim():'-'})()`));

  await ev(`localStorage.clear()`);
  await cdp.call('Page.reload'); await sleep(2200);

  // 进节点
  await ev(`(()=>{const b=[...document.querySelectorAll('[data-act="study"]')].find(x=>!x.disabled);if(b)b.click()})()`);
  await sleep(700);
  const total = await ev(`(()=>{const e=document.querySelector('.quiz-count');return e?e.innerText.trim():'-'})()`);
  check('进入答题页', /^1\s*\/\s*\d+$/.test(total), total);

  // 第一题：程序化点击选项 + 提交
  await ev(`(()=>{const o=document.querySelectorAll('.opt,.option,[data-opt]')[0];if(o)o.click()})()`);
  await sleep(200);
  await ev(`(()=>{const b=document.querySelector('[data-act="submit"]');if(b)b.click()})()`);
  await sleep(600);
  check('提交后出现下一题按钮', (await ev(`!!document.querySelector('[data-act="next"]')`)) === true);

  // 按钮必须停在固定可控的位置，而且中心能命中（之前是跟着内容跑、贴屏幕边缘）
  const pos = await ev(`(()=>{const b=document.querySelector('[data-act="next"]');if(!b)return null;const r=b.getBoundingClientRect();const vh=window.innerHeight;const el=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {top:Math.round(r.top),bottom:Math.round(r.bottom),vh,distFromBottom:Math.round(vh-r.top),hit:el?el.closest('[data-act]')?'ok':'other':null,position:getComputedStyle(b.closest('.quiz-actions')||b).position}})()`);
  check('按钮在视口内', pos && pos.top > 0 && pos.bottom <= pos.vh, JSON.stringify(pos));
  check('按钮固定到底部(不随内容跑)', pos && pos.position === 'fixed', pos ? pos.position : '');
  check('按钮完全可见不被裁切', pos && pos.bottom <= pos.vh, pos ? `bottom=${pos.bottom} vh=${pos.vh}` : '');
  check('按钮中心可命中', pos && pos.hit === 'ok', pos ? pos.hit : '');
  // 滚动到底之后，按钮位置必须不变（这才是"不用找"）
  await ev(`window.scrollTo(0,document.body.scrollHeight)`);
  await sleep(400);
  const pos2 = await ev(`(()=>{const b=document.querySelector('[data-act="next"]');const r=b.getBoundingClientRect();return {top:Math.round(r.top),vh:window.innerHeight}})()`);
  check('滚动后按钮位置不变', pos && pos2 && Math.abs(pos2.top - pos.top) <= 2, `前 ${pos && pos.top} / 后 ${pos2 && pos2.top}`);
  await ev(`window.scrollTo(0,0)`);
  await sleep(300);
  out.notes.push('按钮位置: ' + JSON.stringify(pos));

  // 方式一：程序化 click
  await ev(`(()=>{const b=document.querySelector('[data-act="next"]');if(b)b.click()})()`);
  await sleep(600);
  const p1 = await progress();
  check('方式一 程序化 click 能翻页', p1 === '2 / 12', p1);

  // 回到 1，用真实鼠标事件（坐标点击）
  await ev(`(()=>{const b=document.querySelector('[data-act="back"]');if(b)b.click()})()`);
  await sleep(500);
  await ev(`(()=>{const b=[...document.querySelectorAll('[data-act="study"]')].find(x=>!x.disabled);if(b)b.click()})()`);
  await sleep(600);
  await ev(`(()=>{const o=document.querySelectorAll('.opt,.option,[data-opt]')[0];if(o)o.click()})()`);
  await sleep(200);
  await ev(`(()=>{const b=document.querySelector('[data-act="submit"]');if(b)b.click()})()`);
  await sleep(600);

  const box = await ev(`(()=>{const b=document.querySelector('[data-act="next"]');if(!b)return null;const r=b.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),visible:r.width>0&&r.height>0,top:Math.round(r.top),bottom:Math.round(r.bottom),vh:window.innerHeight}})()`);
  out.notes.push('按钮位置: ' + JSON.stringify(box));

  // 滚到按钮可见
  await ev(`(()=>{const b=document.querySelector('[data-act="next"]');if(b)b.scrollIntoView({block:'center'})})()`);
  await sleep(400);
  const box2 = await ev(`(()=>{const b=document.querySelector('[data-act="next"]');const r=b.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),vh:window.innerHeight}})()`);

  // 真实鼠标按下+抬起
  await cdp.call('Input.dispatchMouseEvent', { type: 'mousePressed', x: box2.x, y: box2.y, button: 'left', clickCount: 1 });
  await cdp.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box2.x, y: box2.y, button: 'left', clickCount: 1 });
  await sleep(700);
  const p2 = await progress();
  check('方式二 真实鼠标点击能翻页', p2 === '2 / 12', `${p2}  (坐标 ${box2.x},${box2.y}, 视口高 ${box2.vh})`);

  // 方式三：键盘回车
  if (p2 !== '2 / 12') {
    await ev(`(()=>{const b=document.querySelector('[data-act="next"]');if(b)b.focus()})()`);
    await cdp.call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await cdp.call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await sleep(600);
    const p3 = await progress();
    check('方式三 键盘回车能翻页', p3 === '2 / 12', p3);
  }

  // 检查事件监听是否挂在正确的容器上
  const listenerInfo = await ev(`(()=>{
    const app=document.getElementById('app');
    const b=document.querySelector('[data-act="next"]');
    if(!b)return 'no-btn';
    const r=b.getBoundingClientRect();
    const el=document.elementFromPoint(r.x+r.width/2, r.y+r.height/2);
    return {tag:el?el.tagName:null, cls:el?el.className:null, path: el&&el.closest('[data-act]')?el.closest('[data-act]').getAttribute('data-act'):'无', inApp: !!(el&&el.closest('#app'))};
  })()`);
  out.notes.push('按钮中心点的实际元素: ' + JSON.stringify(listenerInfo));

  cdp.close();
} catch (e) { out.error = e.message; } finally { proc.kill(); }

writeFileSync('data', JSON.stringify(out, null, 2), 'utf8');
console.log('通过 ' + out.pass.length + ' 项，失败 ' + out.fail.length + ' 项');
out.pass.forEach((p) => console.log('  [OK] ' + p));
out.fail.forEach((f) => console.log('  [FAIL] ' + f));
out.notes.forEach((n) => console.log('  [注] ' + n));
if (out.error) console.log('异常: ' + out.error);
