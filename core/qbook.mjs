// 题库读取层 —— 唯一的数据入口。
// 约定：插件只读，不写题；题目文件由 Qbank 产出。
// 通过环境变量 EDU_QBOOK_PATH 指向题库 JSONL，切换题源不改代码。

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

// 仓库根目录：本文件位于 <root>/core/qbook.mjs，向上一级即仓库根
const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(HERE, '..');

/** 题库产出目录：默认用仓库内 data/；设 ANYSCHOOL_DATA_DIR 可指向外部题库目录 */
export const QBOOK_DIR = process.env.ANYSCHOOL_DATA_DIR || join(ROOT, 'data');

/** 兜底路径：目录里连一个版本化题库都没有时才用（老题库，1311 题、0 挂载） */
export const FALLBACK_QBOOK = join(ROOT, 'data', 'questions-ai-foundations.jsonl');

/**
 * 找出目录里版本号最大的 questions-authoring-v*.jsonl。
 *
 * 【显式调用专用】不再作为默认路径——发布版由 published.json 决定。
 * 保留它是因为排查问题、预览新批时确实需要"看看最新的是哪份"。
 *
 * 版本号按「v 后面的数字」比较，不按文件名字典序（否则 v10 会排在 v9 前面）。
 * 只认 questions-authoring-v<数字>.jsonl 这一种形态，其它文件一律忽略。
 *
 * @param {string} [dir] 题库目录，默认 QBOOK_DIR
 * @returns {{path:string, version:number}|null} 找不到返回 null
 */
export function latestQbook(dir = QBOOK_DIR) {
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return null;
  }
  let best = null;
  for (const name of names) {
    const m = /^questions-authoring-v(\d+)\.jsonl$/i.exec(name);
    if (!m) continue;
    const version = Number(m[1]);
    if (!Number.isFinite(version)) continue;
    if (!best || version > best.version) best = { path: join(dir, name), version };
  }
  return best;
}

/** published.json 的位置：与 edu 目录同级 */
export const PUBLISHED_MANIFEST = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'published.json',
);

/**
 * 读发布版锁定文件。
 *
 * 这是唯一决定"线上用哪一版"的地方：显式改这个文件才切换发布版。
 * 文件名排序、目录里有没有更新的文件，都不影响它。
 *
 * @returns {{version:string, file:string, path:string, questions?:number}}
 */
export function readPublished(path = PUBLISHED_MANIFEST) {
  if (!existsSync(path)) {
    throw new Error(
      `缺少发布版锁定文件：${path}\n` +
        `  这个文件决定线上用哪一版题库，必须显式存在。\n` +
        `  可参照 edu/published.json 建一份，写明 version 与 path。`,
    );
  }
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new Error(`发布版锁定文件格式错误：${path}\n  ${e.message}`);
  }
  if (!raw || typeof raw.path !== 'string' || !raw.path) {
    throw new Error(`发布版锁定文件缺少 path 字段：${path}`);
  }
  return raw;
}

/**
 * 默认题库路径：由 published.json 决定。
 *
 * 【设计决定】默认路径不按文件名自动选版本。
 * 发布哪一版是产品决定，不能交给命名习惯——出现过 v9（做好待定）
 * 仅因名字排在 v8 后面就被自动选中的情况。现在只有显式改
 * published.json 才会切换发布版。
 *
 * @returns {string} 发布版题库的路径（相对路径按仓库根解析）
 */
export function defaultQbook() {
  const p = readPublished().path;
  // path 可写成相对仓库根的路径（如 "data/questions-authoring-v11.jsonl"），也可写绝对路径
  return isAbsolute(p) ? p : join(ROOT, p);
}

/** 许可白名单：只有这些来源可以进公开包 */
export const PUBLIC_LICENSE_ALLOW = new Set(['MIT', 'Apache-2.0', 'CC-BY-4.0', 'CC0-1.0']);

/** 来源判定：按 id 前缀与 tags 识别，规则集中在这里，加题源只改这张表 */
export function sourceOf(q) {
  const id = String(q?.id || '');
  const tags = Array.isArray(q?.tags) ? q.tags : [];
  if (id.startsWith('mmlu-') || tags.includes('MMLU')) {
    return { key: 'mmlu', license: 'MIT', publicOk: true, label: 'MMLU（MIT）' };
  }
  if (id.startsWith('ait-')) {
    // xxiao1127/AI_trainer- 派生，作者禁止商用，著作权归属存疑
    return { key: 'ai-trainer', license: 'proprietary', publicOk: false, label: 'AI训练师（不可对外）' };
  }
  return { key: 'unknown', license: 'unknown', publicOk: false, label: '来源未知' };
}

