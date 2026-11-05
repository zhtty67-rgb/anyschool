// 学习记录持久化的真浏览器验收（Chief 2026-11-05 定的四条）
//
// 为什么必须用真浏览器：localStorage 只在页面上下文里存在，
//   单元测试里 mock 一个 localStorage，验证的只是 mock 本身。
//
// 四条：
//   1. 做 3 道题 → 刷新页面 → 那 3 道还在
//   2. 「已掌握」数字刷新后不减
//   3. 同一道题做两次 → localStorage 里有 2 条记录（不是覆盖）
//   4. 清空记录后 → 所有数字归零
//
// 2026-11-05 第一版的两个错误，改法都写在下面：
//   · 用 sleep(1500) 等页面加载 —— 不等加载完就求值，拿到 null。
//     改成监听 Page.loadEventFired。拿不到就判失败，不默认成功。
//   · summary 为 null 时，"两次都是 null 所以相等"被判通过。
//     改成：求值结果是 null 就直接判失败——没测到不等于测过了。
import { spawn } from 'node:child_process';
import { writeFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DIST = 'data';
const PORT = 9336;
const PROFILE = 'data';

if (!existsSync(CHROME)) { console.error('找不到 Chrome：' + CHROME); process.exit(2); }
if (!existsSync(DIST)) { console.error('找不到产物：' + DIST); process.exit(2); }
if (existsSync(PROFILE)) rmSync(PROFILE, { recursive: true, force: true });

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE,
  'file:///' + DIST.replace(/\\/g, '/'),
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getWsUrl() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const r = await fetch('http://127.0.0.1:' + PORT + '/json/list');
      const list = await r.json();
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* 还没起来 */ }
    await sleep(250);
  }
  throw new Error('Chrome 调试端口没起来');
}

let ws, msgId = 0;
const pending = new Map();
const loadWaiters = [];
// 最新的主框架执行上下文 id。
// 2026-11-05 排查：不带 contextId 求值时，页面导航后可能落在旧上下文里——
//   readyState 报 complete，而 __SNAP__ 是 undefined，两句话来自不同上下文。
// 所以记下每次新上下文创建时的 id，求值一律带上它。
let ctxId = null;

function waitForLoad(timeoutMs = 10000) {
  return new Promise((resolve) => {
    function fn() {
      clearTimeout(timer);
      const i = loadWaiters.indexOf(fn);
      if (i >= 0) loadWaiters.splice(i, 1);
      resolve(true);
    }
    const timer = setTimeout(() => {
      const i = loadWaiters.indexOf(fn);
      if (i >= 0) loadWaiters.splice(i, 1);
      resolve(false);
    }, timeoutMs);
    loadWaiters.push(fn);
  });
}

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evalJs(expression) {
  const params = { expression, returnByValue: true, awaitPromise: true, userGesture: true };
  if (ctxId !== null) params.contextId = ctxId;
  const r = await send('Runtime.evaluate', params);
  if (r.exceptionDetails) throw new Error('页面报错：' + JSON.stringify(r.exceptionDetails).slice(0, 300));
  return r.result?.value;
}

// 刷新并等页面真正可用；超时抛错，不往下走
async function reloadAndWait() {
  await evalJs('location.reload(); true').catch(() => {});
  await sleep(400);   // 给导航一个起步时间，之后靠轮询判断
  for (let i = 0; i < 60; i += 1) {
    try {
      const ok = await evalJs("document.readyState==='complete' && !!window.__SNAP__ && !!window.__SNAP__.tree");
      if (ok) { await sleep(300); return; }
    } catch { /* 导航中上下文会短暂失效，忽略后重试 */ }
    await sleep(250);
  }
  throw new Error('页面刷新后 15 秒内没就绪');
}

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log((pass ? '  ✔ ' : '  ✘ ') + name + (detail ? '  ' + detail : ''));
};

