// 验证 4 条残留文案是否真的改掉了（在真实渲染的页面上查，不看源码）
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 19701;
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
  const text = async () => await ev(`document.body.innerText`);

  await ev(`localStorage.clear()`);
  await cdp.call('Page.reload'); await sleep(2300);

  const t0 = await text();
  out.notes.push('首屏条带: ' + await ev(`(document.querySelector('.band')||{}).innerText||''`).then((s) => String(s).replace(/\n/g, ' | ')));

  // 四处旧文案必须消失
  check('「有题节点」已消失', !t0.includes('有题节点'));
  check('「已经做过的节点」已消失', !t0.includes('已经做过的节点'));
  check('「掌握度可算」已消失', !t0.includes('掌握度可算'));

  // 新文案必须出现
  check('新文案「现在有题可做」出现', t0.includes('现在有题可做'));
  check('新文案「你开始做了没」出现', t0.includes('你开始做了没'));

  // 「未开始」在首屏
  check('「未开始」已消失（首屏）', !t0.includes('未开始'));
  check('新文案「你还没做」或「还没做」出现', t0.includes('还没做'));

  // 进答题页，检查「基线」
  await ev(`(()=>{const b=[...document.querySelectorAll('[data-act="study"]')].find(x=>!x.disabled);if(b)b.click()})()`);
  await sleep(700);
  await ev(`(()=>{const b=document.querySelector('[data-act="back"]');if(b)b.click()})()`);
  await sleep(600);
  const t1 = await text();
  check('「先建立基线」已消失', !t1.includes('建立基线'));
  check('新提示「先做几道看看你哪块薄弱」出现', t1.includes('先做几道看看你哪块薄弱'), t1.includes('先做几道') ? 'ok' : t1.match(/下一步[\s\S]{0,60}/) || '');

  const nextReason = await ev(`(()=>{const e=document.querySelector('.next-reason');return e?e.innerText.trim():null})()`);
  out.notes.push('下一步提示: ' + nextReason);

  cdp.close();
} catch (e) { out.fail.push('异常=' + e.message); } finally { proc.kill(); }

writeFileSync('data', JSON.stringify(out, null, 2), 'utf8');
console.log(`通过 ${out.pass.length} 项，失败 ${out.fail.length} 项`);
out.pass.forEach((p) => console.log('  [OK] ' + p));
out.fail.forEach((f) => console.log('  [FAIL] ' + f));
out.notes.forEach((n) => console.log('  [注] ' + n));
