// 同一题号在 v10 和散装包之间内容不同时，差在哪些字段
//
// 为什么需要这一步（2026-11-05，小白提醒）：
//   合并时按 mtime 取"最新版"是错的——这一轮出现过"新版反而改坏"：
//   为了躲字数泄露，把答案项削掉三个字，反而更差。
//   文件时间只说明"改过"，不说明"改好了"。
//
//   能自动判的只有一件事：差在哪几个字段。
//   差元数据（tags/nodes/qkind）→ 风险低，可以按最新覆盖
//   差内容（stem/options/answer/explanation）→ 必须人看
//
// 用法：node scripts/diff-version-fields.mjs [--json]
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const OUT_DIR = 'data\\';
const V10 = join(OUT_DIR, 'questions-authoring-v10.jsonl');

// 内容字段：改了就可能改变题目本身的难度和答案，必须人看
const CONTENT_FIELDS = ['stem', 'options', 'answer', 'answer_text', 'explanation', 'misconception', 'basis', 'basis_evidence'];
// 元数据字段：改了不影响题目能不能答、答得对不对
const META_FIELDS = ['tags', 'nodes', 'qkind', 'qkind_reason', 'module', 'difficulty', 'estimated_seconds', 'source', 'provenance', 'needs_review', 'basis_strength', 'type'];

const loadRows = (p) => readFileSync(p, 'utf8').split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));
const canon = (v) => JSON.stringify(v ?? null);

const v10 = loadRows(V10);
const v10ById = new Map();
for (const q of v10) if (q.id) v10ById.set(q.id, q);

// 逐文件收集：同一 id 在 v10 和散装包里的字段差异
const diffs = new Map();   // id -> [{file, mtime, contentDiff, metaDiff}]
const files = readdirSync(OUT_DIR)
  .filter((f) => /^questions-.*\.jsonl$/.test(f) && !/^questions-authoring-v\d+\.jsonl$/.test(f))
  .sort();

for (const f of files) {
  const p = join(OUT_DIR, f);
  const mtime = statSync(p).mtime.toISOString();
  let rows;
  try { rows = loadRows(p); } catch { continue; }
  for (const q of rows) {
    if (!q.id || !v10ById.has(q.id)) continue;
    const v = v10ById.get(q.id);
    const contentDiff = [], metaDiff = [];
    for (const k of new Set([...Object.keys(q), ...Object.keys(v)])) {
      if (k === 'id') continue;
      // nodes 是对象数组，比它的字符串形式即可
      if (canon(q[k]) === canon(v[k])) continue;
      if (CONTENT_FIELDS.includes(k)) contentDiff.push(k);
      else if (META_FIELDS.includes(k)) metaDiff.push(k);
      else metaDiff.push(k);   // 不认识的字段按元数据处理，但要能看出来
    }
    if (!contentDiff.length && !metaDiff.length) continue;   // 完全相同
    if (!diffs.has(q.id)) diffs.set(q.id, []);
    diffs.get(q.id).push({ file: f, mtime, contentDiff, metaDiff });
  }
}

const rows = [...diffs].map(([id, list]) => {
  const anyContent = list.some((x) => x.contentDiff.length);
  return {
    id,
    kind: anyContent ? '内容有变（须人看）' : '只差元数据（可自动）',
    contentFields: [...new Set(list.flatMap((x) => x.contentDiff))],
    metaFields: [...new Set(list.flatMap((x) => x.metaDiff))],
    versions: list.map((x) => ({ file: x.file, mtime: x.mtime })),
  };
});

const contentOnly = rows.filter((r) => r.kind.startsWith('内容'));
const metaOnly = rows.filter((r) => r.kind.startsWith('只差'));

const asJson = process.argv.includes('--json');
const out = {
  v10: { path: V10, rows: v10.length },
  compared_ids: rows.length,
  content_changed: contentOnly.length,
  meta_only: metaOnly.length,
  rows,
};
if (asJson) {
  console.log(JSON.stringify(out, null, 2));
} else {
  console.log('跟 v10 同题号、但内容有差别的题：' + rows.length + ' 道');
  console.log('  · 内容有变（须人看）：' + contentOnly.length);
  console.log('  · 只差元数据（可自动）：' + metaOnly.length);
  console.log('');
  console.log('=== 内容有变的（这些必须人看，不能按 mtime 取最新） ===');
  for (const r of contentOnly) {
    console.log('  ' + r.id.padEnd(20) + ' 差: ' + r.contentFields.join(','));
    for (const v of r.versions) console.log('        ' + v.mtime + '  ' + v.file);
  }
  console.log('');
  console.log('=== 只差元数据的（共 ' + metaOnly.length + ' 道，略） ===');
  const fieldCount = {};
  for (const r of metaOnly) for (const f of r.metaFields) fieldCount[f] = (fieldCount[f] || 0) + 1;
  for (const [f, c] of Object.entries(fieldCount).sort((a, b) => b[1] - a[1])) console.log('  ' + f + ': ' + c + ' 道');
}
