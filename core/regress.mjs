// 真实题库回归测试 —— 直接读 1311 道题跑判题，不用手写样例。
// node core/regress.mjs
import assert from 'node:assert/strict';
import { loadQuestions } from './qbook.mjs';
import { grade, parseAnswerKey, normalizeChoice } from './grade.mjs';

const { questions } = loadQuestions();
const MULTI = questions.filter((q) => q.type === 'multi_choice');
const SINGLE = questions.filter((q) => q.type === 'single_choice');
const JUDGE = questions.filter((q) => Array.isArray(q.options) && q.options.length === 2);

let pass = 0;
let fail = 0;
function check(name, fn) {
  try { fn(); pass += 1; console.log(`  ok  ${name}`); }
  catch (e) { fail += 1; console.log(`  FAIL ${name}: ${e.message}`); }
}

console.log('== 数据形状 ==');
console.log(`  单选 ${SINGLE.length} / 多选 ${MULTI.length} / 两选项题 ${JUDGE.length}`);
console.log(`  多选答案长度分布: ${JSON.stringify(countBy(MULTI, (q) => q.answer.length))}`);

console.log('== 多选题字面答案 ==');
// Qbank 问：answer 是 "ABC" 这种多字母，判题能不能接
check('parseAnswerKey 把 "ABC" 拆成集合', () => {
  assert.deepEqual(parseAnswerKey('ABC'), ['A', 'B', 'C']);
});
check('"ABCDE" 这种五选全中也能解析', () => {
  assert.deepEqual(parseAnswerKey('ABCDE'), ['A', 'B', 'C', 'D', 'E']);
});
check('顺序无关："CBA" 与 "ABC" 等价', () => {
  assert.deepEqual(parseAnswerKey('CBA'), parseAnswerKey('ABC'));
});
check('300 道多选题的答案全部可解析且非空', () => {
  const bad = MULTI.filter((q) => parseAnswerKey(q.answer).length === 0);
  assert.equal(bad.length, 0, `${bad.length} 道解析失败`);
});
check('多选题答案字母都在选项范围内', () => {
  const bad = MULTI.filter((q) => {
    const letters = parseAnswerKey(q.answer);
    const n = q.options.length;
    return letters.some((l) => l.charCodeAt(0) - 65 >= n);
  });
  assert.equal(bad.length, 0, `${bad.length} 道答案越界`);
});
check('多选题答案内部无重复字母', () => {
  const dup = MULTI.filter((q) => new Set(q.answer).size !== q.answer.length);
  assert.equal(dup.length, 0, `${dup.length} 道有重复字母`);
});

console.log('== 逐题判题（用标准答案当用户答案，应该全对）==');
check('单选 1011 道全对', () => {
  const bad = SINGLE.filter((q) => !grade(q, q.answer).correct);
  assert.equal(bad.length, 0, `${bad.length} 道答对却判错`);
});
check('多选 300 道全对', () => {
  const bad = MULTI.filter((q) => !grade(q, q.answer).correct);
  assert.equal(bad.length, 0, `${bad.length} 道答对却判错`);
});
check('把多选答案拆成数组也认', () => {
  const bad = MULTI.filter((q) => !grade(q, [...parseAnswerKey(q.answer)]).correct);
  assert.equal(bad.length, 0, `${bad.length} 道数组形式判错`);
});

console.log('== 错答必须判错 ==');
check('单选随便换一个选项要判错', () => {
  const bad = SINGLE.filter((q) => {
    const n = q.options.length;
    if (n < 2) return false;
    const right = parseAnswerKey(q.answer)[0];
    const other = ['A', 'B', 'C', 'D', 'E'].slice(0, n).find((l) => l !== right);
    return !other || grade(q, other).correct;
  });
  assert.equal(bad.length, 0, `${bad.length} 道错答被判对`);
});
check('多选漏一个必须判错', () => {
  const testable = MULTI.filter((q) => q.answer.length >= 2);
  const bad = testable.filter((q) => grade(q, q.answer.slice(0, -1)).correct);
  assert.equal(bad.length, 0, `${bad.length} 道漏选被判对`);
});
check('多选多一个必须判错', () => {
  const testable = MULTI.filter((q) => q.options.length > q.answer.length);
  const bad = testable.filter((q) => {
    const extra = ['A', 'B', 'C', 'D', 'E'].find((l) => !q.answer.includes(l) && l.charCodeAt(0) - 65 < q.options.length);
    return extra && grade(q, q.answer + extra).correct;
  });
  assert.equal(bad.length, 0, `${bad.length} 道多选被判对`);
});

console.log('== 判断题 ==');
check('172 道两选项题（正确√/错误×）能识别', () => {
  const tf = JUDGE.filter((q) => q.options.some((o) => /正确|错误/.test(o)));
  console.log(`     → 识别为判断题 ${tf.length} 道`);
  assert.ok(tf.length > 0);
});
check('判断题点中文"正确/错误"能判', () => {
  const tf = JUDGE.filter((q) => q.options.some((o) => /正确|错误/.test(o)));
  const bad = tf.filter((q) => {
    const expectRight = parseAnswerKey(q.answer)[0] === 'A';
    return grade(q, expectRight ? '正确' : '错误').correct !== true;
  });
  assert.equal(bad.length, 0, `${bad.length} 道中文作答判错`);
});

console.log('== 健壮性 ==');
check('空作答不崩', () => {
  for (const q of questions.slice(0, 100)) {
    const g = grade(q, null);
    assert.equal(g.ok, false);
  }
});
check('乱写作答不崩', () => {
  for (const q of questions.slice(0, 100)) {
    assert.doesNotThrow(() => grade(q, '乱七八糟'));
  }
});

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);

function countBy(arr, keyFn) {
  const m = {};
  for (const x of arr) { const k = keyFn(x); m[k] = (m[k] || 0) + 1; }
  return m;
}
if (fail > 0) process.exitCode = 1;
