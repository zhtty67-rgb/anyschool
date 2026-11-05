// 用无头 Chrome 的 DevTools 协议跑一遍首屏，取渲染后的 DOM 文本与关键交互结果
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL_ = 'file:///D:/jiaoyu/work/edu/dist/index.html';
const PORT = 19517;

const proc = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=D:\\\\jiaoyu\\\\work\\\\edu\\\\.chrome-verify2',
  '--window-size=1400,1000', URL_,
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(path) {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}${path}`);
      return await r.json();
    } catch { await sleep(250); }
  }
  throw new Error('CDP 未就绪');
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    ws.onopen = () => resolve({
      call(method, params = {}) {
        return new Promise((res, rej) => {
          const mid = ++id;
          pending.set(mid, { res, rej });
          ws.send(JSON.stringify({ id: mid, method, params }));
        });
      },
      close() { ws.close(); },
    });
    ws.onerror = reject;
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
      }
    };
  });
}

const out = { steps: [] };
try {
  const list = await getJson('/json/list');
  const page = list.find((t) => t.type === 'page');
  const cdp = await connect(page.webSocketDebuggerUrl);
  await cdp.call('Runtime.enable');
  await cdp.call('Page.enable');
  await sleep(2500);

  const evalJs = async (expr) => {
    const r = await cdp.call('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''));
    return r.result.value;
  };

  out.title = await evalJs('document.title');
  out.consoleErrors = await evalJs('window.__errs || []');
  out.firstScreenText = await evalJs(`(document.querySelector('.band')||document.body).innerText`);
  out.onboardVisible = await evalJs(`!!document.querySelector('.onboard')`);
  out.hasOnboardSteps = await evalJs(`document.querySelectorAll('.onboard-step').length`);
  out.treeModules = await evalJs(`document.querySelectorAll('.module').length`);
  out.nodesTotal = await evalJs(`document.querySelectorAll('.node, .node-card, [data-node]').length`);

  // 走一遍：点第一个有题的节点的“开始学”
  out.startBtn = await evalJs(`(function(){
    const b=[...document.querySelectorAll('[data-act="study"]')].find(x=>!x.disabled);
    if(!b) return null;
    b.click();
    return true;
  })()`);
  await sleep(800);
  out.afterStudyText = await evalJs(`(document.body.innerText||'').slice(0,900)`);
  out.questionDoms = await evalJs(`document.querySelectorAll('[data-act="answer"], .opt, .option').length`);

  // 尝试答一题
  out.answerAttempt = await evalJs(`(function(){
    const o=[...document.querySelectorAll('[data-act="answer"]')][0] || [...document.querySelectorAll('.opt,.option')][0];
    if(!o) return 'no-answer-element';
    o.click();
    return 'clicked';
  })()`);
  await sleep(700);
  out.afterAnswerText = await evalJs(`(document.body.innerText||'').slice(0,1200)`);
  out.hasExplain = await evalJs(`/解析|为什么|正确/.test(document.body.innerText)`);

  cdp.close();
} catch (e) {
  out.error = e.message;
} finally {
  proc.kill();
}

writeFileSync('data', JSON.stringify(out, null, 2), 'utf8');
console.log('结果已写入 dist/verify-headless.json');
console.log(JSON.stringify(out, null, 2).slice(0, 3000));

