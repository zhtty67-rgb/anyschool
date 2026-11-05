// 生成后处理清单 —— 每次生成完自动打印，不靠人记
//
// 起因（2026-11-05，Qbank 提、Chief 采纳）：
//   新04 改了四遍字数，每遍都是重新生成整个文件。
//   如果之前做过打散，四遍里只要有一次忘了，答案位置就乱了。
//   现在实际答案是 B，位置碰巧没错——"是运气，不是控制"。
//
// 所以这份清单不是"检查工具"，是"生成脚本的回执"：
//   脚本跑完必须调一次 printChecklist()，把下面几项的实际状态印出来。
//   印不出来 = 没人验证过，跟没做一样。
//
// 它查四项（Chief 定的）：
//   ① 项数        每道题有几个选项、是不是四选一
//   ② 答案分布    四个位置各几次；全押一个位置就是没打散
//   ③ 字数离群    有没有哪条明显偏离其余三条
//   ④ 题干原词    选项里有没有出现题干里的具体数值/特定词
//
// ④ 必须说清它的能力边界，否则会被当成保证：
//   它只做**字面比对**——题干里出现过的三位以上数字、或长度 ≥3 的连续实词，
//   如果在某个选项里原样出现，就报。
//   它查不出 "夜里 → 光线不同" 这种上位概念改写（Searcher 划的分寸：
//   选项用上位概念不算泄露）。那要靠人读。
//   也就是说：④ 报出来的**一定**要看；没报出来的**不代表**没有泄露。

import { analyzeQuestion } from '../scripts/check-option-parity.mjs';

/** 取选项正文（兼容 string 与 {text|label|content} 两种写法） */
function optionText(o) {
  if (o == null) return '';
  if (typeof o === 'string') return o;
  return String(o.text ?? o.label ?? o.content ?? o.value ?? '');
}

/** 答案字母 → 下标；认不出返回 null（宁可不判，不猜） */
function answerIndex(q) {
  const a = String(q.answer ?? '').trim().toUpperCase();
  if (!/^[A-D]$/.test(a)) return null;
  return a.charCodeAt(0) - 65;
}

/**
 * 从题干里抽"具体要素"：三位以上数字，以及长度 ≥3 的连续中文实词。
 *
 * 为什么只抽这两种：
 *   · 数字（含百分数）是最硬的泄露源——"七成""三十万张""96%"
 *   · 连续中文词只取 3 字以上，是为了避开"系统""模型"这类通用词
 *     它们出现在选项里很正常，报出来只会变成噪音。
 *
 * 已知局限：这是字面抽取，不是分词。切出来的片段可能跨词（如"训练图的"），
 * 那不影响判定——它只会让"在选项里找到"更难，不会造成误报。
 */
export function stemFacts(stem) {
  const s = String(stem || '');
  const facts = new Set();
  // 数字：两位以上，或带百分号/千分位
  for (const m of s.matchAll(/\d[\d,.]*\s*(?:%|％|万|千|百|成|倍|分钟|小时|天|年|个月)?/g)) {
    const t = m[0].trim();
    // 单个数字（如"4 个选项"里的 4）太常见，不算具体要素；两位以上才算
    if (t.replace(/[^\d]/g, '').length >= 2) facts.add(t);
  }
  // 连续中文片段切 3 字窗口
  for (const m of s.matchAll(/[\u4e00-\u9fa5]{3,}/g)) {
    const run = m[0];
    for (let i = 0; i + 3 <= run.length; i++) facts.add(run.slice(i, i + 3));
  }
  return facts;
}

/**
 * 通用词：出现在选项里正常，不算泄露。
 *
 * 2026-11-05 加。起因是 Qbank 指出"只报有命中，等于没报"——
 * 我按 3 字窗口抽片段，报出「自己找」「有没有」「的结论」「训练时」这种。
 * 它们跨词、是虚词组合、或是时间状语，**不是题干里的具体值**，
 * 落在 Searcher 划的线之外（那条线管的是"夜里""三十万张"这种具体值/特定词）。
 *
 * 判定方式：一个片段里**没有任何实词性的双字组合**，就当成通用词丢掉。
 * 这条判据很粗糙，但它只用来**降噪**，不用来下"没问题"的结论——
 * 报出来的仍然要人看，只是不再被一堆"的结论"淹没。
 */
const FUNCTION_CHARS = new Set('的了是在和与或也就都还又很更最不没为把被让给对从向把着过们这那其之所因此但却而且以于等个一二三四五六七八九十'.split(''));

/** 片段里是否有实词性——有连续两个非虚词字就算 */
function hasContentWord(frag) {
  // 纯数字/数字+单位 的片段直接算"具体要素"，不按实词规则筛
  if (/^\d/.test(frag)) return true;
  for (let i = 0; i + 1 < frag.length; i++) {
    if (!FUNCTION_CHARS.has(frag[i]) && !FUNCTION_CHARS.has(frag[i + 1])) return true;
  }
  return false;
}

