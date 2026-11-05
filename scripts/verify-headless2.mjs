// 完整走一遍新手路径：首次引导 → 关掉 → 进节点 → 选答案 → 提交 → 看解析 → 连做 3 题看掌握度
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL_ = 'file:///D:/jiaoyu/work/edu/dist/index.html';
const PORT = 19521;
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
const check = (name, ok, detail) => {
  (ok ? out.pass : out.fail).push(detail === undefined ? name : `${name}=${detail}`);
};

try {
  const list = await getJson('/json/list');
  const page = list.find((t) => t.type === 'page' && t.url.includes('index.html'));
  const cdp = await connect(page.webSocketDebuggerUrl);
  await cdp.call('Runtime.enable');
  await cdp.call('Page.enable');
  await sleep(2500);

  const ev = async (expr) => {
    const r = await cdp.call('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return '__ERR__ ' + (r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''));
    return r.result.value;
  };

  // 1. 首屏
  check('标题正确', (await ev('document.title')) === 'AnyLearn · 人工智能基础', await ev('document.title'));
  const band0 = (await ev(`(document.querySelector('.band')||{}).innerText || ''`)).toString();
  check('首屏不再摆 0/79', !/0\s*\/\s*79/.test(band0.replace(/\n/g, ' ')));
  check('首屏不再有“还缺 N 道”', !/还缺/.test(band0));
  check('首屏有新人文案', /你还没开始/.test(band0));
  out.notes.push('首屏条带: ' + band0.replace(/\n/g, ' | '));

  // 2. 首次引导
  const ob0 = await ev(`(()=>{const o=document.getElementById('onboard');if(!o)return {found:false};const s=getComputedStyle(o);return {found:true,display:s.display,vis:s.visibility,opacity:s.opacity,steps:o.querySelectorAll('.onboard-step').length,text:(o.innerText||'').slice(0,160)}})()`);
  check('首次进入有引导', ob0 && ob0.found === true, JSON.stringify(ob0));
  out.notes.push('引导: ' + JSON.stringify(ob0));

  if (ob0 && ob0.found) {
    const dis = await ev(`(()=>{const b=document.querySelector('[data-act="onboard-dismiss"]');if(!b)return 'no-btn';b.click();return 'clicked'})()`);
    await sleep(400);
    check('引导能关闭', dis === 'clicked', dis);
    check('关闭写入本地记忆', (await ev(`localStorage.getItem('anylearn.onboarded')`)) === '1');
    check('关闭后引导消失', (await ev(`!document.getElementById('onboard')`)) === true);
    await ev(`(()=>{const a=document.querySelector('[data-act="onboard-show"]');if(a)a.click();})()`);
    await sleep(400);
    check('顶部“新手引导”能回看', (await ev(`!!document.getElementById('onboard')`)) === true);
    await ev(`(()=>{const b=document.querySelector('[data-act="onboard-dismiss"]');if(b)b.click();})()`);
    await sleep(300);
  }

  // 3. 进节点
  await ev(`(()=>{const b=[...document.querySelectorAll('[data-act="study"]')].find(x=>!x.disabled);if(b)b.click();})()`);
  await sleep(800);
  const q1 = (await ev(`(document.body.innerText||'').slice(0,700)`)).toString();
  check('能进入做题页', /1\s*\/\s*\d+/.test(q1));
  check('讲解先于题目', q1.indexOf('定义') < q1.indexOf('单选') || q1.indexOf('举个例子') > -1);

  // 4. 选项 → 提交 → 解析
  const optCount = await ev(`document.querySelectorAll('.opt,.option,[data-opt]').length`);
  const picked = await ev(`(()=>{const o=document.querySelectorAll('.opt,.option,[data-opt]')[0];if(o){o.click();return 'ok'}return 'no-opt'})()`);
  await sleep(300);
  check('选项可点', picked === 'ok', `选项元素数=${optCount}`);
  await ev(`(()=>{const b=document.querySelector('[data-act="submit"]');if(b)b.click();})()`);
  await sleep(700);
  const afterSubmit = (await ev(`(document.body.innerText||'').slice(0,1600)`)).toString();
  check('提交后有解析', /解析|正确答案|为什么/.test(afterSubmit));
  check('解析后能翻下一题', (await ev(`!!document.querySelector('[data-act="next"]')`)) === true);
  out.notes.push('提交后: ' + afterSubmit.slice(0, 420).replace(/\n/g, ' | '));

  // 5. 连做
  let done = 1;
  for (let k = 0; k < 2; k++) {
    const nx = await ev(`(()=>{const b=document.querySelector('[data-act="next"]');if(b){b.click();return 'next'}return 'none'})()`);
    if (nx !== 'next') break;
    await sleep(500);
    await ev(`(()=>{const o=document.querySelectorAll('.opt,.option,[data-opt]')[0];if(o)o.click();})()`);
    await sleep(200);
    await ev(`(()=>{const b=document.querySelector('[data-act="submit"]');if(b)b.click();})()`);
    await sleep(500);
    done++;
  }
  check('可连续作答', done >= 2, `做了 ${done} 题`);

  // 6. 回知识树看数字变化
  await ev(`(()=>{const b=document.querySelector('[data-act="back"]');if(b)b.click();})()`);
  await sleep(700);
  const band1 = (await ev(`(document.querySelector('.band')||{}).innerText || ''`)).toString();
  check('作答后首屏不再是新人态', !/你还没开始/.test(band1));
  out.notes.push('作答后条带: ' + band1.replace(/\n/g, ' | '));

  // 7. 重载后不重复打扰
  await cdp.call('Page.reload');
  await sleep(2500);
  const ob2 = await ev(`(()=>{const o=document.getElementById('onboard');if(!o)return {found:false};return {found:true,display:getComputedStyle(o).display}})()`);
  check('再次打开不重复打扰', ob2 && (ob2.found === false || ob2.display === 'none'), JSON.stringify(ob2));

  // 8. 题库数字
  const src = (await ev(`(document.querySelector('.src')||{}).innerText||''`)).toString();
  check('界面标注 322 道', /322/.test(src), src);

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
