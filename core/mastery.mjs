// 掌握度算法 —— 按概念节点（concepts-ai.yaml 的 code，如 c0101）计算。
//
// 三条硬规则（都是为了不误导读图）：
//   1. 样本不足不判定：该节点有效作答 < MIN_SAMPLES，一律返回 unknown，不给百分比。
//   2. 近期加权：越近的作答权重越高；只取最近 WINDOW 次，避免早期错误永远拖死。
//   3. 高失分概念单独标红：错在多选题漏选、与常见误解列表命中，都记入 weakFlags。
//
// 输入 records：
//   { questionId, nodeCode, correct, at (ISO 时间), weight? }
// 注意：一道题可挂多个节点，每个节点各自记一条。

export const MIN_SAMPLES = 3;      // 少于 3 次作答不给掌握度
export const WINDOW = 5;           // 只看最近 5 次
export const DECAY = 0.78;         // 第 n 近的作答权重 = DECAY^(n-1)
export const MASTERED = 0.8;       // >= 80% 判定已掌握
export const WEAK = 0.5;           // < 50% 判定薄弱

/**
 * 投影版本号（FB-02 / ARCHITECTURE §9）。
 * 改算法或默认参数时**必须**改这个号，旧记录凭它区分「哪套口径算的」，
 * 这是做双跑对比（A2 验收）的数据基础。
 */
export const PROJECTION_VERSION = 'mastery/1.0.0';

/** 排除理由的文案：每条 excluded 必须能说清"为什么没算进去"（铁律 4 知情权） */
const EXCLUDE_REASON = {
  unanswerable: '该题标记为「答不了」（选项无法判断对错），作答不计入掌握度',
  missing_correct: '记录缺少 correct 字段，无法判定对错，未计入',
};

/**
 * @param {Array} records 该节点的作答记录（顺序不限）
 * @param {object} [opts]
 * @returns {{state:'unknown'|'mastered'|'learning'|'weak', score:number|null, samples:number, recent:number, trend:'up'|'down'|'flat'|null}}
 */
export function masteryOfNode(records, opts = {}) {
  const minSamples = opts.minSamples ?? MIN_SAMPLES;
  const window = opts.window ?? WINDOW;
  const decay = opts.decay ?? DECAY;

  // 参数快照：记录**本次计算实际用的**参数，不是模块当前的常量。
  // 改完 DECAY 之后，旧记录仍显示旧参数，否则历史无法解释（A-02-4）。
  const formula = `decay=${decay};window=${window};minSamples=${minSamples};mastered=${MASTERED};weak=${WEAK}`;
  const asOf = opts.asOf ?? new Date().toISOString();

  // 排除"答不了"的题：四个选项外行读完不知道在比什么，只能随机选。
  // 这种作答即使蒙对了，也不代表学会了；计入统计会把不会的人抬成"已掌握"，
  // 让整个掌握度失效。宁可少算一条，不能算错一条。
  //
  // 但排除**不能静默**：每条被排除的都要进 basis.excluded 并写明理由，
  // 否则用户看不到"我做过但没算进去"的题，违反铁律 4（知情权）。
  const valid = [];
  const excluded = [];
  for (const r of records || []) {
    if (!r) continue;
    if (typeof r.correct !== 'boolean') {
      excluded.push({ id: String(r.questionId ?? '(无 id)'), why: EXCLUDE_REASON.missing_correct });
      continue;
    }
    if (r.qkind === 'unanswerable') {
      excluded.push({ id: String(r.questionId ?? '(无 id)'), why: EXCLUDE_REASON.unanswerable });
      continue;
    }
    valid.push(r);
  }

  // 按时间升序：attempts 对外承诺是「按时间升序」（A-02-1/2）
  const sortedAll = [...valid].sort((a, b) => ts(a.at) - ts(b.at));
  const basis = {
    attempts: sortedAll.map((r) => String(r.questionId)),
    excluded,
    formula,
    projectionVersion: PROJECTION_VERSION,
    asOf,
  };

  if (valid.length === 0) {
    return { state: 'unknown', score: null, samples: 0, recent: 0, trend: null, basis };
  }

  const sorted = sortedAll;
  const recent = sorted.slice(-window);

  let wSum = 0;
  let wHit = 0;
  recent.forEach((r, i) => {
    const distFromNow = recent.length - 1 - i; // 0 = 最近一次
    const w = Math.pow(decay, distFromNow) * (r.weight ?? 1);
    wSum += w;
    if (r.correct) wHit += w;
  });

  const score = wSum > 0 ? wHit / wSum : 0;

  if (valid.length < minSamples) {
    return {
      state: 'unknown',
      score: null,
      samples: valid.length,
      recent: recent.length,
      trend: null,
      provisional: Number(score.toFixed(4)), // 仅供内部参考，UI 不显示
      basis,
    };
  }

  const state = score >= MASTERED ? 'mastered' : score < WEAK ? 'weak' : 'learning';
  return {
    state,
    score: Number(score.toFixed(4)),
    samples: valid.length,
    recent: recent.length,
    trend: trendOf(sorted),
    basis,
  };
}

