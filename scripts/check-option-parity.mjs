// 选项形式对等检查（只查形式，不查内容）
//
// 来源（2026-11-05，Chief 定）：c0103-01 改了六版，小白每版都能一眼选出正确答案，
// 靠的都不是懂概念，而是某个"形式特征"：句式、连接词、字数、结尾、语气。
//
// 这个脚本只做一件事：把四个选项在**不用读内容**就能比出来的四个维度上量一遍，
// 看有没有哪一条"显得特殊"。有，就是形式泄露。
//
// 它查不出什么（必须写在前面，否则会被当成质量保证）：
//   · 查不出"四个选项是不是都成立"——那是内容问题，只有人读得出
//   · 查不出"要不要拿它当判据"——形式对齐的题也可能是空题
// 所以它不进构建、不阻断发布。只给人看，供写题时自查。
//
// 用法：
//   node scripts/check-option-parity.mjs <题包.jsonl> [--only-flagged]
//   node scripts/check-option-parity.mjs <题包.jsonl> --json
import { readFileSync, existsSync } from 'node:fs';
import { basename } from 'node:path';

/** 连接词：读了能感觉出"在推论"的词，和"在并列"的词 */
const CONNECTIVES = ['所以', '因此', '因而', '于是', '从而', '才', '而', '但', '不过', '却'];

/** 取选项正文（兼容 string 与 {text|label|content} 两种写法） */
function optionText(o) {
  if (o == null) return '';
  if (typeof o === 'string') return o;
  return String(o.text ?? o.label ?? o.content ?? o.value ?? '');
}

/** 选项开头的 N 个字（去空白），用来比"句式是不是一样" */
function head(s, n = 4) {
  return String(s).replace(/\s+/g, '').slice(0, n);
}

/** 选项结尾的 N 个字 */
function tail(s, n = 4) {
  return String(s).replace(/\s+/g, '').slice(-n);
}

/** 命中的连接词（按首次出现位置） */
function connectiveOf(s) {
  for (const c of CONNECTIVES) {
    if (String(s).includes(c)) return c;
  }
  return '';
}

/**
 * 分析一道题。
 * @returns {{id:string, n:number, lenSpread:number, lens:number[], headUnique:number,
 *            tails:[string,string], connectiveModes:Array, flags:string[]}}
 */
