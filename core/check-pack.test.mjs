// 检查器自身的测试 —— 用刻意造的坏样本，确认每条规则真能报出来。
// node core/check-pack.test.mjs
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkPack, similarity } from './check-pack.mjs';

const dir = mkdtempSync(join(tmpdir(), 'edu-check-'));
let pass = 0;
let fail = 0;
function t(name, fn) {
  try { fn(); pass += 1; console.log(`  ok  ${name}`); }
  catch (e) { fail += 1; console.log(`  FAIL ${name}: ${e.message}`); }
}

function write(name, items) {
  const p = join(dir, name);
  writeFileSync(p, items.map((x) => JSON.stringify(x)).join('\n'), 'utf8');
  return p;
}

const good = (over = {}) => ({
  id: 'c0101-01',
  type: 'single_choice',
  stem: '下面哪一项最准确地描述了人工智能？',
  options: ['能说话的机器人', '让机器完成需要人类智能的任务', '会下棋的机器', '有机械臂的机器'],
  answer: 'B',
  explanation: '因为人工智能指的是能力层面，会说话、下棋、机械臂都只是具体形态，并非定义本身。',
  nodes: ['c0101'],
  misconception: '人工智能等于会说话的机器人',
  ...over,
});

console.log('== 相似度函数 ==');
t('完全相同的题干 = 1', () => assert.equal(similarity('什么是过拟合', '什么是过拟合'), 1));
t('完全不同的题干接近 0', () => assert.ok(similarity('什么是过拟合', '梯度下降的学习率怎么选') < 0.2));
t('只换标点视为相同', () => assert.equal(similarity('什么是过拟合？', '什么是过拟合'), 1));

console.log('== 合格样本 ==');
t('单道合格题通过', () => {
  const r = checkPack(write('ok.jsonl', [good()]));
  assert.equal(r.ok, true, JSON.stringify(r.errors));
});

console.log('== 抓出已知问题 ==');
t('nodes 为空要报错', () => {
  const r = checkPack(write('nodes-empty.jsonl', [good({ nodes: [] })]));
  assert.ok(r.errors.some((e) => e.code === 'NODES_EMPTY'));
});
t('nodes 不是数组要报错', () => {
  const r = checkPack(write('nodes-str.jsonl', [good({ nodes: 'c0101' })]));
  assert.ok(r.errors.some((e) => e.code === 'NODES_NOT_ARRAY'));
});
t('不存在的节点要报错', () => {
  const r = checkPack(write('node-unknown.jsonl', [good({ nodes: ['c9999'] })]));
  assert.ok(r.errors.some((e) => e.code === 'NODE_UNKNOWN'));
});
t('MMLU 模板解析要报错', () => {
  const r = checkPack(write('tmpl.jsonl', [good({ explanation: 'MMLU 官方答案：B. 让机器完成需要人类智能的任务' })]));
  assert.ok(r.errors.some((e) => e.code === 'EXPLAIN_TEMPLATE'));
});
t('答案越界要报错', () => {
  const r = checkPack(write('range.jsonl', [good({ answer: 'F' })]));
  assert.ok(r.errors.some((e) => e.code === 'ANSWER_OUT_OF_RANGE'));
});
t('单选题多个答案要报错', () => {
  const r = checkPack(write('multi.jsonl', [good({ answer: 'AB' })]));
  assert.ok(r.errors.some((e) => e.code === 'ANSWER_COUNT'));
});
t('id 重复要报错', () => {
  const r = checkPack(write('dup-id.jsonl', [good(), good({ stem: '另一道完全不同的题，问的是别的事情？' })]));
  assert.ok(r.errors.some((e) => e.code === 'ID_DUPLICATE'));
});

console.log('== 新增两条：题干重复度 ==');
t('同节点换个说法的重复题要报错', () => {
  const items = [
    good({ id: 'c0101-01', stem: '下面哪一项最准确地描述了人工智能的定义？' }),
    good({ id: 'c0101-02', stem: '下面哪一项最准确地描述了人工智能的概念？' }),
  ];
  const r = checkPack(write('dup-stem.jsonl', items));
  assert.ok(r.errors.some((e) => e.code === 'STEM_DUPLICATE'), JSON.stringify(r.errors.map((e) => e.code)));
});
t('同节点不同角度的题不误报', () => {
  const items = [
    good({ id: 'c0101-01', stem: '下面哪一项最准确地描述了人工智能？' }),
    good({ id: 'c0101-02', stem: '图灵测试能否证明机器具有真实理解能力？', options: ['能', '不能'], answer: 'B', misconception: '图灵测试能测出机器的真实理解能力' }),
  ];
  const r = checkPack(write('ok-two.jsonl', items));
  assert.ok(!r.errors.some((e) => e.code === 'STEM_DUPLICATE'));
});
t('不同节点题干像不算重复', () => {
  const items = [
    good({ id: 'c0101-01', nodes: ['c0101'] }),
    good({ id: 'c0102-01', nodes: ['c0102'], misconception: '图灵测试能测出机器的真实理解能力' }),
  ];
  const r = checkPack(write('ok-diffnode.jsonl', items));
  assert.ok(!r.errors.some((e) => e.code === 'STEM_DUPLICATE'));
});

