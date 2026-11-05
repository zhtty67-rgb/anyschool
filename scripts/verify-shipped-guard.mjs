// questions_shipped 校验的注入验证（干净版）
// 目的：证明这条校验确实会拦住错误，而不是只写了一行代码。
// 做法：备份 published.json → 改成错值 → 跑构建 → 读退出码和输出 → 还原 → 再跑一次确认能过。
import { readFileSync, writeFileSync, copyFileSync, unlinkSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const DIR = 'data';
const PUB = DIR + '\\published.json';
const BAK = DIR + '\\published.json.injectbak';

if (existsSync(BAK)) unlinkSync(BAK);
copyFileSync(PUB, BAK);
const original = readFileSync(BAK, 'utf8');

function build() {
  const r = spawnSync('node', ['build.mjs', '--strict'], { cwd: DIR, encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

let ok = true;
try {
  const j = JSON.parse(original);
  const right = j.questions_shipped;
  const wrong = right - 11;             // 故意写错
  j.questions_shipped = wrong;
  writeFileSync(PUB, JSON.stringify(j, null, 2) + '\n', 'utf8');

  console.log('【注入】questions_shipped: ' + right + ' → ' + wrong);
  const bad = build();
  console.log('【构建】退出码 = ' + bad.code);
  const lines = bad.out.split(/\r?\n/).filter((l) => /questions_shipped|实际会发|不一致|改成/.test(l));
  for (const l of lines) console.log('         ' + l.trim());
  const caught = bad.code === 6 && bad.out.includes('实际会发');
  console.log((caught ? '✔' : '✘') + ' 写错的值被拦住，且说清了实际会发多少');
  if (!caught) ok = false;

  // 还原
  writeFileSync(PUB, original, 'utf8');
  console.log('');
  console.log('【还原】questions_shipped 改回 ' + right);
  const good = build();
  console.log('【构建】退出码 = ' + good.code);
  const goodLine = good.out.split(/\r?\n/).find((l) => l.includes('questions_shipped='));
  if (goodLine) console.log('         ' + goodLine.trim());
  const passed = good.code === 0;
  console.log((passed ? '✔' : '✘') + ' 正确的值能正常构建');
  if (!passed) ok = false;
} finally {
  writeFileSync(PUB, original, 'utf8');
  if (existsSync(BAK)) unlinkSync(BAK);
  const now = JSON.parse(readFileSync(PUB, 'utf8')).questions_shipped;
  console.log('');
  console.log('【最终】published.json 的 questions_shipped = ' + now);
}

process.exit(ok ? 0 : 1);
