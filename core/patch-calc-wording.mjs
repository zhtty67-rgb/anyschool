// 改检查文案：从"看起来是计算题"改成"候选，请人工确认"
import { readFileSync, writeFileSync } from 'node:fs';

const F = 'data';
let s = readFileSync(F, 'utf8');

const before = '看起来是计算题但没打「计算」标签：${m.stem}';
const after = '题干有数字但没打「计算」标签，请人工确认是不是计算题：${m.stem}';

if (s.includes(before)) {
  s = s.replace(before, after);
  writeFileSync(F, s, 'utf8');
  console.log('已改文案');
} else if (s.includes(after)) {
  console.log('已是新文案');
} else {
  console.log('找不到目标文案，看实际内容：');
  const m = s.match(/code: 'CALC_TAG_MISSING'[\s\S]{0,200}/);
  if (m) console.log(m[0]);
}
