import { readFileSync } from 'node:fs';
const h = readFileSync('data', 'utf8');
const marks = {
  'coming 折叠区': 'class="coming"',
  'peer-purpose': 'peer-purpose',
  'brief-hint': 'brief-hint',
  '想先看看这个概念': '想先看看这个概念',
  '还缺': '还缺',
};
for (const [k, v] of Object.entries(marks)) {
  console.log(`${k}: ${h.split(v).length - 1} 处`);
}
