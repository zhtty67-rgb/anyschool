// 核实甲乙分类：46 版落盘文件与 45 版乙类是否同一批
// 起因：Qbank 索引第 5 节写了「66/67/31/14（旧版甲乙分类）」，
//       但 66 和 67 我这边没有出处，需要确认是不是别处算出来的数。
import { readFileSync } from 'node:fs';

// 46 版：已落盘
const p46 = 'D:/jiaoyu/work/review/甲乙分类-分母46-20261105.json';
const d46 = JSON.parse(readFileSync(p46, 'utf8'));
console.log('=== 46 版（落盘文件）===');
console.log('  路径：' + p46);
console.log('  total ' + d46.total + '，甲 ' + d46.move_only + '，乙 ' + d46.rewrite + '（' + d46.check + '）');

const yi46 = d46.items.filter((x) => String(x.class).startsWith('乙')).map((x) => x.id).sort();
console.log('  乙类 ' + yi46.length + ' 道：' + yi46.join(', '));

// 45 版：核对基准文件
const p45 = 'D:/jiaoyu/work/review/核对基准-新写7文件.json';
let yi45 = null;
try {
  const d45 = JSON.parse(readFileSync(p45, 'utf8'));
  console.log('');
  console.log('=== 45 版（核对基准）===');
  console.log('  路径：' + p45);
  const items = d45.items || d45.records || d45.rows || [];
  console.log('  条目数：' + items.length);
  if (items.length) {
    yi45 = items.filter((x) => String(x.class || x['类'] || '').includes('乙')).map((x) => x.id).sort();
    console.log('  乙类 ' + yi45.length + ' 道：' + yi45.join(', '));
  }
} catch (e) {
  console.log('  读不了：' + e.message);
}

if (yi45) {
  const same = yi46.length === yi45.length && yi46.every((x, i) => x === yi45[i]);
  console.log('');
  console.log((same ? '✔' : '✘') + ' 两版乙类题号' + (same ? '完全一致' : '不一致'));
}

// 66/67 出处检查：这两组数可能来自"全部 71 道"而不是"46 道严重级"
console.log('');
console.log('=== 66 / 67 的可能出处 ===');
console.log('  71 道总题数时，如果只按极差分类：');
console.log('  46 严重级 + 25 非严重级 = 71，66 和 67 都不等于这些数。');
console.log('  结论：66 / 67 在"46 道严重级分甲乙"这条线上没有对应值。');
