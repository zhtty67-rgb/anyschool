// 给检查器加同质化两条规则：题型配比、计算型节点必须有计算题
import { readFileSync, writeFileSync } from 'node:fs';

const F = 'data';
let src = readFileSync(F, 'utf8');

if (src.includes('checkHomogeneity')) {
  console.log('已经加过了，跳过');
  process.exit(0);
}

const anchor = '/** d2l-zh 里有正章的节点，用于"该用教材却没用"检查 */';
if (!src.includes(anchor)) {
  console.error('找不到插入锚点');
  process.exit(1);
}

const block = `/**
 * 同质化检查 —— 题量上去后最大的风险是换汤不换药。
 *   1. 题型配比：节点下判断题占比低于阈值时提示
 *   2. 有计算属性的节点，一道计算题都没有时提示
 * 都是提示不是错误：概念性质不同，配比本来就该有差异。
 */
export function checkHomogeneity(result, opts = {}) {
  const minJudgeRatio = opts.minJudgeRatio ?? 0.25;
  const minCount = opts.minCount ?? 6;
  const nodeMix = result?.stats?.nodeMix || {};
  const out = [];
  for (const [code, mix] of Object.entries(nodeMix)) {
    if (mix.total < minCount) continue;
    const judgeRatio = mix.judge / mix.total;
    if (judgeRatio < minJudgeRatio) {
      out.push({
        code: 'HOMOGENEITY_JUDGE_RATIO',
        node: code,
        message: \`\${code} 下 \${mix.total} 道题里判断题只有 \${mix.judge} 道（\${Math.round(judgeRatio * 100)}%），低于 \${Math.round(minJudgeRatio * 100)}%\`,
      });
    }
    if (CALC_NODES.has(code) && !(mix.calc > 0)) {
      out.push({
        code: 'HOMOGENEITY_NO_CALC',
        node: code,
        message: \`\${code} 有可算的公式，但 \${mix.total} 道题里一道计算题都没有\`,
      });
    }
  }
  return out;
}

/** 有可算内容的节点，按概念属性人工标定；新增节点时补上 */
export const CALC_NODES = new Set([
  'c0301', 'c0302', 'c0304',
  'c0401', 'c0402', 'c0403', 'c0404', 'c0405',
  'c0903',
]);

`;

src = src.replace(anchor, block + anchor);
writeFileSync(F, src, 'utf8');
console.log('已插入 checkHomogeneity 与 CALC_NODES');
