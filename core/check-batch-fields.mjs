// 字段批量填写检查 —— 规则已封死（Chief 2026-11-04 定案）
//
// 起因：这轮两次被同一个毛病绊倒——
//   · basis 按节点整批标注（Qbank 承认三次）
//   · basis_evidence 按节点复制同一模板（m05 五个节点 48 道）
//
// 最终规则只有两条：
//
//   【错误级】文字去重
//     同一节点下，basis_evidence 全文完全相同的条数 > 题数 30% → 报错
//     整批复制时文字必然完全相同，一抓即中。
//     它拦不住"改几个字的假证据"——那已到规则能做的极限，只能靠人看。
//
//   【信息级】章节号种类
//     只提示"这批题集中在一小节"，不作为问题。
//     12 道题都出自同一节是客观事实，不是错误。
//     已知局限：c0501 写"d2l-zh 引言"没有 X.Y 数字会识别成 0 种；
//               c0504 里丢弃率 0.5 会被误当成章节号。都不影响判定。
//
// 明确废弃的规则（不要再实现）：
//   · "含数字 + ≥20 字就算真证据" —— 模板字符串能直接通过，Qbank 提过、自己推翻
//   · "章节号种类 < 题数一半就报" —— m05 全部误报，Chief 已否
//   · 按 source 判断新题老题 —— source 可自填，白名单黑名单都能绕

import { readFileSync } from 'node:fs';

const PRE_POLICY = 'pre-policy';
const DUP_THRESHOLD = 0.3;
const MIN_SAMPLES = 3;

/** 从一段文字里抽章节号，如 "d2l-zh 4.6.3" → "4.6.3" */
export function extractSections(text) {
  const out = new Set();
  const s = String(text || '');
  const re = /\b(\d+(?:\.\d+){1,3})\b/g;
  let m;
  while ((m = re.exec(s))) out.add(m[1]);
  return out;
}

/**
 * 检查整包。
 * @returns {{errors:Array, infos:Array}}
 */
export function auditBatchFields(questions) {
  const byNode = new Map();
  for (const q of questions || []) {
    const nodes = Array.isArray(q?.nodes) ? q.nodes : [];
    for (const n of nodes) {
      if (!byNode.has(n)) byNode.set(n, []);
      byNode.get(n).push(q);
    }
  }

  const errors = [];
  const infos = [];

  for (const [node, list] of byNode) {
    if (list.length < MIN_SAMPLES) continue;

    // 只看真证据；pre-policy 是统一占位符，相同是正确的
    const withEv = list.filter((q) => {
      const ev = String(q?.basis_evidence || '').trim();
      return ev && ev !== PRE_POLICY;
    });
    if (withEv.length < MIN_SAMPLES) continue;

    // ── 错误级：文字去重 ──
    const counts = new Map();
    for (const q of withEv) {
      const ev = String(q.basis_evidence).trim();
      counts.set(ev, (counts.get(ev) || 0) + 1);
    }
    let dupExtra = 0;
    let worst = null;
    for (const [ev, n] of counts) {
      if (n > 1) {
        dupExtra += n - 1;
        if (!worst || n > worst.n) worst = { ev, n };
      }
    }
    const dupRatio = dupExtra / withEv.length;
    if (dupRatio > DUP_THRESHOLD) {
      errors.push({
        code: 'EVIDENCE_BATCH_COPIED',
        node,
        message:
          `${node} 下 ${withEv.length} 道题有证据，其中 ${dupExtra} 条是重复的` +
          `（${Math.round(dupRatio * 100)}%，上限 30%）` +
          (worst ? `；最重复的一条用了 ${worst.n} 次：「${String(worst.ev).slice(0, 36)}…」` : ''),
      });
    }

    // ── 信息级：章节号种类 ──
    const sections = new Set();
    for (const q of withEv) {
      for (const s of extractSections(q.basis_evidence)) sections.add(s);
    }
    const fewSections = sections.size <= Math.max(1, Math.floor(withEv.length / 4));
    if (fewSections) {
      infos.push({
        code: 'EVIDENCE_ONE_SECTION',
        node,
        message: `${node} 下 ${withEv.length} 道题的证据集中在 ${sections.size} 个章节号上——正常现象，仅提示`,
      });
    }
  }

  return { errors, infos };
}

// CLI
const invokedDirectly = process.argv[1] && /check-batch-fields\.mjs$/.test(process.argv[1]);
if (invokedDirectly) {
  const path = process.argv[2];
  if (!path) {
    console.error('用法: node core/check-batch-fields.mjs <题包.jsonl>');
    process.exit(2);
  }
  const qs = readFileSync(path, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
  const { errors, infos } = auditBatchFields(qs);
  console.log(`题包：${path}`);
  console.log(`错误 ${errors.length} 条，信息 ${infos.length} 条\n`);
  for (const e of errors) console.log(`  [错误] ${e.message}`);
  for (const i of infos) console.log(`  [信息] ${i.message}`);
  process.exitCode = errors.length ? 1 : 0;
}
