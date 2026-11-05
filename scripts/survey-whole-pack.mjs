// 全库排查：现有题里有多少道被检查器报出问题（只报数，不改任何东西）
//
// 2026-11-05：c0204-01 的实测说明，严重的离群题已经在线上了
// （答案 23 字 vs 干扰项 4-7 字）。先弄清有多少道，再谈改不改。
// 这份脚本只读不写，不碰任何题包。
import { readFileSync } from 'node:fs';
import { checkPack } from './check-option-parity.mjs';

const PACKS = [
  { name: 'v11（题包）', path: 'D:/jiaoyu/outputs/questions-authoring-v11.jsonl' },
];

for (const { name, path } of PACKS) {
  const rows = readFileSync(path, 'utf8').split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));
  const r = checkPack(rows);

  console.log('=== ' + name + ' ===');
  console.log('总题数 ' + r.total + '，四选一 ' + r.comparable + '，不适用 ' + r.skipped);
  console.log('有形式问题 ' + r.flagged.length + ' 道（' + ((r.flagged.length / r.comparable) * 100).toFixed(1) + '% 的四选一）');
  console.log('');
  console.log('按类型：');
  for (const [t, c] of Object.entries(r.byType).sort((a, b) => b[1] - a[1])) {
    console.log('  ' + t.padEnd(34) + c + ' 道');
  }
  console.log('');
  console.log('按严重度：');
  for (const [s, c] of Object.entries(r.bySeverity).sort((a, b) => b[1] - a[1])) {
    console.log('  ' + s.padEnd(10) + c + ' 条');
  }
  console.log('');
  console.log('【严重】离群项正好是正确答案：' + r.severeCount + ' 道（占四选一 ' + ((r.severeCount / r.comparable) * 100).toFixed(1) + '%）');
  if (r.severe.length) {
    console.log('  题号：' + r.severe.map((x) => x.id).join(', '));
  }
}
