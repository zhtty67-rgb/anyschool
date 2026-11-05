// AI 同学的自测 —— 重点验证六条硬约束在代码层面成立，不只是口头承诺。
// node peer/peer.test.mjs
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pick, scriptFor, hasLines, POSITIONS, POSITION_LABEL, PEER_NAME } from './index.mjs';
import { LINES, libraryStats } from './lines.mjs';
import { parseTree } from '../core/tree.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
let pass = 0;
let fail = 0;
function t(name, fn) {
  try { fn(); pass += 1; console.log(`  ok  ${name}`); }
  catch (e) { fail += 1; console.log(`  FAIL ${name}: ${e.message}`); }
}

const tree = parseTree();
const conceptByCode = new Map(tree.concepts.map((c) => [c.code, c]));

console.log('== 语句库规模 ==');
const stats = libraryStats();
console.log(`  总计 ${stats.total} 条，覆盖 ${Object.keys(stats.byConcept).length} 个概念`);
console.log(`  立场分布：误解 ${stats.byPosition.misconception} / 发问 ${stats.byPosition.ask} / 举例 ${stats.byPosition.example}`);

t('每条语句立场合法', () => {
  for (const [code, lines] of Object.entries(LINES)) {
    for (const l of lines) {
      assert.ok(POSITIONS.includes(l.position), `${code} 有非法立场 ${l.position}`);
      assert.ok(l.quote && l.quote.length >= 15, `${code} 有语句太短或无内容`);
    }
  }
});
t('语句库覆盖的概念都在知识树里', () => {
  for (const code of Object.keys(LINES)) {
    assert.ok(conceptByCode.has(code), `${code} 不在 concepts-ai.yaml 里`);
  }
});
t('每个概念三种立场都有', () => {
  for (const [code, lines] of Object.entries(LINES)) {
    const kinds = new Set(lines.map((l) => l.position));
    if (lines.length >= 3) {
      for (const p of POSITIONS) assert.ok(kinds.has(p), `${code} 缺少 ${p} 立场`);
    }
  }
});

console.log('== 硬约束 2：不评价学习者 ==');
// 这些词一旦出现在语句里，就是 AI 同学在评价学习者
const EVALUATIVE = ['你错了', '答得好', '很棒', '真棒', '你说得对', '答错了', '你的答案', '你答得', '你太', '厉害', '聪明', '正确率高', '你的掌握'];
t('语句里没有任何评价学习者的表达', () => {
  const bad = [];
  for (const [code, lines] of Object.entries(LINES)) {
    for (const l of lines) {
      for (const w of EVALUATIVE) {
        if (l.quote.includes(w)) bad.push(`${code}: ${w} → ${l.quote.slice(0, 30)}`);
      }
    }
  }
  assert.equal(bad.length, 0, bad.join('; '));
});

console.log('== 硬约束 3：不给正确答案 ==');
t('语句不出现"正确答案是/答案选"这类给答案的句式', () => {
  const ANSWERISH = ['正确答案是', '答案选', '应该选', '正确选项是', '所以正确', '答案是'];
  const bad = [];
  for (const [code, lines] of Object.entries(LINES)) {
    for (const l of lines) {
      for (const w of ANSWERISH) {
        if (l.quote.includes(w)) bad.push(`${code}: ${w}`);
      }
    }
  }
  assert.equal(bad.length, 0, bad.join('; '));
});

console.log('== 硬约束 4/5：不写学习事件、不参与判分（代码层面）==');
t('peer 模块源码不 import 判题或掌握度模块', () => {
  const files = readdirSync(HERE).filter((f) => f.endsWith('.mjs') && !f.includes('.test.'));
  const bad = [];
  for (const f of files) {
    const src = readFileSync(join(HERE, f), 'utf8');
    // 去掉注释再查 import，避免注释里提到也算
    const codeOnly = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    if (/import\s+[^;]*from\s+['"][^'"]*(grade|mastery)\.mjs['"]/.test(codeOnly)) bad.push(`${f} 引入了 grade/mastery`);
    if (/require\([^)]*(grade|mastery)/.test(codeOnly)) bad.push(`${f} 用 require 引入 grade/mastery`);
  }
  assert.equal(bad.length, 0, bad.join('; '));
});
t('peer 模块源码没有任何写文件的调用', () => {
  const files = readdirSync(HERE).filter((f) => f.endsWith('.mjs') && !f.includes('.test.'));
  const bad = [];
  for (const f of files) {
    const src = readFileSync(join(HERE, f), 'utf8');
    const codeOnly = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    if (/writeFileSync|appendFileSync|createWriteStream|fs\.write/.test(codeOnly)) bad.push(f);
  }
  assert.equal(bad.length, 0, bad.join('; '));
});
t('peer 模块不 import node:fs', () => {
  const files = readdirSync(HERE).filter((f) => f.endsWith('.mjs') && !f.includes('.test.'));
  const bad = [];
  for (const f of files) {
    const src = readFileSync(join(HERE, f), 'utf8');
    const codeOnly = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    if (/from\s+['"]node:fs['"]/.test(codeOnly)) bad.push(f);
  }
  assert.equal(bad.length, 0, bad.join('; '));
});

console.log('== 选句行为 ==');
const c0205 = conceptByCode.get('c0205');
t('指定立场能选中对应语句', () => {
  const r = pick(c0205, { prefer: 'misconception' });
  assert.equal(r.position, 'misconception');
  assert.equal(r.conceptCode, 'c0205');
});
t('exclude 能避免重复', () => {
  const first = pick(c0205, { prefer: 'misconception' });
  const second = pick(c0205, { prefer: 'misconception', exclude: [first.quote] });
  assert.notEqual(first.quote, second.quote);
});
t('全部说完后回退，不会返回 null', () => {
  const all = LINES.c0205.map((l) => l.quote);
  const r = pick(c0205, { exclude: all });
  assert.ok(r && r.quote);
});
t('scriptFor 给出三种立场的组合', () => {
  const s = scriptFor(c0205, 3);
  assert.equal(s.length, 3);
  const kinds = s.map((x) => x.position);
  assert.deepEqual(kinds, ['misconception', 'ask', 'example']);
});
t('没有语句的概念返回 null 而不是报错', () => {
  const empty = conceptByCode.get('c1101');
  assert.equal(hasLines('c1101'), false);
  assert.equal(pick(empty), null);
  assert.deepEqual(scriptFor(empty, 2), []);
});
t('角色名固定', () => {
  assert.equal(pick(c0205).peerName, PEER_NAME);
});
t('立场标签措辞不判对错', () => {
  for (const label of Object.values(POSITION_LABEL)) {
    assert.ok(!/错|对|正确|错误/.test(label), `标签「${label}」在判对错`);
  }
});

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
if (fail) process.exitCode = 1;
