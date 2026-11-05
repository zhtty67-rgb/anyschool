// AI 同学 —— 选句逻辑
//
// 硬约束（Chief 定的六条，这里逐条对应实现方式）：
//   1. 三种立场           → POSITIONS 枚举，每条语句必属其一
//   2. 不评价学习者       → 本模块不接收、也不生产任何针对学习者的评语
//   3. 不给正确答案       → 语句库只有"想法"，没有答案；本模块不读 answer/explanation
//   4. 不写学习事件       → 本模块没有写入口，不 import 任何存储
//   5. 不参与判分         → 不 import grade.mjs / mastery.mjs
//
// 这个文件故意只依赖 lines.mjs 和 tree.mjs（只读概念名/误解），
// 结构上就拿不到 correct、records、answer。

import { linesFor, POSITIONS } from './lines.mjs';

export { POSITIONS };

/** AI 同学的角色名 */
export const PEER_NAME = '同学';

/**
 * 选一句 AI 同学说的话。
 *
 * @param {object} concept  概念节点 { code, name, misconceptions }
 * @param {object} opts
 *   - prefer: 想优先要哪种立场（misconception|ask|example），不给就按轮转
 *   - seed:   同一轮里要稳定复现，传个整数
 *   - exclude: 已经说过的 quote 数组，避免重复
 * @returns {{position:string, quote:string, conceptCode:string, conceptName:string}|null}
 */
export function pick(concept, opts = {}) {
  const pool = linesFor(concept?.code);
  if (!pool.length) return null;

  const exclude = new Set(opts.exclude || []);
  let candidates = pool.filter((l) => !exclude.has(l.quote));
  // 全说过了就重新来过，不卡死
  if (!candidates.length) candidates = pool;

  if (opts.prefer && POSITIONS.includes(opts.prefer)) {
    const preferred = candidates.filter((l) => l.position === opts.prefer);
    if (preferred.length) candidates = preferred;
  }

  const idx = opts.seed == null ? 0 : Math.abs(Math.floor(opts.seed)) % candidates.length;
  const line = candidates[idx];

  return {
    position: line.position,
    quote: line.quote,
    conceptCode: concept.code,
    conceptName: concept.name,
    peerName: PEER_NAME,
  };
}

/**
 * 按轮转给出一串发言，用于一次讲解里 AI 同学插几句话。
 * 顺序：先抛一个误解 → 再真诚发问 → 最后举个例子。
 *
 * @param {object} concept
 * @param {number} count 想要几句（1-3）
 */
export function scriptFor(concept, count = 2) {
  const order = ['misconception', 'ask', 'example'];
  const out = [];
  const used = [];
  const n = Math.max(1, Math.min(3, count));
  for (let i = 0; i < n; i += 1) {
    const line = pick(concept, { prefer: order[i % order.length], exclude: used });
    if (!line) break;
    used.push(line.quote);
    out.push(line);
  }
  return out;
}

/** 该概念有没有 AI 同学的话可说 */
export function hasLines(conceptCode) {
  return linesFor(conceptCode).length > 0;
}

/**
 * 立场的中文说法，用于界面上标注这句话是什么性质。
 * 注意：标签说的是"这是哪种想法"，不是"对不对"。
 */
export const POSITION_LABEL = {
  misconception: '抛出一个想法',
  ask: '真诚发问',
  example: '举个例子',
};
