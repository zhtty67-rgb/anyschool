// 查 Qbank 标注文件里的 stem_hash 是怎么算出来的
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const labels = readFileSync('data\\questions-m09-m11-threeway-v1.jsonl', 'utf8')
  .split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));

const q = labels.find((x) => x.id === 'c0901-01');
const stem = q.stem;
console.log('存的 hash:', q.stem_hash);
console.log('题干全长:', stem.length, '字');
console.log('题干结尾:', JSON.stringify(stem.slice(-30)));
console.log('');

// 试各种算法，看哪个能得出 75850f65
const cands = {
  'md5(原文).slice(8)': createHash('md5').update(stem, 'utf8').digest('hex').slice(0, 8),
  'md5(原文).slice(-8)': createHash('md5').update(stem, 'utf8').digest('hex').slice(-8),
  'md5(去空白).slice(8)': createHash('md5').update(stem.replace(/\s+/g, ''), 'utf8').digest('hex').slice(0, 8),
  'md5(去标点).slice(8)': createHash('md5').update(stem.replace(/[，。、；：？！,.;:?!「」『』（）()“”"\'\s']/g, ''), 'utf8').digest('hex').slice(0, 8),
  'md5(id+stem).slice(8)': createHash('md5').update(q.id + stem, 'utf8').digest('hex').slice(0, 8),
  'sha256(原文).slice(8)': createHash('sha256').update(stem, 'utf8').digest('hex').slice(0, 8),
};
for (const [name, h] of Object.entries(cands)) {
  const mark = h === q.stem_hash ? '  ← 命中' : '';
  console.log(`${name.padEnd(24)} ${h}${mark}`);
}

// 再看所有标注的 hash 是否都与众不同（不是同一算法导致的）
const all = labels.map((x) => ({ id: x.id, h: x.stem_hash, mine: createHash('md5').update(x.stem, 'utf8').digest('hex').slice(0, 8) }));
const sameCount = all.filter((x) => x.h === x.mine).length;
console.log(`\n88 条里，存的 hash 与 md5(原文) 一致的有：${sameCount} 条`);
console.log('不一致的样例：');
all.filter((x) => x.h !== x.mine).slice(0, 3).forEach((x) => console.log(`  ${x.id}  存的 ${x.h}  实际 ${x.mine}`));
