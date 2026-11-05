// 校验 dist/index.html 的每个内联 <script> 语法
import { readFileSync } from 'node:fs';

const path = process.argv[2] || 'data';
const html = readFileSync(path, 'utf8');
const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
let m, i = 0, bad = 0;
while ((m = re.exec(html))) {
  i++;
  const attrs = m[1].trim();
  const code = m[2];
  if (/\bsrc\s*=/.test(attrs)) { console.log(`script#${i} 外部引用: ${attrs}`); continue; }
  try {
    new Function(code);
    console.log(`script#${i} OK  ${code.length} 字符`);
  } catch (e) {
    bad++;
    console.log(`script#${i} 语法错误: ${e.message}`);
  }
}
console.log(`共 ${i} 个 script，错误 ${bad} 个`);
process.exit(bad ? 1 : 0);