console.log('== 新增两条：答案位置分布 ==');
t('答案全在 B 要报偏向', () => {
  const items = Array.from({ length: 10 }, (_, i) =>
    good({
      id: `c0101-${String(i + 1).padStart(2, '0')}`,
      stem: `第 ${i + 1} 道互不相同的题：关于模型训练的说法哪个对？角度${i}`,
      answer: 'B',
    })
  );
  const r = checkPack(write('bias-b.jsonl', items));
  assert.ok(r.warnings.some((w) => w.code === 'ANSWER_POSITION_BIAS'), JSON.stringify(r.warnings.map((w) => w.code)));
});
t('答案分散不报偏向', () => {
  const answers = ['A', 'B', 'C', 'D', 'A', 'C', 'D', 'B', 'A', 'C'];
  const items = answers.map((a, i) =>
    good({
      id: `c0101-${String(i + 1).padStart(2, '0')}`,
      stem: `互不相同的第 ${i} 题：关于机器学习与监管的讨论角度${i}`,
      answer: a,
    })
  );
  const r = checkPack(write('ok-spread.jsonl', items));
  assert.ok(!r.warnings.some((w) => w.code === 'ANSWER_POSITION_BIAS'));
});
t('位置分布统计准确', () => {
  const answers = ['A', 'B', 'C', 'D', 'A', 'C', 'D', 'B', 'A', 'C'];
  const items = answers.map((a, i) =>
    good({ id: `c0101-${i + 1}`, stem: `互不相同的第 ${i} 题：角度${i}`, answer: a })
  );
  const r = checkPack(write('stat.jsonl', items));
  assert.equal(r.stats.answerBias.positions.A, 3);
  assert.equal(r.stats.answerBias.positions.C, 3);
  assert.equal(r.stats.answerBias.total, 10);
});

console.log('== 解析字母错位 ==');
t('打乱选项后解析字母没跟着改要报错', () => {
  const q = good({
    stem: '什么是最能描述人工智能的说法？',
    options: ['会说话的机器人', '让机器完成需要人类智能的任务', '会下棋的机器', '有机械臂的机器'],
    answer: 'C', // 正确项挪到 C
    explanation: 'A 正确：让机器完成需要人类智能的任务。B 错：会说话的机器人只是形态。',
  });
  const r = checkPack(write('mis.jsonl', [q]));
  assert.ok(r.errors.some((e) => e.code === 'EXPLAIN_LETTER_MISMATCH'), JSON.stringify(r.errors.map((e) => e.code)));
});
t('解析把答案项说成错的也要报错', () => {
  const q = good({
    stem: '关于人工智能的定义下列哪项成立？',
    options: ['会说话的机器人', '让机器完成需要人类智能的任务', '会下棋的机器', '有机械臂的机器'],
    answer: 'B',
    explanation: 'A 是形态不是定义。B 错：这只是其中一种说法。C 和下棋有关但不对。',
  });
  const r = checkPack(write('mis2.jsonl', [q]));
  assert.ok(r.errors.some((e) => e.code === 'EXPLAIN_LETTER_MISMATCH'));
});
t('解析不用字母指代不误报', () => {
  const q = good({
    stem: '关于人工智能的定义下列哪项成立？',
    options: ['会说话的机器人', '让机器完成需要人类智能的任务', '会下棋的机器', '有机械臂的机器'],
    answer: 'B',
    explanation: '让机器完成需要人类智能的任务才是定义。会说话的机器人只是形态，下棋的机器和下棋是具体能力，机械臂是硬件。',
  });
  const r = checkPack(write('okletters.jsonl', [q]));
  assert.ok(!r.errors.some((e) => e.code === 'EXPLAIN_LETTER_MISMATCH'));
});

