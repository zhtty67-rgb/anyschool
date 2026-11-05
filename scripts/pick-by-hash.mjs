// 跨文件取题校验：按 id 从源文件取题，并核对题干哈希
//
// 起因：c0901-01 在 m09-m11-v1（旧）与 c0901-rewrite-v1（重写）里同号不同题，
//       Qbank 打标注时取错源，整批判定作废。
// 用法（代码里）：
//   import { pickByHash } from './scripts/check-id-collision.mjs'
//   const q = pickByHash('D:\\...\\questions-ai-c0901-rewrite-v1.jsonl', 'c0901-01', '797505e5')
//   // 哈希对不上会抛错，不会静默返回另一个文件里的同名题
//
// 用法（命令行自检）：
//   node scripts/verify-pick.mjs <题包> <id> [期望stem_hash]
// 这个「空」，是真的没有，还是我没读到？分不清就必须报错。
// 文件不存在 / 读不动 / 读出来是空——三种情况必须分开，不许合并成一个空值。
import { readFileSync, existsSync } from 'node:fs';
export { stemHash } from '../core/stem-hash.mjs';

/**
 * 从指定文件按 id 取题，并核对题干哈希。
 * @throws 找不到题、或哈希不符
 */
export function pickByHash(path, id, expectHash) {
  if (!existsSync(path)) throw new Error(`文件不存在：${path}`);
  const lines = readFileSync(path, 'utf8').split(/\r?\n/).filter(Boolean);
  if (!lines.length) throw new Error(`文件是空的：${path}`);
  const hits = [];
  let parsed = 0;
  let firstBad = '';
  for (const l of lines) {
    let q;
    try { q = JSON.parse(l); } catch (e) { firstBad = firstBad || e.message.slice(0, 60); continue; }
    parsed += 1;
    if (q.id === id) hits.push(q);
  }
  // 全部行都解析失败时，"没有这道题"是假象——真实原因是文件读坏了。
  // 这两种情况的排查方向完全不同，必须分开报，否则会按"题号不对"去找半天。
  if (parsed === 0) {
    throw new Error(
      `${path} 一行都没解析出来（共 ${lines.length} 行），首个错误：${firstBad}\n` +
        `  这不是"没有 ${id}"，是这个文件读坏了。`,
    );
  }
  if (!hits.length) throw new Error(`${path} 里没有 ${id}（成功解析 ${parsed}/${lines.length} 行）`);
  if (hits.length > 1) throw new Error(`${path} 里 ${id} 出现 ${hits.length} 次，本身就重复`);
  const q = hits[0];
  const h = stemHash(q.stem);
  if (expectHash && h !== expectHash) {
    throw new Error(
      `题干哈希不符：${id} 在 ${path} 里是 [${h}]「${String(q.stem).slice(0, 40)}」，` +
      `期望 [${expectHash}]——很可能取错了文件`
    );
  }
  return { ...q, _file: path, _stem_hash: h };
}
