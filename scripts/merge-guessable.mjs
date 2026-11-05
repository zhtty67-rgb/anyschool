// 把 guessable_class 标注合并进题包（按 id + stem_hash 双重定位，防撞号）
//
// 用途：check-node-gate 需要题包里带 guessable_class 才能判。
// 现状：88 道标注在独立文件里，v10 题包没有这个字段 → 构建时 c1103 拦不住。
//
// 关键：不能用 id 单独定位——这轮已经证实 591 个题号里 114 个撞号。
// 所以按 (id + stem_hash) 匹配，对不上的单独报出来，不静默跳过。
//
// 用法：
//   node scripts/merge-guessable.mjs <题包> <标注文件> <输出>
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { stemHash } from '../core/stem-hash.mjs';
export { stemHash };

/**
 * @returns {{merged:number, unmatched:string[], hashMismatch:Array, out:Array}}
 */
export function mergeGuessable(pack, labels) {
  // 标注索引：(id + hash) -> 标注
  const idx = new Map();
  for (const l of labels) {
    if (!l.id || !l.guessable_class) continue;
    const h = l.stem_hash || stemHash(l.stem);
    idx.set(`${l.id}::${h}`, l);
  }

  const out = [];
  const unmatched = [];
  const hashMismatch = [];
  let merged = 0;

  for (const q of pack) {
    const h = stemHash(q.stem);
    const hit = idx.get(`${q.id}::${h}`);
    if (hit) {
      out.push({ ...q, guessable_class: hit.guessable_class, guessable_reason: hit.guessable_reason || '' });
      merged += 1;
      continue;
    }
    // 同 id 但 hash 不同 → 撞号或题干被改过，必须报出来
    const sameId = labels.find((l) => l.id === q.id);
    if (sameId) {
      hashMismatch.push({
        id: q.id,
        packHash: h,
        labelHash: sameId.stem_hash || stemHash(sameId.stem),
        packStem: String(q.stem).slice(0, 40),
        labelStem: String(sameId.stem || '').slice(0, 40),
      });
    } else {
      unmatched.push(q.id);
    }
    out.push(q);
  }
  return { merged, unmatched, hashMismatch, out };
}

// CLI
const invokedDirectly = process.argv[1] && /merge-guessable\.mjs$/.test(process.argv[1]);
if (invokedDirectly) {
  const [packPath, labelPath, outPath] = process.argv.slice(2);
  if (!packPath || !labelPath || !outPath) {
    console.error('用法: node scripts/merge-guessable.mjs <题包> <标注文件> <输出>');
    process.exit(2);
  }
  if (!existsSync(packPath) || !existsSync(labelPath)) {
    console.error('文件不存在');
    process.exit(2);
  }
  const pack = readFileSync(packPath, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
  const labels = readFileSync(labelPath, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
  const r = mergeGuessable(pack, labels);

  console.log(`题包 ${pack.length} 道，标注 ${labels.length} 条`);
  console.log(`按 (id + stem_hash) 匹配成功：${r.merged} 道`);
  console.log(`题包里没有对应标注：${r.unmatched.length} 道（未标注，节点门禁会跳过）`);
  if (r.hashMismatch.length) {
    console.log(`\n⚠️ 同 id 但题干不同（撞号或改过题干）：${r.hashMismatch.length} 处`);
    r.hashMismatch.forEach((x) => {
      console.log(`  ${x.id}  题包[${x.packHash}]「${x.packStem}」  vs  标注[${x.labelHash}]「${x.labelStem}」`);
    });
    console.log('  这些不会合并——请先确认是哪一版，别静默采用。');
  }
  writeFileSync(outPath, r.out.map((q) => JSON.stringify(q)).join('\n'), 'utf8');
  console.log(`\n已写出：${outPath}`);
  process.exit(r.hashMismatch.length ? 1 : 0);
}
