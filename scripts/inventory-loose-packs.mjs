// 清点散装 c* 题包：按内容哈希判断哪些是中间版、哪些比 v10 新
//
// 为什么不用文件名判版本（2026-11-05）：
//   这一轮已经反复栽在"名字会骗人"上——
//   c1101-sample-one-v1..v9 里只有 v9 算数，
//   c0103-01-fix-v1..v6 里只有 v6 算数，
//   而 c0102-rewrite-v1 和 c0102-new-v1 谁覆盖谁，光看名字看不出来。
//   所以这里不看名字，看两件事：
//     ① md5(题干原文)  —— 同一个题干只留一条，谁的内容新看 mtime
//     ② 题号            —— 跟 v10 比对，判断是"v10 已有"还是"v10 没有的新题"
//
// 输出三张表：
//   A. 每个散装文件里，有多少题的题干跟 v10 完全相同 / 不同 / v10 里没有
//   B. 同一题号在不同文件里出现、且内容不同的（真冲突，需要人判断）
//   C. 只出现在散装包里、v10 没有的题（合并候选）
//
// 用法：node scripts/inventory-loose-packs.mjs [--json]
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, basename } from 'node:path';

const OUT_DIR = 'data\\';
const V10 = join(OUT_DIR, 'questions-authoring-v10.jsonl');

const stemOf = (q) => String(q.stem ?? q.question ?? q.prompt ?? '');
const md5 = (s) => createHash('md5').update(s, 'utf8').digest('hex');
const stemKey = (q) => md5(stemOf(q).replace(/\s+/g, ''));

function loadRows(path) {
  return readFileSync(path, 'utf8')
    .split(/\r?\n/).filter((l) => l.trim())
    .map((l, i) => {
      try { return JSON.parse(l); } catch (e) {
        throw new Error(`${path} 第 ${i + 1} 行解析失败：${e.message}\n  不能跳过坏行——跳过后的统计就是假的。`);
      }
    });
}

const v10 = loadRows(V10);
const v10ByStem = new Map();
const v10ById = new Map();
for (const q of v10) {
  v10ByStem.set(stemKey(q), q);
  if (q.id) v10ById.set(q.id, q);
}

const looseFiles = readdirSync(OUT_DIR)
  .filter((f) => /^questions-.*\.jsonl$/.test(f))
  .filter((f) => !/^questions-authoring-v\d+\.jsonl$/.test(f))
  .sort();

const perFile = [];
const byStem = new Map();   // stemKey -> [{file, id, q, mtime}]
let totalRows = 0;

for (const f of looseFiles) {
  const p = join(OUT_DIR, f);
  const mtime = statSync(p).mtime.toISOString();
  let rows;
  try { rows = loadRows(p); } catch (e) { perFile.push({ file: f, error: e.message }); continue; }
  totalRows += rows.length;

  let sameAsV10 = 0, diffFromV10 = 0, notInV10 = 0;
  for (const q of rows) {
    const k = stemKey(q);
    if (v10ByStem.has(k)) sameAsV10++;
    else if (q.id && v10ById.has(q.id)) diffFromV10++;
    else notInV10++;
    if (!byStem.has(k)) byStem.set(k, []);
    byStem.get(k).push({ file: f, id: q.id, mtime });
  }
  perFile.push({ file: f, rows: rows.length, sameAsV10, diffFromV10, notInV10, mtime });
}

// B. 真冲突：同一题号，在不同文件里题干内容不同
const byId = new Map();
for (const [k, list] of byStem) {
  for (const { file, id } of list) {
    if (!id) continue;
    if (!byId.has(id)) byId.set(id, new Map());
    byId.get(id).set(k, (byId.get(id).get(k) || 0) + 1);
  }
}
const conflicts = [];
for (const [id, stemSet] of byId) {
  if (stemSet.size > 1) {
    conflicts.push({ id, versions: stemSet.size, files: [...byStem].filter(([, l]) => l.some((x) => x.id === id)).map(([, l]) => l.filter((x) => x.id === id).map((x) => x.file)).flat() });
  }
}

// C. 只在散装包里、v10 没有的题
const newCandidates = [];
for (const [k, list] of byStem) {
  if (v10ByStem.has(k)) continue;
  const id = list[0].id;
  if (id && v10ById.has(id)) continue;   // 同题号 v10 有，只是内容被改过，归到 B/改版
  newCandidates.push({ id, files: list.map((x) => x.file) });
}

const out = {
  v10: { path: V10, rows: v10.length },
  loose: { files: looseFiles.length, rows: totalRows },
  perFile,
  conflicts,
  newCandidates,
};

const asJson = process.argv.includes('--json');
if (asJson) {
  console.log(JSON.stringify(out, null, 2));
} else {
  console.log('v10：' + v10.length + ' 道');
  console.log('散装包：' + looseFiles.length + ' 个文件，' + totalRows + ' 行');
  console.log('');
  console.log('=== A. 每个文件跟 v10 的关系 ===');
  for (const r of perFile) {
    if (r.error) { console.log('  ' + r.file + '  读不了：' + r.error); continue; }
    console.log('  ' + r.file.padEnd(46) + String(r.rows).padStart(3) + ' 道  与v10同:' + String(r.sameAsV10).padStart(3)
      + '  同题号改过:' + String(r.diffFromV10).padStart(3) + '  v10没有:' + String(r.notInV10).padStart(3));
  }
  console.log('');
  console.log('=== B. 同一题号、内容有多个版本（需人判断哪个最终） ===');
  if (!conflicts.length) console.log('  无');
  for (const c of conflicts) console.log('  ' + c.id + '  有 ' + c.versions + ' 个不同版本');
  console.log('');
  console.log('=== C. 只在散装包、v10 没有的题（合并候选） ===');
  console.log('  共 ' + newCandidates.length + ' 道');
  for (const c of newCandidates) console.log('  ' + (c.id || '(无题号)').padEnd(24) + c.files.join(', '));
}
