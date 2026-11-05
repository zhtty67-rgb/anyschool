// AI 同学「写不了学习事件」的实证测试
//
// Chief 的要求：不要只讲设计思路，要证明调用之后记录文件根本没变。
// 做法：
//   1. 造一个学习事件记录文件（模拟真实产线格式）
//   2. 记录它的内容、哈希、修改时间
//   3. 大量调用 AI 同学：挑句、组脚本、遍历所有概念、传各种参数
//   4. 再读一遍文件，比对内容、哈希、修改时间、以及有没有多出文件
//   5. 另外用 fs.watch 挂上监听，全程没有任何文件系统写事件

import assert from 'node:assert/strict';
import {
  writeFileSync, readFileSync, existsSync, statSync,
  readdirSync, mkdtempSync, rmSync, watch,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';

import { pick, scriptFor, hasLines } from './index.mjs';
import { LINES } from './lines.mjs';
import { parseTree } from '../core/tree.mjs';

const dir = mkdtempSync(join(tmpdir(), 'edu-peer-'));
const RECORDS = join(dir, 'learning-records.jsonl');

let pass = 0;
let fail = 0;
function t(name, fn) {
  try { fn(); pass += 1; console.log(`  ok  ${name}`); }
  catch (e) { fail += 1; console.log(`  FAIL ${name}: ${e.message}`); }
}

// ── 1. 造一份"学习事件"记录 ───────────────────────
const tree = parseTree();
const demoRecords = tree.concepts.slice(0, 8).flatMap((c) => ([
  { questionId: `${c.code}-01`, nodeCode: c.code, correct: true, at: '2026-11-04T09:00:00Z' },
  { questionId: `${c.code}-02`, nodeCode: c.code, correct: false, at: '2026-11-04T09:05:00Z' },
]));
writeFileSync(RECORDS, demoRecords.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');

const before = {
  content: readFileSync(RECORDS),
  hash: createHash('sha256').update(readFileSync(RECORDS)).digest('hex'),
  mtime: statSync(RECORDS).mtimeMs,
  size: statSync(RECORDS).size,
  files: readdirSync(dir).sort(),
};
console.log(`记录文件：${before.size} 字节，${before.hash.slice(0, 16)}，${demoRecords.length} 条事件`);
console.log(`目录内文件：${before.files.join(', ')}\n`);

// ── 2. 挂文件监听，全程抓写事件 ────────────────────
const writeEvents = [];
const watcher = watch(dir, { recursive: false }, (event, filename) => {
  if (event === 'change' || event === 'rename') writeEvents.push(`${event}:${filename}`);
});

// ── 3. 大量调用 AI 同学 ───────────────────────────
console.log('== 调用 AI 同学 ==');
let calls = 0;
for (const c of tree.concepts) {
  void hasLines(c.code);
  void pick(c);
  void pick(c, { prefer: 'misconception' });
  void pick(c, { prefer: 'ask', seed: 7 });
  void scriptFor(c, 1);
  void scriptFor(c, 2);
  void scriptFor(c, 3);
  calls += 7;
}
// 把所有语句都挑一遍，模拟一个用户把 AI 同学的话全看完
for (const [code, lines] of Object.entries(LINES)) {
  const concept = tree.concepts.find((x) => x.code === code);
  const seen = [];
  for (let i = 0; i < lines.length * 2; i += 1) {
    const r = pick(concept, { exclude: seen });
    if (r) { seen.push(r.quote); calls += 1; }
  }
}
console.log(`  共调用 ${calls} 次，覆盖全部 ${tree.concepts.length} 个概念`);

// 让监听有机会投递事件
await new Promise((r) => setTimeout(r, 120));
watcher.close();

// ── 4. 比对 ───────────────────────────────────────
console.log('\n== 前后比对 ==');
const after = {
  content: readFileSync(RECORDS),
  hash: createHash('sha256').update(readFileSync(RECORDS)).digest('hex'),
  mtime: statSync(RECORDS).mtimeMs,
  size: statSync(RECORDS).size,
  files: readdirSync(dir).sort(),
};

t('记录文件内容一字未变', () => {
  assert.ok(before.content.equals(after.content), '记录文件内容被改动了');
});
t('记录文件哈希未变', () => {
  assert.equal(before.hash, after.hash);
});
t('记录文件修改时间未变（没被重写）', () => {
  assert.equal(before.mtime, after.mtime);
});
t('记录文件大小未变', () => {
  assert.equal(before.size, after.size);
});
t('没有多出任何新文件', () => {
  assert.deepEqual(before.files, after.files, `多出：${after.files.filter((f) => !before.files.includes(f))}`);
});
t('文件监听全程没有捕捉到写事件', () => {
  assert.deepEqual(writeEvents, [], `捕捉到写事件：${writeEvents.join(', ')}`);
});

console.log(`  记录文件：${after.size} 字节，${after.hash.slice(0, 16)}`);
console.log(`  写事件：${writeEvents.length} 次`);

// ── 5. 独立进程验证：AI 同学能跑，但拿不到文件句柄 ──
console.log('\n== 独立进程验证 ==');
const probeScript = `
import { pick, scriptFor } from ${JSON.stringify(new URL('./index.mjs', import.meta.url).href)};
import * as mod from ${JSON.stringify(new URL('./index.mjs', import.meta.url).href)};
const out = {
  exports: Object.keys(mod).sort(),
  sample: pick({ code: 'c0205', name: '过拟合' }, { prefer: 'misconception' }),
  script: scriptFor({ code: 'c0104', name: 'AI 三大流派' }, 2).length,
};
console.log(JSON.stringify(out));
`;
const probeOut = await runNode(probeScript);
t('模块对外导出的能力里没有任何写入口', () => {
  const exported = JSON.parse(probeOut).exports;
  const suspicious = exported.filter((n) => /write|save|record|append|persist|store/i.test(n));
  assert.deepEqual(suspicious, [], `导出了可疑的写入口：${suspicious.join(', ')}`);
});
t('独立进程里 AI 同学能正常出话', () => {
  const r = JSON.parse(probeOut);
  assert.ok(r.sample && r.sample.quote, '独立进程没拿到语句');
  assert.equal(r.script, 2);
});

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
rmSync(dir, { recursive: true, force: true });
if (fail) process.exitCode = 1;

function runNode(src) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, ['--input-type=module', '-e', src], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(err || `exit ${code}`))));
  });
}
