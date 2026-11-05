// 修正 check-batch-fields 的判定：只查自由文本字段，跳过枚举值和占位符
import { readFileSync, writeFileSync } from 'node:fs';

const F = 'data';
let s = readFileSync(F, 'utf8');

// 只查 basis_evidence，且跳过 pre-policy
s = s.replace(
  "const WATCHED = ['basis', 'basis_evidence', 'misconception'];",
  `// 只查"自由文本"字段——必须逐题写的那些。
// 不查 basis / misconception：它们是枚举值或引用值，同节点相同是正常的。
// 不查 pre-policy：那是统一占位符，相同恰恰是对的。
const WATCHED = ['basis_evidence'];
const SKIP_VALUES = new Set(['pre-policy', 'self-authored']);`
);

// 在统计时跳过占位值
s = s.replace(
  "      const vals = list.map((q) => String(q?.[field] ?? '').trim()).filter(Boolean);",
  "      const vals = list\n        .map((q) => String(q?.[field] ?? '').trim())\n        .filter((v) => v && !SKIP_VALUES.has(v));"
);

writeFileSync(F, s, 'utf8');
console.log('已修正判定范围');
