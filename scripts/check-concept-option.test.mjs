// 概念题初筛的双向验证
// ① 坏数据：题干有情境但选项在问定义 → 必须判 concept（这是 Chief 判据的核心）
// ② 好数据：选项在问判断/推理 → 不能判 concept
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { screenConcept, checkConceptOption } from './check-concept-option.mjs';

let pass = 0, fail = 0;
const t = (n, fn) => { try { fn(); pass++; console.log('  ok  ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + ': ' + e.message); } };

console.log('== ① 题干有情境、选项问定义 → 必须判概念题 ==');
t('长情境题干 + 三个选项都是定义 → concept', () => {
  const q = {
    stem: '某游戏 AI 每步扣 0.1 分、通关加 5 分，训练很久仍在原地打转。',
    options: ['强化学习的基本机制是', '策略指的是', '信用分配指的是', '价值函数指的是'],
  };
  assert.equal(screenConcept(q).verdict, 'concept');
});
t('情境题但选项问"属于哪一类" → concept', () => {
  const q = {
    stem: '甲用固定公式算房贷，乙从十万张照片学出猫长什么样。',
    options: ['甲属于哪一类', '乙属于哪一类', '两者都属于哪一类', '无法判断属于哪类'],
  };
  assert.equal(screenConcept(q).verdict, 'concept');
});
t('这是 Chief 判据的关键：题干再长，看选项', () => {
  const longStem = '张三训练了一个推荐系统，日志显示点击率 3%，转化率 0.5%，三个月后模型表现持续下滑，团队排查了数据管道和特征工程都没发现问题，最后怀疑是训练分布漂移。'.repeat(2);
  const q = { stem: longStem, options: ['过拟合指的是什么', '分布漂移指的是', '偏差的含义是', '方差的定义是'] };
  const r = screenConcept(q);
  assert.equal(r.verdict, 'concept');
  assert.equal(r.stemHasSituation, true, '题干确实有情境，但选项在问定义，仍算概念题');
});

console.log('== ② 选项在问判断/推理 → 不能判概念题 ==');
t('四个选项都在解释因果 → judgment', () => {
  const q = {
    stem: '训练 GAN 时判别器太强，生成器学不动。',
    options: ['因为判别器梯度太小导致生成器推不动', '因为生成器参数量不够', '所以应该加大学习率', '原因是训练集太小'],
  };
  assert.equal(screenConcept(q).verdict, 'judgment');
});
t('选项问"错在哪/最可能的原因" → judgment', () => {
  const q = {
    stem: '有人说奖励给得越多模型学得越好。',
    options: ['错在把奖励幅度当成学习信号', '最可能的原因是稀疏奖励更难学', '差别在于奖励是否及时', '区别在奖励的量级'],
  };
  assert.equal(screenConcept(q).verdict, 'judgment');
});

console.log('== ③ 完整真实数据集 ==');
for (const p of [
  'data\\questions-ai-c0901-rewrite-v1.jsonl',
  'data\\questions-ai-c0101-rewrite-v1.jsonl',
  'data\\questions-authoring-v9.jsonl',
]) {
  if (!existsSync(p)) { console.log(`  skip ${p}`); continue; }
  t(`跑通 ${p.split('\\').pop()}`, () => {
    const qs = readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
    const r = checkConceptOption(qs);
    const nodes = Object.keys(r).sort();
    const tot = nodes.reduce((a, n) => a + r[n].total, 0);
    const con = nodes.reduce((a, n) => a + r[n].concept, 0);
    console.log(`       ${nodes.length} 个节点 ${tot} 道，初筛概念题 ${con} 道（${Math.round((con / tot) * 100)}%）`);
    assert.ok(tot > 0);
  });
}

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
process.exit(fail ? 1 : 0);
