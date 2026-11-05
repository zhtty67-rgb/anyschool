// 独立核对盲测卷里正确答案落在第几个位置
//
// 用法：node check-blind-answer-pos.mjs <盲测卷> <源题包>
//   · 第一个参数：给小白做的盲测卷（只有 序号/题干/选项，没有 answer、没有题号）
//   · 第二个参数：原始题包（有 answer，用来反查正确答案文本）
//   · 两个参数都必须传，且是**两个不同的文件**。
//     2026-11-05 踩过：只传一个文件、或被复制成两份传两次，
//     脚本拿盲测卷当源题包用，而盲测卷没有 answer 字段（这是设计使然），
//     结果报"源里找不到题"，看起来像脚本坏了，其实是调用错了。
//
// 判据（Chief 定）：四个位置各出现一次才算合格。
//   · 只打乱选项顺序不够——实测过一份卷子答案是 1,1,2,2，
//     顺序打乱了，但两个答案都落到 A，读者先看第一条就中招。
//
// 退出码：0 = 合格，1 = 不合格（卷子不许交给小白），2 = 文件读不了。
import { readFileSync, existsSync } from 'node:fs';

const DIR = 'data\\';
// 统一一个"把参数变成真实路径"的地方。之前 load 和 existsSync 各判各的，
// 一个加了 DIR 前缀、一个没加，结果同一个文件"读得到却判不存在"。
const resolve = (n) => (/^[A-Za-z]:[\\/]/.test(n) || n.startsWith('/') ? n : DIR + n);
const load = (n) => readFileSync(resolve(n), 'utf8')
  .split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));

// 只去空白和常见中英文标点，避免排版差异导致比对失败
const norm = (s) => String(s).replace(/\s+/g, '').replace(/[，。：；、！？“”"'']/g, '');

// 允许用命令行指定：node check-blind-answer-pos.mjs <盲测卷> <源题包>
//
// 2026-11-05 改：原来不给参数会用写死的默认文件名，
// 而那个默认盲测卷（questions-blind-c0202-fix4-4.jsonl）早就不在盘上了。
// 结果是任何人裸跑都拿到退出码 2，看起来像"脚本坏了"或"验收不通过"，
// 实际只是默认路径失效——又一个"出错的结果看起来像正常结果"。
// 现在不给参数就直接打印用法并以 2 退出，不再替调用者猜文件。
const argv = process.argv.slice(2).filter((a) => a.endsWith('.jsonl'));
if (argv.length < 2) {
  console.error('用法：node check-blind-answer-pos.mjs <盲测卷.jsonl> <源题包.jsonl>');
  console.error('  第一个：交给外行的盲测卷（只有序号/题干/选项，无 answer、无题号）');
  console.error('  第二个：原始题包（有 answer，用来反查正确答案文本）');
  console.error('  两个都必填，且必须是两个不同的文件。');
  process.exit(2);
}
const blindPath = argv[0];
const srcPath = argv[1];

// 两个参数传成同一个文件 → 直接报错，不要去算。
// 2026-11-05 踩过：只传一个文件、或复制成两份传两次，
// 脚本会拿盲测卷当源题包，而盲测卷没有 answer 字段，结果报"源里找不到"，
// 看起来像脚本坏了，其实是调用错了。这比算出一个错答案更该被拦住。
if (blindPath === srcPath) {
  console.error('❌ 两个参数是同一个文件。');
  console.error('   第一个应为盲测卷（无 answer、无题号），第二个应为源题包（有 answer）。');
  console.error(`   实际两个都是：${blindPath}`);
  process.exit(2);
}
for (const p of [blindPath, srcPath]) {
  if (!existsSync(resolve(p))) {
    console.error(`❌ 文件不存在：${resolve(p)}`);
    process.exit(2);
  }
}

const blind = load(blindPath);
const src = load(srcPath);

console.log(`盲测卷：${blindPath}`);
console.log(`源题包：${srcPath}`);

const byStem = new Map(src.map((q) => [String(q.stem), q]));

const positions = [];
const rows = [];

for (const q of blind) {
  const s = byStem.get(String(q.题干));
  if (!s) {
    rows.push({ seq: q.序号, id: '(源里找不到)' });
    continue;
  }
  const ansIdx = String(s.answer).trim().toUpperCase().charCodeAt(0) - 65;
  const ansText = norm(s.options[ansIdx]);
  const idx = q.选项.findIndex((o) => norm(o.文) === ansText);
  positions.push(idx + 1);
  rows.push({ seq: q.序号, id: s.id, answer: s.answer, blindPos: idx + 1, label: idx >= 0 ? q.选项[idx].标 : '?' });
}

console.log('=== 盲测卷答案位置（独立核对）===');
// 两个输入文件名在开头已经印过一遍（2026-11-05，Qbank 提）。
// 起因：同一份盲测卷，配错源包会从「✅ 合格 exit=0」变成「只核到 0 道 exit=1」，
// 两种都算「跑完了」，只有一种跑对了。印出文件名，谁都能一眼看出这次拿哪个包核的。
for (const r of rows) {
  if (r.blindPos === undefined) console.log(`序号 ${r.seq}  ${r.id}`);
  else console.log(`序号 ${r.seq}  ${r.id}  源答案=${r.answer}  盲测卷里在第 ${r.blindPos} 个（${r.label}）`);
}
console.log(`\n位置序列：${positions.join(', ')}`);

// 验收标准（2026-11-05，Chief 定）：四个位置都得用上。
// 只打乱选项顺序不够——这次实测是 1,1,2,2，顺序打乱了，但两个答案都落到 A。
// 不合格的卷子不许交给小白，所以这里必须给出明确的退出码，不能被当成"跑完了就行"。
const uniq = new Set(positions);
const missing = [1, 2, 3, 4].filter((p) => !uniq.has(p));
const ok = positions.length === 4 && missing.length === 0;

console.log(`用到的位置：${[...uniq].sort().join(', ')}（共 ${uniq.size}/4）`);
if (!ok) {
  console.log(`缺的位置：${missing.length ? missing.join(', ') : '(无)'}`);
  if (positions.length !== 4) console.log(`⚠ 只核到 ${positions.length} 道，不是 4 道——卷子题数不对`);
  console.log('\n❌ 不合格：答案位置没有分散到四个位置，这卷不能用。');
  console.log('   原因：读者可能先看某几个位置，答案扎堆等于位置成了线索。');
  console.log('   修法：重新打散，直到四个位置各出现一次。');
  process.exit(1);
}
console.log('\n✅ 合格：四个位置各用一次，位置线索已排除，可以交给小白。');
process.exit(0);

