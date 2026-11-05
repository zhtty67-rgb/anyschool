// 查 c0101 每道题的选项数：小白说"四个选项变成只剩 A B"
// 如果某些题本来就只有 2 个选项，那是数据问题，不是渲染问题
import { readFileSync } from 'node:fs';

const PACK = 'data\\questions-authoring-v9.jsonl';
const lines = readFileSync(PACK, 'utf8').split(/\r?\n/).filter(Boolean);

// 逐行解析：单个坏行跳过是合理的，但"全都解析不了"必须报错。
// 否则文件坏了、格式改了，这里会安静地输出"0 道题"，看起来像正常结果。
let parsed = 0;
const badLines = [];
const c0101 = [];
for (const l of lines) {
  let q;
// 这个「空」，是真的没有，还是我没读到？分不清就必须报错。
// 文件不存在 / 读不动 / 读出来是空——三种情况必须分开，不许合并成一个空值。
  try { q = JSON.parse(l); } catch (e) { badLines.push(e.message.slice(0, 60)); continue; }
  parsed += 1;
  const nodes = q.nodes || [];
  if (!nodes.includes('c0101')) continue;
  const opts = q.options || q.choices || [];
  c0101.push({
    id: q.id,
    type: q.type,
    optionCount: Array.isArray(opts) ? opts.length : (typeof opts === 'object' ? Object.keys(opts).length : 0),
    optionKeys: Array.isArray(opts) ? null : (opts && typeof opts === 'object' ? Object.keys(opts) : null),
    answer: q.answer,
    stem: String(q.stem || '').slice(0, 40),
  });
}
if (lines.length === 0) {
  console.error(`题包是空的：${PACK}`);
  process.exit(2);
}
if (parsed === 0) {
  console.error(`一行都没解析出来：${PACK}（共 ${lines.length} 行）`);
  console.error(`  首个错误：${badLines[0] || '(无)'}`);
  console.error(`  这不是"没有符合条件的题"，是文件读坏了。`);
  process.exit(2);
}
if (badLines.length) {
  console.warn(`⚠ 跳过 ${badLines.length} 个无法解析的行（共 ${lines.length} 行），首个错误：${badLines[0]}`);
}

console.log(`c0101 共 ${c0101.length} 道题\n`);
console.log('id | 类型 | 选项数 | 答案 | 题干');
c0101.forEach((q) => console.log(`${q.id} | ${q.type} | ${q.optionCount} | ${q.answer} | ${q.stem}`));

const dist = {};
c0101.forEach((q) => { dist[q.optionCount] = (dist[q.optionCount] || 0) + 1; });
console.log('\n选项数分布:', JSON.stringify(dist));

// 全库检查：有多少道题选项数 < 4
const weird = [];
for (const l of lines) {
  let q;
  try { q = JSON.parse(l); } catch { continue; }
  const opts = q.options || q.choices || {};
  const n = Array.isArray(opts) ? opts.length : Object.keys(opts).length;
  if (q.type === 'single_choice' && n !== 4) weird.push({ id: q.id, n, nodes: q.nodes });
}
console.log(`\n全库单选里选项数≠4 的题: ${weird.length} 道`);
weird.slice(0, 15).forEach((w) => console.log(`  ${w.id}  ${w.n} 个选项  ${JSON.stringify(w.nodes)}`));
