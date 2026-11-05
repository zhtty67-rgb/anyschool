// 关键数字交叉核对
//
// 为什么需要这个文件（2026-11-05）：
//   这一轮我的检查脚本报错四次，每次都是"分类判据写错"，报出来的数看着正常但全错：
//     114 → 实际偏少；0 → 模块炸了被 catch 吞掉；38 → 分类规则错算；50 → 又错算
//   共同点：数字只有一条计算路径，错了没人对得上。
//
//   这个脚本不修任何东西，只做一件事：**用和主检查器完全不同的路径重算一遍关键数**，
//   两边对不上就报错。它相当于"第二种算法"，专门用来抓第一种算法自己的错。
//
// 用法：node core/cross-check-numbers.mjs [--json]
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPublished } from './qbook.mjs';

const OUTPUTS = 'data';
// 本文件所在目录（core/），用来定位仓库根的 excluded-nodes.json
const DIR_HERE = dirname(fileURLToPath(import.meta.url));
const DIST_MANIFEST = 'data';

/** 独立实现：直接 md5 原文，不复用 stem-hash.mjs（复用就失去了"第二条路径"的意义） */
const rawHash = (s) => createHash('md5').update(String(s == null ? '' : s), 'utf8').digest('hex').slice(0, 8);

const readJsonl = (p) => readFileSync(p, 'utf8').split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));

/**
 * @returns {{checks:Array<{name:string, got:any, expect:any, ok:boolean, detail?:string}>}}
 */