export function analyzeQuestion(q) {
  const opts = (q.options || []).map(optionText);
  const lens = opts.map((s) => s.replace(/\s+/g, '').length);
  const heads = opts.map((s) => head(s));
  const tails = opts.map((s) => tail(s));
  const cons = opts.map(connectiveOf);

  // 正确答案的位置（0-based）。只认单字母 A/B/C/D；认不出就记 null，
  // 宁可不算"位置泄露"，也不去猜。
  const answerIndex = (() => {
    const a = String(q.answer ?? '').trim().toUpperCase();
    if (!/^[A-D]$/.test(a)) return null;
    const i = a.charCodeAt(0) - 65;
    return i < opts.length ? i : null;
  })();

  const lenSpread = lens.length ? Math.max(...lens) - Math.min(...lens) : 0;
  const headUnique = new Set(heads).size;

  // 结尾：最多的一类占几个
  const tailCount = {};
  for (const t of tails) tailCount[t] = (tailCount[t] || 0) + 1;
  const tailMax = Math.max(0, ...Object.values(tailCount));
  const tailMinority = tails.length - tailMax;

  // 连接词：有几种不同取值。全是同一个词 = 一致；只有一个不同 = 泄露
  const consCount = {};
  for (const c of cons) consCount[c] = (consCount[c] || 0) + 1;
  const consValues = Object.keys(consCount);

  const flags = [];
  // 结构化的问题清单，和 flags 一一对应但不靠中文文字区分。
  //
  // 2026-11-05 加，来自 Chief 的指出：我自己的统计脚本按"提示语里有没有『字数』两个字"
  // 去筛问题，结果严重级的那条提示改名为「【严重】离群项正好是正确答案」后不含"字数"，
  // 21 道被漏掉，算出 42 < 45 这种不可能的数。
  // 问题不在提示语好坏，在"靠名字找东西，而名字会变"——和用文件名当判据是同一个错。
  // 所以每类问题都带上 type / severity 两个机器可读字段，下游按字段筛，不要读中文。
  const issues = [];
  const addIssue = (text, type, severity, extra = {}) => {
    flags.push(text);
    issues.push({ type, severity, text, ...extra });
  };

  // ① 字数：极差过大 → 报
  if (lens.length >= 2) {
    const sorted = [...lens].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    if (lenSpread >= 12) {
      addIssue(
        `字数极差 ${lenSpread}（${lens.join('/')}），中位数 ${median}`,
        'word_count_spread', 'medium', { lenSpread, lens },
      );
    }
  }

  // ①-b 字数离群：极差不大，但有一条明显偏离其余三条 → 也要报
  //
  // 2026-11-05 加，来自小白在 c0202-02 v2 上的实测：
  //   39/43/43/40，极差只有 4，极差判据完全不响。
  //   但它说"我注意到 A 最短，反而信了它，因为最短的那条通常不是凑数的"。
  // 说明读者感觉到的不是"极差"，而是"这个数和另外三个不一样"。
  //
  // 判法：对每一条，拿其余三条的平均值和它比，超过阈值就算离群。
  // 但只报最极端的那一条：逐条比会把"另一侧两个"也算进来，
  // 39/43/43/40 会一次报三条（39 偏短、两个 43 偏长），那是噪音。
  // 真正被读者挑出来的是"偏离最多的那一个"。
  //
  // 阈值为什么从 2 提到 5（2026-11-05，Qbank 实测后定）：
  //   设 2 时他那 9 道题全被报——c0103-n3 的 [21/22/21/45] 四条全中。
  //   这批选项普遍 20–50 字，差 2 个字读者根本感觉不到。
  //   全报等于没报，人直接忽略。所以统一提到 5。
  const OUTLIER_THRESHOLD = 5;
  if (lens.length >= 4) {
    let worst = null;
    for (let i = 0; i < lens.length; i++) {
      const others = lens.filter((_, j) => j !== i);
      const avg = others.reduce((a, b) => a + b, 0) / others.length;
      const delta = Math.abs(lens[i] - avg);
      if (delta > OUTLIER_THRESHOLD && (!worst || delta > worst.delta)) worst = { i, avg, delta };
    }
    if (worst) {
      const where = lens[worst.i] > worst.avg ? '偏长' : '偏短';
      const isAnswerPos = answerIndex !== null && answerIndex === worst.i;

      // 答案项的离群值另附（2026-11-05，Chief 定）：
      //   每道题只列离群最大的那一项，人才能看得过来；
      //   但如果最大的那项不是答案，就把答案项的离群值补在后面——
      //   既不丢信息，也不刷屏。
      let answerNote = '';
      if (!isAnswerPos && answerIndex !== null) {
        const othersForAns = lens.filter((_, j) => j !== answerIndex);
        const ansAvg = othersForAns.reduce((a, b) => a + b, 0) / othersForAns.length;
        const ansDelta = Math.abs(lens[answerIndex] - ansAvg);
        answerNote = `；答案项（第 ${answerIndex + 1} 个）差 ${ansDelta.toFixed(1)}`
          + (ansDelta > OUTLIER_THRESHOLD ? '，也离群' : '，未离群');
      }

      // 分两类（2026-11-05，Chief 定）：
      //   离群项是**正确答案** → 严重：读者注意哪条不一样，答案就在那儿。
      //   离群项是**干扰项**     → 只是显眼，不一定要改。
      // 混在一起报，读者就不看了。实测 c0202-新01 里干扰项 D 差 11.33，
      // 比答案项的 3.33 远得多，可 D 并不是问题所在。
      const prefix = isAnswerPos
        ? '【严重】离群项正好是正确答案'
        : '离群项是干扰项（只是显眼，不一定要改）';
      addIssue(
        `${prefix}：第 ${worst.i + 1} 个 ${lens[worst.i]} 字，${where}，与其余三个均值 ${worst.avg.toFixed(1)} 差 ${worst.delta.toFixed(1)}（${lens.join('/')}）${answerNote}`,
        // 同一个 type，severity 区分轻重：下游要数"有多少道有字数问题"就按 type 筛，
        // 不看提示语里有没有"字数"两个字——那样会漏掉严重级那批。
        'word_count_outlier', isAnswerPos ? 'high' : 'low',
        { index: worst.i, atAnswerPos: isAnswerPos, delta: Number(worst.delta.toFixed(1)), lens },
      );
    }
  }

  // ①-c 反向线索：最短的那一条是不是正确答案
  //
  // 2026-11-05 加，来自小白在 c0202 上的实测，原话：
  //   「我注意到 A 最短，反而信了它，因为最短的那条通常不是凑数的。」
  // 这和"正确项最长"正好是相反方向。旧判据只把"最长"当毛病，
  // 因为写题的人天然想把正确答案写周全——但读者不这么读：
  // 三条长的像在凑字数，最短的那条像"别的都废话，就它说了实话"。
  //
  // 所以离群的**方向**比离群本身更关键：
  //   · 离群项偏长 → 是"正确项最长"，读者当它是总结
  //   · 离群项偏短 → 是"最短的不是凑数的"，读者当它是不掺水的判断
  // 两头都是位置泄露，只是读法不同。这一级专门管偏短那一头，
  // 因为偏长那一头旧的"答案位升级"已经按严重算了。
  //
  // 注意：判的是"最短的那条 == 正确答案"，不是"有一条短"。
  // 最短但不落在答案位，说明读者按这个方向猜也猜不中，只是噪音，不报。
  //
  // 阈值统一（2026-11-05，Qbank 指出）：这一级原来用"与中位数差 ≥3"，
  // 而上面 ①-b 的离群判据用的是"与其余三项均值差 >2"。
  // 同一个东西两个方向的阈值不一样，以后一定打架。
  // 现在统一成同一条：**与其余三项的均值差 >2 字**，方向不限。
  if (lens.length >= 4 && answerIndex !== null) {
    const minLen = Math.min(...lens);
    const others = lens.filter((_, i) => i !== answerIndex);
    const othersAvg = others.reduce((a, b) => a + b, 0) / others.length;
    // 答案项是最短的，且比其余三项均值短超过 2 字
    const shortIsAnswer = lens[answerIndex] === minLen && (othersAvg - lens[answerIndex]) > 2;
    if (shortIsAnswer) {
      addIssue(
        `最短的那条正好是正确答案：第 ${answerIndex + 1} 个 ${minLen} 字，其余三项均值 ${othersAvg.toFixed(1)}` +
          `，短 ${(othersAvg - minLen).toFixed(1)} 字（${lens.join('/')}）` +
          `——读者会觉得"最短的那条通常不是凑数的"，方向和"正确项最长"相反`,
        'word_count_shortest_at_answer', 'high',
        { index: answerIndex, lens, minLen, othersAvg: Number(othersAvg.toFixed(1)) },
      );
    }
  }

  // ② 开头句式：四句里有三句同、一句不同 → 那句会被挑出来
  if (headUnique === 2 && opts.length >= 3 && Math.max(...Object.values(heads.reduce((m, h) => { m[h] = (m[h] || 0) + 1; return m; }, {}))) === opts.length - 1) {
    addIssue(`开头句式 3 句同、1 句不同（${heads.join(' | ')}）`, 'head_pattern', 'medium', { heads });
  }

  // ③ 连接词：三句用一个词、一句用另一个 → 泄露
  if (consValues.length === 2) {
    const minor = consValues.find((v) => consCount[v] === 1) ?? '';
    addIssue(
      `连接词 3 句一致、1 句是「${minor || '无'}」（${cons.map((c) => c || '—').join('/')}）`,
      'connective', 'low', { connectives: cons },
    );
  }

  // ④ 结尾后缀：三句同、一句不同
  if (opts.length >= 3 && tailMinority === 1) {
    const odd = tails.find((t) => tailCount[t] === 1) ?? '';
    addIssue(`结尾 3 句同、1 句是「${odd}」（${tails.join(' | ')}）`, 'tail_pattern', 'low', { tails });
  }

  return {
    id: q.id || '(无题号)',
    n: opts.length,
    // 这四个维度都要求"四个选项才能比"。选项不足四道时，comparables=false：
    // 不是"没问题"，是"没测"。这个区别必须显式带出来，否则会被当成覆盖度报告用。
    comparables: opts.length >= 4,
    lens,
    lenSpread,
    headUnique,
    tails,
    connectives: cons,
    // 正确答案所在下标（0-based），认不出就是 null。
    // 下游要用它区分"只是答案位置特殊"和"长度本身离群"——这两种改法完全不同。
    answerIndex,
    flags,     // 给人看的完整句子
    issues,    // 给程序筛的结构化清单：{type, severity, text, ...}
  };
}

