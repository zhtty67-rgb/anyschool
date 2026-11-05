// 构建脚本 —— 把题包 + 界面 + 第三方许可声明打成一份可交付产物。
//
// 用法：
//   node build.mjs                         # 默认 90 道题包
//   node build.mjs <题包.jsonl>            # 指定题包
//   node build.mjs <题包.jsonl> --strict   # 检查不通过就中止构建
//
// 产出（dist/）：
//   index.html          学习界面（含许可声明页入口）
//   THIRD_PARTY_NOTICES.md  第三方素材与许可声明
//   MANIFEST.json       构建信息：题包、题量、节点覆盖、检查结果、许可摘要

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, statSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkPack } from './core/check-pack.mjs';
import { parseTree } from './core/tree.mjs';
import { readPublished, PUBLISHED_MANIFEST } from './core/qbook.mjs';
import { loadExcluded, activeFor, filterExcluded } from './core/excluded-nodes.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = join(HERE, 'dist');

const NOTICES_SRC = join(HERE, 'data', 'THIRD_PARTY_NOTICES.md');

// 构建源由 published.json 决定：改一行就切换发布版，不再靠文件名排序
const published = readPublished();
const DEFAULT_PACK = published.path;

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const packArg = args.find((a) => !a.startsWith('--'));
const packPath = packArg || DEFAULT_PACK;

if (!existsSync(packPath)) {
  console.error(`题包不存在：${packPath}`);
  process.exit(2);
}

console.log(`构建源：${packPath}`);
if (strict) console.log('模式：严格（检查不通过即中止）');

// ── 1. 检查题包 ───────────────────────────────────
// 先清掉旧产物：构建失败时 dist 里若留着上一版，容易被误当成当前版本
if (existsSync(DIST)) {
  for (const f of ['index.html', 'THIRD_PARTY_NOTICES.md', 'MANIFEST.json']) {
    const p = join(DIST, f);
    if (existsSync(p)) {
      const { unlinkSync } = await import('node:fs');
      unlinkSync(p);
    }
  }
  console.log('已清理旧产物\n');
}

const check = checkPack(packPath, { strict });
const errByCode = {};
for (const e of check.errors) errByCode[e.code] = (errByCode[e.code] || 0) + 1;
const warnByCode = {};
for (const w of check.warnings) warnByCode[w.code] = (warnByCode[w.code] || 0) + 1;

console.log(`\n[1/4] 题包检查`);
console.log(`  错误 ${check.errors.length}  ${JSON.stringify(errByCode)}`);
console.log(`  警告 ${check.warnings.length}  ${JSON.stringify(warnByCode)}`);

// 锁定文件自洽校验（2026-11-05，Chief 定的）
// published.json 是"线上是哪一版"的唯一事实源。它的版本号对、题数错，
// 说明没人核对过它的内容——那下次版本号写错，也一样没人能发现。
// 所以这里不信任它写的数，直接和题包对。
if (packPath === DEFAULT_PACK && typeof published.questions === 'number') {
  const actual = check.stats?.total ?? 0;
  if (actual !== published.questions) {
    console.error(`\n锁定文件与实际题包不一致：`);
    console.error(`  ${basename(PUBLISHED_MANIFEST)} 写的是 ${published.questions} 道`);
    console.error(`  ${basename(packPath)} 实际有 ${actual} 道`);
    console.error(`  「线上有多少题」这个数所有人都从这里抄。两边不一致，说明没人核过它。`);
    console.error(`  先改 ${basename(PUBLISHED_MANIFEST)} 的 questions 字段再构建。`);
    process.exit(5);
  }
  console.log(`  锁定文件自洽：questions=${published.questions} 与题包一致`);
}

