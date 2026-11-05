// 吸顶验收：①滚到中间四个数字还在 ②吸顶后不遮挡内容
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 19721;
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
  await sleep(2500);
  const ev = async (x) => {
    const r = await cdp.call('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return '__ERR__' + (r.exceptionDetails.text || '');
    return r.result.value;
  };

  await ev(`localStorage.clear()`);
  await cdp.call('Page.reload'); await sleep(2300);

  const probe = `(function(){
    var b=document.querySelector('.band');
    if(!b)return null;
    var r=b.getBoundingClientRect();
    var txt=b.innerText||'';
    return {
      top:Math.round(r.top), bottom:Math.round(r.bottom), h:Math.round(r.height),
      inViewport: r.top>=0 && r.bottom<=window.innerHeight,
      pos:getComputedStyle(b).position,
      scrollY:Math.round(window.scrollY),
      hasNum: txt.indexOf('现在有题可做')>=0 && txt.indexOf('你开始做了没')>=0,
      txt: txt.replace(/\\n/g,' | ').slice(0,120)
    };
  })()`;

  // 顶部
  const at0 = await ev(probe);
  check('顶部：条带可见', at0 && at0.inViewport, JSON.stringify({ top: at0 && at0.top }));
  check('顶部：四个数字含新文案', at0 && at0.hasNum);

  // 滚到中间（小白描述的位置）
  await ev(`window.scrollTo(0, 900)`);
  await sleep(500);
  const mid = await ev(probe);
  check('滚到 900：条带仍在视口内', mid && mid.inViewport, `top=${mid && mid.top} scrollY=${mid && mid.scrollY}`);
  check('滚到 900：四个数字仍可读', mid && mid.hasNum, mid && mid.txt);
  check('滚到 900：条带吸在顶部 top=0', mid && mid.top === 0, mid && mid.top);

  // 滚到底
  await ev(`window.scrollTo(0, document.documentElement.scrollHeight)`);
  await sleep(500);
  const bot = await ev(probe);
  check('滚到底：条带仍可见', bot && bot.inViewport, `top=${bot && bot.top}`);
  check('滚到底：四个数字仍可读', bot && bot.hasNum);

  // 遮挡检查（正确判据）：
  // sticky 条带本来就该盖住"正在从它下面滚过去"的内容——某个标题此刻恰好落在条带后面，
  // 是正常现象，不是遮挡事故。真正要防的是"滚到任何位置都看不见"。
  // 所以判据是：每个模块标题，在它对应的滚动位置上都必须能完整露在条带下方。
  const overlap = await ev(`(function(){
    var b=document.querySelector('.band');
    var heads=[...document.querySelectorAll('.module-head h2')];
    var results=[];
    heads.forEach(function(h){
      // 把该标题滚到条带下方 20px 处
      var br=b.getBoundingClientRect();
      var r=h.getBoundingClientRect();
      var need = window.scrollY + r.top - (br.bottom + 20);
      window.scrollTo(0, Math.max(0, need));
      var br2=b.getBoundingClientRect();
      var r2=h.getBoundingClientRect();
      // 滚动后：标题必须完整在条带下方，且没有被别的固定元素压住
      var clearOfBand = r2.top >= br2.bottom;
      var hit = document.elementFromPoint(r2.left+10, r2.top+r2.height/2);
      var clickable = !!(hit && (hit===h || h.contains(hit)));
      results.push({title:h.innerText.trim().slice(0,10), clearOfBand:clearOfBand, reachable:clickable, top:Math.round(r2.top), bandBottom:Math.round(br2.bottom)});
    });
    window.scrollTo(0,0);
    return results;
  })()`);
  const bad = (overlap || []).filter((x) => !x.clearOfBand || !x.reachable);
  check('每个模块标题都能滚到条带下方看到', bad.length === 0, bad.length ? JSON.stringify(bad.slice(0,3)) : `${(overlap||[]).length} 个标题全部可达`);

  out.notes.push('顶部: ' + JSON.stringify(at0));
  out.notes.push('中间: ' + JSON.stringify(mid));

  cdp.close();
} catch (e) { out.fail.push('异常=' + e.message); } finally { proc.kill(); }

writeFileSync('data', JSON.stringify(out, null, 2), 'utf8');
console.log(`通过 ${out.pass.length} 项，失败 ${out.fail.length} 项`);
out.pass.forEach((p) => console.log('  [OK] ' + p));
out.fail.forEach((f) => console.log('  [FAIL] ' + f));
out.notes.forEach((n) => console.log('  [注] ' + n));
