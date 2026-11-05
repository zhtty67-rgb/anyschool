// 选项形式对等检查的测试
//
// 重点不只是"查得出坏题"，更是**查不出什么**。
// c0103-01 v6 就是反例：四个选项字数接近、开头一致、结尾一致，
// 形式检查判"对齐"，但外行一眼就能选出（C、D 只写了一句，内容敷衍）。
// 所以这里专门有一条测试，把"形式对齐却仍然不合格"这个事实钉住——
// 免得以后有人给脚本加阈值，把它当成质量保证。
import assert from 'node:assert/strict';
import { analyzeQuestion, checkPack } from './check-option-parity.mjs';

let pass = 0, fail = 0;
const t = (n, fn) => { try { fn(); pass++; console.log('  ok  ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + ': ' + e.message); } };

const q = (id, opts) => ({ id, options: opts });

console.log('== ① 字数：极差过大要报 ==');
t('极差 ≥12 报出字数问题', () => {
  const r = analyzeQuestion(q('a', [
    '这是一段很长很长的选项内容，写满了完整的一段分析与结论',
    '短句一',
    '短句二',
    '短句三',
  ]));
  assert.ok(r.flags.some((f) => f.includes('字数极差')), JSON.stringify(r.flags));
});
t('字数接近不报', () => {
  const r = analyzeQuestion(q('b', ['选项甲乙丙丁戊', '选项甲乙丙丁己', '选项甲乙丙丁庚', '选项甲乙丙丁辛']));
  assert.equal(r.flags.filter((f) => f.includes('字数极差')).length, 0);
});

console.log('== ② 开头句式：3 同 1 异要报 ==');
t('三句开头相同、一句不同 → 报', () => {
  const r = analyzeQuestion(q('c', [
    '它没看到这套系统在感知环境，所以说它不算智能体是站不住的',
    '它没看到这套系统在采取行动，所以说它不算智能体是没道理的',
    '它没看到这套系统的目标很明确，所以说它不算智能体不合适',
    '这套系统确实不属于智能体，因为它的行为完全由人写的规则决定',
  ]));
  assert.ok(r.flags.some((f) => f.includes('开头句式')), JSON.stringify(r.flags));
});
t('四个开头都不同 → 不报', () => {
  const r = analyzeQuestion(q('d', [
    '甲说是这个原因，所以结论成立',
    '乙认为是那个原因，因此结论也成立',
    '丙的看法不一样，从而结论相反',
    '丁则完全反对，于是结论也相反',
  ]));
  assert.equal(r.flags.filter((f) => f.includes('开头句式')).length, 0);
});

console.log('== ③ 连接词：3 同 1 异要报 ==');
t('三句都用同一个连接词、一句用另一个 → 报', () => {
  const r = analyzeQuestion(q('e', [
    '它是感知的，所以算智能体',
    '它是行动的，所以算智能体',
    '它有目标的，所以算智能体',
    '它没有实体，而这不影响判断',
  ]));
  assert.ok(r.flags.some((f) => f.includes('连接词')), JSON.stringify(r.flags));
});
t('四个都不用连接词 → 不报', () => {
  const r = analyzeQuestion(q('f', ['它算智能体', '它不算智能体', '它是脚本', '它是系统']));
  assert.equal(r.flags.filter((f) => f.includes('连接词')).length, 0);
});

console.log('== ④ 结尾后缀：3 同 1 异要报 ==');
t('三句结尾相同、一句不同 → 报', () => {
  const r = analyzeQuestion(q('g', [
    '它一直在读状态所以算智能体',
    '它一直在改方案所以算智能体',
    '它一直在达目标所以算智能体',
    '它只是按规则走所以不算脚本',
  ]));
  assert.ok(r.flags.some((f) => f.includes('结尾')), JSON.stringify(r.flags));
});

console.log('== ④-b 离群项落在正确答案位置 → 升级为严重 ==');
const mk = (lens) => lens.map((n, i) => String.fromCharCode(97 + i) + 'x'.repeat(n - 1));
t('离群项正好是正确答案 → 报「严重」', () => {
  // c0202-02 前四版就是这个形态：离群一直是第 1 条，而正确答案恰好也是 A。
  // 等于同时泄露了"长度"和"位置"两件事，比随便哪条离群严重。
  const r = analyzeQuestion({ id: 'x', options: mk([45, 34, 35, 33]), answer: 'A' });
  assert.ok(r.flags.some((f) => f.includes('【严重】')), JSON.stringify(r.flags));
});
t('同样的字数，正确答案不在离群位 → 只报普通离群', () => {
  const r = analyzeQuestion({ id: 'x', options: mk([45, 34, 35, 33]), answer: 'B' });
  const hit = r.flags.find((f) => f.includes('离群'));
  assert.ok(hit, '应报出离群');
  assert.ok(!hit.includes('【严重】'), `不该升级为严重：${hit}`);
});
t('四条齐 → 不报离群，也就谈不上升级', () => {
  const r = analyzeQuestion({ id: 'x', options: mk([40, 41, 41, 40]), answer: 'D' });
  assert.equal(r.flags.filter((f) => f.includes('离群')).length, 0);
});
t('answer 缺失或格式不对 → 不猜位置，不误报严重', () => {
  for (const ans of [undefined, '', 'Z', 3, 'AB']) {
    const r = analyzeQuestion({ id: 'x', options: mk([45, 34, 35, 33]), answer: ans });
    assert.ok(!r.flags.some((f) => f.includes('【严重】')), `answer=${JSON.stringify(ans)} 不该判严重`);
  }
});

console.log('== ④-c 反向线索：最短的那条是正确答案 ==');
t('最短的一条正好是答案、且明显短于中位数 → 报', () => {
  // 小白原话：「A 最短，反而信了它，因为最短的那条通常不是凑数的」。
  // 判的是"最短 == 答案"，不是"有一条短"。
  const r = analyzeQuestion({ id: 'x', options: mk([34, 43, 43, 42]), answer: 'A' });
  const hit = r.flags.find((f) => f.includes('最短'));
  assert.ok(hit, `应报出"最短在答案位"，实际：${JSON.stringify(r.flags)}`);
  assert.ok(hit.startsWith('最短的那条正好是正确答案'), hit);
});
t('最短的一条不是答案 → 不按这一级报（读者照这个方向猜也猜不中）', () => {
  const r = analyzeQuestion({ id: 'x', options: mk([34, 43, 43, 42]), answer: 'D' });
  assert.equal(r.flags.filter((f) => f.includes('最短')).length, 0, JSON.stringify(r.flags));
});
t('最短只比中位数少 1–2 字 → 不报（四条基本齐，谈不上"明显最短"）', () => {
  const r = analyzeQuestion({ id: 'x', options: mk([40, 41, 42, 41]), answer: 'A' });
  assert.equal(r.flags.filter((f) => f.includes('最短')).length, 0, JSON.stringify(r.flags));
});
t('最短那条并列（两条一样短）→ 仍是答案位就报，因为读者照样挑得出来', () => {
  const r = analyzeQuestion({ id: 'x', options: mk([34, 34, 43, 43]), answer: 'A' });
  assert.ok(r.flags.some((f) => f.includes('最短')), JSON.stringify(r.flags));
});
t('answer 缺失 → 这一级不猜位置，不报', () => {
  const r = analyzeQuestion({ id: 'x', options: mk([34, 43, 43, 42]) });
  assert.equal(r.flags.filter((f) => f.includes('最短')).length, 0);
});

console.log('== ⑤ 边界：这个脚本查不出的东西，必须写死在测试里 ==');
t('c0103-01 v6 那种"形式对齐但一眼假"的题，形式检查判为无问题', () => {
  // 这是真实的 v6：A 23 字 / B 20 / C 17 / D 13。
  // 原来（只有极差判据时）极差 10 不到阈值 12，脚本说"没问题"，而小白一眼排掉 C、D。
  // 2026-11-05 加了"字数离群"判据之后，这一版**能被查出来了**（13 字离其余三个均值差 7）。
  // 所以这条测试改成两个断言：
  //   ① 它现在会报——新判据确实补上了一个盲区
  //   ② 报的理由必须是"字数离群"，不能是靠别的凑
  const r = analyzeQuestion(q('c0103-01', [
    '它算智能体，因为它能感知设备状态并据此调整行动',
    '它不算，因为它的行为完全由人写的规则决定',
    '它算，因为它的运算速度超过人工排产',
    '它不算，因为它没有实体设备',
  ]));
  // 按 type 字段判断，不按中文提示语。
  // 2026-11-05：提示语从"字数离群"改成了"离群项是干扰项（只是显眼…）"，
  // 靠 includes('字数离群') 的断言当场就挂了——
  // 这正是"靠名字找东西、而名字会变"的老毛病，改成读结构化字段。
  assert.ok(
    r.issues.some((i) => i.type === 'word_count_outlier'),
    `应报出字数离群（type=word_count_outlier），实际：${JSON.stringify(r.issues)}`,
  );
});
t('真正查不出的那种：四个选项字数齐、句式齐、内容敷衍', () => {
  // 四个都是 20 字、都以"它没看到"开头、都不用连接词，
  // 但内容是敷衍的（说的都是废话）。形式上一个字都挑不出来。
  // 这条钉住：形式对齐 ≠ 合格，脚本到此为止，剩下必须人看。
  const r = analyzeQuestion(q('fake', [
    '它没看到这个系统其实一直都在按规则运行着轨道',
    '它没看到这个系统其实一直都在按规则运行着辅助',
    '它没看到这个系统其实一直都在按规则运行着流程',
    '它没看到这个系统其实一直都在按规则运行着规定',
  ]));
  assert.equal(r.flags.length, 0, `形式对齐时脚本应判为无问题（这是它的边界），实际：${JSON.stringify(r.flags)}`);
});
t('选项少于 2 个时不崩、不报', () => {
  const r = analyzeQuestion(q('h', ['只有一个']));
  assert.equal(r.flags.length, 0);
});
t('选项缺失时不崩', () => {
  const r = analyzeQuestion({ id: 'i' });
  assert.equal(r.n, 0);
  assert.equal(r.flags.length, 0);
});

console.log('== ⑥ 题包级汇总 ==');
t('checkPack 统计对数', () => {
  const r = checkPack([
    q('ok1', ['选项甲乙丙丁戊', '选项甲乙丙丁己', '选项甲乙丙丁庚', '选项甲乙丙丁辛']),
    q('bad1', ['这是一段很长很长的选项内容写满了完整的一段分析', '短一', '短二', '短三']),
  ]);
  assert.equal(r.total, 2);
  assert.equal(r.flagged.length, 1);
  assert.equal(r.clean, 1);
});

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
process.exit(fail ? 1 : 0);

