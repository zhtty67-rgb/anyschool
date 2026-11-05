// 合并题包 —— 把多个分模块题包合成一个，校验 id 唯一、节点不冲突。
// node merge-packs.mjs <输出路径> <输入1> <输入2> ...

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { parseTree } from './core/tree.mjs';

const args = process.argv.slice(2);

/**
 * 老批次：basis_evidence 这条要求定下来之前出的题。
 * 只有这里的批次，合并脚本才会自动补 pre-policy。
 * 新批次必须自带证据，填 pre-policy 会被判错。
 */
const LEGACY_BATCH = new Set([
  'questions-authoring-stage12-v1',
  'questions-ai-m02-v1',
  'questions-ai-m02-fill-v1',
  'questions-ai-m03-v1',
  'questions-ai-m04-v1',
  'questions-ai-m05-v1',
  'questions-ai-m09-sample-v1',
  'questions-fill-12-v1',
]);
if (args.length < 3) {
  console.error('用法: node merge-packs.mjs <输出路径> <输入1> <输入2> ...');
  process.exit(2);
}

const [out, ...inputs] = args;
const tree = parseTree();
const validNodes = new Set(tree.concepts.map((c) => c.code));

const all = [];
const seen = new Map();      // id -> { file, q }
const conflicts = [];         // 冲突实例，带题干和来源，便于人工判断真假重复
const problems = [];
const stats = { files: [], bySource: {}, byType: {}, byNode: {} };

for (const path of inputs) {
  if (!existsSync(path)) {
    console.error(`输入不存在：${path}`);
    process.exit(2);
  }
  const items = readFileSync(path, 'utf8').split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));
  const tag = path.split(/[\\/]/).pop().replace(/\.jsonl$/, '');
  stats.files.push({ file: tag, count: items.length });

  for (const q of items) {
    if (seen.has(q.id)) {
      const prev = seen.get(q.id);
      conflicts.push({
        id: q.id,
        a: { file: prev.file, stem: prev.q.stem, answer: prev.q.answer, basis: prev.q.basis },
        b: { file: tag, stem: q.stem, answer: q.answer, basis: q.basis },
        sameStem: String(prev.q.stem).trim() === String(q.stem).trim(),
      });
      problems.push(`id 重复：${q.id}（${prev.file} 与 ${tag}）`);
      continue;
    }
    seen.set(q.id, { file: tag, q });
    for (const n of q.nodes || []) {
      if (!validNodes.has(n)) problems.push(`${q.id} 引用了不存在的节点 ${n}`);
      stats.byNode[n] = (stats.byNode[n] || 0) + 1;
    }
    stats.byType[q.type] = (stats.byType[q.type] || 0) + 1;

    // ── source 与 basis_evidence 由合并脚本统一写，出题人不手填 ──
    // 这是整个流水线里唯一判断"新批次 / 老批次"的地方（Qbank 2026-11-04 提的）。
    // 放在一处判断，比散在检查器里出错面小得多。
    //
    //   老批次（LEGACY_BATCH 里那几批，basis_evidence 要求定下来之前出的）：
    //     没有证据就写 pre-policy
    //   新批次：
    //     出题人自己填了 pre-policy → 报错（想冒充老题）
    //     没填证据 → 报错（新题必须给证据）
    const src = q.source || tag;
    const isLegacy = LEGACY_BATCH.has(src);
    const ev = q.basis_evidence == null ? '' : String(q.basis_evidence).trim();
    const out = { ...q, source: src };

    if (ev) {
      if (ev === 'pre-policy' && !isLegacy) {
        problems.push(
          `id ${q.id}（来自 ${tag}）：新批次不许自填 pre-policy——` +
            `该值只能由合并脚本写给老批次`,
        );
        continue;
      }
      out.basis_evidence = ev;
    } else if (isLegacy) {
      out.basis_evidence = 'pre-policy';
      stats.autoPrePolicy = (stats.autoPrePolicy || 0) + 1;
    } else {
      problems.push(`id ${q.id}（来自 ${tag}）：新批次缺 basis_evidence，必须写到具体章节/页码`);
      continue;
    }

    stats.bySource[src] = (stats.bySource[src] || 0) + 1;
    all.push(out);
  }
}

if (problems.length) {
  console.error(`合并失败，${problems.length} 个问题：`);
  for (const p of problems.slice(0, 20)) console.error(`  ${p}`);
  // 把冲突实例的正文打出来：只看 id 分不清"内容重复"还是"编号撞号"
  if (conflicts.length) {
    console.error(`\n冲突详情（${conflicts.length} 处）：`);
    for (const c of conflicts) {
      console.error(`\n  ▸ ${c.id}  判定：${c.sameStem ? '题干完全相同，是内容重复' : '题干不同，是编号撞号'}`);
      console.error(`    [${c.a.file}] ${c.a.stem}`);
      console.error(`    [${c.b.file}] ${c.b.stem}`);
    }
  }
  process.exit(1);
}

// 按模块顺序稳定排序，方便人看
const moduleOrder = new Map(tree.modules.map((m, i) => [m.code, i]));
all.sort((a, b) => {
  const ma = moduleOrder.get(a.module) ?? 999;
  const mb = moduleOrder.get(b.module) ?? 999;
  if (ma !== mb) return ma - mb;
  return String(a.id).localeCompare(String(b.id));
});

writeFileSync(out, all.map((q) => JSON.stringify(q)).join('\n') + '\n', 'utf8');

const nodeCount = Object.keys(stats.byNode).length;
const judgeCount = stats.byType.judge || 0;
console.log(`已写入 ${out}`);
console.log(`题量 ${all.length}`);
console.log(`类型 ${JSON.stringify(stats.byType)}（判断题占 ${Math.round((judgeCount / all.length) * 100)}%）`);
console.log(`节点 ${nodeCount}/${tree.total}`);
console.log(`来源 ${JSON.stringify(stats.bySource)}`);
console.log('各文件贡献：');
for (const f of stats.files) console.log(`  ${f.file}: ${f.count} 道`);

// 哪些节点还差题
const short = [];
for (const c of tree.concepts) {
  const n = stats.byNode[c.code] || 0;
  if (n > 0 && n < 10) short.push(`${c.code}(${n})`);
}
if (short.length) console.log(`未满 10 道的节点：${short.join(' ')}`);
