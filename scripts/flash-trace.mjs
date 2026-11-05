// 查小白说的"提交后状态被重绘冲掉"：提交后连续采样多次，看 DOM 是否变化、是否被重置
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 19641;
const PROFILE = 'data';

const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--window-size=1280,720',
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

try {
  const list = await getJson('/json/list');
  const page = list.find((t) => t.type === 'page');
  const cdp = await connect(page.webSocketDebuggerUrl);
  await cdp.call('Runtime.enable'); await cdp.call('Page.enable');
  await sleep(2400);
  const ev = async (x) => {
    const r = await cdp.call('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return '__ERR__' + (r.exceptionDetails.text || '');
    return r.result.value;
  };

  await ev(`localStorage.clear()`);
  await cdp.call('Page.reload'); await sleep(2000);

  // 装一个 MutationObserver 记录 #app 的重绘次数
  await ev(`window.__PAINTS__=[]; (function(){
    var app=document.getElementById('app');
    var mo=new MutationObserver(function(muts){
      window.__PAINTS__.push({t:Date.now(),n:muts.length, childList:muts.filter(function(m){return m.type==='childList'}).length});
    });
    mo.observe(app,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
    window.__MO__=mo;
  })()`);

  await ev(`(()=>{const b=[...document.querySelectorAll('[data-act="study"]')].find(x=>!x.disabled);if(b)b.click()})()`);
  await sleep(650);
  await ev(`window.__PAINTS__=[]`);
  await ev(`(()=>{const els=document.querySelectorAll('.opt,.option,[data-opt]');if(els[2])els[2].click()})()`);
  await sleep(250);

  const snapshot = `(function(){
    var sel=document.querySelectorAll('.opt.selected,.opt.chosen,.opt.checked');
    var hasFeedback=!!document.querySelector('.feedback');
    var hasNext=!!document.querySelector('[data-act="next"]');
    var hasSubmit=!!document.querySelector('[data-act="submit"]');
    var hasExplain=!!document.querySelector('.explain');
    var hasPeer=!!document.querySelector('.peer');
    var count=(document.querySelector('.quiz-count')||{}).innerText||'-';
    var optsHaveClass=Array.prototype.map.call(document.querySelectorAll('.opt'),function(o){return o.className});
    return {feedback:hasFeedback,next:hasNext,submit:hasSubmit,explain:hasExplain,peer:hasPeer,count:count,optClass:optsHaveClass[0]||'',selCount:sel.length};
  })()`;

  console.log('提交前:', JSON.stringify(await ev(snapshot)));

  await ev(`window.__PAINTS__=[]`);
  await ev(`(()=>{const b=document.querySelector('[data-act="submit"]');if(b)b.click()})()`);

  // 连续采样 10 次，每次 120ms
  const samples = [];
  for (let i = 0; i < 10; i++) {
    await sleep(120);
    samples.push({ ms: (i + 1) * 120, ...(await ev(snapshot)) });
  }
  const paints = await ev(`window.__PAINTS__`);
  console.log('\n提交后逐次采样：');
  console.log('ms | 反馈 | 下一题 | 提交 | 解析 | 同学 | 进度 | 选中数');
  samples.forEach((s) => {
    console.log(`${s.ms} | ${s.feedback} | ${s.next} | ${s.submit} | ${s.explain} | ${s.peer} | ${s.count} | ${s.selCount}`);
  });
  console.log('\n重绘次数:', paints ? paints.length : 0);
  if (paints) console.log('重绘明细:', JSON.stringify(paints.slice(0, 12)));

  const stable = samples.every((s) => s.feedback === samples[samples.length - 1].feedback && s.next === samples[samples.length - 1].next);
  console.log('\n提交后状态是否稳定:', stable);

  writeFileSync('data', JSON.stringify({ samples, paints }, null, 2), 'utf8');
  cdp.close();
} catch (e) { console.log('异常: ' + e.message); } finally { proc.kill(); }
