// 判据放宽后的反向确认：故意造出必须被报的坏样本，看还能不能不抓到
import { checkExplanation } from '../core/check-explanation.mjs';

const opts = ['算的是乙，因为它的能力是从数据里学出来的，不是人把规则写死的', '两者都算，因为它们都用了计算机', '两者都不算，因为都没有实体机器人', '算的是甲，因为它的计算更精确'];

const cases = [
  { name: '引用完全不存在的选项（编一段无关文本）', exp: '错项「量子纠缠会导致随机梯度爆炸」不成立，因为：无据', want: true },
  { name: '引用串位（把别的节点选项抄进来）', exp: '错项「反向传播会吃掉梯度」不成立，因为：无据', want: true },
  { name: '改写式：抽掉词重排（学生找不到原话）', exp: '错项「都不算，因为没实体」不成立，因为：智能体不需要身体', want: true },
  { name: '正常引用（原文照抄）', exp: '错项「两者都算，因为它们都用了计算机」不成立，因为：用计算机不是判据', want: false },
  { name: '省略式：保留语序、中间用省略号', exp: '错项「两者都不算…因为都没有实体机器人」不成立，因为：智能体不需要身体', want: false },
  { name: '正确项照抄', exp: '正确答案是「算的是乙，因为它的能力是从数据里学出来的，不是人把规则写死的」', want: false },
];

let pass = 0, fail = 0;
for (const c of cases) {
  const r = checkExplanation([{ id: 't', options: opts, explanation: c.exp }]);
  const flagged = r.missing.length > 0;
  const ok = flagged === c.want;
  if (ok) pass++; else fail++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${c.name} → ${flagged ? '报' : '不报'}（期望${c.want ? '报' : '不报'}）`);
}
console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
process.exit(fail ? 1 : 0);
