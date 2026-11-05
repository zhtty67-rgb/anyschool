// 诊断：Chrome 打开产物后，页面里到底有什么
import { spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DIST = 'data';
const PORT = 9334;
const PROFILE = 'data';

if (existsSync(PROFILE)) rmSync(PROFILE, { recursive: true, force: true });

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE,
  'file:///' + DIST.replace(/\\/g, '/'),
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let wsUrl = null;
  for (let i = 0; i < 40; i += 1) {
    try {
      const r = await fetch('http://127.0.0.1:' + PORT + '/json/list');
      const list = await r.json();
      const p = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (p) { wsUrl = p.webSocketDebuggerUrl; break; }
    } catch { /* */ }
    await sleep(250);
  }
  if (!wsUrl) throw new Error('调试端口没起来');

  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
  };
  const send = (method, params = {}) => new Promise((r) => {
    const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params }));
  });
  const ev = async (e) => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.exceptionDetails) return 'ERR: ' + JSON.stringify(r.exceptionDetails).slice(0, 200);
    return r.result?.value;
  };

  await send('Runtime.enable');
  await sleep(2000);

  console.log('URL: ' + await ev('location.href'));
  console.log('readyState: ' + await ev('document.readyState'));
  console.log('title: ' + await ev('document.title'));
  console.log('body 前 200 字: ' + String(await ev("document.body ? document.body.innerText.slice(0,200) : '(no body)'")).replace(/\n/g, ' | '));
  console.log('__SNAP__ 类型: ' + await ev('typeof window.__SNAP__'));
  console.log('app 元素: ' + await ev("!!document.getElementById('app')"));
  console.log('script 数量: ' + await ev('document.scripts.length'));
  console.log('页面内错误（若有会在 console 里，这里查 window.onerror 捕获）: '
    + await ev('window.__err__ || "(无)"'));

  ws.close();
  chrome.kill();
  process.exit(0);
})().catch((e) => { console.error(e.message); try { chrome.kill(); } catch {} process.exit(2); });
