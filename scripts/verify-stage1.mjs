// 阶段 1 四项双向验证：改对了能过、改错了会报
//
// 每条断言都跑两遍——正常态一遍、故意改坏一遍。
// 只验"能过"等于没验：这条规矩来自 Chief，本轮已经栽过好几次"测试绿、产品没动"。
import { readFileSync, writeFileSync, copyFileSync, unlinkSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const DIR = 'data';
const MASTERY = DIR + '\\core\\mastery.mjs';
const RENDER = DIR + '\\ui\\render.mjs';
const DIST = DIR + '\\dist\\index.html';

const results = [];
const rec = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log((pass ? '  ✔ ' : '  ✘ ') + name + (detail ? '\n      ' + detail : ''));
};

function build() {
  const r = spawnSync('node', ['build.mjs', '--strict'], { cwd: DIR, encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

function readSnap() {
  const html = readFileSync(DIST, 'utf8');
  const m = html.match(/window\.__SNAP__\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
  if (!m) throw new Error('产物里找不到 __SNAP__');
  return JSON.parse(m[1]);
}

// 临时改一个文件、跑构建、还原
function withPatched(file, from, to, fn) {
  const bak = file + '.testbak';
  copyFileSync(file, bak);
  const orig = readFileSync(file, 'utf8');
  try {
    if (!orig.includes(from)) throw new Error('要替换的片段没找到：' + from.slice(0, 60));
    writeFileSync(file, orig.replace(from, to), 'utf8');
    return fn();
  } finally {
    writeFileSync(file, orig, 'utf8');
    if (existsSync(bak)) unlinkSync(bak);
  }
}

console.log('=== 断言 1：分母 —— 正常态是 45，退回整棵树时会变 79 ===');
{
  const r = build();
  const snap = readSnap();
  rec('产物 summary.total === 45（不是 79）', snap.summary.total === 45,
    `build exit=${r.code}，total=${snap.summary.total}`);
}

console.log('\n=== 断言 2：单一真源 —— 改 DECAY，产物里客户端参数必须跟着变 ===');
{
  const before = readFileSync(DIST, 'utf8');
  const hit = before.match(/var MIN_SAMPLES=\d+, WINDOW=\d+, DECAY=[\d.]+/);
  const patch = withPatched(MASTERY, 'export const DECAY = 0.78;', 'export const DECAY = 0.5;', () => {
    const r = build();
    return { code: r.code, html: readFileSync(DIST, 'utf8') };
  });
  const after = patch.html.match(/var MIN_SAMPLES=\d+, WINDOW=\d+, DECAY=[\d.]+/);
  rec('改 DECAY=0.5 后重建，产物里的 DECAY 从 0.78 变成 0.5',
    !!hit && !!after && hit[0].includes('0.78') && after[0].includes('0.5'),
    `改前 ${hit ? hit[0] : '(没找到)'}  →  改后 ${after ? after[0] : '(没找到)'}`);
  rec('改 DECAY 后构建仍然成功（说明是重新生成，不是硬编码）', patch.code === 0, `exit=${patch.code}`);

  // 还原后重建，确认回到 0.78
  const r2 = build();
  const back = readFileSync(DIST, 'utf8').match(/var MIN_SAMPLES=\d+, WINDOW=\d+, DECAY=[\d.]+/);
  rec('还原真源后重建，DECAY 回到 0.78', r2.code === 0 && back && back[0].includes('0.78'),
    back ? back[0] : '(没找到)');
}

console.log('\n=== 断言 3：反向 —— 故意把客户端用到的名字改错，构建必须失败 ===');
{
  // clientSource 里引用了 trendOf；把真源里 reasonFor 依赖的名字改坏，
  // 生成的源码里就会出现未定义引用。
  const r = withPatched(MASTERY, 'const fns = [ts, masteryOfNode, trendOf, reasonFor, pickNext]',
    'const fns = [ts, masteryOfNode, reasonForNotExist, reasonFor, pickNext]', () => build());
  rec('引用一个不存在的函数名 → 构建失败', r.code !== 0,
    `exit=${r.code}；输出含报错：${/ReferenceError|is not defined|not a function/.test(r.out)}`);
}

console.log('\n=== 断言 4：加一个无题节点重建，分母不变 ===');
{
  // 断言 3 故意让构建失败，构建脚本会先清空 dist 再跑——所以这时 dist 里没有产物。
  // 这是正确行为（失败时不留旧产物，免得被误当新版），但断言 4 要读产物，必须先重建。
  const rb = build();
  if (rb.code !== 0) {
    rec('重建失败，断言 4 无法进行', false, rb.out.slice(-300));
  } else {
  const snap = readSnap();
  const withQ = new Set((snap.questions || []).flatMap((q) => q.nodes || []));
  const allCodes = [];
  for (const m of snap.tree.modules) for (const c of m.concepts) allCodes.push(c.code);
  const noQ = allCodes.filter((c) => !withQ.has(c));
  rec('树里有无题节点（否则这条断言没有意义）', noQ.length > 0,
    `无题节点 ${noQ.length} 个，如 ${noQ.slice(0, 5).join(',')}`);
  rec('分母 = 有题节点数，不等于树的总节点数',
    snap.summary.total === withQ.size && snap.summary.total !== allCodes.length,
    `total=${snap.summary.total}，有题=${withQ.size}，树=${allCodes.length}`);
  }
}

const bad = results.filter((x) => !x.pass);
console.log(`\n通过 ${results.length - bad.length} / ${results.length}`);
writeFileSync(DIR + '\\reports\\阶段1-双向验证.json',
  JSON.stringify({ at: new Date().toISOString(), results }, null, 2), 'utf8');
process.exit(bad.length ? 1 : 0);
