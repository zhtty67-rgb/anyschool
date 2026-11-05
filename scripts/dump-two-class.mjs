// 出具一份可对照的核对基准：文件清单 + 每道严重级题的分类归属
//
// 用途（2026-11-05，Chief 定）：两边数字不一致时，不是再争一个数，
// 而是把"跑了哪些文件、每道题算到哪类"逐条列出来，交集之外就是分歧点。
//
// 用法：node scripts/dump-two-class.mjs > 核对基准.json
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
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

const md5 = (p) => createHash('md5').update(readFileSync(p)).digest('hex');
const rows = [];
const fileInfo = [];

for (const f of files) {
  const p = D + f;
  if (!existsSync(p)) { fileInfo.push({ file: f, exists: false }); continue; }
  const pack = readFileSync(p, 'utf8').split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));
  fileInfo.push({ file: f, exists: true, md5: md5(p), questions: pack.length });

  for (const q of pack) {
    const r = analyzeQuestion(q);
    const severeIssue = r.issues.find((i) => i.severity === 'high');
    if (!severeIssue) continue;

    const ai = r.answerIndex;
    const others = ai === null ? r.lens : r.lens.filter((_, i) => i !== ai);
    const othersSpread = others.length >= 2 ? Math.max(...others) - Math.min(...others) : null;

    rows.push({
      id: q.id,
      file: f,
      lens: r.lens,
      answerAt: ai === null ? null : 'ABCD'[ai],
      lenSpread: r.lenSpread,
      // 判法：去掉答案项，看其余三个的极差
      othersSpread,
      // ≤5 只需挪位置；>5 是其余三个本身就不齐，得改内容
      class: ai !== null && othersSpread !== null && othersSpread <= 5 ? '甲-挪位置' : '乙-改内容',
    });
  }
}

const A = rows.filter((r) => r.class.startsWith('甲'));
const B = rows.filter((r) => r.class.startsWith('乙'));

const out = {
  _口径: {
    文件清单: files,
    判法: '只统计【严重】级（离群项正好落在正确答案位置）；分类看"去掉答案项后其余三个的极差"，≤5 甲类，>5 乙类',
    脚本: 'scripts/check-option-parity.mjs 的 analyzeQuestion（severity=high）',
    阈值: { 答案项与其余均值差: '>2 字算离群', '其余三个极差': '≤5 甲类 / >5 乙类' },
    生成时间: new Date().toISOString(),
  },
  文件: fileInfo,
  汇总: { 严重级总数: rows.length, 甲: A.length, 乙: B.length },
  严重级明细: rows,
};

console.log(JSON.stringify(out, null, 2));
