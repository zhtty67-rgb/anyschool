// 验证两个方向的阈值已经一致：同一个「离其余三项均值 3 字」的偏离，
// 不管它是最长那条还是最短那条、是不是答案，报不报应该一致。
import { analyzeQuestion } from '../scripts/check-option-parity.mjs';

const mk = (lens) => lens.map((n, i) => String.fromCharCode(97 + i) + 'x'.repeat(n - 1));

const cases = [
  { name: '答案最长（40/37/37/37，均值差 2.4）', lens: [40, 37, 37, 37], answer: 'A' },
  { name: '答案最短（37/40/40/40）', lens: [37, 40, 40, 40], answer: 'A' },
  { name: '干扰项最短（40/37/40/40）', lens: [40, 37, 40, 40], answer: 'A' },
  { name: '干扰项最长（37/43/37/37）', lens: [37, 43, 37, 37], answer: 'A' },
  { name: '偏离 2 字以内，不该报（40/41/41/39）', lens: [40, 41, 41, 39], answer: 'A' },
];

console.log('阈值口径：与其余三项的均值差 > 2 字\n');
for (const c of cases) {
  const r = analyzeQuestion({ id: c.name, options: mk(c.lens), answer: c.answer });
  const types = r.issues.map((i) => i.type + '/' + i.severity);
  console.log(c.name);
  console.log('  ' + c.lens.join('/') + '  →  ' + (types.length ? types.join(' | ') : '（不报）'));
}
