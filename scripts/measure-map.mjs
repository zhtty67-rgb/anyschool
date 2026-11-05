// 量 #map 在真实浏览器里的渲染尺寸
// 2026-11-05：小白说"没看到图"，但 HTML 里 map-wrap 确实在。
// 只有一种可能：它渲染出来的高度是 0，或被别的东西盖住/挤走。
// 不猜，直接开 Chrome 量。
import { spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PAGE = 'data';
const PORT = 9340;
const PROFILE = 'data';

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
  for (let i = 0; i < 40; i += 1) {
    try {
      const r = await fetch('http://127.0.0.1:' + PORT + '/json/list');
      const list = await r.json();
      const p = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (p) { wsUrl = p.webSocketDebuggerUrl; break; }
    } catch { /* 还没起来 */ }
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
  for (let i = 0; i < 60; i += 1) {
    if (await ev("document.readyState==='complete'")) break;
    await sleep(250);
  }
  await sleep(600);

  const probe = `
(function(){
  var el = document.getElementById('map');
  var svg = document.querySelector('.map-svg');
  var wrap = document.querySelector('.map-wrap');
  function box(e){ if(!e) return null; var r=e.getBoundingClientRect();
    return {w:Math.round(r.width),h:Math.round(r.height),top:Math.round(r.top),left:Math.round(r.left)}; }
  var cs = el ? getComputedStyle(el) : null;
  return JSON.stringify({
    exists: !!el,
    wrapBox: box(wrap),
    mapBox: box(el),
    svgBox: box(svg),
    display: cs ? cs.display : null,
    visibility: cs ? cs.visibility : null,
    overflow: cs ? cs.overflow : null,
    svgViewBox: svg ? svg.getAttribute('viewBox') : null,
    svgWidthAttr: svg ? svg.getAttribute('width') : null,
    // 图在整页里的顺序：前面有几个兄弟节点
    prevSiblings: wrap ? Array.from(wrap.parentNode.children).indexOf(wrap) : -1,
    parentTag: wrap ? wrap.parentNode.tagName : null,
    pageHeight: document.body.scrollHeight,
    viewport: window.innerHeight,
    mapNodeCount: document.querySelectorAll('.map-node').length,
    mapEdgeCount: document.querySelectorAll('.map-edge').length
  }, null, 2);
})()`;

  console.log(await ev(probe));

  ws.close();
  chrome.kill();
  process.exit(0);
})().catch((e) => { console.error(e.message); try { chrome.kill(); } catch {} process.exit(2); });
