// 核实：写入 2 条 c0101 记录后，c0101 这个节点到底有没有吃进去
//
// 2026-11-05：我先前打印的是 tree.modules[0].concepts[0]，
// 那未必是 c0101，读到 samples:0 就以为记录没进去。
// 这次按 code 精确找节点，并打印每步的中间值。
import { spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DIST = 'data';
const PORT = 9338;
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
    if (r.exceptionDetails) return 'ERR ' + r.exceptionDetails.text;
    return r.result?.value;
  };

  await send('Runtime.enable');
  for (let i = 0; i < 60; i += 1) {
    if (await ev("document.readyState==='complete' && !!window.__SNAP__")) break;
    await sleep(250);
  }

  // 写 3 条（MIN_SHOWN 门槛可能正好是 3），全挂 c0101
  await ev("localStorage.removeItem('anylearn.records'); true");
  await ev(`
    (function(){
      localStorage.setItem('anylearn.records', JSON.stringify([
        {id:'c0101-01', node:'c0101', correct:true,  at:'2026-11-05T07:40:00.000Z'},
        {id:'c0101-02', node:'c0101', correct:true,  at:'2026-11-05T07:41:00.000Z'},
        {id:'c0101-03', node:'c0101', correct:false, at:'2026-11-05T07:42:00.000Z'}
      ]));
      return true;
    })()
  `);

  // 刷新让页面走一次完整的 loadRecords → applyRecords
  await ev('location.reload(); true').catch(() => {});
  await sleep(600);
  for (let i = 0; i < 60; i += 1) {
    const ok = await ev("document.readyState==='complete' && !!window.__SNAP__");
    if (ok === true) break;
    await sleep(250);
  }
  await sleep(400);

  console.log('存储里的记录数：' + await ev("JSON.parse(localStorage.getItem('anylearn.records')||'[]').length"));
  console.log('');
  console.log('第 0 个模块第一个概念是谁：' + await ev('window.__SNAP__.tree.modules[0].concepts[0].code'));
  console.log('');
  console.log('按 code 精确找 c0101 的 mastery：');
  console.log('  ' + await ev(`
    (function(){
      var hit=null;
      window.__SNAP__.tree.modules.forEach(function(m){m.concepts.forEach(function(c){if(c.code==='c0101')hit=c})});
      return hit ? JSON.stringify(hit.mastery) : '没找到 c0101';
    })()
  `));
  console.log('');
  console.log('summary：' + await ev('JSON.stringify(window.__SNAP__.summary)'));

  ws.close();
  chrome.kill();
  process.exit(0);
})().catch((e) => { console.error(e.message); try { chrome.kill(); } catch {} process.exit(2); });
