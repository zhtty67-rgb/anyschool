// 计算题标签 ↔ formula ↔ 场景题 三者一致性检查
//
// Chief 2026-11-04 定的三条规则（都可机检，不靠自觉）：
//   1. 有「计算」标签 → 必须有 formula
//   2. 有 formula     → 必须有「计算」标签
//   3. 标了 scenario  → 不许再挂「计算」标签
//
// 场景题必须用 type: "scenario" 声明，不能靠口头自称——
// 否则任何难验算的题都能自称"场景题"逃过验算，规则就形同虚设。
//
// 另外统计场景题数量：场景题太多，说明题目在绕开验算，要停下来审视。
import { readFileSync } from 'node:fs';

const CALC_TAG = '计算';
const SCENARIO_TYPE = 'scenario';

function tagsOf(q) {
  return Array.isArray(q?.tags) ? q.tags : [];
}

/**
 * 检查整个题包的标签一致性。
 * @returns {{violations:Array, stats:Object}}
 */
export function checkCalcFormulaConsistency(questions) {
  const violations = [];
  const stats = {
    total: 0,
    calcTag: 0,        // 打了「计算」标签的
    withFormula: 0,    // 带 formula 的
    both: 0,           // 两者都有
    neither: 0,        // 两者都无
    scenario: 0,       // 声明为场景题的
  };

  for (const q of questions || []) {
    if (!q || typeof q !== 'object') continue;
    stats.total += 1;
    const tags = tagsOf(q);
    const hasCalc = tags.includes(CALC_TAG);
    const hasFormula = !!(q.formula && String(q.formula).trim());
    const isScenario = q.type === SCENARIO_TYPE;

    if (hasCalc) stats.calcTag += 1;
    if (hasFormula) stats.withFormula += 1;
    if (hasCalc && hasFormula) stats.both += 1;
    if (!hasCalc && !hasFormula) stats.neither += 1;
    if (isScenario) stats.scenario += 1;

    // 规则 1：有标签没公式
    if (hasCalc && !hasFormula) {
      violations.push({
        id: q.id,
        rule: 'CALC_NO_FORMULA',
        message: '打了「计算」标签但没有 formula，无法机器验算',
      });
    }

    // 规则 2：有公式没标签
    if (hasFormula && !hasCalc) {
      violations.push({
        id: q.id,
        rule: 'FORMULA_NO_CALC',
        message: '有 formula 但没打「计算」标签，验算时会被漏掉',
      });
    }

    // 规则 3：场景题不许挂计算标签
    if (isScenario && hasCalc) {
      violations.push({
        id: q.id,
        rule: 'SCENARIO_HAS_CALC',
        message: '声明为场景题（type: scenario）却仍挂着「计算」标签',
      });
    }

    // 规则 4：场景题也不该有 formula
    if (isScenario && hasFormula) {
      violations.push({
        id: q.id,
        rule: 'SCENARIO_HAS_FORMULA',
        message: '场景题不该有 formula（它不需要单条公式验算）',
      });
    }
  }

  // 场景题占比预警：超过 15% 说明在绕开验算
  stats.scenarioRatio = stats.total ? Number((stats.scenario / stats.total).toFixed(3)) : 0;
  stats.warnScenarioTooMany = stats.scenarioRatio > 0.15 && stats.scenario >= 10;

  return { violations, stats };
}

/** 接进 checkPack 时用的警告列表 */
export function calcConsistencyFindings(questions) {
  const { violations, stats } = checkCalcFormulaConsistency(questions);
  const out = violations.map((v) => ({
    code: v.rule,
    where: '',
    id: v.id,
    message: v.message,
  }));
  if (stats.warnScenarioTooMany) {
    out.push({
      code: 'SCENARIO_TOO_MANY',
      id: '全卷',
      message: `场景题 ${stats.scenario} 道，占 ${Math.round(stats.scenarioRatio * 100)}%，偏高——可能是在绕开机器验算，建议审视`,
    });
  }
  return out;
}

// CLI
const invokedDirectly = process.argv[1] && /check-calc-consistency\.mjs$/.test(process.argv[1]);
if (invokedDirectly) {
  const path = process.argv[2];
  if (!path) {
    console.error('用法: node core/check-calc-consistency.mjs <题包.jsonl>');
    process.exit(2);
  }
  const qs = readFileSync(path, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
  const { violations, stats } = checkCalcFormulaConsistency(qs);
  console.log(`题包：${path}`);
  console.log(`总题数 ${stats.total}`);
  console.log(`  带「计算」标签：${stats.calcTag}`);
  console.log(`  带 formula：${stats.withFormula}`);
  console.log(`  两者都有：${stats.both}`);
  console.log(`  两者都无：${stats.neither}`);
  console.log(`  场景题：${stats.scenario}（${Math.round(stats.scenarioRatio * 100)}%）`);
  console.log(`\n违规 ${violations.length} 处：`);
  for (const v of violations) console.log(`  ${v.id}  [${v.rule}]  ${v.message}`);
  if (stats.warnScenarioTooMany) console.log('\n⚠ 场景题偏多，可能绕开验算');
  process.exitCode = violations.length ? 1 : 0;
}
