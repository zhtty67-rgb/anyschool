// 复现小白的操作路径：像人一样 用鼠标点 C → 点提交 → 点下一题 → 刷新看进度
// 全程只用真实鼠标事件（Input.dispatchMouseEvent），不用 element.click()
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 19571;
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

const out = { pass: [], fail: [], notes: [] };
const check = (n, ok, d) => (ok ? out.pass : out.fail).push(d === undefined ? n : `${n}=${d}`);

let cdp, cdp2;
try {
  const list = await getJson('/json/list');
  const page = list.find((t) => t.type === 'page');
  cdp = await connect(page.webSocketDebuggerUrl);
  await cdp.call('Runtime.enable'); await cdp.call('Page.enable');
  await sleep(2500);
  const ev = async (x) => {
    const r = await cdp.call('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return '__ERR__' + (r.exceptionDetails.text || '');
    return r.result.value;
  };
  // 真实鼠标点击某个选择器
  const humanClick = async (sel, idx = 0, label = sel) => {
    const box = await ev(`(()=>{const els=document.querySelectorAll(${JSON.stringify(sel)});const b=els[${idx}];if(!b)return null;b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);
    if (!box) { out.notes.push(`找不到 ${label}`); return false; }
    await sleep(250);
    await cdp.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y });
    await cdp.call('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
    await cdp.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
    await sleep(450);
    return true;
  };
  const progress = async () => (await ev(`(()=>{const e=document.querySelector('.quiz-count');return e?e.innerText.trim():'-'})()`));

  await ev(`localStorage.clear()`);
  await cdp.call('Page.reload'); await sleep(2200);

  // 1. 像小白一样：点「开始学」
  const ok1 = await humanClick('[data-act="study"]:not([disabled])', 0, '开始学');
  check('鼠标点「开始学」进入答题页', ok1 && /^1\s*\/\s*\d+$/.test(await progress()), await progress());

  // 2. 连续做 3 题，全程真实鼠标
  let done = 0;
  for (let k = 0; k < 3; k++) {
    await humanClick('.opt,.option,[data-opt]', 2, `第${k + 1}题选项C`);
    await humanClick('[data-act="submit"]', 0, '提交');
    const p = await progress();
    await humanClick('[data-act="next"]', 0, '下一题');
    const p2 = await progress();
    if (p2 !== p) done++;
    out.notes.push(`第${k + 1}题: 提交前 ${p} → 点下一题后 ${p2}`);
  }
  check('鼠标点「下一题」真的翻页', done >= 3, `成功翻页 ${done} 次`);

  // 3. 刷新看进度
  const before = await progress();
  await cdp.call('Page.reload');
  await sleep(2500);
  const records = await ev(`JSON.parse(localStorage.getItem('anylearn.records')||'[]').length`);
  check('刷新后作答记录还在', records >= 3, `${records} 条`);
  const band = await ev(`(document.querySelector('.band')||{}).innerText||''`);
  check('刷新后不再是新人态', !/你还没开始/.test(band));
  out.notes.push('刷新后条带: ' + String(band).replace(/\n/g, ' | ').slice(0, 200));

  cdp.close();
} catch (e) { out.error = e.message; } finally { proc.kill(); }

writeFileSync('data', JSON.stringify(out, null, 2), 'utf8');
console.log('通过 ' + out.pass.length + ' 项，失败 ' + out.fail.length + ' 项');
out.pass.forEach((p) => console.log('  [OK] ' + p));
out.fail.forEach((f) => console.log('  [FAIL] ' + f));
out.notes.forEach((n) => console.log('  [注] ' + n));
if (out.error) console.log('异常: ' + out.error);
