// 复核：7 个文件里，甲类/乙类到底各多少
// 背景：同一判法（去掉答案项看其余三个），Edu 算 31/14，Qbank 算 2/67，方向相反。
// 必须查清是算法不同还是样本不同——这决定下一轮该按 14 道还是 67 道排工期。
import { readFileSync, existsSync } from 'node:fs';
import { analyzeQuestion } from './check-option-parity.mjs';

const D = 'data\\';
const files = [
  'questions-ai-c0101-rewrite-v1.jsonl',
  'questions-ai-c0102-rewrite-v1.jsonl',
  'questions-ai-c0103-rewrite-v2.jsonl',
  'questions-ai-c0104-rewrite-v1.jsonl',
  'questions-ai-c0202-rewrite-v2.jsonl',
  'questions-ai-c0202-fix4-v2.jsonl',
  'questions-ai-c0904-distractors-v1.jsonl',
];

const rows = [];
for (const f of files) {
  if (!existsSync(D + f)) { console.log(`缺文件：${f}`); continue; }
  for (const q of readFileSync(D + f, 'utf8').split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l))) {
    const r = analyzeQuestion(q);
    const isSevere = r.issues.some((i) => i.severity === 'high');
    const ai = r.answerIndex;
    const others = ai === null ? r.lens : r.lens.filter((_, i) => i !== ai);
    const othersSpread = others.length >= 2 ? Math.max(...others) - Math.min(...others) : null;
    rows.push({
      file: f.replace('questions-ai-', '').replace('.jsonl', ''),
      id: q.id,
      lens: r.lens.join('/'),
      answer: ai === null ? '?' : 'ABCD'[ai],
      othersSpread,
      lenSpread: r.lenSpread,
      isSevere,
    });
  }
}

const severe = rows.filter((r) => r.isSevere);
const A = severe.filter((r) => r.othersSpread !== null && r.othersSpread <= 5);
const B = severe.filter((r) => r.othersSpread === null || r.othersSpread > 5);

console.log(`7 个文件共 ${rows.length} 道；严重级 ${severe.length} 道`);
console.log(`  【含严重级口径】甲-挪位置 ${A.length} / 乙-改内容 ${B.length}`);

// 另一种口径：不管严重与否，所有"有字数问题"的题
const wc = rows.filter((r) => r.othersSpread !== null);
const wcA = wc.filter((r) => r.othersSpread <= 5);
console.log(`  【全部 71 道口径】其余三个齐(≤5) ${wcA.length} / 其余三个不齐(>5) ${wc.length - wcA.length}`);

console.log('\n严重级里的乙类明细（其余三个极差 >5）：');
for (const r of B.slice(0, 10)) {
  console.log(`  ${r.id.padEnd(12)} ${r.lens.padEnd(14)} 答案${r.answer}  其余三个极差 ${r.othersSpread}`);
}