/**
 * 窗口里是否"头尾都被虚词包着"——这种片段几乎必然是跨词切出来的噪音。
 * 「的结论」「的样本」「两年的」都是这类：实词在中间，两头挂虚词。
 * 真正要抓的是「30 万张」「夜间录像」「进销记录」这种实打实的片段。
 */
function edgesAreFunction(frag) {
  const head = frag[0];
  const tail = frag[frag.length - 1];
  return FUNCTION_CHARS.has(head) || FUNCTION_CHARS.has(tail)
    ? (FUNCTION_CHARS.has(head) && FUNCTION_CHARS.has(tail))
    : false;
}

/** 选项里原样出现了哪些题干片段 */
export function leakedFacts(stem, opts) {
  const facts = stemFacts(stem);
  const out = [];
  for (let i = 0; i < opts.length; i++) {
    const text = opts[i];
    const hit = [...facts].filter((f) => {
      if (!text.includes(f)) return false;
      // 数字（两位以上）永远算具体要素，不套下面的实词规则
      if (/^\d/.test(f)) return true;
      // 跨词片段：「的结论」「的样本」——实词在中间、两头挂虚词
      if (edgesAreFunction(f)) return false;
      // 纯虚词组合：「有没有」
      return hasContentWord(f);
    });
    if (hit.length) {
      // 同一处连续片段会切出多个窗口（「进销记」「销记录」），
      // 只留最长的那一个，免得报"命中 6 处"其实是一处被切成了 6 段。
      const merged = [];
      for (const f of [...hit].sort((a, b) => b.length - a.length)) {
        if (!merged.some((m) => m.includes(f))) merged.push(f);
      }
      out.push({ index: i, hits: merged });
    }
  }
  return out;
}

/**
 * 把命中拆成两档：具体值 vs 普通词。
 *
 * 2026-11-05 加，起因是 Qbank 指出「只报有命中等于没报」，
 * 而我第一次改完还是把「带结论的样本」和「12 个」混在一栏里报——
 * 前者是切词切出来的普通片段（题干原话本来就这么说，躲不开），
 * 后者是题干里的具体数值（Searcher 划定：选项里出现题干的具体值就算泄露）。
 *
 * 两档的处置完全不同：
 *   · 具体值命中 → 真泄露，要改选项
 *   · 普通片段命中 → 提示，看是不是必要用词，不必一律改
 * 混在一起报，看的人不知道该改哪个。
 */
export function classifyHits(leak) {
  const hard = [];   // 具体数值
  const soft = [];   // 普通片段
  for (const { index, hits } of leak) {
    for (const h of hits) {
      const row = { index, text: h };
      if (/^\d/.test(h)) hard.push(row);
      else soft.push(row);
    }
  }
  return { hard, soft };
}

/**
 * 对一批题生成处理清单。
 * 返回结构化结果 + 一段可直接打印的文本。
 */
