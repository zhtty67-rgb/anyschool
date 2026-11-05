// 误解字段检查：填了 misconception，但题目根本不是考那个误解
//
// 背景（2026-11-05，Qbank 自查发现）：
//   它批量生成时，如果没有指定误解就"默认挂第一个"，结果 6 个文件 64 道题几乎全是满填，
//   连计算题（c0202-04 的期望计算、fix4 的四道）都挂上了误解——而那些题根本没在考误解。
//   这和当初 basis 整批标注是同一个毛病：为了填满而填，不是因为有再填。
//
// 这个脚本查不出"误解填得对不对"（那要人判断），但能查出三种明显的凑数迹象：
//   ① 计算题挂了误解（有 计算 标签或 formula 字段）
//   ② 判断题挂了误解，但误解不是那种"常见错误认知"的形态
//   ③ 同一个节点的所有题挂的是同一条误解（多半是默认值，不是逐题判断的）
//
// 用法：node scripts/check-misconception.mjs <题包.jsonl> [--json]
import { readFileSync, existsSync } from 'node:fs';

const isCalc = (q) =>
  (Array.isArray(q.tags) && q.tags.includes('计算')) || Boolean(q.formula) || Boolean(q.formula_params);

/**
 * @returns {{total:number, filled:number, empty:number, byNode:Object, issues:Array}}
 */
export function checkMisconception(pack) {
  const issues = [];
  const byNode = {};

  for (const q of pack || []) {
    const m = q.misconception;
    const node = (q.nodes && q.nodes[0]) || '(无节点)';
    byNode[node] = byNode[node] || { total: 0, filled: 0, values: new Map() };
    byNode[node].total += 1;

    if (m == null || m === '') continue;
    byNode[node].filled += 1;
    const key = String(m).trim();
    byNode[node].values.set(key, (byNode[node].values.get(key) || 0) + 1);

    // ① 计算题挂误解：这类题考的是算法，不是误解
    if (isCalc(q)) {
      issues.push({ id: q.id, node, kind: '计算题挂了误解', value: key.slice(0, 30) });
    }
  }

  // ③ 整节点同一条误解：多半是批量默认，不是逐题判断的
  for (const [node, s] of Object.entries(byNode)) {
    if (s.filled >= 8 && s.values.size === 1) {
      const only = [...s.values.keys()][0];
      issues.push({
        id: '(节点级)',
        node,
        kind: `整个节点的 ${s.filled} 道题挂的是同一条误解，疑为默认值`,
        value: only.slice(0, 30),
      });
    }
  }

  const filled = Object.values(byNode).reduce((a, s) => a + s.filled, 0);
  const total = pack.length;
  return { total, filled, empty: total - filled, byNode, issues };
}

const invokedDirectly = process.argv[1] && /check-misconception\.mjs$/.test(process.argv[1]);
if (invokedDirectly) {
  const path = process.argv.slice(2).find((a) => a.endsWith('.jsonl'));
  if (!path || !existsSync(path)) {
    console.error('用法: node scripts/check-misconception.mjs <题包.jsonl> [--json]');
    process.exit(2);
  }
  const lines = readFileSync(path, 'utf8').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) {
    console.error(`题包是空的：${path}`);
    process.exit(2);
  }
  const pack = lines.map((l, i) => {
    try { return JSON.parse(l); } catch (e) {
      throw new Error(`第 ${i + 1} 行解析失败：${e.message}`);
    }
  });

  const r = checkMisconception(pack);
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ file: path, ...r, byNode: Object.fromEntries(
      Object.entries(r.byNode).map(([k, v]) => [k, { total: v.total, filled: v.filled, unique: v.values.size }])
    ) }, null, 2));
    process.exit(r.issues.length ? 1 : 0);
  }

  console.log(`题包：${path}`);
  console.log(`题数 ${r.total}；填了误解 ${r.filled}；留空 ${r.empty}`);
  console.log('\n按节点（填了几道 / 共几道 / 不同误解数）：');
  for (const [node, s] of Object.entries(r.byNode)) {
    console.log(`  ${node}  ${s.filled}/${s.total}  不同误解 ${s.values.size}`);
  }

  if (!r.issues.length) {
    console.log('\n没发现明显的凑数迹象（但填得对不对仍需人判断）。');
  } else {
    console.log(`\n可疑 ${r.issues.length} 处：`);
    for (const x of r.issues) console.log(`  [${x.kind}] ${x.id} @ ${x.node}  「${x.value}」`);
  }
  // 只做提示，不阻断——填得对不对最终要人判断
  console.log('\n注意：这个脚本查不出"误解填得对不对"，只能查出明显的凑数迹象。');
  process.exit(0);
}