// questions_shipped 校验（2026-11-05，Qbank 指出后加）
//
// questions 校验的是"题包有多少道"，但**界面实际发多少由排除清单决定**。
// 加 questions_shipped 以后，如果只校验 questions、不校验它，就有一种错会溜过去：
//   有人往排除清单里加了个节点，实发从 531 变 500，但忘了改 questions_shipped。
//   构建照样通过（题包还是 543），界面显示 500，published.json 还写着 531。
// 两个字段看着都对，实际彼此矛盾——比只写一个数时更难发现。
//
// 之前 nodes_covered 写 46（题包数）、实际 45（实发数）就是这么来的：
// 当时只校验了一个数，那次是人工发现并修的，构建没拦住。
// 所以这里把实发数算一遍，对不上直接退出，不让它上线。
if (packPath === DEFAULT_PACK && typeof published.questions_shipped === 'number') {
  // 这时下面还没读到 pack / droppedByExclusion，用同样的来源现算一遍：
  // 排除清单 → 生效项 → 去掉对应节点的题。
  const _pack = readFileSync(packPath, 'utf8').split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));
  const _exFile = loadExcluded();
  const _exList = activeFor(_exFile, published.version);
  const { kept: _shipped } = filterExcluded(_pack, _exList.nodes);
  if (_shipped.length !== published.questions_shipped) {
    // 注意：activeFor() 返回的 nodes 是过滤用的对象，不是数组；生效节点名单在 active 里。
    // 2026-11-05 踩过：这里写 _exList.nodes.join(',')，nodes 是 {}，调用 join 直接抛 TypeError，
    // 构建在"打印错误说明"这一步崩掉。退出码虽然还是非 0、拦截仍然生效，
    // 但"为什么被拦"一个字没打出来——拦截生效不等于错误信息有用。
    const activeNodeNames = (_exList.active || []).map((e) => e.node);
    console.error(`\n锁定文件与实际发布数不一致：`);
    console.error(`  ${basename(PUBLISHED_MANIFEST)} 的 questions_shipped 写的是 ${published.questions_shipped} 道`);
    console.error(`  按排除清单（${activeNodeNames.join(',') || '无'}）实际会发 ${_shipped.length} 道`);
    console.error(`  这个字段就是"用户能看见几道题"，写错了界面上的数就是错的。`);
    console.error(`  先把 questions_shipped 改成 ${_shipped.length} 再构建。`);
    process.exit(6);
  }
  console.log(`  锁定文件自洽：questions_shipped=${published.questions_shipped} 与实发数一致`);
}

if (!check.ok) {
  console.error('\n检查不通过。');
  for (const e of check.errors.slice(0, 10)) {
    console.error(`  ${e.id || e.where} ${e.code}: ${e.message}`);
  }
  if (strict) process.exit(1);
  console.warn('  （非严格模式，继续构建；产物会标记 passed=false）');
}

// ── 2. 许可声明 ───────────────────────────────────
console.log(`\n[2/4] 第三方许可声明`);
if (!existsSync(NOTICES_SRC)) {
  console.error(`  许可声明文件不存在：${NOTICES_SRC}`);
  process.exit(3);
}
const notices = readFileSync(NOTICES_SRC, 'utf8');
// 校验必需条目，缺了直接失败——漏了就是违规
const REQUIRED = [
  { key: 'd2l-zh', pattern: /d2l-zh|动手学深度学习/, why: 'Apache-2.0 需保留署名' },
  // Apache-2.0 §4(c)：保留源码中的版权、专利、商标与归属声明。对书而言就是作者姓名。
  { key: 'd2l 作者 Aston Zhang', pattern: /Aston Zhang/, why: 'Apache-2.0 §4(c) 归属声明' },
  { key: 'd2l 作者 Zachary C. Lipton', pattern: /Zachary C\. Lipton/, why: 'Apache-2.0 §4(c) 归属声明' },
  { key: 'd2l 作者 Mu Li', pattern: /Mu Li/, why: 'Apache-2.0 §4(c) 归属声明' },
  { key: 'd2l 作者 Alexander J. Smola', pattern: /Alexander J\. Smola/, why: 'Apache-2.0 §4(c) 归属声明' },
  { key: 'MMLU', pattern: /MMLU/, why: 'MIT 需保留版权声明' },
  { key: '版权行', pattern: /Copyright \(c\) 2020 Dan Hendrycks/, why: 'MIT 版权行' },
  { key: '变更声明', pattern: /修改|变更/, why: 'Apache-2.0 §4(b)' },
];
const missing = REQUIRED.filter((r) => !r.pattern.test(notices));
if (missing.length) {
  console.error(`  许可声明缺少必需内容：${missing.map((m) => `${m.key}（${m.why}）`).join('、')}`);
  process.exit(3);
}
// 记录读取的是哪一版声明文件，避免声明改了而产物没重建却没人发现
const noticesStat = statSync(NOTICES_SRC);
const noticesHash = createHash('sha256').update(notices).digest('hex').slice(0, 16);
console.log(`  通过：${REQUIRED.length} 项必需内容齐全`);
console.log(`  声明文件：${basename(NOTICES_SRC)}  ${noticesHash}  ${noticesStat.mtime.toISOString()}`);

