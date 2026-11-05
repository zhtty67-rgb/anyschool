// 出处合规检查 —— 把 Chief 的来源规定变成可自动执行的规则
//
// 规定（2026-11-04 Chief）：
//   1. 白名单：d2l-zh（Apache-2.0）、MMLU（MIT）
//   2. 黑名单：李宏毅 leedl-tutorial、CMMLU、MMLU-Pro、AGIEval、AI训练师题库（均禁商用或无真解析）
//   3. E:\AI教学资料 的 PDF 只能用来理解知识点，不能直接抄题 → 标 self-authored
//   4. 每道题必须标 basis；查不到出处 → self-authored + needs_review 注明"无出处"
//
// 这条检查不判断题目内容对不对，只判断"出处声明合不合规"。

import { readFileSync, existsSync } from 'node:fs';

/** 已排除的源：出现在 basis 或 tags 里就是违规 */
export const BANNED_SOURCES = [
  { key: 'leedl', patterns: [/leedl/i, /李宏毅/, /李宏-毅/], why: 'CC BY-NC-SA 4.0，禁商用' },
  { key: 'CMMLU', patterns: [/cmmlu/i], why: 'CC BY-NC-SA 4.0，禁商用' },
  { key: 'MMLU-Pro', patterns: [/mmlu-?pro/i], why: '无真解析' },
  { key: 'AGIEval', patterns: [/agieval/i], why: '无真解析' },
  { key: 'AI训练师', patterns: [/ai.?trainer/i, /AI训练师/, /ait-/], why: '作者明文禁商用，著作权存疑' },
];

/** 允许的源 */
export const ALLOWED_SOURCES = [
  { key: 'd2l-zh', pattern: /^d2l-zh(\s|$)/i, license: 'Apache-2.0' },
  { key: 'MMLU', pattern: /^mmlu/i, license: 'MIT' },
  { key: 'self-authored', pattern: /^(self-authored|自写|原创)$/i, license: '自产' },
];

/** 老批次来源标识：这些 source 出的题在 basis_evidence 成为强制要求之前 */
export const LEGACY_SOURCES = new Set([
  'authored-stage12',
  'authored-m02',
  'questions-authoring-stage12-v1',
  'questions-ai-m02-v1',
  'questions-ai-m02-fill-v1',
  'questions-ai-m03-v1',
  'questions-ai-m04-v1',
  'questions-ai-m05-v1',
  'questions-ai-m09-sample-v1',
  // 旧名：文件已改名成 questions-ai-m02-m03-fill-v1，但 source 字段里还是旧值，
  // 这批是 m01/m02/m03 的补齐题，同样属于 basis_evidence 规矩之前
  'questions-fill-12-v1',
]);

/** 老题的 basis_evidence 占位值：表示"规矩定下来之前出的题" */
export const PRE_POLICY = 'pre-policy';

/**
 * basis_evidence 的值合法性检查（Qbank 2026-11-04 提的解法，比按 source 判新老更稳）
 *
 * 核心：不判断新题老题，只判断"这个值有没有证据力"。
 * 因为 source 是出题人能自己填的，任何基于 source 的判定都能被绕过。
 *
 * 合法值只有两种：
 *   1. 'pre-policy' —— 明确声明"本字段成为要求之前的老题"
 *   2. 一句可核对的描述 —— 长度 ≥ 20 且含数字（章节号或页码）
 *      模糊的"参考 4.4 章"这种含数字但不具体？—— 只要有章节号就算过，
 *      但会额外提示"建议写到具体表述"
 *
 * 其他一律判无效。
 */
export function checkEvidenceValue(q) {
  const ev = q?.basis_evidence == null ? '' : String(q.basis_evidence).trim();

  if (!ev) {
    return { valid: false, code: 'EVIDENCE_EMPTY', message: 'basis_evidence 为空' };
  }
  if (ev === PRE_POLICY) {
    return { valid: true, kind: 'pre-policy' };
  }
  // 可核对描述：至少 20 字，且含数字（章节号/页码/公式编号）
  if (ev.length < 20) {
    return {
      valid: false,
      code: 'EVIDENCE_TOO_SHORT',
      message: `basis_evidence 只有 ${ev.length} 字，不足 20 字，写不出可核对的出处`,
    };
  }
  if (!/\d/.test(ev)) {
    return {
      valid: false,
      code: 'EVIDENCE_NO_NUMBER',
      message: 'basis_evidence 里没有任何数字（章节号 / 页码），无法定位到教材哪一处',
    };
  }
  // 只写了章节号但没写讲了什么，给提示不判错
  if (/^(参[考照]|见)\s*[\d.]+(\s*章)?$/.test(ev)) {
    return { valid: true, kind: 'vague', note: '只写了章节号，建议补一句"那一节讲了什么"' };
  }
  return { valid: true, kind: 'detailed' };
}

/**
 * 整包检查 basis_evidence 值合法性（不看 source，只看值本身）。
 */
export function auditEvidenceValues(questions) {
  const errors = [];
  const notes = [];
  const kinds = { 'pre-policy': 0, vague: 0, detailed: 0 };

  for (const q of questions || []) {
    const r = checkEvidenceValue(q);
    if (!r.valid) {
      errors.push({ id: q.id, code: r.code, message: r.message });
    } else {
      kinds[r.kind] = (kinds[r.kind] || 0) + 1;
      if (r.note) notes.push({ id: q.id, message: r.note });
    }
  }

  return { errors, notes, kinds, total: (questions || []).length };
}

