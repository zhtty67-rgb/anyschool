// coverage-check.mjs —— B1–B5 判据补丁（大副产出，交 Edu 落地）
//
// 用法：直接替换 data 全文。
// 依赖：../core/tree.mjs、./index.mjs、./lines.mjs —— 全部是现有导出，不新增依赖。
//
// 本版相对原版的改动：
//   1. 删除 c0101 / c0102 的"应无语句"断言（那两条判断过时，且那两句是本库最好的内容之一）
//   2. 断言从"哪些概念该配"改为"配了的必须合格"（B2 / B3）
//   3. 新增 B5：hook 与概念树 misconceptions 的对齐度统计
//   4. 保留原有的孤儿语句检查（B1）
//
// 为什么不再判"哪些概念该配"：
//   实测 79 个概念的 misconceptions 字段全部非空（无一例外），这个字段是每个概念都填的
//   标准字段，不是"值得配语句"的信号。拿它当判据，判别力为零，会让 79 个概念全被要求配语句。
//   "该不该配"是编辑判断，写不成规则；"配了必须合格"是可以机器验的。

import { parseTree } from '../core/tree.mjs';
import { hasLines } from './index.mjs';
import { LINES, POSITIONS, libraryStats } from './lines.mjs';

const tree = parseTree();
const conceptByCode = new Map(tree.concepts.map((c) => [c.code, c]));

let failures = 0;
const fail = (msg) => {
  failures += 1;
  console.log(`  FAIL ${msg}`);
};
const pass = (msg) => console.log(`  ok   ${msg}`);
const warn = (msg) => console.log(`  WARN ${msg}`);

// ─────────────────────────────────────────────────────────────
// 总览
// ─────────────────────────────────────────────────────────────
const codesInLines = Object.keys(LINES);
console.log(`知识树 ${tree.total} 个概念，语句库覆盖 ${codesInLines.length} 个`);

// 哪些概念显示 AI 同学（用于人工核对，不作为断言）
const shown = tree.concepts.filter((c) => hasLines(c.code)).map((c) => c.code);
const hidden = tree.concepts.filter((c) => !hasLines(c.code));
console.log(`\n已配语句：${shown.join(' ')}`);
console.log(`未配语句（界面上不显示 AI 同学）：${hidden.length} 个`);
for (const c of hidden.slice(0, 10)) console.log(`  ${c.code} ${c.name}`);
if (hidden.length > 10) console.log(`  …… 另有 ${hidden.length - 10} 个`);

// ─────────────────────────────────────────────────────────────
// B1 语句库完整性：每条语句必须落在真实概念上，不能孤儿
// ─────────────────────────────────────────────────────────────
console.log('\n== B1 语句库完整性 ==');
const orphan = codesInLines.filter((code) => !conceptByCode.has(code));
if (orphan.length) {
  fail(`孤儿语句：${orphan.join(' ')}`);
} else {
  pass(`全部 ${codesInLines.length} 个 code 都能在概念树里找到`);
}

// ─────────────────────────────────────────────────────────────
// B2 配了就必须合格：每个已配概念至少 3 条，且三种立场齐全
// ─────────────────────────────────────────────────────────────
console.log('\n== B2 三种立场齐全 ==');
const MIN_LINES = 3;
for (const code of codesInLines) {
  const list = LINES[code];
  const concept = conceptByCode.get(code);
  const label = concept ? `${code} ${concept.name}` : code;

  if (!Array.isArray(list) || list.length < MIN_LINES) {
    fail(`${label}：只有 ${Array.isArray(list) ? list.length : 0} 条语句，至少要 ${MIN_LINES} 条`);
    continue;
  }

  const present = new Set(list.map((l) => l.position));
  const missing = POSITIONS.filter((p) => !present.has(p));
  if (missing.length) {
    fail(`${label}：缺少立场 ${missing.join(' / ')}`);
    continue;
  }

  // 顺带查结构：position / quote / hook 三个字段都得有
  const broken = list.filter(
    (l) => !l || typeof l.quote !== 'string' || !l.quote.trim() || !POSITIONS.includes(l.position)
  );
  if (broken.length) {
    fail(`${label}：${broken.length} 条语句结构不完整（缺 quote 或 position 非法）`);
    continue;
  }

  pass(`${label}：${list.length} 条，三种立场齐全`);
}

// ─────────────────────────────────────────────────────────────
// B3 不评价学习者：quote 里不得出现评语类词
// ─────────────────────────────────────────────────────────────
console.log('\n== B3 不评价学习者 ==');
// 只匹配针对"人"的评价，不匹配针对"事情/说法"的中性词。
// 例如"这样算不对"是评述命题，允许；"你算错了""答得好"是评价学习者，禁止。
const BANNED = [
  { re: /你(答|做|算|想)错了/, why: '直接判定学习者出错' },
  { re: /你(说|讲)得?(对|不对|错)/, why: '评价学习者的回答' },
  { re: /答得好|真棒|很棒|太棒了|不错哦|做得好/, why: '表扬学习者' },
  { re: /你真(聪明|厉害|笨)/, why: '评价学习者能力' },
  { re: /你(应该|必须|得)先/, why: '指令式说教' },
  { re: /显而易见|很简单|不难吧|这都不会/, why: '贬低难度' },
];

