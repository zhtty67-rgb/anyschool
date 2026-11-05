// 把计算题标签检查接进 check-pack.mjs 的信息级输出
import { readFileSync, writeFileSync } from 'node:fs';

const F = 'data';
let s = readFileSync(F, 'utf8');
const done = [];

// 1) 引入
if (!s.includes("from './check-calc-tags.mjs'")) {
  const anchor = "import { grade, parseAnswerKey, isTrueFalseShape } from './grade.mjs';";
  if (s.includes(anchor)) {
    s = s.replace(anchor, anchor + "\nimport { calcTagFindings } from './check-calc-tags.mjs';");
    done.push('import');
  }
}

// 2) 在题目循环结束后、返回值之前，把计算结果并入 infos
if (!s.includes('calcTagFindings(')) {
  const anchor = '  const failCodes = errors.length > 0';
  const idx = s.indexOf(anchor);
  if (idx > 0) {
    const insert = `  // 计算题必须打「计算」标签：盲解对计算题不可靠，将来要机器验算
  const questionList = questions.map(({ q }) => q);
  infos.push(...calcTagFindings(questionList));

`;
    s = s.slice(0, idx) + insert + s.slice(idx);
    done.push('调用');
  }
}

writeFileSync(F, s, 'utf8');
console.log(done.length ? `已改：${done.join('、')}` : '无变化（可能已接好）');
