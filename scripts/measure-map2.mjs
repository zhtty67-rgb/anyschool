// 再量一次 #map，这次把"量的到底是哪份文件"也打出来
// 前面量到 #map 不存在，但三份文件里都有 79 个 map-node。
// 唯一解释：先前量的不是我以为的那份。所以这次把 path/md5 一起打，不再凭假设。
import { spawn } from 'node:child_process';
import { existsSync, rmSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PAGE = 'data';
const PORT = 9341;
const PROFILE = 'data';

// 量的这份文件是什么，先记下来
const buf = readFileSync(PAGE);
console.log('要量的文件: ' + PAGE);
console.log('  字节 ' + buf.length + '  md5 ' + createHash('md5').update(buf).digest('hex').slice(0, 8));

if (existsSync(PROFILE)) rmSync(PROFILE, { recursive: true, force: true });

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--window-size=1440,900',
  '--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE,
  'file:///' + PAGE.replace(/\\/g, '/'),
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let wsUrl = null;
  for (let i = 0; i < 60; i += 1) {
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
    if (r.exceptionDetails) return 'ERR: ' + r.exceptionDetails.text;
    return r.result?.value;
  };

  await send('Runtime.enable');
  await sleep(1500);

  console.log('\n=== 浏览器实际加载的 ===');
  console.log('URL      : ' + await ev('location.href'));
  console.log('readyState: ' + await ev('document.readyState'));
  console.log('body 子元素: ' + await ev('Array.from(document.body.children).map(function(x){return x.tagName+"."+x.className}).join(" | ")'));
  console.log('#map 存在 : ' + await ev('!!document.getElementById("map")'));
  console.log('.map-wrap : ' + await ev('document.querySelectorAll(".map-wrap").length'));
  console.log('.map-svg  : ' + await ev('document.querySelectorAll(".map-svg").length'));
  console.log('.map-node : ' + await ev('document.querySelectorAll(".map-node").length'));
  console.log('svg 数量  : ' + await ev('document.querySelectorAll("svg").length'));
  console.log('页面高度  : ' + await ev('document.body.scrollHeight'));

  ws.close();
  chrome.kill();
  process.exit(0);
})().catch((e) => { console.error(e.message); try { chrome.kill(); } catch {} process.exit(2); });
