// 三个门槛下，v11 四选一的实际分布
//
// 判法（Chief 定）：去掉正确答案那一项，看剩下三个自己的极差。
// 为什么不能用总极差：总极差大往往正是因为"正确项长"，那是位置泄露，
// 把答案挪走就解决了；用总极差会把只需挪位置的题算成"要重写"。
//
// 2026-11-05：先前用 PowerShell 内联脚本跑，正则里的 $ 被吃掉，
// 411 道全被判成"答案认不出"。写成文件跑，避免转义问题。
import { readFileSync } from 'node:fs';

const rows = readFileSync('D:/jiaoyu/outputs/questions-authoring-v11.jsonl', 'utf8')
  .split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));

const four = rows.filter((q) => Array.isArray(q.options) && q.options.length === 4);

// 两种字数计法（2026-11-05 定）：
//   norm —— 去掉所有空白（默认）。中文长句里英文词两侧常有空格，
//           如「用硬间隔 SVM，强迫全部分对」原文 15 字符、去空白 14；
//           「结果一定比 K-means 好」原文 15、去空白 13。
//           空格只出现在部分选项里，会让极差凭空多 1～2。
//   raw  —— 原文长度。带英文词的选项会比纯中文选项多 1–2 字。
//
// 两边一度因此对不上（c0603-05：去空白 14/6/6/28 极差 8，原文 15/6/6/29 极差 9）。
// 两种都不算错，但**必须说清用的是哪一种**，否则同一份文件能算出两个极差。
const lensOf = (q, mode) => q.options.map((o) => {
  const s = String(typeof o === 'string' ? o : (o.text ?? ''));
  return mode === 'raw' ? s.length : s.replace(/\s+/g, '').length;
});
const ansIdx = (q) => {
  const a = String(q.answer ?? '').trim().toUpperCase();
  if (a.length !== 1 || a < 'A' || a > 'D') return null;
  const i = a.charCodeAt(0) - 65;
  return i < q.options.length ? i : null;
};

function survey(mode) {
  const buckets = { '<=3': 0, '<=5': 0, '<=8': 0, '>8': 0 };
  let noAns = 0;
  for (const q of four) {
    const L = lensOf(q, mode);
    const i = ansIdx(q);
    if (i === null) { noAns += 1; continue; }
    const others = L.filter((_, j) => j !== i);
    const sp = Math.max(...others) - Math.min(...others);
    if (sp <= 3) buckets['<=3'] += 1;
    else if (sp <= 5) buckets['<=5'] += 1;
    else if (sp <= 8) buckets['<=8'] += 1;
    else buckets['>8'] += 1;
  }
  return { buckets, noAns, total: four.length - noAns };
}

for (const mode of ['norm', 'raw']) {
  const { buckets, noAns, total } = survey(mode);
  console.log('=== 计法：' + (mode === 'norm' ? '去空白' : '原文长度') + ' ===');
  console.log('四选一 ' + four.length + ' 道；答案认不出 ' + noAns + ' 道；可分类 ' + total + ' 道');
  console.log('  （第一列是"落在这一档"的题数，第二列是"累计到这一档"的题数——');
  console.log('   报数时必须说清用的是哪一列，2026-11-05 就因为两列并排被读错过一次）');
  let cum = 0;
  for (const k of ['<=3', '<=5', '<=8', '>8']) {
    const c = buckets[k];
    cum += c;
    console.log('  ' + k.padEnd(5) + String(c).padStart(4) + ' 道    累计 ' + String(cum).padStart(4)
      + ' 道（' + ((cum / total) * 100).toFixed(1) + '%）');
  }
  console.log('');
}
