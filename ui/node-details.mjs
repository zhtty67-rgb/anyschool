// 节点详情数据 —— 原定义（机器校验用）+ 扩写定义（界面显示用）
//
// 来源：concepts-ai.yaml 的 def/misconceptions（原定义）
//       node-defs-expanded-v1.json 的 def_expanded（扩写版，试点 3 个）
//
// 原则：
//   - 扩写版只用于界面显示，不替代原定义
//   - 两套说法不能冲突；原定义保留在 brief.original 里可对照
// 这个「空」，是真的没有，还是我没读到？分不清就必须报错。
// 文件不存在 / 读不动 / 读出来是空——三种情况必须分开，不许合并成一个空值。
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTree } from '../core/tree.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.ANYSCHOOL_DATA_DIR || join(HERE, '..', 'data');

const EXPANDED_PATH = join(DATA_DIR, 'node-defs-expanded-v1.json');
// v2：Qbank 2026-11-05 产出，32 个节点（v9 的 27 + m06/m07 待合并的 5），字段 asks 是「这个节点在考什么」
// 一句话钩子，比 15~34 字的原始定义更能让人看懂，替代不了 def（def 保留给机器校验）
const DETAILS_V2_PATH = join(DATA_DIR, 'node-details-v2.json');
const DEFAULT_TREE = join(DATA_DIR, 'concepts-ai.yaml');

/** 读 node-details-v2：{ code: {asks, def, misconceptions, module_name, question_count} } */
export function loadDetailsV2(path = DETAILS_V2_PATH) {
  // 文件不存在 = 这一次确实没有这份数据，可以退化成空表（界面少显示，不会错）。
  if (!existsSync(path)) {
    console.warn(`  ⚠ 节点详情文件不存在，界面将不显示 asks：${path}`);
    return {};
  }
  // 但文件存在却读不动 / 解析失败，是错误，不能装成"没有数据"。
  // 这一处原来 catch 后返回 {}，等于"JSON 坏了"和"没这个文件"长得一模一样，
  // 结果是 32 个节点的详情全空，界面上看不出来，日志里也不留痕。
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new Error(`节点详情文件存在但读不出来：${path}\n  ${e.message}\n  这不是"没有数据"，是数据坏了。`);
  }
  const list = Array.isArray(raw) ? raw : (raw.nodes || Object.values(raw).filter((v) => v && v.code));
  const out = {};
  for (const v of list) {
    if (!v || !v.code) continue;
    out[v.code] = {
      asks: typeof v.asks === 'string' ? v.asks.trim() : '',
      def: v.def || '',
      misconceptions: Array.isArray(v.misconceptions) ? v.misconceptions : [],
      moduleName: v.module_name || '',
    };
  }
  if (Object.keys(out).length === 0) {
    throw new Error(`节点详情文件解析后是空的：${path}\n  文件存在、能解析，但一个节点都没读出来——先查格式，别当成"没有详情"。`);
  }
  return out;
}

/** 读扩写定义；文件不在就返回空表（扩写本来就是可选的） */
export function loadExpanded(path = EXPANDED_PATH) {
  if (!existsSync(path)) return {};
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new Error(`扩写定义文件存在但读不出来：${path}\n  ${e.message}`);
  }
  const nodes = raw.nodes || {};
  const out = {};
  for (const [code, v] of Object.entries(nodes)) {
    if (!v || !v.def_expanded) continue;
    const parts = String(v.def_expanded).split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
    out[code] = {
      name: v.name,
      original: v.def_original || '',
      // 主文（是什么 + 为什么需要），默认显示
      main: parts[0] || '',
      // 例子，默认折叠
      example: parts.slice(1).join('\n\n'),
    };
  }
  return out;
}

/**
 * 组装某个节点的详情：优先扩写版，没有就退回原定义。
 * @returns {{hasExpanded:boolean, main:string, example:string, original:string, misconceptions:string[]}}
 */
export function briefFor(conceptCode, tree = parseTree()) {
  const c = tree.concepts.find((x) => x.code === conceptCode);
  if (!c) return null;
  const expanded = loadExpanded()[conceptCode];
  const v2 = loadDetailsV2()[conceptCode];
  return {
    hasExpanded: !!expanded,
    main: expanded?.main || c.def || '',
    example: expanded?.example || '',
    original: c.def || '',
    misconceptions: Array.isArray(c.misconceptions) ? c.misconceptions : [],
    // 「这个节点在考什么」——具体情境而非“XX 是什么”，没有就用空串
    asks: v2?.asks || '',
  };
}