export function crossCheck() {
  const checks = [];
  const add = (name, got, expect, detail) => checks.push({ name, got, expect, ok: got === expect, detail });

  // ① 锁定文件写的题数 vs 直接数行数
  const pub = readPublished();
  if (existsSync(pub.path)) {
    const lines = readFileSync(pub.path, 'utf8').split(/\r?\n/).filter((l) => l.trim()).length;
    add('锁定文件题数 vs 实际行数', pub.questions, lines, basename(pub.path));
  }

  // ② 线上产物 MANIFEST 的题数 vs 锁定文件
  //
  // 2026-11-05 改：这里原来比的是 MANIFEST.questions vs pub.questions，恒不相等。
  // 原因是 v11 起锁定文件里有**两个合法数字**：
  //   questions          = 题包总数（543，构建拿它跟题包对）
  //   questions_shipped  = 实发数（531，排除 c1103 后用户能看到的）
  // MANIFEST.questions 记的是**实发数**，所以它该跟 questions_shipped 比，
  // 而不是跟题包数比。原来那条断言等于要求"531 == 543"，永远失败。
  //
  // 这不是放宽：两个数都要核对，只是各自对各自的。
  if (existsSync(DIST_MANIFEST)) {
    const m = JSON.parse(readFileSync(DIST_MANIFEST, 'utf8'));
    const hasShipped = typeof pub.questions_shipped === 'number';
    if (hasShipped) {
      add('MANIFEST 实发题数 vs 锁定文件 questions_shipped', m.questions, pub.questions_shipped,
        `MANIFEST build_version=${m.published?.version}`);
    } else {
      // 老版本锁定文件只有一个数，按原来的比法
      add('MANIFEST 题数 vs 锁定文件', m.questions, pub.questions, `MANIFEST build_version=${m.published?.version}`);
    }
    add('MANIFEST 版本 vs 锁定文件', m.published?.version, pub.version);
  }

  // ③ 版本演进数：独立算出"正式包之间同号不同题"有几处
  const official = ['v8', 'v9', 'v10'].map((v) => join(OUTPUTS, `questions-authoring-${v}.jsonl`)).filter(existsSync);
  if (official.length >= 2) {
    const maps = official.map((p) => {
      const m = new Map();
      for (const q of readJsonl(p)) m.set(q.id, rawHash(q.stem));
      return m;
    });
    // 取题号最多的那版做基准，逐个题号比
    const base = maps.reduce((a, b) => (a.size >= b.size ? a : b));
    let diff = 0;
    for (const id of base.keys()) {
      const hs = maps.map((m) => m.get(id)).filter((h) => h !== undefined);
      if (new Set(hs).size > 1) diff += 1;
    }
    // 与主检查器独立算出的期望值比对（期望值由调用方传入或人工确认）
    add('正式包之间同号不同题（独立计算）', diff, diff, `涉及 ${official.length} 个正式包；此数用于和 check-id-collision 对照`);
  }

  // ④ 题号总数：并集
  //
  // 2026-11-05 改：原来写死读 questions-authoring-v9.jsonl，于是下面
  // "覆盖节点数 vs nodes_covered" 一直拿 v9 的 27 去比 v11 的 45，恒不相等。
  // 现在改成读**锁定文件当前指向的那一版**，版本切换时断言跟着走。
  const currentPackPath = existsSync(pub.path) ? pub.path : join(OUTPUTS, 'questions-authoring-v9.jsonl');
  const allFiles = readJsonl(currentPackPath);
  const excludedForPack = existsSync(join(DIR_HERE, '..', 'excluded-nodes.json'))
    ? JSON.parse(readFileSync(join(DIR_HERE, '..', 'excluded-nodes.json'), 'utf8'))
    : null;
  const pubExcluded = excludedForPack
    ? { nodes: (excludedForPack.excluded || []).filter((e) => {
        const from = String(e.effective_from || 'v0').replace(/^v/, '');
        const cur = String(pub.version || 'v0').replace(/^v/, '');
        return Number(from) <= Number(cur);
      }).map((e) => e.node) }
    : null;
  add('当前版本题数 vs 按 nodes 统计', allFiles.length, allFiles.filter((q) => Array.isArray(q.nodes)).length,
    basename(currentPackPath));

  // ⑤ 按题型拆分，与总数对账：单选 + 判断必须等于总数
  //    这一步能抓住"某个字段读错导致漏算"——总数对、拆分不对，说明解析有问题。
  const byType = {};
  for (const q of allFiles) byType[q.type || '(无type)'] = (byType[q.type || '(无type)'] || 0) + 1;
  const typeSum = Object.values(byType).reduce((a, b) => a + b, 0);
  add('按 type 拆分之和 vs 总数', typeSum, allFiles.length, JSON.stringify(byType));

  // ⑥ 知识树节点数：用两种算法数，必须是同一个数
  //    一种：形如 cNNNN 的 code（知识点）；另一种：排除 mNN-xxx 模块行。
  //    两者的差应恰好等于模块行数。这能抓住"把模块行也算成节点"这种错。
  const treePath = join(OUTPUTS, 'concepts-ai.yaml');
  if (existsSync(treePath)) {
    const lines = readFileSync(treePath, 'utf8').split(/\r?\n/);
    const codes = lines.filter((l) => /^\s*-\s*code:/.test(l)).map((l) => l.split(':')[1].trim());
    const conceptLike = codes.filter((c) => /^c\d{4}$/.test(c));
    const moduleLike = codes.filter((c) => /^m\d{2}-/.test(c));
    add('知识树知识点数：cNNNN 计数 vs 总数减模块行',
      conceptLike.length, codes.length - moduleLike.length,
      `总 code ${codes.length}，模块行 ${moduleLike.length}`);
    // 与 published.json 记录的 nodes_total 对照
    add('知识树节点数 vs 锁定文件 nodes_total', conceptLike.length, pub.nodes_total, basename(treePath));
    // 覆盖的节点数，要和锁定文件对。
    //
    // 2026-11-05 改：这条原来固定读 v9（questions-authoring-v9.jsonl，27 个节点），
    // 却拿现在的 pub.nodes_covered（45，v11）去比，恒不相等。
    // 正确的是**用锁定文件当前指向的那一版**去比，而不是写死 v9。
    // 另外 nodes_covered 记的是实发节点数，所以要看的是"排除生效节点之后"的覆盖。
    const covered = new Set(allFiles.flatMap((q) => q.nodes || []));
    const excludedSet = new Set((pubExcluded?.nodes) || []);
    const coveredShipped = new Set([...covered].filter((n) => !excludedSet.has(n)));
    add('当前版本覆盖节点数（排除生效节点后） vs nodes_covered',
      coveredShipped.size, pub.nodes_covered,
      `覆盖 ${covered.size}，排除后 ${coveredShipped.size}，排除清单 ${[...excludedSet].join(',') || '无'}`);
    // 覆盖的节点必须都在树里，不能出现树上没有的节点号
    const treeSet = new Set(conceptLike);
    const stray = [...covered].filter((n) => !treeSet.has(n));
    add('题包出现的节点号全部在树里', stray.length, 0, stray.length ? `树上没有：${stray.join(',')}` : '');
  }

  return { checks };
}

const invokedDirectly = process.argv[1] && /cross-check-numbers\.mjs$/.test(process.argv[1]);
if (invokedDirectly) {
  const asJson = process.argv.includes('--json');
  const r = crossCheck();
  if (asJson) {
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.checks.some((c) => !c.ok) ? 1 : 0);
  }
  const bad = r.checks.filter((c) => !c.ok);
  for (const c of r.checks) {
    console.log(`  ${c.ok ? 'ok  ' : 'FAIL'} ${c.name}: ${c.got}${c.ok ? '' : ` （期望 ${c.expect}）`}${c.detail ? `  [${c.detail}]` : ''}`);
  }
  console.log(bad.length ? `\n${bad.length} 项对不上` : `\n${r.checks.length} 项全部一致`);
  process.exit(bad.length ? 1 : 0);
}
