// 验证 questions_shipped 校验真的会拦人
// 故意把 published.json 的 questions_shipped 改成错的值，看构建是否 exit 6。
// 只在临时副本上做，不碰真的 published.json。
import { readFileSync, writeFileSync, copyFileSync, unlinkSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const PUB = 'data';
const BAK = 'data';

if (existsSync(BAK)) unlinkSync(BAK);
copyFileSync(PUB, BAK);

function runBuild() {
  try {
    const out = execFileSync('node', ['build.mjs', '--strict'], {
      cwd: 'data',
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: (e.stdout || '') + (e.stderr || '') };
  }
}

try {
  // ① 把 questions_shipped 改成错的值（531 → 520）
  const j = JSON.parse(readFileSync(BAK, 'utf8'));
  j.questions_shipped = 520;
  writeFileSync(PUB, JSON.stringify(j, null, 2) + '\n', 'utf8');

  const bad = runBuild();
  const caught = bad.code === 6 && bad.out.includes('questions_shipped');
  console.log((caught ? '✔' : '✘') + ' 写错的 questions_shipped 被拦住（exit=' + bad.code + '）');
  if (bad.out.includes('实际会发')) {
    const line = bad.out.split(/\r?\n/).find((l) => l.includes('实际会发'));
    console.log('   拦下的理由：' + line.trim());
  }

  // ② 恢复正确值，确认能正常构建
  writeFileSync(PUB, readFileSync(BAK, 'utf8'), 'utf8');
  const good = runBuild();
  const pass = good.code === 0;
  console.log((pass ? '✔' : '✘') + ' 恢复正确值后构建通过（exit=' + good.code + '）');

  process.exit(caught && pass ? 0 : 1);
} finally {
  // 无论成败都恢复原文件
  if (existsSync(BAK)) {
    writeFileSync(PUB, readFileSync(BAK, 'utf8'), 'utf8');
    unlinkSync(BAK);
  }
}
