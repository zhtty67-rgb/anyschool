// 计算题标记检查 —— 帮 Qbank 落实 Chief 的第 6 条要求
//
// 背景：盲解对计算题不可靠（44.4% 出错），以后要机器验算。
// 所以计算题必须在 tags 里带「计算」，否则将来筛不出来、也没法批量验算。
//
// 判定「是不是计算题」不用 tags（正在查的就是它），而是看题干里有没有可算的东西：
//   · 带了具体数值 + 要求算结果（多少 / 等于 / 尺寸 / 输出 / 参数）
import { readFileSync } from 'node:fs';

const CAP = 0;

/**
 * 判断一道题是否属于"计算题"（按题干特征，不依赖 tags）
 *
 * 判据演进记录：
 *   第一版只认中文描述（权重/输入值/维度），漏掉了用数学记号写的题
 *   —— Q(s,a)=10、y = 2x + 1、γ=0.5、α=0.5、奖励 5、5、5 这类，
 *   全是真计算题但一个都认不出。现在补上"数学记号"这一路。
 */
export function looksNumeric(q) {
  const stem = String(q?.stem || '');
  if (!/\d/.test(stem)) return false;

  // 场景题不是计算题：题干里的数字多在描述情境（如"两个感知机，权重 (1,1)、偏置 −0.5"），
  // 问的是推理结论而不是算出一个数。而且规则本身规定场景题不许挂「计算」标签，
  // 所以这里必须排除——否则会出现"场景题被判成缺计算标签"的自相矛盾告警。
  // （v9 上 c0401-12 就是这么被误报的）
  const tags = Array.isArray(q?.tags) ? q.tags : [];
  if (tags.includes('场景') || q?.type === 'scenario') return false;

  // A. 中文描述型参数
  const cnParams =
    /(权重|偏置|输入值|取值|维度|通道|卷积核|填充|步幅|学习率|折扣因子|奖励|目标值)/.test(stem);

  // B. 数学记号型参数：赋值、坐标、乘式、函数记号、希腊字母、数列
  const mathParams =
    /(\d+\s*[×xX]\s*\d+|-?\d+\s*=\s*-?\d|[(（]\s*-?\d+\s*[,，]\s*-?\d+\s*[)）]|[A-Za-z]\s*\(\s*[a-z]\s*[,，]\s*[a-z]\s*\)|[α-ωΑ-Ω]\s*=|(\d+\s*[、,，]\s*)+\d+|=\s*-?\d+[a-zA-Z]?(\s*[+-]\s*\d+)?)/.test(stem);

  if (!cnParams && !mathParams) return false;

  // 要求给出结果
  return /(多少|等于|尺寸|输出|参数|概率|约|计算|算出|求|结果|判定|哪个|是否|变成|梯度|是：|是:)/.test(stem);
}

/**
 * 检查计算题有没有打「计算」标签。
 * @param {Array} questions
 * @returns {{missing: Array, tagged: number, numericTotal: number}}
 */
export function checkCalcTags(questions) {
  const missing = [];
  let tagged = 0;
  let numericTotal = 0;
  for (const q of questions || []) {
    if (!looksNumeric(q)) continue;
    numericTotal += 1;
    const tags = Array.isArray(q.tags) ? q.tags : [];
    if (tags.includes('计算')) tagged += 1;
    else missing.push({ id: q.id, stem: String(q.stem).slice(0, 50) });
  }
  return { missing, tagged, numericTotal };
}

/** 接进 checkPack 的返回值用 */
export function calcTagFindings(questions) {
  const r = checkCalcTags(questions);
  return r.missing.map((m) => ({
    code: 'CALC_TAG_MISSING',
    level: 'info',
    id: m.id,
    message: `题干有数字但没打「计算」标签，请人工确认是不是计算题：${m.stem}`,
  }));
}

// CLI
const invokedDirectly = process.argv[1] && /check-calc-tags\.mjs$/.test(process.argv[1]);
if (invokedDirectly) {
  const path = process.argv[2];
  if (!path) {
    console.error('用法: node core/check-calc-tags.mjs <题包.jsonl>');
    process.exit(2);
  }
  const qs = readFileSync(path, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
  const r = checkCalcTags(qs);
  console.log(`题包：${path}`);
  console.log(`看起来是计算题的：${r.numericTotal} 道`);
  console.log(`已打「计算」标签：${r.tagged} 道`);
  console.log(`缺标签：${r.missing.length} 道`);
  for (const m of r.missing.slice(0, 20)) console.log(`  ${m.id}  ${m.stem}`);
  if (r.missing.length > 20) console.log(`  …还有 ${r.missing.length - 20} 道`);
}
