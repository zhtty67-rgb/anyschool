// 列出 outputs/ 全部文件，按归档方案分类
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'data';
const files = readdirSync(DIR)
  .filter((f) => f.endsWith('.jsonl'))
  .map((f) => ({ name: f, size: statSync(join(DIR, f)).size, mtime: statSync(join(DIR, f)).mtime }))
  .sort((a, b) => a.name.localeCompare(b.name));

const classify = (name) => {
  const m = /^questions-authoring-v(\d+)\.jsonl$/.exec(name);
  if (m) {
    const v = Number(m[1]);
    if (v === 8) return '【保留】发布版，published.json 指向它';
    if (v === 9) return '【保留】待定版，B2 决定后可能上线';
    return '【归档】中间态，移到 archive/';
  }
  if (name === 'questions-fill-12-v1.jsonl') return '【改名】→ questions-ai-m02-m03-fill-v1.jsonl';
  if (/^questions-ai-m\d+-/.test(name)) return '【保留】Qbank 单批题包，符合新命名规则';
  return '【待定】命名不符新规则，需人工判断';
};

const groups = {};
for (const f of files) {
  const c = classify(f.name);
  (groups[c] ||= []).push(f);
}

console.log(`outputs/ 下共 ${files.length} 个 jsonl 文件\n`);
for (const [label, list] of Object.entries(groups)) {
  console.log(`== ${label}（${list.length} 个）==`);
  for (const f of list) {
    console.log(`  ${f.name}  ${(f.size / 1024).toFixed(1)} KB`);
  }
  console.log('');
}

// 归档后仍在根目录的，就是没被动过的
const moving = files.filter((f) => {
  const m = /^questions-authoring-v(\d+)\.jsonl$/.exec(f.name);
  return (m && ![8, 9].includes(Number(m[1]))) || f.name === 'questions-fill-12-v1.jsonl';
});
console.log(`将移动/改名：${moving.length} 个`);
console.log(`移动后根目录剩：${files.length - moving.length} 个`);
