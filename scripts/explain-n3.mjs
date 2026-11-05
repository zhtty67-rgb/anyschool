// 核 Qbank 说的「c0103-n3 四条全被报」到底是怎么来的
// 我的代码在 ①-b 里只留最极端的那一条，不可能一次报四条。
// 所以要么是别的判据报的，要么是我理解错了他的意思。
import { analyzeQuestion } from '../scripts/check-option-parity.mjs';

const cases = [
  { id: 'c0103-n3 形态', lens: [21, 22, 21, 45], answer: 'A' },
  { id: 'c0204-t1 形态', lens: [30, 40, 30, 30], answer: 'B' },
];

for (const c of cases) {
  const opts = c.lens.map((n, i) => String.fromCharCode(97 + i) + 'x'.repeat(n - 1));
  const r = analyzeQuestion({ id: c.id, options: opts, answer: c.answer });
  console.log('=== ' + c.id + '  ' + c.lens.join('/') + '  答案=' + c.answer + ' ===');
  if (!r.issues.length) console.log('  不报');
  for (const i of r.issues) {
    console.log('  [' + i.type + '/' + i.severity + '] ' + i.text);
  }
  console.log('');
}