// 题包引用到第三方素材（basis 以 d2l 开头），声明里必须有对应署名，否则构建失败
const declaredDeps = check.stats?.basisDeps || [];
const BASIS_RULE = {
  'd2l-zh': { pattern: /动手学深度学习|d2l-zh/, why: '题目依据了 d2l-zh，声明里必须有 d2l-zh 署名与修改声明' },
  'd2l-en': { pattern: /动手学深度学习|d2l-en|d2l-zh/, why: '题目依据了 d2l-en，声明里必须有 d2l 署名' },
  MMLU: { pattern: /MMLU/, why: '题目依据了 MMLU，声明里必须有 MMLU 条目' },
};
const basisProblems = [];
for (const dep of declaredDeps) {
  const rule = BASIS_RULE[dep];
  if (rule && !rule.pattern.test(notices)) basisProblems.push(`${dep}：${rule.why}`);
}
if (basisProblems.length) {
  console.error(`  题包引用的素材未在声明文件中覆盖：`);
  for (const p of basisProblems) console.error(`    ${p}`);
  process.exit(4);
}
const basisCovered = check.stats?.basisCovered ?? 0;
const totalQ = check.stats?.total ?? 0;
console.log(`  basis 标注：${basisCovered}/${totalQ} 道，引用素材 ${declaredDeps.length ? declaredDeps.join('、') : '无'}`);
if (basisCovered < totalQ) {
  console.warn(`  ⚠ ${totalQ - basisCovered} 道题没有 basis，看不出依据的是不是第三方教材`);
  if (strict) {
    console.error('  严格模式：basis 不完整，中止构建');
    process.exit(4);
  }
}

// ── 3. 生成界面 ───────────────────────────────────
console.log(`\n[3/4] 生成界面`);
const { renderPage } = await import('./ui/render.mjs');
const html = renderPage(packPath);
console.log(`  index.html  ${(html.length / 1024).toFixed(1)} KB`);

// ── 4. 落盘 ───────────────────────────────────────
console.log(`\n[4/4] 写产物`);
mkdirSync(DIST, { recursive: true });
writeFileSync(join(DIST, 'index.html'), html, 'utf8');
copyFileSync(NOTICES_SRC, join(DIST, 'THIRD_PARTY_NOTICES.md'));

