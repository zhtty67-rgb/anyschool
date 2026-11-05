// 判题内核 —— 只依赖题目 JSON 的既有字段，不依赖挂载结果，可先用 mock 跑通。
//
// 输入题目形状（来自 questions-ai-foundations-*.jsonl）：
//   { id, type, stem, options: string[], answer, explanation, nodes: string[] }
//
// graded 返回：
//   { ok, correct, expected: string[], given: string[], partial, note }

/** 归一化用户选择的字母集合：接受 "A" / ["A","C"] / "A,C" / "AC" */
export function normalizeChoice(input) {
  if (input == null) return [];
  const raw = Array.isArray(input) ? input.join(',') : String(input);
  const letters = raw.toUpperCase().match(/[A-Z]/g) || [];
  return [...new Set(letters)].sort();
}

/** 解析标准答案。多选题答案可能是 "ABC"、"A,B,C" 或 ["A","B"] */
export function parseAnswerKey(answer) {
  return normalizeChoice(answer);
}

/**
 * 判断题特殊处理：options 是 ["正确 √","错误 ×"]，
 * answer 字段写的是 "A"/"B"，但用户可能直接点"正确"。
 */
export function resolveTrueFalse(input) {
  const s = String(input ?? '').trim();
  if (/正确|对|true|√|T/i.test(s)) return ['A'];
  if (/错误|错|false|×|F/i.test(s)) return ['B'];
  return normalizeChoice(s);
}

/**
 * 核心判题。
 * @param {object} question 题目对象
 * @param {string|string[]} userInput 用户作答
 * @returns {{ok:boolean, correct:boolean, expected:string[], given:string[], partial:number, note:string}}
 */
export function grade(question, userInput) {
  const type = question?.type || 'single_choice';
  const expected = parseAnswerKey(question?.answer);

  if (expected.length === 0) {
    return { ok: false, correct: false, expected: [], given: [], partial: 0, note: '题目缺少有效答案，无法判分' };
  }

  let given;
  if (type === 'judge' || isTrueFalseShape(question)) {
    given = resolveTrueFalse(userInput);
  } else {
    given = normalizeChoice(userInput);
  }

  if (given.length === 0) {
    return { ok: false, correct: false, expected, given, partial: 0, note: '未作答' };
  }

  // 多选题：全对才给分，部分对只记录 partial 用于诊断，不影响正确判断
  const hit = given.filter((x) => expected.includes(x)).length;
  const partial = expected.length ? hit / expected.length : 0;
  const exact = given.length === expected.length && hit === expected.length;

  return {
    ok: true,
    correct: exact,
    expected,
    given,
    partial: Number(partial.toFixed(4)),
    note: exact ? '' : exactMissNote(type, expected, given),
  };
}

/** 只有两个选项且内容是"正确/错误"的，按判断题对待（容错老数据 type 标错） */
export function isTrueFalseShape(question) {
  const opts = question?.options;
  if (!Array.isArray(opts) || opts.length !== 2) return false;
  return opts.every((o) => /^(正确|错误|对|错)/.test(String(o)));
}

function exactMissNote(type, expected, given) {
  if (type === 'multi_choice') {
    const missing = expected.filter((x) => !given.includes(x));
    const extra = given.filter((x) => !expected.includes(x));
    const parts = [];
    if (missing.length) parts.push(`漏选 ${missing.join('')}`);
    if (extra.length) parts.push(`多选 ${extra.join('')}`);
    return parts.join('，');
  }
  return `正确选项为 ${expected.join('')}`;
}
