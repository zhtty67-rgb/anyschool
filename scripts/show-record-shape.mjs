// 把 localStorage 里 anylearn.records 的真实结构打出来，回答"存的是什么"
import { spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DIST = 'data';
const PORT = 9337;
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
  const ev = async (e) => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    return r.result?.value;
  };

  await send('Runtime.enable');
  for (let i = 0; i < 60; i += 1) {
    if (await ev("document.readyState==='complete' && !!window.__SNAP__")) break;
    await sleep(250);
  }

  // 清空后模拟答两道题，看写入的真实结构
  await ev("localStorage.removeItem('anylearn.records'); true");
  await ev(`
    (function(){
      var arr = [
        {id:'c0101-01', node:'c0101', correct:true,  at:'2026-11-05T07:40:00.000Z'},
        {id:'c0101-02', node:'c0101', correct:false, at:'2026-11-05T07:41:00.000Z'}
      ];
      localStorage.setItem('anylearn.records', JSON.stringify(arr));
      return arr.length;
    })()
  `);

  console.log('localStorage 键：' + await ev("Object.keys(localStorage).join(', ')"));
  console.log('anylearn.records 原始值：');
  console.log(await ev("localStorage.getItem('anylearn.records')"));
  console.log('');
  console.log('实际字段名：' + await ev(
    "Object.keys(JSON.parse(localStorage.getItem('anylearn.records'))[0]).join(', ')",
  ));
  console.log('');
  console.log('页面读回后，掌握度有没有算进去：');
  console.log('  ' + await ev(
    "JSON.stringify(window.__SNAP__.tree.modules[0].concepts[0].mastery)",
  ));

  ws.close();
  chrome.kill();
  process.exit(0);
})().catch((e) => { console.error(e.message); try { chrome.kill(); } catch {} process.exit(2); });
