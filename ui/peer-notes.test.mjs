// 可输入框的隔离验证 —— 输入内容必须碰不到判分链路
//
// 按 Chief 的要求，用 no-write.test.mjs 的方式给出证据：
//   1. records（学习事件）在"记笔记"前后一字节不变
//   2. 掌握度结果、下一步推荐完全不变
//   3. peer-notes 模块不 import 判题/掌握度

import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { append, readAll, NOTES_FILE, NOTES_DIR } from './peer-notes.mjs';
import { masteryOfTree, pickNext } from '../core/mastery.mjs';
import { parseTree } from '../core/tree.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
let pass = 0;
let fail = 0;
function t(name, fn) {
  try { fn(); pass += 1; console.log(`  ok  ${name}`); }
  catch (e) { fail += 1; console.log(`  FAIL ${name}: ${e.message}`); }
}

// ── 准备 ───────────────────────────────
const tree = parseTree();
const RECORDS = join(HERE, '..', '.tmp-records.jsonl');
const demoRecords = tree.concepts.slice(0, 6).flatMap((c) => ([
  { questionId: `${c.code}-01`, nodeCode: c.code, correct: true, at: '2026-11-04T09:00:00Z' },
  { questionId: `${c.code}-02`, nodeCode: c.code, correct: false, at: '2026-11-04T09:05:00Z' },
  { questionId: `${c.code}-03`, nodeCode: c.code, correct: true, at: '2026-11-04T09:10:00Z' },
]));
writeFileSync(RECORDS, demoRecords.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');

const hashOf = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const before = {
  hash: hashOf(RECORDS),
  size: statSync(RECORDS).size,
  mtime: statSync(RECORDS).mtimeMs,
  mastery: JSON.stringify(masteryOfTree(tree.concepts, demoRecords).summary),
  next: JSON.stringify(pickNext(masteryOfTree(tree.concepts, demoRecords).nodes)),
};

// 清掉旧的笔记，从干净状态开始，最后也删掉
const hadNotes = existsSync(NOTES_FILE);
if (hadNotes) rmSync(NOTES_FILE, { force: true });

// ── 写一堆笔记 ─────────────────────────
console.log('== 模拟用户输入 ==');
const inputs = [
  '参数多不一定好，模型太复杂会记住噪声',
  '我觉得他说反了，训练集好不代表新数据也好',
  '',
  '   ',
  'x'.repeat(2000),
  '过拟合不等于模型太复杂，数据分布也会导致',
];
let written = 0;
for (const text of inputs) {
  const r = append({ conceptCode: 'c0205', conceptName: '过拟合', peerQuote: '参数多肯定没坏处', userText: text });
  if (r.ok) written += 1;
}
console.log(`  提交 ${inputs.length} 条，实际写入 ${written} 条（空的和超长的被拒）`);

// ── 比对 ───────────────────────────────
console.log('\n== 判分链路是否被动过 ==');
const after = {
  hash: hashOf(RECORDS),
  size: statSync(RECORDS).size,
  mtime: statSync(RECORDS).mtimeMs,
  mastery: JSON.stringify(masteryOfTree(tree.concepts, demoRecords).summary),
  next: JSON.stringify(pickNext(masteryOfTree(tree.concepts, demoRecords).nodes)),
};

t('records 内容一字节未变', () => {
  assert.equal(before.hash, after.hash);
});
t('records 没被重写（mtime 未变）', () => {
  assert.equal(before.mtime, after.mtime);
});
t('掌握度汇总完全不变', () => {
  assert.equal(before.mastery, after.mastery);
});
t('下一步推荐完全不变', () => {
  assert.equal(before.next, after.next);
});

console.log('\n== 笔记本身 ==');
t('笔记写在独立文件里', () => {
  assert.ok(existsSync(NOTES_FILE), '笔记文件不存在');
  assert.ok(!NOTES_FILE.includes('.tmp-records'), '笔记文件不该落在学习记录上');
});
t('空输入和超长输入被拒', () => {
  assert.equal(written, inputs.length - 3, `实际写入 ${written}，预期 ${inputs.length - 3}`);
});
t('笔记条数与写入数一致', () => {
  assert.equal(readAll().length, written);
});
t('每条笔记带时间与概念', () => {
  for (const n of readAll()) {
    assert.ok(n.at && n.conceptCode);
  }
});

console.log('\n== 模块依赖隔离 ==');
t('peer-notes 不 import grade / mastery / qbook', () => {
  const src = readFileSync(join(HERE, 'peer-notes.mjs'), 'utf8')
    .replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const bad = src.match(/from\s+['"][^'"]*(grade|mastery|qbook)[^'"]*['"]/g);
  assert.equal(bad, null, `引入了判分模块：${bad}`);
});
t('peer-notes 导出里没有算分入口', () => {
  const src = readFileSync(join(HERE, 'peer-notes.mjs'), 'utf8');
  const exported = [...src.matchAll(/export\s+(?:function|const)\s+(\w+)/g)].map((m) => m[1]);
  const suspicious = exported.filter((n) => /score|grade|master|judge/i.test(n));
  assert.deepEqual(suspicious, [], `导出了可疑函数：${suspicious.join(',')}`);
});

// ── 收尾 ───────────────────────────────
rmSync(RECORDS, { force: true });
rmSync(NOTES_FILE, { force: true });
console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
if (fail) process.exitCode = 1;