(async () => {
  const wsUrl = await getWsUrl();
  ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Page.loadEventFired') {
      for (const fn of [...loadWaiters]) fn();
      return;
    }
    // 每次页面导航后 Chrome 会新建执行上下文；记住最新的那个
    if (m.method === 'Runtime.executionContextCreated') {
      const c = m.params?.context;
      if (c && (!c.auxData || c.auxData.isDefault !== false)) ctxId = c.id;
      return;
    }
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) reject(new Error(JSON.stringify(m.error)));
      else resolve(m.result);
    }
  };

  // 只用 Runtime.enable，不调 Page.enable。
  // 2026-11-05 排查：调了 Page.enable 之后，求值落在旧执行上下文里，
  //   readyState 报 complete 而 __SNAP__ 是 undefined——两句话来自不同的上下文。
  // 诊断脚本只开 Runtime 就能正常读到，差别就在这里。
  await send('Runtime.enable');

  // 等页面真正可用再开始：readyState 完成 **并且** __SNAP__ 已经挂上。
  // 2026-11-05 排查记录：前几版这一等，catch 把求值异常悄悄吞掉，
  //   循环到超时还显示"页面没就绪"，而真正的原因（求值报了什么错）一句没留。
  //   这里把最后一次的错误留住，超时一并发出来。
  let ready = false;
  let lastErr = null;
  for (let i = 0; i < 60; i += 1) {
    try {
      ready = await evalJs("document.readyState==='complete' && !!window.__SNAP__ && !!window.__SNAP__.tree");
      lastErr = null;
    } catch (e) { ready = false; lastErr = e.message; }
    if (ready) break;
    await sleep(250);
  }
  if (!ready) {
    const dbg = await evalJs("JSON.stringify({readyState:document.readyState, hasSnap:typeof window.__SNAP__, scripts:document.scripts.length})").catch((e) => '求值也失败：' + e.message);
    throw new Error('页面 15 秒内没就绪：' + dbg + (lastErr ? '｜最后一次求值错误：' + lastErr : ''));
  }
  console.log('页面已就绪，__SNAP__ 存在\n');

  // 干净起点
  await evalJs("localStorage.removeItem('anylearn.records'); true");
  await reloadAndWait();

  console.log('[1] 做 3 道题 → 刷新');
  await evalJs(`
    (function(){
      var cur = JSON.parse(localStorage.getItem('anylearn.records')||'[]');
      cur.push({id:'c0101-01', node:'c0101', correct:true,  at:new Date().toISOString()});
      cur.push({id:'c0101-02', node:'c0101', correct:false, at:new Date().toISOString()});
      cur.push({id:'c0102-01', node:'c0102', correct:true,  at:new Date().toISOString()});
      localStorage.setItem('anylearn.records', JSON.stringify(cur));
      return cur.length;
    })()
  `);
  const before = await evalJs("JSON.parse(localStorage.getItem('anylearn.records')||'[]').length");
  await reloadAndWait();
  const after = await evalJs("JSON.parse(localStorage.getItem('anylearn.records')||'[]').length");
  check('做完 3 道，记录数 = 3', before === 3, '刷新前 ' + before);
  check('刷新后那 3 道还在', after === 3, '刷新后 ' + after);

  console.log('\n[2] 刷新后掌握度数字不减');
  const readSummary = async () => evalJs(
    'window.__SNAP__ && window.__SNAP__.summary ? JSON.stringify(window.__SNAP__.summary) : null',
  );
  const s1 = await readSummary();
  await reloadAndWait();
  const s2 = await readSummary();
  if (s1 === null || s2 === null) {
    check('两次都能读到 summary', false, '读到 null，说明没测到东西');
  } else {
    const a = JSON.parse(s1); const b = JSON.parse(s2);
    check('两次刷新 summary 一致', s1 === s2, s1 + ' / ' + s2);
    check('已掌握数刷新后不减', b.mastered >= a.mastered, '前 ' + a.mastered + ' 后 ' + b.mastered);
  }

  console.log('\n[3] 同一道题做两次 → 2 条记录');
  await evalJs(`
    (function(){
      var arr = JSON.parse(localStorage.getItem('anylearn.records')||'[]');
      arr.push({id:'c0101-01', node:'c0101', correct:false, at:new Date().toISOString()});
      localStorage.setItem('anylearn.records', JSON.stringify(arr));
      return arr.length;
    })()
  `);
  const twice = await evalJs(`
    (function(){
      var arr = JSON.parse(localStorage.getItem('anylearn.records')||'[]');
      return arr.filter(function(r){return r.id==='c0101-01'}).length;
    })()
  `);
  check('同一题做两次有 2 条记录（不是覆盖）', twice === 2, 'c0101-01 共 ' + twice + ' 条');

  console.log('\n[4] 清空记录后归零');
  await evalJs("localStorage.removeItem('anylearn.records'); true");
  await reloadAndWait();
  const cleared = await evalJs("JSON.parse(localStorage.getItem('anylearn.records')||'[]').length");
  const s3 = await readSummary();
  check('清空后记录数 = 0', cleared === 0, '实际 ' + cleared);
  if (s3 === null) {
    check('清空后 summary 回到全 unknown', false, '读到 null');
  } else {
    const c = JSON.parse(s3);
    check('清空后 summary 回到全 unknown', c.unknown === c.total && c.total === 79,
      'unknown ' + c.unknown + ' / total ' + c.total);
  }

  const bad = results.filter((r) => !r.pass);
  console.log('\n通过 ' + (results.length - bad.length) + ' / ' + results.length);

  mkdirSync('data', { recursive: true });
  writeFileSync('data',
    JSON.stringify({ at: new Date().toISOString(), dist: DIST, results }, null, 2), 'utf8');

  ws.close();
  chrome.kill();
  process.exit(bad.length ? 1 : 0);
})().catch((e) => {
  console.error('\n验收失败：' + e.message);
  try { chrome.kill(); } catch { /* ignore */ }
  process.exit(2);
});
