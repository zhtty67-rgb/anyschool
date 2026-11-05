// 严重级题目清单：离群项正好落在正确答案位置的那些题
//
// 来源（2026-11-05，Chief 定）：形式检查报"严重"的题必须优先改——
// 它们不只是"形式不齐"，而是长度和位置同时泄露答案：读者只要注意哪条不一样，答案就在那儿。
//
// 用法：node scripts/list-severe.mjs [题包路径] [--json]
import { readFileSync, existsSync } from 'node:fs';
import { analyzeQuestion } from './check-option-parity.mjs';

const DEFAULT_PACK = 'data\\questions-authoring-v9.jsonl';

/**
 * @param {string} path
 * @returns {{total:number, comparable:number, skipped:number, flagged:number, severe:Array, byNode:Object}}
 */
export function listSevere(path) {
  const lines = readFileSync(path, 'utf8').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) throw new Error(`题包是空的：${path}`);
  const pack = lines.map((l, i) => {
    try { return JSON.parse(l); } catch (e) {
      throw new Error(`第 ${i + 1} 行解析失败：${e.message}\n  不能跳过坏行——跳过后统计出来的数就是假的。`);
    }
  });
  const rows = pack.map(analyzeQuestion);
  const flagged = rows.filter((r) => r.flags.length);
  const severe = flagged.filter((r) => r.flags.some((f) => f.includes('【严重】')));

  const byNode = {};
  for (const s of severe) {
    const q = pack.find((x) => x.id === s.id);
    for (const n of q?.nodes || ['(无节点)']) byNode[n] = (byNode[n] || 0) + 1;
  }

  // 分两类，给下一轮判断工作量用（2026-11-05，Chief 定判法）。
  //
  // 判法：**去掉正确答案那一项，看剩下三个自己齐不齐。**
  //   甲类（挪位置）：其余三个极差 ≤ 门槛 → 长度本身没问题，只是答案站在了特殊位置上
  //   乙类（改内容）：其余三个极差 > 门槛 → 不管答案在哪个位置，都有一个明显偏长/偏短
  //
  // 为什么不能用"四个选项的总极差"（我先写错过一次）：
  //   总极差大，往往正是因为**正确项那一项长**——而那一项长恰恰是"位置泄露"，
  //   把答案挪走就解决了。用总极差判，会把 130 道本来只需挪位置的题算成"要重写"，
  //   下一轮工作量被高估三倍多。
  //
  // 关于门槛本身（2026-11-05，Qbank 指出后改）：
  //   "≤5" 一开始是我**估的**，不是算出来的。Qbank 说得对：
  //   38/37/38/40（极差 3，但答案在离群位）和 47/40/39/39（极差 8）之间那条线画在哪，
  //   会让 165 道的分类差出几十道。
  //   所以现在不改成一个"更好的门槛"，而是**把三个门槛的结果一起报**，
  //   并且在输出里直接写明"换门槛会变成什么数"。
  //   定门槛的权力交给做决定的人，不给脚本。
  const THRESHOLDS = [3, 5, 8];
  const DEFAULT_SPLIT = 5;

  const withClass = severe.map((s) => {
    const lens = s.lens;
    const ansIdx = s.answerIndex;
    const others = ansIdx === null ? lens : lens.filter((_, i) => i !== ansIdx);
    const othersSpread = others.length >= 2 ? Math.max(...others) - Math.min(...others) : 0;
    // 答案位置认不出时，退回到"总极差小就算挪位置"，并标注出来，不假装确定
    const ambiguous = ansIdx === null;
    const moveOnly = ambiguous ? s.lenSpread <= 6 : othersSpread <= DEFAULT_SPLIT;
    return {
      id: s.id,
      lens,
      lenSpread: s.lenSpread,
      othersSpread,
      answerAt: ansIdx === null ? '?' : String.fromCharCode(65 + ansIdx),
      class: moveOnly ? '甲-挪位置' : '乙-改内容',
      why: s.flags.find((f) => f.includes('【严重】')),
      stopped: '',   // 留给小白填：停了 / 没停
    };
  });

  // 每个门槛下的分类结果，一起报
  const byThreshold = {};
  for (const th of THRESHOLDS) {
    const move = withClass.filter((s) => (s.answerAt === '?' ? s.lenSpread <= 6 : s.othersSpread <= th)).length;
    byThreshold[th] = { moveOnly: move, rewrite: withClass.length - move };
  }

  return {
    total: rows.length,
    comparable: rows.filter((r) => r.comparables).length,
    skipped: rows.filter((r) => !r.comparables).length,
    flagged: flagged.length,
    severe: withClass,
    byNode,
    byClass: {
      moveOnly: withClass.filter((s) => s.class === '甲-挪位置').length,
      rewrite: withClass.filter((s) => s.class === '乙-改内容').length,
    },
    // 每个门槛下的分类结果。报数时必须连门槛一起报——
    // 只说"13 道挪位置"而不说是什么门槛，等于没说。
    byThreshold,
    thresholds: THRESHOLDS,
    defaultSplit: DEFAULT_SPLIT,
  };
}

const invokedDirectly = process.argv[1] && /list-severe\.mjs$/.test(process.argv[1]);
if (invokedDirectly) {
  const path = process.argv.slice(2).find((a) => a.endsWith('.jsonl')) || DEFAULT_PACK;
  if (!existsSync(path)) {
    console.error(`文件不存在：${path}`);
    process.exit(2);
  }
  let r;
  try { r = listSevere(path); } catch (e) {
    console.error(e.message);
    process.exit(2);
  }

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ file: path, ...r }, null, 2));
    process.exit(0);
  }

  console.log(`题包：${path}`);
  console.log(`总计 ${r.total} 道；四选一 ${r.comparable} 道；不适用的 ${r.skipped} 道`);
  console.log(`有形式泄露 ${r.flagged} 道；其中【严重】${r.severe.length} 道` +
    `（占四选一的 ${((r.severe.length / r.comparable) * 100).toFixed(1)}%）`);
  console.log(`\n〔严重〕= 离群项正好是正确答案：长度和位置同时泄露。这类必须优先改。`);

  console.log(`\n按节点：`);
  for (const [n, c] of Object.entries(r.byNode).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${n}  ${c} 道`);
  }

  console.log(`\n逐题：`);
  for (const s of r.severe) console.log(`  ${s.id}  ${s.lens.join('/')}`);
  process.exit(0);
}