/** 是否为 AI 学科题（electrical_engineering 虽属 MMLU 但是电子工程，不算） */
export function isAiSubject(q) {
  const tags = Array.isArray(q?.tags) ? q.tags : [];
  const subjects = tags.filter((t) => t !== 'MMLU' && t !== '英文');
  if (subjects.length === 0) return false;
  return !subjects.includes('电子工程');
}

/**
 * 读题库。
 *
 * 路径优先级：显式参数 > 环境变量 EDU_QBOOK_PATH > published.json 里写的发布版
 * 不传参、不设环境变量时，加载的就是 published.json 指定的那一份。
 */
export function loadQuestions(path = process.env.EDU_QBOOK_PATH || defaultQbook()) {
  if (!existsSync(path)) {
    let published = null;
    try { published = readPublished(); } catch { /* 锁定文件本身有问题时下面照样报 */ }
    throw new Error(
      `题库文件不存在：${path}\n` +
        `  · 发布版锁定文件：${PUBLISHED_MANIFEST}\n` +
        `  · 其中指定的版本：${published ? `${published.version} → ${published.path}` : '（读不到）'}\n` +
        `  · 可显式传路径、设 EDU_QBOOK_PATH，或修正 published.json 里的 path`,
    );
  }
  const lines = readFileSync(path, 'utf8').split(/\r?\n/).filter((l) => l.trim());
  const questions = [];
  const errors = [];
  lines.forEach((line, i) => {
    try {
      questions.push(JSON.parse(line));
    } catch (e) {
      errors.push({ line: i + 1, message: e.message });
    }
  });
  return { path, questions, errors, total: questions.length };
}

/** 按包过滤。pack='public' 只留许可白名单；pack='local' 全留 */
export function selectPack(questions, pack = 'public') {
  if (pack === 'local') return questions.map((q) => ({ ...q, _source: sourceOf(q) }));
  return questions
    .map((q) => ({ ...q, _source: sourceOf(q) }))
    .filter((q) => q._source.publicOk && PUBLIC_LICENSE_ALLOW.has(q._source.license));
}

/** 按概念节点取题。nodes 为空时返回空数组（挂载未完成即如此） */
export function questionsForNode(questions, nodeCode) {
  return questions.filter((q) => Array.isArray(q.nodes) && q.nodes.includes(nodeCode));
}

/**
 * 题池里出现过的所有概念节点 code。
 *
 * 纯函数：不读文件、不碰全局，只吃传入的 questions 数组。
 *
 * 两个用途：
 *   1. 诊断/回溯时判定某个先修概念"有没有题可做"——没题的只提示，不派题，
 *      避免把学习者导到没有题的空概念上。
 *   2. 覆盖率监控：与知识树的 total 一比，就是实时的概念覆盖数字。
 *
 * 容错：nodes 缺失、非数组、含空串或非字符串元素，均跳过，不抛错。
 *
 * @param {Array<{nodes?: string[]}>} questions
 * @returns {Set<string>} 出现在题池里的 nodeCode 集合（去重，顺序不保证）
 */
export function nodesWithQuestions(questions) {
  const codes = new Set();
  if (!Array.isArray(questions)) return codes;
  for (const q of questions) {
    const nodes = q?.nodes;
    if (!Array.isArray(nodes)) continue;
    for (const code of nodes) {
      if (typeof code === 'string' && code.trim()) codes.add(code);
    }
  }
  return codes;
}

/** 组卷：从节点取题，按难度分层抽样，避免全出最难的 */
export function drawQuestions(questions, nodeCode, count = 5, seed = 1) {
  const pool = questionsForNode(questions, nodeCode);
  if (pool.length <= count) return pool;
  const ranked = [...pool].sort((a, b) => (a.difficulty ?? 3) - (b.difficulty ?? 3));
  const step = ranked.length / count;
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const idx = Math.min(ranked.length - 1, Math.floor(i * step + (seed % 3)));
    out.push(ranked[idx]);
  }
  return out;
}