/** 趋势：最近一半 vs 早一半的正确率差；样本不足 4 次不给趋势 */
export function trendOf(sortedRecords) {
  const n = sortedRecords.length;
  if (n < 4) return null;
  const mid = Math.floor(n / 2);
  const early = sortedRecords.slice(0, mid);
  const late = sortedRecords.slice(mid);
  const rate = (arr) => arr.filter((r) => r.correct).length / arr.length;
  const d = rate(late) - rate(early);
  if (d > 0.15) return 'up';
  if (d < -0.15) return 'down';
  return 'flat';
}

/**
 * 整棵树汇总。
 *
 * 分母口径（FB-09 修正）：`total` 与 `coverage` 的分母是「**有题节点数**」，
 * 不是整棵树节点数。原因：33 个空节点混进分母，加一个空节点全校掌握度就掉一档，
 * 而学习者实际什么都没变。
 *
 * 三种数只有两个错，`mean` 本来就是对的不许动：
 *   total    分母 nodes.length        → 错，改 opts.nodeCodesWithQuestions.size
 *   coverage 分母 nodes.length        → 错，同上
 *   mean     分母 scored.length       → 对，保持原样
 *
 * @param {Array<{code:string, name:string, module?:string, prereq?:string[]}>} concepts
 * @param {Array} records 全部作答记录
 * @param {object} [opts]
 *   - nodeCodesWithQuestions?: Set<string>|null  有题节点集合；为 null/未传时退化为全树分母
 *   - minSamples / window / decay                透传给 masteryOfNode
 */
export function masteryOfTree(concepts, records, opts = {}) {
  const byNode = new Map();
  for (const r of records || []) {
    if (!r?.nodeCode) continue;
    if (!byNode.has(r.nodeCode)) byNode.set(r.nodeCode, []);
    byNode.get(r.nodeCode).push(r);
  }

  const nodes = concepts.map((c) => ({
    ...c,
    mastery: masteryOfNode(byNode.get(c.code) || [], opts),
  }));

  const counts = { unknown: 0, weak: 0, learning: 0, mastered: 0 };
  for (const n of nodes) counts[n.mastery.state] += 1;

  const scored = nodes.filter((n) => n.mastery.score != null);
  const mean = scored.length
    ? scored.reduce((s, n) => s + n.mastery.score, 0) / scored.length
    : null;

  // ── 分母：有题节点数（方案 A 静态口径） ──
  const withQ = opts.nodeCodesWithQuestions;
  const hasDenominator = withQ instanceof Set;
  const denominator = hasDenominator ? withQ.size : nodes.length;

  // 分子：有题且已算出状态的节点数。没传集合时退化为原来的 (总数 - unknown)
  let answered;
  if (hasDenominator) {
    answered = nodes.filter((n) => withQ.has(n.code) && n.mastery.state !== 'unknown').length;
  } else {
    answered = nodes.length - counts.unknown;
  }

  const coverage = denominator > 0 ? answered / denominator : 0;

  return {
    nodes,
    summary: {
      total: denominator,
      ...counts,
      mean: mean == null ? null : Number(mean.toFixed(4)),
      coverage: Number(coverage.toFixed(4)),
    },
    nextUp: pickNext(nodes),
  };
}

/**
 * 推荐下一个该学的节点：先修已满足、且状态最差（weak > learning > unknown）的。
 * 先修未掌握的节点不推荐，避免跳级。
 */
export function pickNext(nodes) {
  const stateRank = { weak: 0, learning: 1, unknown: 2, mastered: 3 };
  const byCode = new Map(nodes.map((n) => [n.code, n]));

  const eligible = nodes.filter((n) => {
    if (n.mastery.state === 'mastered') return false;
    return (n.prereq || []).every((p) => {
      const dep = byCode.get(p);
      return !dep || dep.mastery.state === 'mastered' || dep.mastery.state === 'unknown';
    });
  });

  if (eligible.length === 0) return null;

  eligible.sort((a, b) => {
    const r = stateRank[a.mastery.state] - stateRank[b.mastery.state];
    if (r !== 0) return r;
    // 同状态：优先样本多的（更可信），再按编号稳定排序
    const s = b.mastery.samples - a.mastery.samples;
    if (s !== 0) return s;
    return String(a.code).localeCompare(String(b.code));
  });

  const top = eligible[0];
  return { code: top.code, name: top.name, state: top.mastery.state, reason: reasonFor(top) };
}