/**
 * basis_evidence 分级检查（旧版，按 source 判新老——保留给需要区分批次的场景）
 *
 * 注意：Qbank 指出按 source 判有漏洞（source 可自填），
 * 主检查应改用 auditEvidenceValues()，这个函数只作辅助统计。
 */
export function checkBasisEvidence(questions) {
  const errors = [];
  const infos = [];
  let legacy = 0;
  let legacyNoEvidence = 0;
  let fresh = 0;
  let freshOk = 0;

  for (const q of questions || []) {
    const src = String(q?.source || '');
    const ev = q?.basis_evidence == null ? '' : String(q.basis_evidence).trim();
    const isLegacy = LEGACY_SOURCES.has(src) || /stage12|m0[1-5]|m09/i.test(src);

    if (isLegacy) {
      legacy += 1;
      if (!ev || ev === PRE_POLICY) legacyNoEvidence += 1;
      continue;
    }

    fresh += 1;
    if (!ev) {
      errors.push({ code: 'BASIS_EVIDENCE_MISSING', id: q.id, message: `新批次（source=${src || '未标'}）缺 basis_evidence` });
    } else if (ev === PRE_POLICY) {
      errors.push({
        code: 'BASIS_EVIDENCE_PREPOLICY_IN_NEW',
        id: q.id,
        message: `basis_evidence 填了 pre-policy，但这个 source（${src || '未标'}）不是老批次——pre-policy 只能用于规矩定下来之前的题`,
      });
    } else if (ev.length < 15) {
      infos.push({ code: 'BASIS_EVIDENCE_SHORT', id: q.id, message: `basis_evidence 只写了 ${ev.length} 字，可能没到具体表述级` });
    } else {
      freshOk += 1;
    }
  }

  return {
    errors,
    infos,
    stats: { legacy, legacyNoEvidence, fresh, freshOk },
  };
}

/**
 * 检查一道题的出处声明。
 *
 * 两个字段回答两个不同问题（Chief 2026-11-04 定）：
 *   basis      → 依据哪个教材（d2l-zh X.Y / MMLU / self-authored）
 *   provenance → 有没有外部来源（original = 我们原创无外部出处 / pdf / d2l / mmlu）
 *
 * @returns {{ok:boolean, problems:string[]}}
 */
export function checkProvenance(q) {
  const problems = [];
  const basis = String(q?.basis || '').trim();
  const prov = q?.provenance == null ? null : String(q.provenance).trim();
  const tags = Array.isArray(q?.tags) ? q.tags : [];
  const haystack = [basis, prov || '', ...tags, String(q?.id || '')].join(' ');

  // 1. 黑名单命中 → 违规
  for (const b of BANNED_SOURCES) {
    if (b.patterns.some((p) => p.test(haystack))) {
      problems.push(`命中了已排除的源「${b.key}」：${b.why}`);
    }
  }

  // 2. basis 必须落在白名单里
  if (!basis) {
    problems.push('没有 basis 字段');
  } else if (!ALLOWED_SOURCES.some((a) => a.pattern.test(basis))) {
    problems.push(`basis「${basis}」不在白名单内（只接受 d2l-zh X.Y / MMLU / self-authored）`);
  }

  // 3. d2l-zh 必须带章节号，不许只写 "d2l-zh"
  if (/^d2l-zh/i.test(basis) && !/^d2l-zh\s+\d+(\.\d+)*/.test(basis)) {
    problems.push(`basis「${basis}」缺章节号，必须写成 "d2l-zh 4.4 模型选择" 这种`);
  }

  // 4. provenance 若存在，值必须合法
  const VALID_PROV = ['original', 'd2l-zh', 'mmlu', 'pdf'];
  if (prov !== null && prov !== '' && !VALID_PROV.includes(prov)) {
    problems.push(`provenance「${prov}」非法，只接受 ${VALID_PROV.join(' / ')}`);
  }

  // 5. 语义一致性：self-authored 应配 provenance=original（或未填，过渡期放行）
  if (/^self-authored$/i.test(basis) && prov && prov !== 'original' && prov !== 'pdf') {
    problems.push(`basis 是 self-authored，provenance 却是「${prov}」，语义冲突`);
  }

  return { ok: problems.length === 0, problems };
}

/** 整包检查 */
export function auditPack(questions) {
  const violations = [];
  for (const q of questions || []) {
    const r = checkProvenance(q);
    if (!r.ok) violations.push({ id: q.id, problems: r.problems });
  }
  return {
    total: questions.length,
    violationCount: violations.length,
    violations,
  };
}

// CLI
const invokedDirectly = process.argv[1] && /check-provenance\.mjs$/.test(process.argv[1]);
if (invokedDirectly) {
  const path = process.argv[2];
  if (!path) {
    console.error('用法: node core/check-provenance.mjs <题包.jsonl>');
    process.exit(2);
  }
  const qs = readFileSync(path, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
  const r = auditPack(qs);
  console.log(`题包：${path}`);
  console.log(`总题数 ${r.total}，出处违规 ${r.violationCount} 道`);
  for (const v of r.violations.slice(0, 25)) {
    console.log(`  ${v.id}: ${v.problems.join('；')}`);
  }
  if (r.violationCount > 25) console.log(`  …还有 ${r.violationCount - 25} 道`);
  process.exitCode = r.violationCount ? 1 : 0;
}
