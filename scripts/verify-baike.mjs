// 小白 5 条反馈的验收：每一条都从渲染后的 DOM 里取证据，不看源码
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL_ = 'file:///D:/jiaoyu/work/edu/dist/index.html';
const PORT = 19541;
const PROFILE = 'data';

const proc = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
  '--window-size=1400,1000', URL_,
], { stdio: 'ignore' });

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
  const page = list.find((t) => t.type === 'page' && t.url.includes('index.html'));
  const cdp = await connect(page.webSocketDebuggerUrl);
  await cdp.call('Runtime.enable'); await cdp.call('Page.enable');
  await sleep(2500);
  const ev = async (x) => {
    const r = await cdp.call('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return '__ERR__' + (r.exceptionDetails.text || '');
    return r.result.value;
  };
  await ev(`localStorage.clear()`);
  await cdp.call('Page.reload'); await sleep(2300);

  // ── 第 5 条：模块标题不能为空 ──
  const heads = await ev(`[...document.querySelectorAll('.module-head h2')].map(h=>h.innerText.trim())`);
  const emptyHeads = heads.filter((h) => !h).length;
  check('第5条 模块标题都有名字', emptyHeads === 0, `${heads.length} 个模块，空标题 ${emptyHeads} 个`);
  check('第5条 标题不是"—"占位', !heads.includes('—'));
  out.notes.push('前三个模块标题: ' + heads.slice(0, 3).join(' / '));

  // ── 第 2 条：无题节点默认不出现、不标红 ──
  const visibleNodes = await ev(`document.querySelectorAll('.module .node').length`);
  const emptyNodes = await ev(`document.querySelectorAll('.module .node-empty').length`);
  check('第2条 默认不渲染无题卡片', emptyNodes === 0, `可见节点 ${visibleNodes}，无题卡片 ${emptyNodes}`);
  const lackText = await ev(`/缺 \\d+ 道/.test(document.body.innerText)`);
  check('第2条 页面上没有红色“缺 N 道”', lackText === false);
  const coming = await ev(`(()=>{const d=document.querySelector('details.coming');if(!d)return null;return {open:d.open,summary:d.querySelector('summary').innerText.trim()}})()`);
  check('第2条 无题知识点收进折叠区', coming !== null && coming.open === false, JSON.stringify(coming));
  out.notes.push('折叠区文案: ' + (coming ? coming.summary : '无'));

  // ── 第 7 条：讲解默认折叠，题目可见 ──
  await ev(`(()=>{const b=[...document.querySelectorAll('[data-act="study"]')].find(x=>!x.disabled);if(b)b.click()})()`);
  await sleep(700);
  const brief = await ev(`(()=>{const d=document.querySelector('details.brief');if(!d)return null;return {open:d.open,title:d.querySelector('summary').innerText.trim()}})()`);
  check('第7条 讲解默认是折叠的', brief !== null && brief.open === false, JSON.stringify(brief));
  out.notes.push('讲解折叠标题: ' + (brief ? brief.title : '无'));
  const quizVisibleNoOpen = await ev(`(()=>{const opts=document.querySelectorAll('.opt,.option,[data-opt]').length;return opts>0})()`);
  check('第7条 不展开讲解也能看到题目', quizVisibleNoOpen === true);

  // 能展开
  await ev(`(()=>{const s=document.querySelector('details.brief summary');if(s)s.click()})()`);
  await sleep(300);
  check('第7条 想看得时候能展开', (await ev(`(document.querySelector('details.brief')||{}).open`)) === true);

  // ── 第 8 条：AI 同学有目的说明（要先答题，解析下面才有同学块）──
  await ev(`(()=>{const o=document.querySelectorAll('.opt,.option,[data-opt]')[0];if(o)o.click()})()`);
  await sleep(200);
  await ev(`(()=>{const b=document.querySelector('[data-act="submit"]');if(b)b.click()})()`);
  await sleep(600);
  const peerPurpose = await ev(`(()=>{const p=document.querySelector('.peer-purpose');return p?p.innerText.trim():null})()`);
  check('第8条 AI 同学有目的说明', !!peerPurpose, peerPurpose ? peerPurpose.slice(0, 40) : '缺失');
  const nextBtnAbovePeer = await ev(`(()=>{
    const n=document.querySelector('[data-act="next"]');const p=document.querySelector('.peer');
    if(!n||!p)return 'missing';
    return (n.compareDocumentPosition(p)&Node.DOCUMENT_POSITION_FOLLOWING)?'下一题在同学块之前':'下一题在同学块之后(会被挤走)';
  })()`);
  check('第6条 下一题按钮不被同学块挡住', nextBtnAbovePeer === '下一题在同学块之前', nextBtnAbovePeer);

  // ── 第 1 条：首屏数字不再有 0/79 和“已做过的节点 0/…” ──
  await ev(`(()=>{const b=document.querySelector('[data-act="back"]');if(b)b.click()})()`);
  await sleep(500);
  const band = (await ev(`(document.querySelector('.band')||{}).innerText||''`)).toString();
  check('第1条 首屏无 0/79', !/0\s*\/\s*79/.test(band.replace(/\n/g, ' ')));
  check('第1条 首屏无“还缺”', !/还缺/.test(band));

  // 回归：模块标题在作答后仍正常
  await ev(`(()=>{const b=[...document.querySelectorAll('[data-act="study"]')].find(x=>!x.disabled);if(b)b.click()})()`);
  await sleep(500);
  await ev(`(()=>{const o=document.querySelectorAll('.opt,.option,[data-opt]')[0];if(o)o.click()})()`);
  await sleep(200);
  await ev(`(()=>{const b=document.querySelector('[data-act="submit"]');if(b)b.click()})()`);
  await sleep(500);
  await ev(`(()=>{const b=document.querySelector('[data-act="back"]');if(b)b.click()})()`);
  await sleep(600);
  const heads2 = await ev(`[...document.querySelectorAll('.module-head h2')].map(h=>h.innerText.trim())`);
  check('回归 作答后模块标题仍在', heads2.filter((h) => !h).length === 0, `${heads2.length} 个`);
  check('回归 作答后记录仍写入', (await ev(`JSON.parse(localStorage.getItem('anylearn.records')||'[]').length`)) >= 1);

  cdp.close();
} catch (e) { out.error = e.message; } finally { proc.kill(); }

writeFileSync('data', JSON.stringify(out, null, 2), 'utf8');
console.log('通过 ' + out.pass.length + ' 项，失败 ' + out.fail.length + ' 项');
out.pass.forEach((p) => console.log('  [OK] ' + p));
out.fail.forEach((f) => console.log('  [FAIL] ' + f));
out.notes.forEach((n) => console.log('  [注] ' + n));
if (out.error) console.log('异常: ' + out.error);
