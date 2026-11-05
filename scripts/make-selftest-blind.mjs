// 自检：构造一份"答案确实分散到四个位置"的假卷子，验证验收脚本会判合格
// 目的：如果 Qbank 的 make_blind.py 真的做出了分散的卷子而我判它不合格，
// 那说明是我的脚本错了，不是它的工具错了。这条测试就是用来排除这种可能的。
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const TMP = 'data';
if (!existsSync(TMP)) mkdirSync(TMP, { recursive: true });

// 4 道题，答案分别放在第 1、2、3、4 个位置（真实分散）
const src = [
  { id: 't-01', stem: '测试题一', options: ['正确答案甲', '错项乙', '错项丙', '错项丁'], answer: 'A' },
  { id: 't-02', stem: '测试题二', options: ['错项甲', '正确答案乙', '错项丙', '错项丁'], answer: 'B' },
  { id: 't-03', stem: '测试题三', options: ['错项甲', '错项乙', '正确答案丙', '错项丁'], answer: 'C' },
  { id: 't-04', stem: '测试题四', options: ['错项甲', '错项乙', '错项丙', '正确答案丁'], answer: 'D' },
];

const blind = src.map((q, i) => ({
  序号: i + 1,
  题干: q.stem,
  选项: q.options.map((t, j) => ({ 标: 'ABCD'[j], 文: t })),
}));

writeFileSync(join(TMP, 'selftest-src-4.jsonl'), src.map((q) => JSON.stringify(q)).join('\n'), 'utf8');
writeFileSync(join(TMP, 'selftest-blind-4-ok.jsonl'), blind.map((q) => JSON.stringify(q)).join('\n'), 'utf8');
console.log('已生成：');
console.log(`  源文件   ${join(TMP, 'selftest-src-4.jsonl')}`);
console.log(`  盲测卷   ${join(TMP, 'selftest-blind-4-ok.jsonl')}（答案在 1/2/3/4，真分散）`);
