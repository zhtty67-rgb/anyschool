// 节点排除清单：哪些知识点不上线，以及为什么
//
// 来源（2026-11-05，Chief 判定）：
//   c1103 要摘出发布包，但不能靠改 published.json。
//   published.json 管的是「用哪一版题包」，这个清单管的是「这一版里哪些节点不放出去」。
//   两种性质不同的东西混在一个文件里，下次想切版本就说不清到底改了什么。
//
// 硬规矩（不是建议）：
//   每条排除必须有 node / reason / decided_by / decided_at / evidence 五项。
//   缺任何一项直接抛错，构建失败。理由是——无理由的排除比不排除更危险，
//   半年后没人记得 c1103 为什么不见，只记得「好像有人说不行」。
// 这个「空」，是真的没有，还是我没读到？分不清就必须报错。
// 文件不存在 / 读不动 / 读出来是空——三种情况必须分开，不许合并成一个空值。
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// 清单在项目根（data core/ 下。
// 这里挂过一次：写成了 dirname(本文件)，于是去 core/ 里找，找不到，
// 又因为「文件不存在 = 没有排除」这条静默规则被吞成了空清单，构建照常通过。
export const EXCLUDED_PATH = join(dirname(dirname(fileURLToPath(import.meta.url))), 'excluded-nodes.json');

const REQUIRED = ['node', 'reason', 'decided_by', 'decided_at', 'evidence'];

/** 把 "v9" / "v10" 变成可比较的数字；认不出就返回 null */
export function versionNum(v) {
  const m = /^v(\d+)$/i.exec(String(v || '').trim());
  return m ? Number(m[1]) : null;
}

/**
 * 读取并校验排除清单。
 *
 * 文件不存在时不再静默返回空：显式抛错并给出期望路径。
 * 理由——「清单缺失」和「清单为空」必须分开，否则清单一旦被挪走或被删，
 * 构建会照常通过，而且界面上看不出来，等于排除机制自己消失了。
 *
 * @param {string} [path]
 * @returns {{nodes:Set<string>, entries:Array, path:string}}
 */
export function loadExcluded(path = EXCLUDED_PATH) {
  if (!existsSync(path)) {
    throw new Error(
      `排除清单缺失：${path}\n` +
        `  如果确实不需要排除任何节点，请建一个 {"excluded": []} 的文件，不要靠删文件来表达「没有排除」。`,
    );
  }
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new Error(`排除清单不是合法 JSON：${path}\n  ${e.message}`);
  }
  const list = raw.excluded;
  if (!Array.isArray(list)) throw new Error(`排除清单缺少 excluded 数组：${path}`);

  const problems = [];
  const seen = new Set();
  for (const [i, e] of list.entries()) {
    for (const k of REQUIRED) {
      if (!e || typeof e[k] !== 'string' || !e[k].trim()) {
        problems.push(`第 ${i + 1} 条缺少 ${k}`);
      }
    }
    // effective_from 可省略（= 立即生效）；写了就必须是 vN 格式，写错等于这条永远不生效
    if (e && e.effective_from !== undefined && versionNum(e.effective_from) === null) {
      problems.push(`第 ${i + 1} 条 effective_from 格式不对："${e.effective_from}"（应形如 "v10"）`);
    }
    if (e && e.node) {
      if (seen.has(e.node)) problems.push(`第 ${i + 1} 条 ${e.node} 重复`);
      seen.add(e.node);
    }
  }
  if (problems.length) {
    throw new Error(`排除清单不完整，拒绝构建：\n  ${problems.join('\n  ')}\n  文件：${path}`);
  }
  return { all: list, entries: list, nodes: seen, path };
}

/**
 * 按当前构建版本挑出真正生效的排除项。
 *
 * 为什么需要这一步（2026-11-05，Chief 定的）：
 *   清单里记的是"这个节点将来不该上线"，但当前构建的版本可能根本没有那个节点。
 *   比如 c1103 要到 v10 才存在，而线上是 v9——这时报警"清单里有节点却没去掉题"
 *   是正确的警告，但天天报就成了噪音，人会开始无视它。
 *   所以每条可以标 effective_from（从哪一版起生效），不匹配当前版本的不报警。
 *
 * @param {{all:Array}} loaded loadExcluded 的返回值
 * @param {string} currentVersion 当前构建的版本号，形如 "v9"
 * @returns {{nodes:Set<string>, active:Array, pending:Array}}
 */
export function activeFor(loaded, currentVersion) {
  const cur = versionNum(currentVersion);
  const active = [];
  const pending = [];
  for (const e of loaded.all) {
    const from = e.effective_from === undefined ? null : versionNum(e.effective_from);
    // 没写 effective_from = 立即生效；当前版本号认不出时，宁可按生效算（保守）
    if (from === null || cur === null || cur >= from) active.push(e);
    else pending.push(e);
  }
  return { nodes: new Set(active.map((e) => e.node)), active, pending };
}

/**
 * 从题包里去掉落在排除节点上的题。
 * 一道题挂多个节点时，只要有一个节点被排除，整道题就去掉——
 * 因为它在界面上仍会出现在那个节点里，等于没摘干净。
 * @param {Array} questions
 * @param {Set<string>} nodes 被排除的节点号
 * @returns {{kept:Array, dropped:Array}}
 */
export function filterExcluded(questions, nodes) {
  if (!nodes || nodes.size === 0) return { kept: questions || [], dropped: [] };
  const kept = [];
  const dropped = [];
  for (const q of questions || []) {
    const hit = (q.nodes || []).filter((n) => nodes.has(n));
    if (hit.length) dropped.push({ id: q.id, nodes: hit });
    else kept.push(q);
  }
  return { kept, dropped };
}
