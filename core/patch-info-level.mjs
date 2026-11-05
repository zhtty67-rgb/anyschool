// 把 EXPLAIN_JUDGE_NO_SUPPORT 从警告降为信息级
import { readFileSync, writeFileSync } from 'node:fs';

const F = 'data';
let s = readFileSync(F, 'utf8');
const done = [];

// 1) 在该检查处改用 infos 数组
const oldBlock = `        if (!SUPPORT.test(ex)) {
          warnings.push({
            code: 'EXPLAIN_JUDGE_NO_SUPPORT',
            where, id,
            message: '判断题解析只给了结论，没有说明为什么成立或不成立',
          });
        }`;
const newBlock = `        if (!SUPPORT.test(ex)) {
          // 信息级：这条检查已从"抓问题"变成"防退步"。
          // 质量上来后通过率 78/79，但它早期拦下过只复述概念的题，留着兜底。
          // 不进 warnings，避免天天制造噪音。
          infos.push({
            code: 'EXPLAIN_JUDGE_NO_SUPPORT',
            level: 'info',
            where, id,
            message: '判断题解析没识别到论证词，可能漏判，也可能确实只给了结论',
          });
        }`;
if (s.includes(oldBlock)) {
  s = s.replace(oldBlock, newBlock);
  done.push('改为 infos');
} else {
  console.log('未找到检查块，检查是否已改过');
}

// 2) 声明 infos 数组
if (!s.includes('const infos = [];')) {
  s = s.replace('const nodeBasis = {};', 'const nodeBasis = {};\n  const infos = [];               // 信息级提示，不计入警告');
  done.push('声明 infos');
}

// 3) 返回值带上 infos
if (!s.includes('infos,') || !s.includes('return { ok:')) {
  s = s.replace(
    '  return { ok: !failCodes, errors, warnings, stats };',
    '  return { ok: !failCodes, errors, warnings, infos, stats };'
  );
  done.push('返回值');
}

writeFileSync(F, s, 'utf8');
console.log(done.length ? `已改：${done.join('、')}` : '无变化');
