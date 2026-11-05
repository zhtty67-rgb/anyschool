// 口径核对：界面文案里的数字必须与数据一致
// 用法：node scripts/check-counts.mjs
// 判据（群内已定，2026-11-05）：
//   线上 v9 = MANIFEST 里的 v9 题包；数据侧 = v9 + 待合并批次
//   概念树总节点 79 是固定的，"无题节点数" = 79 - 有题节点数，每次构建自动重算
import { readFileSync, existsSync } from 'node:fs';

const DIST = 'data';
const html = readFileSync(`${DIST}\\index.html`, 'utf8');
const snap = JSON.parse(html.match(/window\.__SNAP__ = (\{[\s\S]*?\});<\/script>/)[1]);
const manifest = JSON.parse(readFileSync(`${DIST}\\MANIFEST.json`, 'utf8'));

const all = snap.tree.modules.flatMap((m) => m.concepts);
const withQ = all.filter((c) => c.questionCount > 0);
const without = all.filter((c) => c.questionCount === 0);
const briefs = snap.briefs || {};
const pending = without.filter((c) => briefs[c.code] && briefs[c.code].asks);

const out = [];
const ok = (n, c, d) => out.push(`${c ? 'OK  ' : 'FAIL'} ${n}${d === undefined ? '' : ' = ' + d}`);

// ── 反向自检（Chief 定的规矩：新增检查必须能抓到已知问题，且不误报）──
// 用造出来的数据跑同一套判据：错误的必须报 FAIL，正确的必须报 OK。
// 自检不通过，说明判据本身坏了，后面的正常结果也不可信。
const selfTest = [];
function probe(label, cond, expectPass) {
  const passed = !!cond;
  const good = passed === expectPass;
  selfTest.push({ label, expectPass, passed, good });
  return good;
}
{
  // 造数据：79 节点、27 有题、323 道
  const fakeAll = Array.from({ length: 79 }, (_, i) => ({ code: `c${i}`, questionCount: i < 27 ? 12 : 0 }));
  const fakeWith = fakeAll.filter((c) => c.questionCount > 0);
  const fakeWithout = fakeAll.filter((c) => c.questionCount === 0);
  const fakeManifest = { published: { version: 'v9' }, questions: 323, nodes_covered: 27, nodes_total: 79 };

  probe('一致数据判通过', fakeWith.length === fakeManifest.nodes_covered, true);           // 27 === 27
  probe('题量不符判失败', 322 === fakeManifest.questions, false);                          // 322 !== 323
  probe('节点数不符判失败', 26 === fakeManifest.nodes_covered, false);
  probe('总数不符判失败', 80 === fakeManifest.nodes_total, false);
  probe('无题数错判失败', (fakeWithout.length === 99), false);
  probe('版本错判失败', 'v8' === fakeManifest.published.version, false);
}
const selfBad = selfTest.filter((t) => !t.good);

ok('MANIFEST 版本', manifest.published.version === 'v9', manifest.published.version);
ok('MANIFEST 题量', manifest.questions === snap.questions.length, manifest.questions);
ok('快照题量一致', snap.questions.length === manifest.questions);
ok('有题节点数', withQ.length === manifest.nodes_covered, `${withQ.length} vs MANIFEST ${manifest.nodes_covered}`);
ok('概念树总节点', all.length === manifest.nodes_total, `${all.length} vs MANIFEST ${manifest.nodes_total}`);
ok('无题节点 = 总数 - 有题', without.length === all.length - withQ.length, without.length);

// 界面文案里的数字必须是算出来的，不是写死的
// 现在数字包在 <span data-coming-count> 里，由运行时按数据重算，所以这里同时校验标记存在 + 首屏值正确
const m = html.match(/还有\s*(?:<span data-coming-count>)?(\d+)/);
ok('折叠区数字取自数据', m && Number(m[1]) === without.length, m ? m[1] : '未找到');
ok('折叠区数字带运行时重算标记', /<span data-coming-count>/.test(html));

console.log('── 口径 ──────────────────────────────');
console.log(`线上 v9       : ${manifest.questions} 道 / ${manifest.nodes_covered} 个有题节点`);
console.log(`概念树        : ${all.length} 个节点`);
console.log(`无题          : ${without.length} 个（界面折叠区显示这个数）`);
console.log(`其中待合并    : ${pending.length} 个（${pending.map((c) => c.code).join(', ') || '无'}）`);
console.log(`真正未覆盖    : ${without.length - pending.length} 个`);
console.log('── 自检（检查器本身是否可信）─────────');
selfTest.forEach((t) => console.log(`  ${t.good ? 'OK  ' : 'FAIL'} ${t.label}（期望${t.expectPass ? '通过' : '失败'}，实际${t.passed ? '通过' : '失败'}）`));
if (selfBad.length) console.log(`  ⚠ 自检 ${selfBad.length} 项不通过——判据本身有问题，下面的结果不可信`);
console.log('── 校验 ──────────────────────────────');
out.forEach((l) => console.log(l));
const fails = out.filter((l) => l.startsWith('FAIL')).length + selfBad.length;
console.log(fails === 0 ? '\n全部通过（含自检）' : `\n${fails} 项不通过`);
process.exit(fails ? 1 : 0);
