// 归档后验收：跟基线逐项比对，确认「归档不应产生任何界面变化」
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { loadQuestions, readPublished } from '../core/qbook.mjs';
import { checkPack } from '../core/check-pack.mjs';

const BASE = 'data';
const base = JSON.parse(readFileSync(BASE, 'utf8'));

let pass = 0;
let fail = 0;
function t(name, got, want) {
  const ok = String(got) === String(want);
  if (ok) pass += 1; else fail += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}`);
  if (!ok) console.log(`       归档前：${want}\n       现  在：${got}`);
}

console.log('== 唯一验收标准：发布版还能正常加载 ==\n');

// 1. 不传参加载
const r = loadQuestions();
t('不传参加载到发布版路径', r.path, base.loaded.path);
t('题量仍是 262 道', r.total, base.loaded.total);

// 2. 题包本身没被动过
const packHash = createHash('sha256').update(readFileSync(r.path)).digest('hex');
t('v8 文件哈希未变（归档没碰它）', packHash.slice(0, 16), base.loaded.sha256.slice(0, 16));

// 3. published.json 没变
const pub = readPublished();
t('published.json 仍指向 v8', pub.version, base.published.version);
t('published.json 路径未变', pub.path, base.published.path);

// 4. 检查结果不变
const check = checkPack(pub.path);
t('检查错误数不变', check.errors.length, base.check.errors);
t('检查警告数不变', check.warnings.length, base.check.warnings);
t('题量不变', check.stats.total, base.check.total);

console.log(`\n== 结果 ==`);
console.log(`  通过 ${pass} 项，失败 ${fail} 项`);
console.log(`  发布版 ${pub.version} / ${r.total} 道 / ${(readFileSync(r.path).length / 1024).toFixed(1)} KB`);
if (fail) process.exitCode = 1;
