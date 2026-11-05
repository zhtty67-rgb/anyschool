// 两版甲乙分类对比：45 版（分母 45）vs 46 版（分母 46）
// 45 版字段名是「严重级明细」，不是 items/records/rows——先前我按错字段名读，读到 0 条。
import { readFileSync } from 'node:fs';

const p45 = 'D:/jiaoyu/work/review/核对基准-新写7文件.json';
const p46 = 'D:/jiaoyu/work/review/甲乙分类-分母46-20261105.json';

const d45 = JSON.parse(readFileSync(p45, 'utf8'));
const d46 = JSON.parse(readFileSync(p46, 'utf8'));

console.log('=== 45 版 ===');
console.log('  口径：' + JSON.stringify(d45['_口径']));
console.log('  汇总：' + JSON.stringify(d45['汇总']));
const rows45 = d45['严重级明细'] || [];
console.log('  明细条数：' + rows45.length);
if (rows45.length) {
  console.log('  第一条的字段：' + Object.keys(rows45[0]).join(', '));
}

console.log('');
console.log('=== 46 版 ===');
console.log('  口径：' + JSON.stringify(d46.criteria));
console.log('  汇总：total ' + d46.total + '，甲 ' + d46.move_only + '，乙 ' + d46.rewrite);
console.log('  明细条数：' + d46.items.length);

// 取两版乙类题号
const yi45 = rows45
  .filter((x) => String(x.class || x['类'] || x['分类'] || '').includes('乙'))
  .map((x) => x.id).sort();
const yi46 = d46.items.filter((x) => String(x.class).includes('乙')).map((x) => x.id).sort();

console.log('');
console.log('=== 乙类对比 ===');
console.log('  45 版乙类：' + yi45.length + ' 道');
if (yi45.length) console.log('    ' + yi45.join(', '));
console.log('  46 版乙类：' + yi46.length + ' 道');
console.log('    ' + yi46.join(', '));

if (yi45.length) {
  const only45 = yi45.filter((x) => !yi46.includes(x));
  const only46 = yi46.filter((x) => !yi45.includes(x));
  const same = only45.length === 0 && only46.length === 0;
  console.log('');
  console.log((same ? '✔ 两版乙类题号完全一致' : '✘ 两版乙类不一致'));
  if (!same) {
    if (only45.length) console.log('  只在 45 版：' + only45.join(', '));
    if (only46.length) console.log('  只在 46 版：' + only46.join(', '));
  }
}
