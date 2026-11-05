// 跨文件 id 撞号检查：同一个 id 在不同题包里，题干是否不同
// 起因：c0901-01 在 m09-m11-v1（旧版）和 c0901-rewrite-v1（重写版）里是同号不同题，
//       导致"按 id 取题"静默取错文件。这轮已经因此出过两次错。
//
// 这条检查验的是事实（题干哈希），不碰语义，所以不会有争议。
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { stemHash } from '../core/stem-hash.mjs';

const DIR = process.argv[2] || 'data';

/** 题干指纹：全项目唯一实现，见 core/stem-hash.mjs（md5 原文前 8 位） */
export { stemHash };

export function loadPack(path) {
  const qs = readFileSync(path, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
  return qs.map((q) => ({ id: q.id, hash: stemHash(q.stem), stem: String(q.stem || '').slice(0, 50) }));
}

export function findCollisions(dir) {
  const files = readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort();
  const byId = new Map();   // id -> [{file, hash, stem}]
  const failed = [];        // 读不了的文件：必须报出来，不能静默跳过
  for (const f of files) {
    const p = join(dir, f);
    let rows;
    try { rows = loadPack(p); } catch (e) { failed.push({ file: f, error: e.message }); continue; }
    for (const r of rows) {
      if (!r.id) continue;
      if (!byId.has(r.id)) byId.set(r.id, []);
      byId.get(r.id).push({ file: f, hash: r.hash, stem: r.stem });
    }
  }
  const collisions = [];
  for (const [id, list] of byId) {
    const hashes = new Set(list.map((x) => x.hash));
    if (hashes.size <= 1) continue;

    // ── 只做两步，中间不加别的判断（2026-11-05，Chief 定的）──
    // 这一处改坏过四次，每次都是因为规则里塞了额外分支：
    //   ① 漏 sample  → 事故被吞   ② 先看文件数 → 38 条正常演进当成事故
    //   ③ 漏 -fix-   → 50 条重写包当成演进   ④ 要求"全来自正式包" → 真演进被吞成 0
    // 共同点：靠文件名分支判断。文件一多一类，判据就变。
    //
    // 第一步：把非正式包全部剔掉（白名单：只认 questions-authoring-vN.jsonl）。
    // 第二步：剩下的正式包里，同一个题号题干是否一致。不一致就是版本演进。

    // 第一步
    const official = list.filter((v) => /^questions-authoring-v\d+\.jsonl$/.test(v.file));

    // 第二步：只比较剩下的
    const officialHashes = new Set(official.map((v) => v.hash));

    let kind;
    if (officialHashes.size > 1) {
      kind = 'versioned';   // 正式包之间题干不同：v8→v9 改过题，已知行为
    } else if (official.length > 0 && official.length < list.length) {
      kind = 'rewrite';     // 正式包一致，差异全在重写/预览/样本里，不是事故
    } else if (official.length === 0) {
      kind = 'other';       // 全是非正式包，只是同一题的多版并存
    } else {
      kind = 'spread';
    }
    collisions.push({ id, variants: list, kind, authoringCount: official.length });
  }
  const original = collisions.filter((c) => c.kind === 'spread');
  const versioned = collisions.filter((c) => c.kind === 'versioned');
  // rewrite = 非事故的一切（正式包一致+重写包的分歧、以及全是样本/草稿的多版并存）
  const rewrite = collisions.filter((c) => c.kind === 'rewrite' || c.kind === 'other');
  // drafts 是 rewrite 的子集：只算"全部来自样本/草稿"的
  const drafts = collisions.filter(
    (c) => (c.kind === 'rewrite' || c.kind === 'other') && c.variants.every((v) => /sample|draft|wip/i.test(v.file)),
  );
  return { files, failed, collisions, original, versioned, rewrite, drafts, totalIds: byId.size };
}

// CLI
const invokedDirectly = process.argv[1] && /check-id-collision\.mjs$/.test(process.argv[1]);
if (invokedDirectly) {
  const r = findCollisions(DIR);
  console.log(`扫描目录：${DIR}`);
  console.log(`题包文件：${r.files.length} 个，涉及题号 ${r.totalIds} 个`);
  console.log('');
  console.log(`重写沿号（已知行为，只计数不报警）：${r.rewrite.length} 个`);
  console.log(`样本/草稿换版（同一题多版并存，不是事故）：${r.drafts.length} 个`);
  console.log(`版本演进（v8→v9→v10 之间改过题干，已知行为）：${r.versioned.length} 个`);
  console.log(`疑似扩散（正式包与批次文件之间同号不同题，需人看）：${r.original.length} 个`);

  // 读不了的文件必须报：否则"题号 0 个"会当成正常结果被人拿去用
  if (r.failed.length) {
    console.log(`\n⚠️ 读取失败的文件：${r.failed.length} 个（这些文件没被检查）`);
    r.failed.forEach((x) => console.log(`  ${x.file} :: ${x.error}`));
  }
  if (r.totalIds === 0) {
    console.log('\n❌ 扫到 0 个题号 —— 这不可能是正常结果，先查读取，别把这个数拿去用');
    process.exit(2);
  }

  if (r.original.length) {
    console.log('\n=== 原始重复明细 ===');
    for (const c of r.original) {
      console.log(`\n  ${c.id}`);
      const seen = new Set();
      for (const v of c.variants) {
        if (seen.has(v.hash)) continue;
        seen.add(v.hash);
        const others = c.variants.filter((x) => x.hash === v.hash).map((x) => x.file);
        console.log(`    [${v.hash}] ${v.stem}`);
        console.log(`         ${others.join(', ')}`);
      }
    }
  }

  // 只有"原始重复"会让退出码非 0；重写沿号不阻断构建
  const blocking = r.original.length;
  console.log(blocking ? `\n${blocking} 处原始重复需要处理` : '\n没有原始重复');
  process.exit(blocking ? 1 : 0);
}
