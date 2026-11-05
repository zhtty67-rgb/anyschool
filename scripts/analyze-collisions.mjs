// 撞号归因：114 个同号不同题，有多少来自"重写沿用原编号"
//
// 判法：
//   · 若某个 id 的不同题干分别出现在「重写/rewrite 文件」和「正式题包（authoring-vN）」里 → 重写撞号
//   · 若只出现在多个 rewrite 文件之间 → 重写撞号
//   · 若出现在同一份题包的两个版本（v8/v9/v10）之间且题干不同 → 版本差异（更严重）
//   · 其余归为其他
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'data';
import { stemHash } from '../core/stem-hash.mjs';

const files = readdirSync(DIR).filter((f) => f.endsWith('.jsonl')).sort();
const byId = new Map();
for (const f of files) {
  let rows;
  try {
    rows = readFileSync(join(DIR, f), 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
  } catch { continue; }
  for (const q of rows) {
    if (!q.id) continue;
    if (!byId.has(q.id)) byId.set(q.id, []);
    byId.get(q.id).push({ file: f, hash: stemHash(q.stem) });
  }
}

const isRewrite = (f) => /rewrite|tagfix|guessable/i.test(f);
const isAuthoring = (f) => /^questions-authoring-v\d+/.test(f);

const buckets = { 重写撞号: [], 版本差异: [], 其他: [] };
for (const [id, list] of byId) {
  const hashes = new Set(list.map((x) => x.hash));
  if (hashes.size <= 1) continue;
  const fs_ = list.map((x) => x.file);
  const rew = fs_.some(isRewrite);
  const auth = fs_.filter(isAuthoring);
  if (rew) buckets.重写撞号.push(id);
  else if (auth.length >= 2) buckets.版本差异.push(id);
  else buckets.其他.push(id);
}

console.log(`扫描 ${files.length} 个文件\n`);
for (const [k, v] of Object.entries(buckets)) {
  console.log(`${k}: ${v.length} 个`);
}
console.log(`合计: ${Object.values(buckets).reduce((a, v) => a + v.length, 0)} 个`);

if (buckets.版本差异.length) {
  console.log('\n=== 版本差异样例（正式题包之间同号不同题，最该处理）===');
  buckets.版本差异.slice(0, 5).forEach((id) => {
    console.log(`\n  ${id}`);
    const seen = new Set();
    for (const x of byId.get(id)) {
      if (seen.has(x.hash)) continue;
      seen.add(x.hash);
      console.log(`    [${x.hash}] ${x.file}`);
    }
  });
}

// 重写文件自身的命名规范情况
console.log('\n=== 重写类文件清单 ===');
files.filter(isRewrite).forEach((f) => console.log(`  ${f}`));