const tree = parseTree();
const pack = readFileSync(packPath, 'utf8').split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));
// 排除清单在构建这一步就读并校验：理由缺项直接中止，不留给界面去发现
const excludedFile = loadExcluded();
// 按当前构建的版本挑出生效的项：还没到生效版本的只提示、不报警、不去题
const excludedList = activeFor(excludedFile, published.version);
const { kept: shipped, dropped: droppedByExclusion } = filterExcluded(pack, excludedList.nodes);
// nodesWithQ 必须从**实发**题包算，不是从完整题包算。
//
// 2026-11-05 修：原来这行在排除之前，用的是 pack（排除前的完整题包）。
// 结果 c1103 被排除、界面里一道都没有，MANIFEST 却还把 c1103 算进 nodes_covered——
// 自述 46 个节点，界面实际只有 45 个。
// 这正是这一轮反复出现的"报出来的数和实际对不上"：脚本自己数的是排除前的数。
// 现在挪到 shipped 之后，数的是真正上界面的那批题。
const nodesWithQ = new Set(shipped.flatMap((q) => q.nodes || []));
if (excludedFile.all.length) {
  console.log(`\n节点排除清单（当前构建 ${published.version}）：`);
  for (const e of excludedList.active) {
    console.log(`  ${e.node}  ${e.name || ''}  [生效]`);
    console.log(`    理由：${e.reason}`);
    console.log(`    决定：${e.decided_by}（${e.decided_at}）`);
  }
  for (const e of excludedList.pending) {
    console.log(`  ${e.node}  ${e.name || ''}  [${e.effective_from} 起生效，本版不适用]`);
    console.log(`    理由：${e.reason}`);
  }
  console.log(`  去掉 ${droppedByExclusion.length} 道题，实发 ${shipped.length} 道`);
  if (excludedList.active.length && !droppedByExclusion.length) {
    console.warn(`  ⚠ 有已生效的排除项，但一道题都没被去掉——节点号可能写错了，或该节点本版没有题`);
  }
}
const manifest = {
  built_at: new Date().toISOString(),
  source_pack: basename(packPath),
  source_pack_full: packPath,
  published: {
    version: published.version,
    file: published.file,
    manifest: PUBLISHED_MANIFEST,
    locked_path_matches: published.path === packPath,
  },
  // 本次构建排除了哪些节点、为什么——写进产物，任何人打开 MANIFEST 都能查到
  excluded_nodes: {
    file: 'excluded-nodes.json',
    build_version: published.version,
    nodes: [...excludedList.nodes],
    questions_dropped: droppedByExclusion.length,
    // 已生效的才去题；待生效的写进来是为了让人知道"清单里还有一条在排队"
    entries: excludedList.active.map((e) => ({
      node: e.node,
      name: e.name || '',
      effective_from: e.effective_from || published.version,
      reason: e.reason,
      decided_by: e.decided_by,
      decided_at: e.decided_at,
    })),
    pending: excludedList.pending.map((e) => ({
      node: e.node,
      name: e.name || '',
      effective_from: e.effective_from,
      reason: e.reason,
    })),
  },
  questions: shipped.length,
  by_type: check.stats?.byType || {},
  nodes_covered: nodesWithQ.size,
  nodes_total: tree.total,
  check: {
    passed: check.ok,
    errors: check.errors.length,
    warnings: check.warnings.length,
    error_codes: errByCode,
    warning_codes: warnByCode,
  },
  notices: {
    file: 'THIRD_PARTY_NOTICES.md',
    file_sha256: noticesHash,
    file_mtime: noticesStat.mtime.toISOString(),
    verified: REQUIRED.map((r) => r.key),
  },
  // 题目包本身的指纹：声明文件、题包、产物三者能对得上
  pack_sha256: createHash('sha256').update(readFileSync(packPath)).digest('hex').slice(0, 16),
  // 发布说明：版本之间发生过的实质变化，必须显式记录，不能静默替换。
  // c0205-08：v8→v9 改了题干，考点从"训练准确率高不高"变成"训练集与新数据对比"，
  // 是两道不同的题（答案都对，但问的不是同一件事）。用户量小，选更好的那版，旧作答记录不继承。
  release_notes: [
    {
      id: 'c0205-08',
      change: 'stem_replaced',
      from_version: 'v8',
      to_version: 'v9+',
      old_stem: '过拟合的模型在训练数据上的准确率一定很高。',
      new_stem: '过拟合的模型在训练数据上的表现一定优于它在新数据上的表现。',
      assessment_changed: true,
      note: '考点由"训练准确率"改为"训练集与新数据对比"。v8 的作答记录不继承——两者不是同一道题。',
    },
  ],
  files: ['index.html', 'THIRD_PARTY_NOTICES.md'],
};
writeFileSync(join(DIST, 'MANIFEST.json'), JSON.stringify(manifest, null, 2), 'utf8');

console.log(`  dist/index.html`);
console.log(`  dist/THIRD_PARTY_NOTICES.md`);
console.log(`  dist/MANIFEST.json`);
console.log(`\n完成：${pack.length} 道题，${nodesWithQ.size}/${tree.total} 个节点有题，检查${check.ok ? '通过' : '未通过'}`);