function reasonFor(node) {
  const s = node.mastery.state;
  if (s === 'weak') return `近 ${node.mastery.recent} 次作答正确率 ${Math.round(node.mastery.score * 100)}%，明显薄弱`;
  if (s === 'learning') return `已有 ${node.mastery.samples} 次作答，正确率 ${Math.round(node.mastery.score * 100)}%，还没稳住`;
  // 「先建立基线」是黑话，新用户看不懂。改成说明具体要做什么。
  // 注意：这句文案在 ui/render.mjs 里还有一份运行时实现，两处必须同步改，
  // 否则构建出来的快照和运行时重绘会显示不同的话。
  return '还没做过，先做几道看看你哪块薄弱';
}

function ts(at) {
  if (!at) return 0;
  const n = Date.parse(at);
  return Number.isFinite(n) ? n : 0;
}

/**
 * 生成浏览器端要用的纯函数源码（供 ui/render.mjs 内联进页面）。
 *
 * 为什么要有这个导出（2026-11-05，v12 阶段 1）：
 *   原来 ui/render.mjs 里手抄了一份 masteryOfNode / reasonFor / pickNext，
 *   注释写着"两处必须同步改"。这条约定已经失效两次：
 *     · reasonFor 文案改过一次，两边不同步
 *     · 分母口径改过一次，客户端仍用 all.length（整棵树 79）
 *   而且客户端常量叫 MIN_SHOWN，真源叫 MIN_SAMPLES —— 值一样、名字不一样，
 *   说明当初就是手抄的，不是导出。这种副本最危险：看着"一致"，随时再分叉。
 *
 * 所以改成：**源码只在这里写一次，客户端跑的是这里拼出来的字符串。**
 * 参数字面量也来自本文件的常量，改 DECAY 时客户端会跟着变——
 * 这一条是可验证的：改 core/mastery.mjs 的 DECAY 重建，产物里的数字必须跟着变。
 *
 * 注意：这里拼的是纯函数（不碰 DOM、不碰 IO），浏览器里能直接跑。
 * 任何带 Node API 的函数都**不要**放进来。
 */
export function clientSource() {
  // 用函数本身转字符串，保证逻辑只有一份。
  // 这些函数内部只用到 Math / Date / String / 数组方法，浏览器都有。
  const fns = [ts, masteryOfNode, trendOf, reasonFor, pickNext].map((f) => f.toString()).join('\n');
  // 常量也要一起带：真源的 masteryOfNode 里用到 PROJECTION_VERSION 和 EXCLUDE_REASON，
  // 只拼函数会出现 "PROJECTION_VERSION is not defined"（第一版就栽在这）。
  // 这里用 JSON.stringify 序列化，值跟着真源走，不手抄。
  return [
    '/* 由 core/mastery.mjs 的 clientSource() 生成，不要手改。改真源后重建即可。 */',
    `var MIN_SAMPLES=${MIN_SAMPLES}, WINDOW=${WINDOW}, DECAY=${DECAY}, MASTERED=${MASTERED}, WEAK=${WEAK};`,
    `var PROJECTION_VERSION=${JSON.stringify(PROJECTION_VERSION)};`,
    `var EXCLUDE_REASON=${JSON.stringify(EXCLUDE_REASON)};`,
    fns,
    // 客户端只需要"按节点重算 + 汇总"，不需要 masteryOfTree 里的覆盖率那一套（那由构建时算）
    `function masteryOfTreeClient(nodes, records, nodeCodesWithQuestions){
  var byNode={};
  (records||[]).forEach(function(r){ if(r&&r.node){ (byNode[r.node]=byNode[r.node]||[]).push(r); } });
  nodes.forEach(function(n){ n.mastery = masteryOfNode(byNode[n.code]||[]); });
  var counts={unknown:0,weak:0,learning:0,mastered:0};
  nodes.forEach(function(n){ counts[n.mastery.state]++; });
  var withQ = (nodeCodesWithQuestions instanceof Set) ? nodeCodesWithQuestions : null;
  var denominator = withQ ? withQ.size : nodes.length;
  var answered;
  if (withQ) {
    answered = nodes.filter(function(n){ return withQ.has(n.code) && n.mastery.state!=='unknown'; }).length;
  } else {
    answered = nodes.length - counts.unknown;
  }
  var scored = nodes.filter(function(n){ return n.mastery.score!=null; });
  var mean = scored.length ? scored.reduce(function(s,n){ return s+n.mastery.score; },0)/scored.length : null;
  return {
    summary: {
      total: denominator,
      unknown: counts.unknown, weak: counts.weak, learning: counts.learning, mastered: counts.mastered,
      mean: mean==null ? null : Number(mean.toFixed(4)),
      coverage: denominator>0 ? Number((answered/denominator).toFixed(4)) : 0
    },
    nextUp: pickNext(nodes)
  };
}`,
  ].join('\n');
}
