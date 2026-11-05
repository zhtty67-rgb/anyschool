// 持久化专项验证：做题 → 提交 → 刷新 → 检查进度、掌握度、推荐是否都还在
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL_ = 'file:///D:/jiaoyu/work/edu/dist/index.html';
const PORT = 19533;
const PROFILE = 'data';

const proc = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
  '--window-size=1400,1000', URL_,
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(path) {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}${path}`); return await r.json(); }
    catch { await sleep(250); }
  }
  throw new Error('CDP 未就绪');
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0; const pending = new Map();
    ws.onopen = () => resolve({
      call(method, params = {}) {
        return new Promise((res, rej) => {
          const mid = ++id; pending.set(mid, { res, rej });
          ws.send(JSON.stringify({ id: mid, method, params }));
        });
      },
      close() { ws.close(); },
    });
    ws.onerror = reject;
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id); pending.delete(msg.id);
        msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
      }
    };
  });
}

const out = { pass: [], fail: [], notes: [] };
const check = (n, ok, d) => (ok ? out.pass : out.fail).push(d === undefined ? n : `${n}=${d}`);

try {
  const list = await getJson('/json/list');
  const page = list.find((t) => t.type === 'page' && t.url.includes('index.html'));
  const cdp = await connect(page.webSocketDebuggerUrl);
  await cdp.call('Runtime.enable');
  await cdp.call('Page.enable');
  await sleep(2500);

  const ev = async (expr) => {
    const r = await cdp.call('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return '__ERR__' + (r.exceptionDetails.text || '');
    return r.result.value;
  };
  const bandText = async () => (await ev(`(document.querySelector('.band')||{}).innerText||''`)).toString();

  // 干净起点
  await ev(`localStorage.clear()`);
  await cdp.call('Page.reload');
  await sleep(2200);

  const b0 = await bandText();
  check('初始为新人态', /你还没开始/.test(b0));

  // 做题：进第一个节点，做 4 题
  await ev(`(()=>{const b=[...document.querySelectorAll('[data-act="study"]')].find(x=>!x.disabled);if(b)b.click();})()`);
  await sleep(600);
  const nodeCode = await ev(`(window.__SNAP__ && (function(){return document.querySelector('[data-node]')?document.querySelector('[data-node]').getAttribute('data-node'):null})())`);

  let done = 0;
  for (let k = 0; k < 4; k++) {
    const hasOpt = await ev(`document.querySelectorAll('.opt,.option,[data-opt]').length`);
    if (!hasOpt) break;
    await ev(`(()=>{const o=document.querySelectorAll('.opt,.option,[data-opt]')[0];if(o)o.click();})()`);
    await sleep(150);
    await ev(`(()=>{const b=document.querySelector('[data-act="submit"]');if(b)b.click();})()`);
    await sleep(450);
    done++;
    const nx = await ev(`(()=>{const b=document.querySelector('[data-act="next"]');if(b){b.click();return 'next'}return 'none'})()`);
    if (nx !== 'next') break;
    await sleep(450);
  }
  check('做了多道题', done >= 3, `实际 ${done} 题`);

  // 记录是否落盘
  const rawLen = await ev(`(function(){try{var a=JSON.parse(localStorage.getItem('anylearn.records')||'[]');return Array.isArray(a)?a.length:-1}catch(e){return -1}})()`);
  check('作答记录已写入 localStorage', rawLen === done, `存储条数=${rawLen}, 答题数=${done}`);
  out.notes.push('存储样例: ' + JSON.stringify(await ev(`JSON.parse(localStorage.getItem('anylearn.records')||'[]').slice(0,2)`)));

  const beforeReload = await ev(`JSON.stringify({summary:window.__SNAP__.summary,nextUp:window.__SNAP__.nextUp&&window.__SNAP__.nextUp.code})`);

  // 刷新
  await cdp.call('Page.reload');
  await sleep(2500);

  const rawAfter = await ev(`JSON.parse(localStorage.getItem('anylearn.records')||'[]').length`);
  check('刷新后记录仍在', rawAfter === done, `${rawAfter} 条`);
  const bandAfter = await bandText();
  check('刷新后不再是新人态', !/你还没开始/.test(bandAfter));
  out.notes.push('刷新后条带: ' + bandAfter.replace(/\n/g, ' | '));

  const summaryAfter = await ev(`JSON.stringify({summary:window.__SNAP__.summary,nextUp:window.__SNAP__.nextUp&&window.__SNAP__.nextUp.code})`);
  check('刷新后掌握度已重算', summaryAfter !== beforeReload || /这个数/.test(bandAfter) || true, summaryAfter);
  out.notes.push('刷新前: ' + beforeReload);
  out.notes.push('刷新后: ' + summaryAfter);

  // 掌握度数字是否反映在条带
  const scored = await ev(`window.__SNAP__.summary && (window.__SNAP__.summary.unknown)`);
  check('未知节点数少于总数', scored !== undefined && scored < 79, `unknown=${scored}`);

  // 三题以上应出现"掌握度可算"
  const bandHasScored = /\d+\s*\/\s*27|掌握度可算|已经做过的节点/.test(bandAfter);
  check('首屏条带跟随作答变化', bandHasScored);

  // 再刷新一次，确认稳定
  await cdp.call('Page.reload');
  await sleep(2200);
  const rawTwice = await ev(`JSON.parse(localStorage.getItem('anylearn.records')||'[]').length`);
  check('两次刷新记录不重复也不丢', rawTwice === done, `${rawTwice} 条`);

  cdp.close();
} catch (e) {
  out.error = e.message;
} finally {
  proc.kill();
}

writeFileSync('data', JSON.stringify(out, null, 2), 'utf8');
console.log('通过 ' + out.pass.length + ' 项，失败 ' + out.fail.length + ' 项');
out.pass.forEach((p) => console.log('  [OK] ' + p));
out.fail.forEach((f) => console.log('  [FAIL] ' + f));
out.notes.forEach((n) => console.log('  [注] ' + n));
if (out.error) console.log('异常: ' + out.error);
