// 45 版与 46 版的甲类差异：到底是哪一道题、是不是同一道题被改过
// 不凭印象，按 id 求差集。
import { readFileSync } from 'node:fs';

const d45 = JSON.parse(readFileSync('D:/jiaoyu/work/review/核对基准-新写7文件.json', 'utf8'));
const d46 = JSON.parse(readFileSync('D:/jiaoyu/work/review/甲乙分类-分母46-20261105.json', 'utf8'));

const rows45 = d45['严重级明细'] || [];
const rows46 = d46.items || [];

const all45 = rows45.map((x) => x.id).sort();
const all46 = rows46.map((x) => x.id).sort();

const only45 = all45.filter((x) => !all46.includes(x));
const only46 = all46.filter((x) => !all45.includes(x));

console.log('45 版严重级：' + all45.length + ' 道');
console.log('46 版严重级：' + all46.length + ' 道');
console.log('');
console.log('只在 45 版：' + (only45.length ? only45.join(', ') : '（无）'));
console.log('只在 46 版：' + (only46.length ? only46.join(', ') : '（无）'));
console.log('');

// 对同一 id 在两版里的长度和分类做对比
const common = all45.filter((x) => all46.includes(x));
let changed = 0;
for (const id of common) {
  const a = rows45.find((x) => x.id === id);
  const b = rows46.find((x) => x.id === id);
  const la = (a.lens || []).join('/');
  const lb = (b.lens || []).join('/');
  if (la !== lb || a.class !== b.class) {
    changed += 1;
    console.log('同一题号、两版不同：' + id);
    console.log('  45 版：长度 ' + la + '  分类 ' + a.class + '  其余三项极差 ' + a.othersSpread);
    console.log('  46 版：长度 ' + lb + '  分类 ' + b.class + '  其余三项极差 ' + b.lenSpreadExcludingAnswer);
  }
}
console.log('');
console.log('同题号但内容或分类有变的：' + changed + ' 道');
