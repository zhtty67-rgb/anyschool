// 阶段2 验收：从构建产物上量 DOM，不看单测通过
// 反向验证：paint() 一旦漏掉 mapView()，本脚本必须报错
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const FILE = process.argv[2] || 'data';
const PORT = 9450 + Math.floor(Math.random() * 40);
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const udd = 'data' + Date.now();
const p = spawn(EDGE, [
  '--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${udd}`, '--no-first-run', '--window-size=1600,1200',
  'file:///' + FILE.replace(/\\/g, '/')
], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getWs() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const l = await r.json();
      const pg = l.find(t => t.type === 'page');
      if (pg?.webSocketDebuggerUrl) return pg.webSocketDebuggerUrl;
    } catch { }
    await sleep(250);
  }
  throw new Error('CDP not up');
}

const ws = new WebSocket(await getWs());
let id = 0;
const pending = new Map();
ws.addEventListener('message', ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
await new Promise(r => ws.addEventListener('open', r));
const send = (method, params) => { const i = ++id; return new Promise(res => { pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); }); };
const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  return r.result?.result?.value;
};

await sleep(1600);

let pass = 0, fail = 0;
const results = [];
function check(name, cond, detail) {
  if (cond) { pass++; results.push(`  ✓ ${name}`); }
  else { fail++; results.push(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
  return cond;
}

// 用真实 DOM 量，不是 HTML 字符串
const d = await evalJs(`(() => {
  const map = document.getElementById('map');
  const r = map ? map.getBoundingClientRect() : null;
  return {
    exists: !!map,
    h: r ? Math.round(r.height) : 0,
    nodes: document.querySelectorAll('.map-node').length,
    edges: document.querySelectorAll('.map-edge').length,
    ready: document.readyState,
    appH: document.getElementById('app') ? Math.round(document.getElementById('app').getBoundingClientRect().height) : 0,
    order: Array.from(document.getElementById('app').children).map(e => e.id || e.className),
    total: (window.__SNAP__ && window.__SNAP__.summary) ? window.__SNAP__.summary.total : null,
  };
})()`);

console.log('构建产物 DOM 实测:', JSON.stringify(d));
check('页面首绘后 #map 存在（不是被 innerHTML 抹掉）', d.exists);
check('#map 有可见高度 > 200px', d.h > 200, `h=${d.h}`);
check('map-node 节点数 = 79', d.nodes === 79, `实际 ${d.nodes}`);
check('map-edge 边数 = 91', d.edges === 91, `实际 ${d.edges}`);
check('区块顺序 head → band → map → tree', JSON.stringify(d.order.slice(0, 4)) === JSON.stringify(['top', 'band', 'map', 'tree']), JSON.stringify(d.order.slice(0, 4)));
check('分母 summary.total = 45（不是 79）', d.total === 45, `实际 ${d.total}`);

// 弱项高亮：必须走真实判题链路，不能改 __SNAP__ 副本（那是另一个引用）
// 规则：样本 < MIN_SAMPLES(3) 不判定 → 图上不出琥珀；满 3 次才有
const amber = () => evalJs(`document.querySelectorAll('.map-node rect[stroke="#f5a524"]').length`);
const startCode = await evalJs(`window.__SNAP__.startNode && window.__SNAP__.startNode.code`);
const before = await amber();
for (let k = 0; k < 3; k++) {
  await evalJs(`(() => { const b=document.querySelector('[data-act="study"][data-node="${startCode}"]'); if(b)b.click(); })()`);
  await sleep(350);
  await evalJs(`(() => { const o=document.querySelector('[data-opt]'); if(o)o.click(); })()`);
  await sleep(250);
  await evalJs(`(() => { const s=document.querySelector('[data-act="submit"]'); if(s)s.click(); })()`);
  await sleep(350);
  await evalJs(`(() => { const b=document.querySelector('[data-act="back"]'); if(b)b.click(); })()`);
  await sleep(350);
}
const after = await amber();

console.log(`\n弱项高亮: 0 次作答 ${before} 个，答满 3 次后 ${after} 个`);
check('弱项高亮随掌握度变化（不是写死）', before === 0 && after > 0, `before=${before} after=${after}`);

// ── 阶段3：证据链（点开节点，看 DOM 里有没有真东西）──────────
// 点开图上起点节点，展开"这个数是怎么算出来的"
await evalJs(`(() => { const g=document.querySelector('.map-node[data-node="${startCode}"]'); if(g)g.dispatchEvent(new MouseEvent('click',{bubbles:true})); })()`);
await sleep(400);
const ev = await evalJs(`(() => {
  const box = document.getElementById('map-detail');
  if (!box) return { err: 'no map-detail' };
  const det = box.querySelector('details.basis');
  if (!det) return { err: 'no basis <details>', html: box.innerHTML.slice(0,200) };
  det.open = true;
  const txt = det.textContent;
  const codes = Array.from(det.querySelectorAll('code')).map(c => c.textContent);
  return {
    hasDetails: true,
    text: txt.replace(/\\s+/g,' ').slice(0, 400),
    codes,
    hasUndefined: /undefined/.test(txt),
    hasFormula: /decay=/.test(txt),
    attemptsShown: codes.filter(c => /^c\\d{4}-\\d{2,3}$/.test(c)).length,
  };
})()`);
console.log('\n证据链（点开节点后实际 DOM）:', JSON.stringify(ev, null, 2).slice(0, 700));
check('节点详情里有可展开的证据块', !!(ev && ev.hasDetails), ev && ev.err);
check('证据里 attempts 是真事件 id，不是 undefined', !!(ev && !ev.hasUndefined && ev.attemptsShown > 0), `attempts=${ev && ev.attemptsShown} undefined=${ev && ev.hasUndefined}`);
check('证据里能看到 formula 参数快照', !!(ev && ev.hasFormula));

console.log(results.join('\n'));
console.log(`\n阶段2产物验收: ${pass} 通过 / ${fail} 失败`);

ws.close();
p.kill();
try { fs.rmSync(udd, { recursive: true, force: true }); } catch { }
process.exit(fail ? 1 : 0);
