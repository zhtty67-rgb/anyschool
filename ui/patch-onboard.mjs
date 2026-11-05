// 把首次使用引导接进 render.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const F = 'data';
let src = readFileSync(F, 'utf8');

// 1. 引入
if (!src.includes("from './onboarding.mjs'")) {
  src = src.replace(
    "import { briefFor } from './node-details.mjs';",
    "import { briefFor } from './node-details.mjs';\nimport { renderOnboarding, pickStartNode, ONBOARD_CSS, FIRST_VISIT_KEY } from './onboarding.mjs';"
  );
  console.log('已引入 onboarding');
}

// 2. 快照里带上起点节点与统计
if (!src.includes('startNode:')) {
  const anchor = 'briefs: Object.fromEntries(';
  const idx = src.indexOf(anchor);
  if (idx > 0) {
    // 在 briefs 之后插入
    const endOfBriefs = src.indexOf(')),', idx);
    if (endOfBriefs > 0) {
      const insertAt = endOfBriefs + 3;
      const add = `\n    // 首次使用的起点：按先修顺序挑第一个可做的节点\n    startNode: (function () {\n      const covered = new Set(snap_questionsForOnboard(questions));\n      const s = pickStartNode(tree, [...covered]);\n      return s ? { code: s.code, name: s.name } : null;\n    })(),\n    stats: { questions: questions.length, nodesWithQuestions: new Set(questions.flatMap((q) => q.nodes || [])).size },`;
      src = src.slice(0, insertAt) + add + src.slice(insertAt);
      console.log('已加快照字段');
    }
  }
}

writeFileSync(F, src, 'utf8');
console.log('写回完成');
