// 最小复现：为什么验证脚本读不到 __SNAP__，诊断脚本能读到
// 唯一的差别是求值参数。逐个加，看是哪个把它弄坏的。
import { spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DIST = 'data';
const PORT = 9335;
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
  if (!wsUrl) throw new Error('端口没起来');

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

  await send('Runtime.enable');
  await sleep(2000);

  const probe = async (label, params) => {
    const r = await send('Runtime.evaluate', { expression: 'typeof window.__SNAP__', ...params });
    console.log(label.padEnd(52) + ' → ' + JSON.stringify(r.result?.value ?? r.exceptionDetails?.text ?? r));
  };

  await probe('只给 expression', { returnByValue: true });
  await probe('+ awaitPromise: true', { returnByValue: true, awaitPromise: true });
  await probe('+ userGesture: true', { returnByValue: true, userGesture: true });
  await probe('+ awaitPromise + userGesture', { returnByValue: true, awaitPromise: true, userGesture: true });
  await probe('全都不加（只 expression）', {});

  ws.close();
  chrome.kill();
  process.exit(0);
})().catch((e) => { console.error(e.message); try { chrome.kill(); } catch {} process.exit(2); });