console.log('== 解析质量（不看关键词，看有没有讲到干扰项）==');
t('解析没提任何干扰项要警告', () => {
  const q = good({
    stem: '什么是过拟合？',
    options: ['训练误差小、泛化误差大', '训练误差也大', '模型参数太少', '数据完全随机'],
    answer: 'A',
    explanation: '过拟合就是训练得好但泛化差的现象，学习时要注意控制模型复杂度并增加数据量，必要时用正则化手段。',
  });
  const r = checkPack(write('nodist.jsonl', [q]));
  assert.ok(r.warnings.some((w) => w.code === 'EXPLAIN_DISTRACTOR_COVERAGE'), JSON.stringify(r.warnings.map((w) => w.code)));
});
t('解析讲到了干扰项不报警告', () => {
  const q = good({
    stem: '什么是过拟合？',
    options: ['训练误差小、泛化误差大', '训练误差也大', '模型参数太少', '数据完全随机'],
    answer: 'A',
    explanation: '训练误差小但泛化误差大就是过拟合。训练误差也大是欠拟合，模型参数太少会欠拟合而不是过拟合，数据完全随机则学不到规律。',
  });
  const r = checkPack(write('okdist.jsonl', [q]));
  assert.ok(!r.warnings.some((w) => w.code === 'EXPLAIN_NO_DISTRACTOR'));
});
t('解析按选项数要求够长', () => {
  const q = good({
    stem: '什么是过拟合？',
    options: ['训练误差小、泛化误差大', '训练误差也大', '模型参数太少', '数据完全随机'],
    answer: 'A',
    explanation: '训练误差小但泛化误差大就是过拟合，训练误差也大是欠拟合。',
  });
  const r = checkPack(write('terse.jsonl', [q]));
  assert.ok(r.warnings.some((w) => w.code === 'EXPLAIN_TOO_TERSE'));
});
t('不再用关键词判断解析质量', () => {
  const q = good({
    stem: '什么是过拟合？',
    options: ['训练误差小、泛化误差大', '训练误差也大', '模型参数太少', '数据完全随机'],
    answer: 'A',
    explanation: '训练误差小但泛化误差大就是过拟合。训练误差也大是欠拟合，模型参数太少会欠拟合，数据完全随机学不到规律。',
  });
  const r = checkPack(write('nokw.jsonl', [q]));
  assert.ok(!r.warnings.some((w) => w.code === 'EXPLAIN_NO_REASON'), 'EXPLAIN_NO_REASON 应该已删除');
});

console.log('== 判断题解析 ==');
const judge = (over = {}) => ({
  id: 'c0201-01',
  type: 'judge',
  stem: '监督学习必须有标签。',
  options: ['正确 √', '错误 ×'],
  answer: 'A',
  explanation: '正确。监督学习靠标签计算误差来更新参数，没有标签就无从修正，但这不等于所有 AI 都要标签。',
  nodes: ['c0201'],
  misconception: null,
  ...over,
});
t('判断题合格解析通过', () => {
  const q = judge({ misconception: null });
  const r = checkPack(write('judge-ok.jsonl', [q]));
  assert.ok(!r.warnings.some((w) => w.code === 'EXPLAIN_JUDGE_NO_VERDICT'), JSON.stringify(r.warnings.map((w) => w.code)));
  assert.ok(!r.warnings.some((w) => w.code === 'EXPLAIN_JUDGE_NO_SUPPORT'));
});
t('解析判定与 answer 冲突要报错', () => {
  const q = judge({ explanation: '错误。监督学习的标签只是可选信息，实际上不需要，因为很多模型能自学。' });
  const r = checkPack(write('judge-conflict.jsonl', [q]));
  assert.ok(r.errors.some((e) => e.code === 'EXPLAIN_JUDGE_VERDICT_CONFLICT'), JSON.stringify(r.errors.map((e) => e.code)));
});
t('解析开头没给判定要警告', () => {
  const q = judge({ explanation: '监督学习的核心是标签，模型根据标签计算误差再反向传播更新参数，这一过程需要大量数据支撑。' });
  const r = checkPack(write('judge-noverdict.jsonl', [q]));
  assert.ok(r.warnings.some((w) => w.code === 'EXPLAIN_JUDGE_NO_VERDICT'));
});
t('只给结论没支撑要提示（信息级，不计警告）', () => {
  const q = judge({ explanation: '正确。这句话没有问题，是对的，考生应当记住这个知识点和它的适用范围。' });
  const r = checkPack(write('judge-nosupport.jsonl', [q]));
  assert.ok(r.infos.some((w) => w.code === 'EXPLAIN_JUDGE_NO_SUPPORT'), JSON.stringify(r.infos.map((w) => w.code)));
  assert.ok(!r.warnings.some((w) => w.code === 'EXPLAIN_JUDGE_NO_SUPPORT'), '信息级不该进警告');
});
t('改写题干不复述的解析不误报', () => {
  // 真实案例：解析用"把测试集变成训练集的一部分"回应"在测试集上调参"
  const q = judge({
    stem: '在测试集上反复调整参数、直到测试准确率变高，这样得到的结果仍然可信。',
    answer: 'B',
    explanation: '错误。在测试集上调参等于把测试集变成了训练集的一部分，测出来的分数会被高估，这叫数据泄露。',
  });
  const r = checkPack(write('judge-paraphrase.jsonl', [q]));
  assert.ok(!r.warnings.some((w) => w.code.startsWith('EXPLAIN_JUDGE')), JSON.stringify(r.warnings.map((w) => w.code)));
});

console.log('== 覆盖统计 ==');
t('统计节点覆盖与零覆盖', () => {
  const items = [good(), good({ id: 'c0101-02', stem: '另一角度的题：人工智能与机器学习是什么关系？', misconception: '人工智能等于机器学习' })];
  const r = checkPack(write('cover.jsonl', items));
  assert.equal(r.stats.byNode['c0101'], 2);
  assert.equal(r.stats.zeroCoverNode.length, 78);
});

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
if (fail) process.exitCode = 1;
