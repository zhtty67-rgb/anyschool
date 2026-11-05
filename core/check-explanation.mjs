// 解析质量检查：解析是给学生看的话，不能混入给机器核对的文本
//
// 两条规则：
//   EXPLAIN_MACHINE_TEXT   解析里出现"对照选项：""错项A""选项A："这类机器标记
//   EXPLAIN_OPTION_MISSING 解析里引用的「错项「XXX」」，XXX 在 options 里找不到
//
// 第二条比第一条有用：它同时能抓"引用了不存在的选项"和"错项解析串位"。
//
// 用法：node core/check-explanation.mjs <题包.jsonl>
import { readFileSync, existsSync } from 'node:fs';

// 给机器看的文本标记（学生看到会困惑：选项已经列在上方了）
const MACHINE_MARK = /(对照选项|错项[A-Za-z0-9]+\s*[「:：]|正确项[A-Za-z0-9]+\s*[「:：]|选项\s*[A-D]\s*[：:]|^\s*[A-D]\s*[.、：:])/m;

// 「正确答案是 A」「答案是 B」「选 C」这类字母指代。
// 打散选项顺序后，这类指代最容易和实际答案错位——那是学生按解析做题会直接做错的错。
const ANSWER_LETTER = /(?:正确答案|答案|应?选|应当选|正确选项)\s*(?:是|为|：|:)?\s*([A-D])(?![A-Za-z0-9])/g;

/**
 * 检查解析里的字母指代是否与实际答案一致。
 * 判法（Chief 定的）：把字母换成选项原文，再和 answer_text / options[正确下标] 比对。
 * @returns {Array<{id, letter, expectOption, expectAnswer}>}
 */
function checkAnswerLetters(q) {
  const out = [];
  const exp = String(q.explanation || '');
  const opts = Array.isArray(q.options) ? q.options : [];
  if (!exp || !opts.length) return out;

  const ans = String(q.answer || '').toUpperCase().replace(/[^A-Z]/g, '');
  const correctIdx = ans.charCodeAt(0) - 65;
  const correctText = String(q.answer_text || opts[correctIdx] || '').trim();

  let m;
  ANSWER_LETTER.lastIndex = 0;
  while ((m = ANSWER_LETTER.exec(exp))) {
    const letter = m[1].toUpperCase();
    const idx = letter.charCodeAt(0) - 65;
    const implied = String(opts[idx] || '').trim();
    // 字母指向的选项必须就是正确答案
    const sameAsAnswer = ans === letter;
    // 或者字母指向的选项文本和 answer_text 等价
    const sameText = implied && correctText && (implied === correctText);
    if (!sameAsAnswer && !sameText) {
      out.push({ id: q.id, letter, expectOption: implied.slice(0, 40), expectAnswer: correctText.slice(0, 40) });
    }
  }
  return out;
}

/** 抽取解析里引用的「错项「...」」或「正确项「...」」的文本 */
function extractQuotedOptions(explanation) {
  const out = [];
  const re = /(?:错项|正确项|选项)\s*[「“"]([^」”"]+)[」”"]/g;
  let m;
  while ((m = re.exec(explanation))) out.push(m[1].trim());
  return out;
}

/** 判断一段引用是否对应某个真实选项
 *
 * 判据演进（两次调整，都是被真实数据逼出来的）：
 *
 * 第一版：字面前缀匹配。
 *   结果 c0101 误报 34 处——出题人会改写引用，不会照抄。太严。
 *
 * 第二版：60% 实词覆盖。
 *   结果全部放行，包括「属于，因为自动回复」这种把原文抽得只剩骨架的改写。
 *   但学生照着解析去选项里找，根本找不到这句，会困惑。太松。
 *
 * 第三版（当前）：引用必须是某个选项里的**连续片段**。
 *   · 完整照抄 → 通过
 *   · 省略式「属于…因为自动回复」→ 通过（保留了原文语序的连续片段）
 *   · 改写式「属于，因为自动回复」（把"人工智能""它""了用户"抽掉重排）→ 报
 *
 * 判法：把引用按「…」「...」切成若干片段，每个片段都必须是某选项的子串，
 * 且片段总长占引用的比例够高（避免「属于」两个字就蒙混过关）。
 */