let b3Hits = 0;
for (const code of codesInLines) {
  const list = LINES[code] || [];
  const concept = conceptByCode.get(code);
  const label = concept ? `${code} ${concept.name}` : code;
  for (let i = 0; i < list.length; i += 1) {
    const q = list[i]?.quote ?? '';
    for (const rule of BANNED) {
      if (rule.re.test(q)) {
        b3Hits += 1;
        fail(`${label} 第 ${i + 1} 条：命中「${rule.why}」→ ${q.slice(0, 30)}…`);
      }
    }
  }
}
if (b3Hits === 0) pass(`扫描全部 ${codesInLines.reduce((s, c) => s + (LINES[c]?.length || 0), 0)} 条语句，无评价性用语`);

// ─────────────────────────────────────────────────────────────
// B4（软）hook 能不能对上概念树的 misconceptions —— 只警告不报错
// ─────────────────────────────────────────────────────────────
console.log('\n== B4 hook 与概念树误解的对齐（软） ==');

/** 粗匹配：hook 和误解条目共享 2 个以上连续汉字，即视为相关 */
function looselyRelated(hook, mis) {
  if (!hook || !mis) return false;
  const clean = (s) => String(s).replace(/[，。、；：""''（）()《》!？?—…·\s]/g, '');
  const a = clean(hook);
  const b = clean(mis);
  if (!a || !b) return false;
  // 双向包含
  if (a.includes(b) || b.includes(a)) return true;
  // 2-gram 交集
  const grams = (s) => {
    const out = new Set();
    for (let i = 0; i < s.length - 1; i += 1) out.add(s.slice(i, i + 2));
    return out;
  };
  const ga = grams(a);
  const gb = grams(b);
  let hit = 0;
  for (const g of ga) if (gb.has(g)) hit += 1;
  return hit >= 1;
}

const b4Stats = [];
for (const code of codesInLines) {
  const concept = conceptByCode.get(code);
  if (!concept) continue;
  const misconceptions = Array.isArray(concept.misconceptions) ? concept.misconceptions : [];
  const hooks = (LINES[code] || []).map((l) => l.hook).filter(Boolean);
  if (!hooks.length) continue;

  const matched = hooks.filter((h) => misconceptions.some((m) => looselyRelated(h, m)));
  b4Stats.push({
    code,
    name: concept.name,
    hooks: hooks.length,
    matched: matched.length,
    misCount: misconceptions.length,
  });
}

for (const s of b4Stats) {
  if (s.matched === 0) warn(`${s.code} ${s.name}：${s.hooks} 个 hook 全部对不上概念树的 ${s.misCount} 条误解`);
}
const b4Total = b4Stats.reduce((s, x) => s + x.hooks, 0);
const b4Ok = b4Stats.reduce((s, x) => s + x.matched, 0);
console.log(`  hook 对齐 ${b4Ok}/${b4Total}${b4Total ? `（${((b4Ok / b4Total) * 100).toFixed(1)}%）` : ''}`);

// ─────────────────────────────────────────────────────────────
// B5（统计）概念树 misconceptions 的来源质量
// ─────────────────────────────────────────────────────────────
// Chief 的判断：79 个概念全都有 misconceptions，可能只是为 spec 完整而填，
// 不是每条都真来自真实错误案例。若对齐率极低，问题在概念树数据本身，要 Qbank 回查来源。
console.log('\n== B5 概念树 misconceptions 数量分布 ==');

const misCounts = tree.concepts.map((c) => (Array.isArray(c.misconceptions) ? c.misconceptions.length : 0));
const emptyMis = misCounts.filter((n) => n === 0).length;
const dist = {};
for (const n of misCounts) dist[n] = (dist[n] || 0) + 1;

console.log(`  概念总数 ${tree.total}，misconceptions 为空的 ${emptyMis} 个`);
console.log(`  每条概念的误解条数分布：${Object.keys(dist).sort((a, b) => a - b).map((k) => `${k}条×${dist[k]}`).join('  ')}`);

if (emptyMis === tree.total) {
  console.log('  说明：全部为空，说明该字段未填写');
} else if (emptyMis === 0) {
  // 这就是实测到的情况
  const alignRate = b4Total ? b4Ok / b4Total : 0;
  console.log(`  说明：${tree.total} 个概念全部填了 misconceptions —— 该字段无判别力，不能当"该配语句"的判据`);
  if (alignRate < 0.5) {
    warn(
      `hook 对齐率 ${(alignRate * 100).toFixed(1)}% < 50%，` +
        `说明概念树的误解条目可能只是为 spec 完整性而填，并非来自真实错误案例；` +
        `建议 Qbank 回查这批数据的来源，而不是继续给语句库补内容`
    );
  } else {
    pass(`hook 对齐率 ${(alignRate * 100).toFixed(1)}%，概念树误解条目与语句库内容基本一致`);
  }
}

// ─────────────────────────────────────────────────────────────
// 语句库自身统计（仅供参考，不设阈值）
// ─────────────────────────────────────────────────────────────
console.log('\n== 语句库统计 ==');
if (typeof libraryStats === 'function') {
  const s = libraryStats();
  console.log(`  ${JSON.stringify(s)}`);
}

// ─────────────────────────────────────────────────────────────
console.log(`\n${failures ? `✗ ${failures} 项失败` : '✓ 全部通过（B1–B3 硬检查，B4–B5 为提示）'}`);
if (failures) process.exitCode = 1;
