// 节点级发布门槛：答不了占比过高的节点，只做信息提示，不再阻断发布
//
// 来源：小白（外行视角）原话——
//   "如果学习者点进 c1103，12 道里 7 道看不懂、3 道靠语感蒙，
//    他出来的感觉是『这个我真学不会』。分数不会假，但体验是真的差。"
//
// 为什么从"阻断"降级成"信息"（2026-11-05，Chief 判定）：
//   这条线的判据是 guessable_class 标注，而标注本身还没定稳——
//   小白复核 22 道，Qbank 判过头 11 道，一半。"答不了"与"可猜"的边界
//   刚改成"能不能排除三个"，标注口径仍在变。
//   拿一个还在变的标注去决定节点上不上线，等于让工具替人做产品决定。
//
//   所以：这条线只报告，不阻断。c1103 该不该下线，理由应该是
//   "读者读着像看天书"——那是人的判断，不是这个脚本的判断。
//
// 用法：node core/check-node-gate.mjs <题包.jsonl>
import { readFileSync, existsSync } from 'node:fs';

/** 信息级阈值：超过它只打提示，不影响退出码 */
export const UNANSWERABLE_LIMIT = 0.5;

/**
 * 按节点统计 guessable_class
 * @param {Array} questions 题包里每道题需带 nodes 与 guessable_class
 * @returns {{flagged: Array, passed: Array, untagged: Array, noClass: number}}
 *   flagged 只是"值得人看一眼"的节点，不是"被阻断"的节点
 */
export function checkNodeGate(questions) {
  const byNode = new Map();
  let noClass = 0;

  for (const q of questions || []) {
    if (!Array.isArray(q.nodes)) continue;
    const cls = q.guessable_class;
    if (!cls) { noClass += 1; continue; }
    for (const n of q.nodes) {
      if (!byNode.has(n)) byNode.set(n, { total: 0, unanswerable: 0, guessable: 0, need: 0, ids: [] });
      const s = byNode.get(n);
      s.total += 1;
      if (cls === 'unanswerable') { s.unanswerable += 1; s.ids.push(q.id); }
      else if (cls === 'guessable') s.guessable += 1;
      else s.need += 1;
    }
  }

  const flagged = [];
  const passed = [];
  const untagged = [];
  for (const [node, s] of byNode) {
    const ratio = s.total ? s.unanswerable / s.total : 0;
    const item = { node, ...s, ratio: Number(ratio.toFixed(3)) };
    // flagged = 值得人看一眼，不是"禁止发布"
    if (ratio > UNANSWERABLE_LIMIT) flagged.push(item);
    else passed.push(item);
    // 全没标注的节点单独列出来：不是通过，是没数据
    if (s.guessable + s.need + s.unanswerable === 0) untagged.push(node);
  }
  flagged.sort((a, b) => b.ratio - a.ratio);
  passed.sort((a, b) => a.node.localeCompare(b.node));
  return { flagged, passed, untagged, noClass };
}

// CLI
const invokedDirectly = process.argv[1] && /check-node-gate\.mjs$/.test(process.argv[1]);
if (invokedDirectly) {
  const path = process.argv[2];
  if (!path || !existsSync(path)) {
    console.error('用法: node core/check-node-gate.mjs <题包.jsonl>');
    process.exit(2);
  }
  const qs = readFileSync(path, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
  const r = checkNodeGate(qs);

  console.log(`题包：${path}（${qs.length} 道）`);
  console.log(`未标 guessable_class 的题：${r.noClass} 道\n`);

  console.log('节点 | 题数 | 可猜 | 答不了 | 需掌握 | 答不了占比');
  for (const x of [...r.flagged, ...r.passed]) {
    const flag = x.ratio > UNANSWERABLE_LIMIT ? '  ← 值得看一眼' : '';
    console.log(`${x.node} | ${x.total} | ${x.guessable} | ${x.unanswerable} | ${x.need} | ${Math.round(x.ratio * 100)}%${flag}`);
  }

  if (r.flagged.length) {
    console.log(`\n信息级：${r.flagged.length} 个节点答不了占比超过 ${UNANSWERABLE_LIMIT * 100}%（不阻断构建）：`);
    for (const b of r.flagged) {
      console.log(`  ${b.node}  ${b.unanswerable}/${b.total} = ${Math.round(b.ratio * 100)}%`);
      console.log(`    答不了的题：${b.ids.join(', ')}`);
    }
    console.log('\n这只是提示。节点上不上线由人定，不由这个比例定——标注本身还在变。');
  } else {
    console.log('\n没有节点答不了占比过半');
  }
  // 信息级：无论结果如何都不影响退出码，构建不会被它挡住
  process.exit(0);
}