/** 对整个题包跑一遍 */
export function checkPack(pack) {
  const rows = (pack || []).map(analyzeQuestion);
  const flagged = rows.filter((r) => r.flags.length);
  // 选项不足四道的题（判断题等）：这套判据根本不适用，单独计数
  const skipped = rows.filter((r) => !r.comparables);

  // 按结构化字段统计，不按中文提示语。理由见上面 addIssue 的注释。
  const byType = {};
  const bySeverity = {};
  for (const r of rows) {
    for (const i of r.issues) {
      byType[i.type] = (byType[i.type] || 0) + 1;
      bySeverity[i.severity] = (bySeverity[i.severity] || 0) + 1;
    }
  }
  // 有字数问题的题数：按 type 筛，严重级也算在内（这就是我上次漏掉的 21 道）
  const withWordCount = rows.filter((r) => r.issues.some((i) => i.type.startsWith('word_count'))).length;
  const severeRows = rows.filter((r) => r.issues.some((i) => i.severity === 'high'));

  return {
    total: rows.length,
    comparable: rows.length - skipped.length,
    skipped: skipped.length,
    skippedIds: skipped.map((r) => r.id).slice(0, 20),
    clean: rows.length - flagged.length,
    flagged,
    // 按"命中几个维度"排序，多维度同时泄露的最值得先看
    worst: [...flagged].sort((a, b) => b.flags.length - a.flags.length),
    // 结构化统计：谁要数什么按字段来，不要读中文
    byType,
    bySeverity,
    withWordCount,           // 有字数类问题的题数（含严重级）
    severe: severeRows,      // 离群项落在答案位的那批
    severeCount: severeRows.length,
  };
}

