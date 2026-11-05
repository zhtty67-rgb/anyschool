// 确认 AI 同学回复框的实际状态：位置、文案、输入框、按钮、是否影响判分
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 19581;
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
    if (r.exceptionDetails) return '__ERR__' + (r.exceptionDetails.text || '');
    return r.result.value;
  };

  await ev(`localStorage.clear()`);
  await cdp.call('Page.reload'); await sleep(2200);

  // 进节点，做一题，让解析出现
  await ev(`(()=>{const b=[...document.querySelectorAll('[data-act="study"]')].find(x=>!x.disabled);if(b)b.click()})()`);
  await sleep(700);
  await ev(`(()=>{const o=document.querySelectorAll('.opt,.option,[data-opt]')[0];if(o)o.click()})()`);
  await sleep(200);
  await ev(`(()=>{const b=document.querySelector('[data-act="submit"]');if(b)b.click()})()`);
  await sleep(700);

  const peer = await ev(`(()=>{
    const p=document.querySelector('.peer');
    if(!p)return {exists:false};
    const ta=p.querySelector('.peer-input');
    const btn=p.querySelector('[data-act="peer-save"]');
    const purpose=p.querySelector('.peer-purpose');
    return {
      exists:true,
      purposeText: purpose?purpose.innerText.trim():null,
      placeholder: ta?ta.getAttribute('placeholder'):null,
      hasButton: !!btn,
      buttonText: btn?btn.innerText.trim():null,
      name: (p.querySelector('.peer-name')||{}).innerText||null,
      quote: ((p.querySelector('.peer-quote')||{}).innerText||'').slice(0,40),
      note: (p.querySelector('.peer-ask-note')||{}).innerText||null
    };
  })()`);
  out.notes.push('AI 同学块: ' + JSON.stringify(peer, null, 1));

  check('AI 同学块存在', peer && peer.exists === true);
  check('有目的说明', !!(peer && peer.purposeText), peer && peer.purposeText ? peer.purposeText.slice(0, 30) : '');
  check('输入框提示语已更新', !!(peer && peer.placeholder), peer && peer.placeholder);
  check('记下按钮在', !!(peer && peer.hasButton), peer && peer.buttonText);
  check('免责说明仍在', !!(peer && peer.note && peer.note.includes('不评分')), peer && peer.note);

  // 关键：写备注不能影响判分链路
  const before = await ev(`JSON.stringify({rec:(JSON.parse(localStorage.getItem('anylearn.records')||'[]')).length, mastery:window.__SNAP__.summary})`);
  await ev(`(()=>{const ta=document.querySelector('.peer-input');if(ta){ta.value='我觉得它把这个搞混了';const b=document.querySelector('[data-act="peer-save"]');if(b)b.click()}})()`);
  await sleep(500);
  const after = await ev(`JSON.stringify({rec:(JSON.parse(localStorage.getItem('anylearn.records')||'[]')).length, mastery:window.__SNAP__.summary})`);
  check('写备注不产生作答记录', before === after, before === after ? '记录与掌握度均未变' : `${before} -> ${after}`);

  cdp.close();
} catch (e) { out.error = e.message; } finally { proc.kill(); }

writeFileSync('data', JSON.stringify(out, null, 2), 'utf8');
console.log('通过 ' + out.pass.length + ' 项，失败 ' + out.fail.length + ' 项');
out.pass.forEach((p) => console.log('  [OK] ' + p));
out.fail.forEach((f) => console.log('  [FAIL] ' + f));
out.notes.forEach((n) => console.log('  [注] ' + n));
if (out.error) console.log('异常: ' + out.error);
