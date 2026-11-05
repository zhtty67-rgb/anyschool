// 归档前基线：记下发布版的关键指标，归档后比对"归档不应产生任何界面变化"
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { loadQuestions, readPublished } from '../core/qbook.mjs';
import { checkPack } from '../core/check-pack.mjs';

const OUT = 'data';

const pub = readPublished();
const r = loadQuestions();
const check = checkPack(pub.path);

// dist 现状
const dist = readFileSync('data');

const baseline = {
  at: new Date().toISOString(),
  published: { version: pub.version, file: pub.file, path: pub.path },
  loaded: {
    path: r.path,
    total: r.total,
    sha256: createHash('sha256').update(readFileSync(pub.path)).digest('hex'),
  },
  check: { errors: check.errors.length, warnings: check.warnings.length, total: check.stats.total },
  dist: {
    sha256: createHash('sha256').update(dist).digest('hex'),
    size: dist.length,
  },
};

writeFileSync(OUT, JSON.stringify(baseline, null, 2), 'utf8');

console.log('归档前基线已记录：');
console.log(`  发布版：${baseline.published.version} → ${baseline.published.file}`);
console.log(`  实际加载：${baseline.loaded.total} 道`);
console.log(`  题包哈希：${baseline.loaded.sha256.slice(0, 16)}`);
console.log(`  检查：${baseline.check.errors} 错误 ${baseline.check.warnings} 警告`);
console.log(`  dist：${(baseline.dist.size / 1024).toFixed(1)} KB，哈希 ${baseline.dist.sha256.slice(0, 16)}`);
console.log(`\n写入：${OUT}`);
