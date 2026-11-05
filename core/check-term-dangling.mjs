// 术语悬空检查：节点需要的核心术语，在它的前置节点里是否出现过
//
// 来源：小白（外行视角）提出、Chief 定为规矩——
//   "一个节点如果需要的核心术语，在整条路径前面从没出现过，
//    那它要么往后挪，要么前面得补上。否则不管题写得多好，走上来的人都是一片黑。"
//
// ⚠️ 这个检查器只查**字面出现**，不判断语义：
//   · "潜空间" 写成 "潜在空间" 会漏
//   · 一个词出现过，不等于那个概念被讲过
//   所以它报"无悬空"只能说明"这些词出现过"，不能说明"路径是通的"。
//
// 用法：node core/check-term-dangling.mjs [题包.jsonl]
import { readFileSync, existsSync } from 'node:fs';

// 常见的技术术语：从节点定义和题面里提取时，用它做过滤器
// （只认这些词，避免把普通中文当术语）
const TERM_PATTERNS = [
  // 英文缩写/术语
  /[A-Z]{2,}[a-z]?/g,
  // 带英文的技术词
  /[A-Za-z]{3,}/g,
];

// 中文技术词：按常见 AI 术语表匹配（字面）
const ZH_TERMS = [
  '潜空间', '潜在空间', '编码器', '解码器', '后验', '先验', '重参数化', '变分',
  '梯度', '反向传播', '激活函数', '损失函数', '卷积', '池化', '注意力', '自注意力',
  '过拟合', '欠拟合', '正则化', '归一化', '批归一化', '丢弃', '残差',
  '奖励', '策略', '价值函数', '状态', '动作', '轨迹', '折扣',
  '生成器', '判别器', '对抗', '扩散', '去噪', '采样',
  '监督学习', '无监督学习', '强化学习', '半监督',
  '训练集', '测试集', '验证集', '标签', '特征',
  '损失', '优化器', '学习率', '收敛', '泛化', '偏差', '方差',
  '词向量', '嵌入', '分词', '语料', '预训练', '微调',
  '目标检测', '语义分割', '图像分类',
];

/** 从文本里提取出现的术语（只做字面匹配） */
export function extractTerms(text) {
  const s = String(text || '');
  const found = new Set();
  for (const t of ZH_TERMS) {
    if (s.includes(t)) found.add(t);
  }
  for (const re of TERM_PATTERNS) {
    const m = s.match(re);
    if (m) m.forEach((x) => { if (x.length >= 2) found.add(x); });
  }
  return found;
}

/**
 * 判据（Chief 定，2026-11-05）：
 *   节点自己 def / misconceptions 里出现过的术语 = 它本来就要讲的新词，不算悬空；
 *   题目里反复用、但该节点 def 和 misconceptions 里都没提 = 悬空（用到了没讲过的概念）。
 *
 *   前置节点里出现过，也算有人铺过，不算悬空。
 *
 * @param {Array} concepts 概念树扁平列表 [{code, name, def, prereq, misconceptions}]
 * @param {Map}   usedTerms 每个节点题目里实际出现的术语 code -> Set
 * @returns {{dangling: Array, checked: number}}
 */
export function checkTermDangling(concepts, usedTerms = new Map()) {
  const byCode = new Map(concepts.map((c) => [c.code, c]));

  // 每个节点自己在 def/misconceptions 里讲过的术语
  const explained = new Map();
  for (const c of concepts) {
    const text = [c.def, ...(c.misconceptions || [])].join(' ');
    explained.set(c.code, extractTerms(text));
  }

  // 递归收集所有前置节点讲过的术语（含前置的前置）
  const collectPrereqExplained = (code, seen = new Set()) => {
    const c = byCode.get(code);
    if (!c) return new Set();
    const out = new Set();
    for (const p of c.prereq || []) {
      if (seen.has(p)) continue;
      seen.add(p);
      for (const t of explained.get(p) || []) out.add(t);
      for (const t of collectPrereqExplained(p, seen)) out.add(t);
    }
    return out;
  };

  const dangling = [];
  for (const c of concepts) {
    const used = usedTerms.get(c.code);
    if (!used || used.size === 0) continue;  // 没题或不带术语，不判

    const said = explained.get(c.code) || new Set();
    const prereqSaid = collectPrereqExplained(c.code);

    // 悬空 = 题目里用了，但本节点没解释，前置也没解释
    const missing = [...used].filter((t) => !said.has(t) && !prereqSaid.has(t));
    if (missing.length) {
      dangling.push({ code: c.code, name: c.name, prereq: c.prereq || [], missing });
    }
  }
  return { dangling, checked: concepts.length };
}

// CLI
const invokedDirectly = process.argv[1] && /check-term-dangling\.mjs$/.test(process.argv[1]);
if (invokedDirectly) {
  const { parseTree } = await import('./tree.mjs');
  const { existsSync: ex, readFileSync: rd } = await import('node:fs');
  const tree = parseTree();

  // 从题包里收集每个节点题目实际用到的术语
  const PACKS = [
    'data\\questions-authoring-v10.jsonl',
  ];
  const usedTerms = new Map();
  let packCount = 0;
  for (const p of PACKS) {
    if (!ex(p)) continue;
    packCount++;
    const qs = rd(p, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
    for (const q of qs) {
      const text = [q.stem, ...(q.options || []), q.explanation || ''].join(' ');
      const terms = extractTerms(text);
      for (const n of q.nodes || []) {
        if (!usedTerms.has(n)) usedTerms.set(n, new Set());
        for (const t of terms) usedTerms.get(n).add(t);
      }
    }
  }

  const r = checkTermDangling(tree.concepts, usedTerms);

  console.log('⚠️  只查字面：词出现过 ≠ 概念被讲过。同义词、改写会漏。');
  console.log('   判据：题目里用到，但本节点 def/misconceptions 和所有前置都没提 → 悬空\n');
  console.log(`题包 ${packCount} 个，带题节点 ${usedTerms.size} 个`);
  console.log(`检查 ${r.checked} 个节点，${r.dangling.length} 个有术语悬空\n`);
  // 2026-11-05 澄清：这个数报错过一次。
  // "35" 是【有悬空的节点数】，不是【悬空术语的条数】。
  // 说成"35 个悬空术语"，会让人以为 79 个节点里总共只漏了 35 个词；
  // 实际是 35 个节点，每个节点各漏若干条（下面明细里逐节点列）。
  console.log(`    ↑ 这是【节点数】不是【术语条数】；悬空术语总条数 = ${r.dangling.reduce((a, d) => a + d.missing.length, 0)}\n`);

  r.dangling.sort((a, b) => b.missing.length - a.missing.length);
  for (const d of r.dangling) {
    console.log(`${d.code} ${d.name}（前置 ${d.prereq.join(', ') || '无'}）`);
    console.log(`   题目用了但没讲过 ${d.missing.length} 个：${d.missing.slice(0, 10).join('、')}${d.missing.length > 10 ? ' …' : ''}`);
  }
}