export function buildChecklist(pack, { title = '' } = {}) {
  const rows = [];
  const posCount = { 0: 0, 1: 0, 2: 0, 3: 0 };
  const unknownAnswer = [];
  const outliers = [];
  const leakRows = [];
  const notFour = [];

  for (const q of pack || []) {
    const id = q.id || '(无题号)';
    const opts = (q.options || []).map(optionText);
    if (opts.length !== 4) notFour.push({ id, n: opts.length });

    const ai = answerIndex(q);
    if (ai === null) unknownAnswer.push(id);
    else posCount[ai] = (posCount[ai] || 0) + 1;

    // ③ 字数离群：复用形式检查的判据，不另写一套
    const r = analyzeQuestion(q);
    const wo = r.issues.find((i) => i.type === 'word_count_outlier'
      || i.type === 'word_count_shortest_at_answer');
    if (wo) outliers.push({ id, type: wo.type, severity: wo.severity, text: wo.text });

    // ④ 题干原词
    const leak = leakedFacts(q.stem ?? q.question ?? q.prompt ?? '', opts);
    if (leak.length) {
      const { hard, soft } = classifyHits(leak);
      leakRows.push({ id, leak, hard, soft });
    }
  }

  const total = (pack || []).length;
  const answered = total - unknownAnswer.length;
  // 打散合格 = 有答案的题里，最集中的那个位置没超过 60%
  //
  // 一道答案都认不出时必须是 null，不是 false：
  //   false 会被读成"打散不合格"，null 才是"没测"。
  // 这和"选项不足四道 = 没测，不是没问题"是同一条原则——
  // 判不了的时候，不能让它显示成判过了，也不能显示成判否了。
  // 原来就栽在这里：空题包算出 NaN%，被当成抽签失败报出去。
  const maxPos = answered === 0 ? 0 : Math.max(...Object.values(posCount));
  const shuffledOk = answered === 0 ? null : maxPos / answered <= 0.6;

  const checks = [
    {
      name: '① 项数',
      ok: notFour.length === 0,
      detail: notFour.length === 0
        ? `全部四选一（${total} 道）`
        : `${notFour.length} 道不是四选一：${notFour.map((x) => `${x.id}(${x.n})`).join(', ')}`,
    },
    {
      name: '② 答案分布',
      ok: shuffledOk !== false,
      detail: answered === 0
        ? '没有可识别的答案字母，无法判断（不是"通过"，是"没测"）'
        : `A${posCount[0]} B${posCount[1]} C${posCount[2]} D${posCount[3]}` +
          `（共 ${answered} 道；最集中 ${maxPos} 道 = ${(maxPos / answered * 100).toFixed(0)}%）` +
          (shuffledOk ? '' : ' ← 集中在同一个位置，等于没打散') +
          (unknownAnswer.length ? `；${unknownAnswer.length} 道答案认不出：${unknownAnswer.slice(0, 6).join(', ')}` : ''),
    },
    {
      name: '③ 字数离群',
      ok: outliers.length === 0,
      detail: outliers.length === 0
        ? '四选项字数齐，无离群'
        : `${outliers.length} 道有离群：${outliers.map((x) => x.id).join(', ')}`,
    },
    {
      name: '④ 题干原词',
      // 只有"具体数值"命中才算这一项不过。
      // 普通片段命中（如「带结论的样本」这种切词产物）降为提示，不算问题——
      // 题干原话就这么说，选项要解释同一个机制，躲不开。
      // 自 2026-11-05：Qbank 指出"只报有命中等于没报"，而两档处置完全不同，必须分开。
      ok: leakRows.every((x) => x.hard.length === 0),
      detail: leakRows.length === 0
        ? '没查到题干片段原样出现在选项里——这只等于「字面没重合」，不等于这一项没问题：'
          + '上位概念改写查不出（「夜里」写成「光线不同」就看不见），选项之间的内容差别也查不出'
        : [
            leakRows.some((x) => x.hard.length)
              ? `${leakRows.filter((x) => x.hard.length).length} 道选项里出现题干的具体数值（要改）：` +
                leakRows.filter((x) => x.hard.length).map((x) => x.id).join(', ')
              : '',
            leakRows.some((x) => x.soft.length)
              ? `${leakRows.filter((x) => x.soft.length).length} 道只有普通片段命中（看是不是必要用词，不必一律改）：` +
                leakRows.filter((x) => x.soft.length).map((x) => x.id).join(', ')
              : '',
          ].filter(Boolean).join('；'),
    },
  ];

  return {
    title,
    total,
    checks,
    posCount,
    answered,
    shuffledOk,
    outliers,
    leakRows,
    notFour,
    unknownAnswer,
  };
}

/** 把人看的那段文本拼出来 */
export function formatChecklist(r) {
  const lines = [];
  const head = r.title ? `处理清单 · ${r.title}` : '处理清单';
  lines.push(`── ${head} ──`);
  lines.push(`题数：${r.total}`);

  // 空题包：什么都没查，不能印四个 ✔。
  // 这是最坏的误报形态——"全部通过"看起来比"报了 1 个问题"更像好消息，
  // 但它其实一个数都没算。干脆整份换成"没测"，连 ✔ 都不给。
  if (r.total === 0) {
    lines.push('  ✘ 没测：题包里一道题都没有，四项一项都没跑。');
    lines.push('  → 不能交。这不是"通过"，是根本没查。');
    return lines.join('\n');
  }

  for (const c of r.checks) {
    // ok 可以是 null（判不了）。三态：true 过 / false 不过 / null 没测。
    // 用 "?" 表示没测，不给 ✔ 也不给 ✘。
    const mark = c.ok === null ? '?' : (c.ok ? '✔' : '✘');
    lines.push(`  ${mark} ${c.name}：${c.detail}`);
  }
  const bad = r.checks.filter((c) => c.ok === false).length;
  const undecided = r.checks.filter((c) => c.ok === null).length;
  if (bad) lines.push(`  → ${bad} 项未过，这个题包不能直接交。`);
  else if (undecided) lines.push(`  → ${undecided} 项判不了（不是"通过"，是"没测"）。`);
  else lines.push('  → 四项都过。');
  lines.push('  注：四项都过 ≠ 题目合格。④ 只查字面，查不出上位概念改写；');
  lines.push('      ① ② ③ 查的是形式，题目会不会被读懂逻辑「读出来」，脚本一点都管不到。');
  return lines.join('\n');
}

/** 生成脚本跑完后调这一句，把清单印出来 */
export function printChecklist(pack, opts = {}) {
  const r = buildChecklist(pack, opts);
  console.log(formatChecklist(r));
  return r;
}
