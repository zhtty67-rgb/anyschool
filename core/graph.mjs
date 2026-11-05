// FB-11 关系图 —— 从概念树导出可渲染的 DAG
//
// 三条规矩（来自施工图 FB-11）：
//   1. level 固定三层 MAP_LEVELS = ['domain','module','concept']，图里节点都是 concept
//   2. 布局用 Kahn 拓扑分层，**不做力导向**——力导向每次跑不一样，没法截图对账
//   3. mastery 字段必须由调用方传入（来自 masteryOfTree），本模块**不自算掌握度**
//      ——禁区 2：不许有两套真源
//
// 本模块不读文件、不 import mastery 的算法，只吃参数。

import { nodesWithQuestions } from './qbook.mjs';

/** 知识地图固定三层，不许变 */
export const MAP_LEVELS = ['domain', 'module', 'concept'];

/** 弱项高亮默认阈值（施工图明确的数值规格：<70% 琥珀高亮） */
export const WEAK_THRESHOLD = 0.7;

/**
 * 从概念树导出关系图。
 *
 * @param {{concepts: Array, modules: Array, total: number}} tree parseTree() 的返回
 * @param {Array} questions 题库（只用来判定谁有题，内容不被读取）
 * @param {Map<string, object>|null} masteryByCode code → mastery（来自 masteryOfTree）
 * @returns {{
 *   nodes: {code:string, name:string, level:'concept', module:string, mastery:object|null, hasQuestions:boolean}[],
 *   edges: {from:string, to:string, kind:'prereq', crossModule:boolean}[],
 *   stats: {nodes:number, edges:number, crossModuleEdges:number, components:number}
 * }}
 */
export function buildGraph(tree, questions, masteryByCode) {
  const concepts = tree?.concepts || [];
  const cover = nodesWithQuestions(questions);
  const byCode = new Map(concepts.map((c) => [c.code, c]));
  const mastery = masteryByCode instanceof Map ? masteryByCode : new Map();

  // ── 节点 ──
  const nodes = concepts.map((c) => ({
    code: c.code,
    name: c.name,
    level: 'concept',
    module: c.module ?? null,
    mastery: mastery.get(c.code) ?? null,
    hasQuestions: cover.has(c.code),
  }));

  // ── 边：只保留两端都存在的（悬空引用不静默丢弃，计数暴露出来） ──
  const edges = [];
  let dropped = 0;
  for (const c of concepts) {
    for (const p of c.prereq || []) {
      if (!byCode.has(p)) {
        dropped += 1;
        continue;
      }
      const fromMod = byCode.get(p).module ?? null;
      const toMod = c.module ?? null;
      edges.push({
        from: p,
        to: c.code,
        kind: 'prereq',
        crossModule: fromMod !== toMod,
      });
    }
  }

  const stats = {
    nodes: nodes.length,
    edges: edges.length,
    crossModuleEdges: edges.filter((e) => e.crossModule).length,
    components: countComponents(nodes, edges),
  };
  // 悬空引用计数单独暴露，不参与上面四个正式指标（施工图基线 dangling 恒为 0）
  stats.danglingDropped = dropped;

  return { nodes, edges, stats };
}

/**
 * Kahn 拓扑分层。
 *
 * 返回二维数组：第 0 层是所有无先修的节点，第 n 层是「所有先修都在第 <n 层」的节点。
 * **同一层内按 code 排序**，保证同样输入永远得到同样输出（可截图对账）。
 *
 * 有环时抛错（A-11-2）：环意味着先修关系自相矛盾，不能静默当作无环处理。
 *
 * @param {{nodes:Array, edges:Array}} graph
 * @returns {string[][]}
 */
export function topoLayers(graph) {
  const codes = graph.nodes.map((n) => n.code);
  const indeg = new Map(codes.map((c) => [c, 0]));
  const out = new Map(codes.map((c) => [c, []]));

  for (const e of graph.edges) {
    if (!indeg.has(e.to) || !out.has(e.from)) continue;
    indeg.set(e.to, indeg.get(e.to) + 1);
    out.get(e.from).push(e.to);
  }

  let frontier = codes.filter((c) => indeg.get(c) === 0).sort();
  const layers = [];
  let placed = 0;

  while (frontier.length) {
    layers.push([...frontier]);
    placed += frontier.length;
    const next = [];
    for (const c of frontier) {
      for (const to of out.get(c) || []) {
        const d = indeg.get(to) - 1;
        indeg.set(to, d);
        if (d === 0) next.push(to);
      }
    }
    frontier = [...new Set(next)].sort();
  }

  if (placed !== codes.length) {
    const stuck = codes.filter((c) => indeg.get(c) > 0).sort();
    throw new Error(`先修关系存在环（cycle），${stuck.length} 个节点无法拓扑排序：${stuck.slice(0, 5).join(', ')}`);
  }
  return layers;
}

/**
 * 弱项节点：分数低于阈值的。
 *
 * 阈值是参数，不是写死的常量——A-11-5 用改阈值必须改变结果来证明它真的生效。
 * score 为 null（样本不足，还没算出分）的一律不算弱项：没证据不等于弱。
 *
 * @param {Map<string, {score:number|null}>} masteryByCode
 * @param {number} [threshold] 默认 WEAK_THRESHOLD(0.7)
 * @returns {string[]} 按 code 排序的弱项 code 列表
 */
export function weakNodes(masteryByCode, threshold = WEAK_THRESHOLD) {
  const out = [];
  if (!(masteryByCode instanceof Map)) return out;
  for (const [code, m] of masteryByCode) {
    const s = m?.score;
    if (typeof s !== 'number' || !Number.isFinite(s)) continue;
    if (s < threshold) out.push(code);
  }
  return out.sort();
}

/** 弱连通分量数量（把有向边当无向看，用于判断图是不是一整块） */
function countComponents(nodes, edges) {
  const parent = new Map(nodes.map((n) => [n.code, n.code]));
  const find = (x) => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)));
      x = parent.get(x);
    }
    return x;
  };
  for (const e of edges) {
    const a = find(e.from);
    const b = find(e.to);
    if (a !== b) parent.set(a, b);
  }
  const roots = new Set(nodes.map((n) => find(n.code)));
  return roots.size;
}