function segments(quoted) {
  return String(quoted)
    .split(/…|\.\.\.|．{2,}/)
    .map((s) => s.replace(/[，。；、\s]+$/g, '').replace(/^[，。；、\s]+/g, '').trim())
    .filter(Boolean);
}

function matchesOption(quoted, options) {
  const q = String(quoted).trim();
  if (!q) return true;
  const segs = segments(q);
  if (!segs.length) return true;
  const totalLen = segs.reduce((n, s) => n + s.length, 0);

  let bestCovered = 0;
  for (const o of options) {
    const opt = String(o).trim();
    if (opt === q) return true;
    let covered = 0;
    let allHit = true;
    for (const s of segs) {
      if (opt.includes(s)) covered += s.length;
      else { allHit = false; break; }
    }
    if (allHit) return true;             // 每个片段都在这个选项里，且顺序被包含
    bestCovered = Math.max(bestCovered, covered);
  }
  // 兜底：单片段且足够长时，允许它是选项的子串（已由 allHit 覆盖）；
  // 这里再给「片段覆盖率 >= 80% 且每个片段长度 >= 4」留一条窄路，
  // 应对选项里有个别标点差异的情况。
  if (segs.every((s) => s.length >= 4) && bestCovered / totalLen >= 0.8) return true;
  return false;
}

/**
 * @param {Array} questions
 * @returns {{machine: Array, missing: Array, total: number, checked: number}}
 */
export function checkExplanation(questions) {
  const machine = [];
  const missing = [];
  const letterMismatch = [];
  let checked = 0;
  for (const q of questions || []) {
    if (!q || typeof q !== 'object') continue;
    const exp = String(q.explanation || '');
    if (!exp) continue;
    checked += 1;

    if (MACHINE_MARK.test(exp)) {
      const hit = exp.match(MACHINE_MARK);
      machine.push({ id: q.id, mark: hit ? hit[0].trim() : '' });
    }

    const opts = Array.isArray(q.options) ? q.options : [];
    if (!opts.length) continue;
    for (const quoted of extractQuotedOptions(exp)) {
      if (!matchesOption(quoted, opts)) {
        missing.push({ id: q.id, quoted: quoted.slice(0, 40) });
      }
    }

    // 「正确答案是 A」这类字母指代，必须与实际答案一致
    for (const lm of checkAnswerLetters(q)) letterMismatch.push(lm);
  }
  return { machine, missing, letterMismatch, total: (questions || []).length, checked };
}

// CLI
const invokedDirectly = process.argv[1] && /check-explanation\.mjs$/.test(process.argv[1]);
if (invokedDirectly) {
  const path = process.argv[2];
  if (!path || !existsSync(path)) { console.error('用法: node core/check-explanation.mjs <题包.jsonl>'); process.exit(2); }
  const qs = readFileSync(path, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
  const r = checkExplanation(qs);
  console.log(`题包：${path}`);
  console.log(`共 ${r.total} 道，检查解析 ${r.checked} 道`);
  console.log(`机器标记：${r.machine.length} 道`);
  r.machine.slice(0, 10).forEach((x) => console.log(`  ${x.id}  含「${x.mark}」`));
  console.log(`引用对不上的错项：${r.missing.length} 道`);
  r.missing.slice(0, 10).forEach((x) => console.log(`  ${x.id}  引用「${x.quoted}」在 options 里找不到`));
  console.log(`字母指代与实际答案不符：${r.letterMismatch.length} 道`);
  r.letterMismatch.slice(0, 10).forEach((x) => console.log(`  ${x.id}  解析写「正确答案是 ${x.letter}」，但该字母指向「${x.expectOption}」，实际答案是「${x.expectAnswer}」`));
  const bad = r.machine.length + r.missing.length + r.letterMismatch.length;
  process.exit(bad ? 1 : 0);
}
