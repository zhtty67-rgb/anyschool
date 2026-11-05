// 构建期 vs 运行期一致性检查
//
// 起因：同一个算法写了两份实现——构建时跑 core/mastery.mjs 生成快照，
// 运行时页面里内联了一份再算一遍。两份只要有一处文案或阈值不同，
// 用户看到的就会先是一句话、重绘后变成另一句。
//
// 已经踩过三次：
//   1. 折叠区数字（构造期固化 vs 运行时重算）
//   2. 首屏条带文案
//   3. reasonFor 的"先建立基线"（只改了运行时那份）
//
// 这条检查在真实浏览器里打开页面，用运行时那份重算一遍，再跟快照里
// 构建期算出来的结果逐字比对。不一致就报错。
//
// 用法：node scripts/check-build-runtime-parity.mjs
import { spawn } from 'node:child_process';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 19711;
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

const issues = [];
const oks = [];
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

  // 清空作答记录 → 空状态下构建期和运行期必须说出同一句话
  await ev(`localStorage.clear()`);
  await cdp.call('Page.reload'); await sleep(2300);

  const parity = await ev(`(function(){
    // 构建期：快照里算好的
    var snap = window.__SNAP__;
    var builtNext = snap.nextUp ? snap.nextUp.reason : null;
    var builtSummary = snap.summary;
    // 运行期：页面上实际渲染出来的
    var shownNext = (document.querySelector('.next-reason')||{}).innerText || null;
    var bandText = (document.querySelector('.band')||{}).innerText || '';
    return {
      builtNext: builtNext,
      shownNext: shownNext,
      bandText: bandText.replace(/\\n/g,' | '),
      builtUnknown: builtSummary ? builtSummary.unknown : null,
      buildTotal: builtSummary ? builtSummary.total : null
    };
  })()`);

  if (parity.builtNext !== parity.shownNext) {
    issues.push(`「下一步」提示构建期与运行期不一致：构建期="${parity.builtNext}" 运行期="${parity.shownNext}"`);
  } else {
    oks.push(`「下一步」提示一致：${parity.shownNext}`);
  }

  // 快照里出现过的旧文案，渲染后不许再出现
  const bannedInSnapshot = ['先建立基线'];
  const hit = bannedInSnapshot.filter((w) => String(parity.builtNext || '').includes(w));
  if (hit.length) issues.push(`快照（构建期）里仍有旧文案: ${hit.join(', ')}`);
  else oks.push('快照里没有旧文案');

  // 条带里的词必须是新词
  const mustHave = ['现在有题可做', '你开始做了没'];
  const miss = mustHave.filter((w) => !parity.bandText.includes(w));
  if (miss.length) issues.push(`条带缺少新文案: ${miss.join(', ')}（实际：${parity.bandText}）`);
  else oks.push('条带文案已经是新的');

  const banned = ['有题节点', '已经做过的节点', '掌握度可算'];
  const found = banned.filter((w) => parity.bandText.includes(w));
  if (found.length) issues.push(`条带里还有旧文案: ${found.join(', ')}`);
  else oks.push('条带里没有旧文案');

  // 吸顶检查：滚动后条带是否仍可见
  await ev(`window.scrollTo(0, 1200)`);
  await sleep(400);
  const sticky = await ev(`(function(){
    var b=document.querySelector('.band');
    if(!b)return null;
    var r=b.getBoundingClientRect();
    return {top:Math.round(r.top), inViewport: r.top>=0 && r.top<window.innerHeight, pos:getComputedStyle(b).position, scrollY:Math.round(window.scrollY)};
  })()`);
  if (!sticky) issues.push('找不到顶部条带');
  else if (sticky.pos !== 'sticky' && sticky.pos !== 'fixed') issues.push(`条带不吸顶（position=${sticky.pos}），滚动后看不见进度`);
  else if (!sticky.inViewport) issues.push(`条带吸顶但滚到 ${sticky.scrollY} 时不在视口内（top=${sticky.top}）`);
  else oks.push(`条带吸顶生效（${sticky.pos}，滚到 ${sticky.scrollY} 时 top=${sticky.top}）`);

  cdp.close();
} catch (e) { issues.push('异常: ' + e.message); } finally { proc.kill(); }

console.log('── 构建期 ═ 运行期 一致性 ─────────────');
oks.forEach((s) => console.log('  OK   ' + s));
issues.forEach((s) => console.log('  FAIL ' + s));
console.log(issues.length ? `\n${issues.length} 项不通过` : '\n全部通过');
process.exit(issues.length ? 1 : 0);