// CLI
const invokedDirectly = process.argv[1] && /check-option-parity\.mjs$/.test(process.argv[1]);
if (invokedDirectly) {
  const args = process.argv.slice(2);
  const path = args.find((a) => a.endsWith('.jsonl'));
  const onlyFlagged = args.includes('--only-flagged');
  const asJson = args.includes('--json');

  if (!path || !existsSync(path)) {
    console.error('用法: node scripts/check-option-parity.mjs <题包.jsonl> [--only-flagged] [--json]');
    process.exit(2);
  }
  const pack = readFileSync(path, 'utf8').split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));
  if (!pack.length) {
    console.error(`题包里一道题都没有：${path}\n  这不正常，先查文件，别把空包当成"没有问题"`);
    process.exit(2);
  }

  const r = checkPack(pack);
  if (asJson) {
    console.log(JSON.stringify({ file: basename(path), ...r }, null, 2));
    process.exit(0);
  }

  console.log(`题包：${path}`);
  console.log(
    `题目 ${r.total} 道；可比较（四选一）${r.comparable} 道；` +
      `不适用的 ${r.skipped} 道；形式对齐 ${r.clean} 道；有形式泄露 ${r.flagged.length} 道`,
  );
  // 尺子说明（2026-11-05，Chief 定的规矩）：
  // 这个数一变，必须同时说清是"题变了"还是"尺子变了"，否则没法比。
  console.log(
    `  〔尺子：极差≥12 + 开头/结尾三同一异 + 连接词两值 + 字数离群>2字 + 离群项在答案位升级 + 最短那条落在答案位〕`,
  );
  // 这条必须写出来，否则会被当成"形式检查能防住猜答案"：
  // 脚本量的是字数差，读者感觉的是"哪条不一样"。方向判断（长=总结、短=不掺水）
  // 是人读出来的，脚本只是把"会被挑出来的位置"标出来，管不了读者怎么解读。
  console.log(
    `  〔它测不到的：读者会往哪个方向解读离群。"正确项最长"是当总结，"最短的"是当不掺水的判断——` +
      `两头都防，但脚本只知道哪条离群，不知道读者会信哪一头〕`,
  );
  console.log(
    `  〔参照：同一份 v9 在旧尺子（只有前三条、无离群）下是 121 道，新尺子是 194 道——` +
      `差的是尺子，不是题。换判据后必须两个数一起说。〕`,
  );
  if (r.skipped) {
    console.log(
      `\n⚠ 有 ${r.skipped} 道不是四选一（判断题等），这四项判据对它们不成立——` +
        `它们不在上面任何一类里，是"没测"，不是"没问题"。`,
    );
    console.log(`  例：${r.skippedIds.join(', ')}${r.skipped > r.skippedIds.length ? ' …' : ''}`);
  }
  console.log('');

  if (!r.flagged.length) {
    console.log('四个形式维度都没发现问题。');
  } else {
    for (const row of onlyFlagged ? r.worst : r.flagged) {
      console.log(`${row.id}  （命中 ${row.flags.length} 项）`);
      for (const f of row.flags) console.log(`    · ${f}`);
    }
  }

  console.log('\n注意：形式对齐 ≠ 题目合格。');
  console.log('  这个脚本查不出"四个选项是不是都成立"——那要人读。');
  console.log('  它查不出"这条题测不测得出东西"——那要外行真做一遍。');
  // 只供参考，永远不阻断
  process.exit(0);
}
