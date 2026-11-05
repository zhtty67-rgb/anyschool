// 小白说：提交后「下一题」根本没渲染出来。这脚本把提交后的真实 DOM 原样 dump 出来看。
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 19591;
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

try {
  const list = await getJson('/json/list');
  const page = list.find((t) => t.type === 'page');
  const cdp = await connect(page.webSocketDebuggerUrl);
  await cdp.call('Runtime.enable'); await cdp.call('Page.enable');
  await sleep(2500);
  const ev = async (x) => {
    const r = await cdp.call('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return '__ERR__' + (r.exceptionDetails.text || ' ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || ''));
    return r.result.value;
  };

  await ev(`localStorage.clear()`);
  await cdp.call('Page.reload'); await sleep(2200);

  // 收集页面运行时的 JS 错误
  await ev(`window.__ERRS__=[];window.addEventListener('error',function(e){window.__ERRS__.push(String(e.message))})`);

  await ev(`(()=>{const b=[...document.querySelectorAll('[data-act="study"]')].find(x=>!x.disabled);if(b)b.click()})()`);
  await sleep(700);

  const before = await ev(`(function(){var m=document.querySelector('main');return m?m.className:'无 main'})()`);
  out.notes.push('提交前 main class: ' + before);

  // 选选项
  await ev(`(()=>{const o=document.querySelectorAll('.opt,.option,[data-opt]')[0];if(o)o.click()})()`);
  await sleep(250);

  // 提交
  const submitOk = await ev(`(()=>{const b=document.querySelector('[data-act="submit"]');if(!b)return 'no-submit-btn';b.click();return 'clicked'})()`);
  await sleep(900);

  const errors = await ev(`window.__ERRS__`);
  out.notes.push('运行时 JS 错误: ' + JSON.stringify(errors));
  check('提交时无 JS 报错', !errors || errors.length === 0, JSON.stringify(errors));

  // 提交后真实 DOM 状态
  const state = await ev(`(()=>{
    var m=document.querySelector('main');
    var next=document.querySelector('[data-act="next"]');
    var submit=document.querySelector('[data-act="submit"]');
    var feedback=document.querySelector('.feedback');
    var explain=document.querySelector('.explain');
    var peer=document.querySelector('.peer');
    var actions=document.querySelector('.quiz-actions');
    var bodyText=(m||document.body).innerText;
    return {
      mainClass: m?m.className:'无',
      hasNext: !!next,
      hasSubmit: !!submit,
      hasFeedback: !!feedback,
      hasExplain: !!explain,
      hasPeer: !!peer,
      hasActions: !!actions,
      actionsHTML: actions?actions.outerHTML.slice(0,300):null,
      bodyHasNextText: bodyText.indexOf('下一题')>=0,
      bodySlice: bodyText.slice(0,600)
    };
  })()`);
  out.notes.push('提交后 DOM: ' + JSON.stringify(state, null, 1));

  check('提交后有反馈条', state && state.hasFeedback === true);
  check('提交后有解析', state && state.hasExplain === true);
  check('提交后有下一题按钮(元素存在)', state && state.hasNext === true);
  check('页面上能看到「下一题」三个字', state && state.bodyHasNextText === true);
  check('提交按钮已消失', state && state.hasSubmit === false);
  check('AI 同学块出现', state && state.hasPeer === true);
  check('main 已切到答题视图', state && String(state.mainClass).indexOf('quiz') >= 0, state && state.mainClass);

  cdp.close();
} catch (e) { out.error = e.message; } finally { proc.kill(); }

writeFileSync('data', JSON.stringify(out, null, 2), 'utf8');
console.log('通过 ' + out.pass.length + ' 项，失败 ' + out.fail.length + ' 项');
out.pass.forEach((p) => console.log('  [OK] ' + p));
out.fail.forEach((f) => console.log('  [FAIL] ' + f));
out.notes.forEach((n) => console.log('  [注] ' + n));
if (out.error) console.log('异常: ' + out.error);
