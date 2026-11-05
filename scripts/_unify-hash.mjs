// 把 4 份 stemHash 副本统一改为引用 core/stem-hash.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const TARGETS = [
  'data',
  'data',
  'data',
  'data',
];

// 匹配 export function stemHash(...) {...} 或 function stemHash(...) {...}
const RE = /(?:export\s+)?function stemHash\(stem\)\s*\{[\s\S]*?\n\}/;

for (const p of TARGETS) {
  let src = readFileSync(p, 'utf8');
  if (!RE.test(src)) { console.log(`跳过（未匹配）: ${p}`); continue; }

  // 判断原来的是否 export
  const wasExport = /export\s+function stemHash/.test(src);
  src = src.replace(RE, wasExport
    ? "export { stemHash } from '../core/stem-hash.mjs';"
    : "import { stemHash } from '../core/stem-hash.mjs';");

  // 如果原来用 createHash 且现在不再需要，清理该 import（保留其他用法）
  if (!/createHash\(/.test(src.replace(/import[^;]+;/g, ''))) {
    src = src.replace(/import\s*\{\s*createHash\s*\}\s*from\s*'node:crypto';\s*\r?\n/, '');
  }
  writeFileSync(p, src, 'utf8');
  console.log(`已改：${p.split('\\').pop()}  (export=${wasExport})`);
}
