// 写出「分母 46」版的甲乙分类，连同七个文件 md5 一起落盘
//
// 起因（2026-11-05，Qbank 指出）：
//   我重跑出 46 之后，只把结果贴在群里，没有落盘。
//   结果盘上 `核对基准-新写7文件.json` 还是旧的 45/31/14，
//   两边一对就"对不上"——不是谁算错，是重跑没存档。
//   以后每次重跑都写新文件，文件名带分母，旧版留着不覆盖。
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { listSevere } from '../scripts/list-severe.mjs';

const FILES = [
  'c0101-rewrite-v1',
  'c0102-rewrite-v1',
  'c0103-rewrite-v2',
  'c0104-rewrite-v1',
  'c0202-rewrite-v2',
  'c0202-fix4-v2',
  'c0904-distractors-v1',
];

const rows = [];
const mds = {};
for (const f of FILES) {
  const p = 'D:/jiaoyu/outputs/questions-ai-' + f + '.jsonl';
  const md5 = createHash('md5').update(readFileSync(p)).digest('hex');
  mds[f] = { path: p, md5_32: md5, md5_8: md5.slice(0, 8).toUpperCase() };
  const r = listSevere(p);
  for (const s of r.severe) {
    const sp = s.answerAt === '?' ? s.lenSpread : s.othersSpread;
    rows.push({
      file: f,
      id: s.id,
      lens: s.lens,
      lenSpread: s.lenSpread,
      lenSpreadExcludingAnswer: sp,
      answerAt: s.answerAt,
      class: sp <= 5 ? '甲-挪位置' : '乙-改内容',
    });
  }
}

const move = rows.filter((r) => r.class.startsWith('甲')).length;
const rw = rows.length - move;

const out = {
  generated_at: new Date().toISOString(),
  note:
    '分母 46 版。上一版 45/31/14（核对基准-新写7文件.json）作废：'
    + 'c0103-rewrite-v2 在两次跑之间被改过，md5 由 0e647c8b 变 21eea2e8，所以差 1 道。',
  criteria: {
    严重级: 'severity == high（离群项正好是正确答案）',
    甲类: '去掉答案项后，其余三个极差 <= 5',
    乙类: '去掉答案项后，其余三个极差 > 5',
  },
  files: mds,
  total: rows.length,
  move_only: move,
  rewrite: rw,
  check: move + '+' + rw + '=' + (move + rw) + ' vs 总数 ' + rows.length,
  items: rows,
};

const outPath = 'D:/jiaoyu/work/review/甲乙分类-分母46-20261105.json';
writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');

console.log('写出：' + outPath);
console.log('总 ' + rows.length + ' 道   甲 ' + move + '   乙 ' + rw + '   ' + out.check);
console.log('七个文件 md5（前 8 位）：');
for (const [k, v] of Object.entries(mds)) console.log('  ' + k.padEnd(24) + v.md5_8);
