// 盲测卷验收脚本的自检
//
// 为什么需要：这个脚本本身出过错——它一开始硬编码文件名、不读命令行参数，
// 结果拿旧卷子审新卷子，误判了别人的工具。所以它必须能自证：
//   · 真分散的卷子 → 判合格（退出码 0）
//   · 答案扎堆的卷子 → 判不合格（退出码 1）
//   · 两个参数是同一个文件 → 拦住（退出码 2）
//   · 文件不存在 → 报错而不是算出一个数（退出码 2）
//
// 这几个用例用的是临时生成的假数据，不依赖 outputs 里的真实卷子——
// 那些卷子是会被清掉的（2026-11-05 就被清过一次）。
import { writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

let pass = 0, fail = 0;
const t = (n, fn) => { try { fn(); pass++; console.log('  ok  ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + ': ' + e.message); } };

const HERE = dirname(fileURLToPath(import.meta.url));
const CLi = join(HERE, 'check-blind-answer-pos.mjs');
const run = (...args) => spawnSync(process.execPath, [CLi, ...args], { encoding: 'utf8' });

const dir = mkdtempSync(join(tmpdir(), 'blind-'));
const w = (name, rows) => {
  const p = join(dir, name);
  writeFileSync(p, rows.map((r) => JSON.stringify(r)).join('\n'), 'utf8');
  return p;
};

// 源题包：4 道，答案分别在 A/B/C/D
const src = [
  { id: 't-01', stem: '测试题一', options: ['正确答案甲', '错项乙', '错项丙', '错项丁'], answer: 'A' },
  { id: 't-02', stem: '测试题二', options: ['错项甲', '正确答案乙', '错项丙', '错项丁'], answer: 'B' },
  { id: 't-03', stem: '测试题三', options: ['错项甲', '错项乙', '正确答案丙', '错项丁'], answer: 'C' },
  { id: 't-04', stem: '测试题四', options: ['错项甲', '错项乙', '错项丙', '正确答案丁'], answer: 'D' },
];
const srcPath = w('src-4.jsonl', src);

const toBlind = (q) => ({ 序号: q.序号, 题干: q.题干, 选项: q.选项 });
const blindOf = (stems, optOrders) =>
  stems.map((stem, i) => {
    const s = src.find((x) => x.stem === stem);
    return toBlind({
      序号: i + 1,
      题干: stem,
      选项: optOrders[i].map((idx) => ({ 标: 'ABCD'[idx], 文: s.options[idx] })),
    });
  });

console.log('== ① 真分散 → 合格 ==');
t('答案落在 1/2/3/4 → 退出码 0', () => {
  const blind = blindOf(
    ['测试题一', '测试题二', '测试题三', '测试题四'],
    [[0, 1, 2, 3], [0, 1, 2, 3], [0, 1, 2, 3], [0, 1, 2, 3]],
  );
  const r = run(w('blind-ok.jsonl', blind), srcPath);
  if (r.status !== 0) console.log(r.stdout + r.stderr);
  if (r.status !== 0) throw new Error(`应为 0，实际 ${r.status}`);
});

console.log('== ② 答案扎堆 → 不合格 ==');
t('答案全落在第 1 个 → 退出码 1', () => {
  // 把每道题的正确答案都换到第 1 位
  const blind = blindOf(
    ['测试题一', '测试题二', '测试题三', '测试题四'],
    [[0, 1, 2, 3], [1, 0, 2, 3], [2, 0, 1, 3], [3, 0, 1, 2]],
  );
  const r = run(w('blind-bad.jsonl', blind), srcPath);
  if (r.status !== 1) throw new Error(`应为 1，实际 ${r.status}`);
  if (!r.stdout.includes('缺的位置')) throw new Error('应指出缺哪些位置');
});

console.log('== ③ 参数传错 → 拦住，不要算 ==');
t('两个参数是同一个文件 → 退出码 2', () => {
  const r = run(srcPath, srcPath);
  if (r.status !== 2) throw new Error(`应为 2，实际 ${r.status}`);
  if (!r.stderr.includes('同一个文件')) throw new Error('应提示是同一个文件');
});
t('文件不存在 → 退出码 2，不要算出一个数', () => {
  const r = run(join(dir, '不存在.jsonl'), srcPath);
  if (r.status !== 2) throw new Error(`应为 2，实际 ${r.status}`);
});

console.log('== ④ 输出里要能定位到具体题 ==');
t('合格时打印位置序列', () => {
  const blind = blindOf(['测试题一', '测试题二', '测试题三', '测试题四'],
    [[0, 1, 2, 3], [0, 1, 2, 3], [0, 1, 2, 3], [0, 1, 2, 3]]);
  const r = run(w('blind-ok2.jsonl', blind), srcPath);
  if (!r.stdout.includes('1, 2, 3, 4')) throw new Error('应打印位置序列 1, 2, 3, 4');
});

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
process.exit(fail ? 1 : 0);
