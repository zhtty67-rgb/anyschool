// 验证「折叠区数字由数据决定」：改快照 → 重新载入 → 数字必须跟着变
import { spawn } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SRC = 'data';
const TMP = 'data';
const PORT = 19553;
const PROFILE = 'data';

// 造两份：原版(52) 和 把一个节点题量清零后的版本(应为 53)
const orig = readFileSync(SRC, 'utf8');
const idx = orig.indexOf('"questionCount":12');
if (idx < 0) { console.log('未找到 questionCount:12，退出'); process.exit(1); }
writeFileSync(TMP, orig.slice(0, idx) + '"questionCount":0' + orig.slice(idx + '"questionCount":12'.length), 'utf8');

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

let proc;
try {
  proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--window-size=1400,1000', 'file:///D:/jiaoyu/work/edu/dist/index.html'], { stdio: 'ignore' });
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

  // 原版
  const readCount = `(()=>{const e=document.querySelector('[data-coming-count]');if(e)return e.textContent.trim();const s=document.querySelector('details.coming summary');const m=s?s.innerText.match(/还有\\s*(\\d+)/):null;return m?m[1]:null})()`;
  const n1 = await ev(readCount);
  check('原版折叠区数字=52', n1 === '52', n1);

  // 载入改动版（模拟合并后数据变了）
  await cdp.call('Page.navigate', { url: 'file:///D:/jiaoyu/work/edu/dist/_count-test.html' });
  await sleep(2500);
  const n2 = await ev(readCount);
  check('数据变了数字跟着变=53', n2 === '53', n2);
  const vis = await ev(`(()=>{const d=document.querySelector('details.coming');return d?d.querySelector('summary').innerText.trim().slice(0,20):null})()`);
  out.notes.push('改动版折叠区文案: ' + vis);

  cdp.close();
} catch (e) { out.error = e.message; } finally { if (proc) proc.kill(); }

writeFileSync('data', JSON.stringify(out, null, 2), 'utf8');
console.log('通过 ' + out.pass.length + ' 项，失败 ' + out.fail.length + ' 项');
out.pass.forEach((p) => console.log('  [OK] ' + p));
out.fail.forEach((f) => console.log('  [FAIL] ' + f));
out.notes.forEach((n) => console.log('  [注] ' + n));
if (out.error) console.log('异常: ' + out.error);
