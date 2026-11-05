// 折叠区验收：①在列表最后 ②视觉上是分隔块（有分隔线、居中、独立成块）③不遮挡
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 19741;
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

  const info = await ev(`(function(){
    var main=document.querySelector('main.tree');
    var kids=[].slice.call(main.children);
    var c=document.querySelector('details.coming');
    if(!c) return {missing:true};
    var idx=kids.indexOf(c);
    var r=c.getBoundingClientRect();
    var sum=c.querySelector('summary');
    var sr=sum?sum.getBoundingClientRect():null;
    var ss=sum?getComputedStyle(sum):null;
    var cs=getComputedStyle(c);
    // 分隔线
    var before=getComputedStyle(c,'::before');
    return {
      isLast: idx===kids.length-1,
      index: idx, total: kids.length,
      summaryText: sum?sum.innerText.trim():null,
      summaryAlign: ss?ss.textAlign:null,
      summaryDisplay: ss?ss.display:null,
      hasBorder: ss?ss.borderTopWidth:null,
      comingMarginTop: cs.marginTop,
      separatorHeight: before.height,
      separatorContent: before.content,
      isDetailsClosed: !c.open,
      scrollableHeight: document.documentElement.scrollHeight,
      comingTop: Math.round(r.top)
    };
  })()`);
  out.notes.push(JSON.stringify(info, null, 1));

  check('折叠区在列表最末尾', info.isLast === true, `index ${info.index}/${info.total}`);
  check('默认收起', info.isDetailsClosed === true);
  check('标题居中', info.summaryAlign === 'center', info.summaryAlign);
  check('标题是块级布局', info.summaryDisplay === 'flex', info.summaryDisplay);
  check('有边框使其成块', info.hasBorder !== '0px', info.hasBorder);
  check('上方有分隔线', info.separatorHeight !== '0px' || info.separatorContent !== 'none', `${info.separatorHeight} / ${info.separatorContent}`);
  check('标题文字含数量', /\d+\s*个知识点/.test(info.summaryText || ''), info.summaryText);

  // 展开后内容可见
  await ev(`(()=>{const s=document.querySelector('details.coming summary');if(s)s.click()})()`);
  await sleep(400);
  const opened = await ev(`(function(){
    var c=document.querySelector('details.coming');
    var names=c.querySelectorAll('.coming-names span').length;
    return {open:c.open, names:names, bodyVisible: !!c.querySelector('.coming-body')};
  })()`);
  check('点击能展开', opened.open === true);
  check('展开后显示节点名', opened.names >= 50, `${opened.names} 个`);

  cdp.close();
} catch (e) { out.fail.push('异常=' + e.message); } finally { proc.kill(); }

writeFileSync('data', JSON.stringify(out, null, 2), 'utf8');
console.log(`通过 ${out.pass.length} 项，失败 ${out.fail.length} 项`);
out.pass.forEach((p) => console.log('  [OK] ' + p));
out.fail.forEach((f) => console.log('  [FAIL] ' + f));
out.notes.forEach((n) => console.log('  [注] ' + n));
