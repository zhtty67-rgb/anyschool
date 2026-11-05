// 概念题初筛：按 Chief 定的"看选项"判据做机器初筛
//
// 判据来源（Chief 定，2026-11-05）：
//   情境的作用是给判断依据，真正考的是选项在问什么。
//   选项问"X 是什么/属于什么/有哪些" → 概念题，题干再长也算；
//   选项问"哪个做法对/为什么会这样/差别在哪" → 真题。
//
// 这个检查器只做**初筛**：它能用句式把明显的概念题挑出来，
// 但"选项到底在问什么"是语义判断，机器判不了。所以它的输出必须人看。
//
// 用法：node scripts/check-concept-option.mjs <题包.jsonl>
import { readFileSync, existsSync } from 'node:fs';

// 选项在问"是什么"的句式（命中即疑似概念题）
const DEFINITION_OPTION = /(指的是|是指|的含义是|的定义是|基本机制是|基本结构是|基本做法是|核心目标是|核心思想是|核心作用是|主要作用是|主要目的是|作用是|特征是|属于哪一类|属于哪类|属于什么|有哪些|包括哪些|包含哪些|的说法是正确|的说法正确|下列哪个不是)/;

// 选项在问"判断/推理"的句式（命中即倾向真题）
const JUDGMENT_OPTION = /(因为|所以|会导致|原因是|最可能|最直接|说明了|差别在|区别在|不同在于|错在|应该选|更合适|更可能|为什么)/;

/**
 * 对一道题给出概念题初筛判定
 * @returns {{verdict:'concept'|'judgment'|'unclear', hits:string[], stemHasSituation:boolean}}
 */
export function screenConcept(q) {
  const opts = Array.isArray(q?.options) ? q.options.map((o) => String(o)) : [];
  const stem = String(q?.stem || '');
  const hits = opts.filter((o) => DEFINITION_OPTION.test(o));
  const judges = opts.filter((o) => JUDGMENT_OPTION.test(o));

  // 题干里有没有具体情境（只作参考，不作判据）
  const stemHasSituation = /(一个|一位|一只|有人|某人|某训练|训练时|过程中|\d)/.test(stem);

  if (hits.length >= Math.ceil(opts.length / 2)) return { verdict: 'concept', hits, stemHasSituation };
  if (judges.length >= Math.ceil(opts.length / 2)) return { verdict: 'judgment', hits, stemHasSituation };
  return { verdict: 'unclear', hits, stemHasSituation };
}

export function checkConceptOption(questions) {
  const byNode = {};
  for (const q of questions || []) {
    if (!q || !Array.isArray(q.options) || !q.options.length) continue;
    const r = screenConcept(q);
    for (const n of q.nodes || ['?']) {
      byNode[n] = byNode[n] || { total: 0, concept: 0, judgment: 0, unclear: 0, ids: [] };
      byNode[n].total += 1;
      byNode[n][r.verdict] += 1;
      if (r.verdict === 'concept') byNode[n].ids.push(q.id);
    }
  }
  return byNode;
}

// CLI
const invokedDirectly = process.argv[1] && /check-concept-option\.mjs$/.test(process.argv[1]);
if (invokedDirectly) {
  const path = process.argv[2];
  if (!path || !existsSync(path)) { console.error('用法: node scripts/check-concept-option.mjs <题包.jsonl>'); process.exit(2); }
  const qs = readFileSync(path, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
  const r = checkConceptOption(qs);
  console.log(`题包：${path}（${qs.length} 道）`);
  console.log('节点 | 总题 | 初筛概念 | 初筛判断 | 待定 | 非概念底数');
  const nodes = Object.keys(r).sort();
  let tot = 0, con = 0;
  for (const n of nodes) {
    const x = r[n];
    tot += x.total; con += x.concept;
    const nonConcept = x.total - x.concept;
    const flag = nonConcept < 4 ? ' ← 不足4道' : '';
    console.log(`${n} | ${x.total} | ${x.concept} | ${x.judgment} | ${x.unclear} | ${nonConcept}${flag}`);
  }
  console.log(`\n合计 ${tot} 道，初筛为概念题 ${con} 道（${Math.round((con / tot) * 100)}%）`);
  console.log('注意：这是句式初筛，不是定论。选项问"是什么"的直接算概念题，剩下的人看。');
}
