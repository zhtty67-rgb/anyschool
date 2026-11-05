// 核实 basis_evidence：占位标记等于没证据
//
// 起因（2026-11-05，Qbank 指出）：
//   我先前报"basis_evidence 为空 0 道"，看起来证据齐全。
//   但填的是 pre-policy —— 那是占位标记，不是"教材哪句话"。
//   "非空"不等于"有证据"，这两件事必须分开数。
import { readFileSync } from 'node:fs';

const rows = readFileSync('D:/jiaoyu/outputs/questions-authoring-v11.jsonl', 'utf8')
  .split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));

const ev = (q) => String(q.basis_evidence ?? '').trim();

const placeholder = rows.filter((q) => ev(q) === 'pre-policy').length;
const empty = rows.filter((q) => !ev(q)).length;
const real = rows.length - placeholder - empty;

console.log('总题数: ' + rows.length);
console.log('');
console.log('basis_evidence 实际内容：');
console.log('  pre-policy（占位，等于没证据）: ' + placeholder);
console.log('  完全为空: ' + empty);
console.log('  有实际内容: ' + real);
console.log('');

const withChapter = rows.filter((q) => q.basis && q.basis !== 'self-authored');
const chNoEv = withChapter.filter((q) => ev(q) === 'pre-policy' || !ev(q))
  .length;
const chRealEv = withChapter.length - chNoEv;

console.log('已标 d2l 章节的题: ' + withChapter.length);
console.log('  其中证据是占位/空的: ' + chNoEv);
console.log('  其中证据有实际内容: ' + chRealEv);
console.log('');
console.log('所以真正「有章节 + 有证据」的只有 ' + chRealEv + ' 道，'
  + '占全部 ' + ((chRealEv / rows.length) * 100).toFixed(1) + '%。');
console.log('剩下的 ' + (rows.length - chRealEv) + ' 道，拿不出来源。');
