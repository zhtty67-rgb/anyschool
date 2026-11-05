// 题目接入检查器 —— Qbank 交题后第一步跑这个，格式不对立刻报。
// 用法：
//   node core/check-pack.mjs <题目文件.jsonl>
//   node core/check-pack.mjs <题目文件.jsonl> --strict   # 把警告也当失败

import { readFileSync, existsSync } from 'node:fs';
import { parseTree } from './tree.mjs';
import { grade, parseAnswerKey, isTrueFalseShape } from './grade.mjs';
import { calcTagFindings } from './check-calc-tags.mjs';

const VALID_TYPES = new Set(['single_choice', 'multi_choice', 'judge']);

export function checkPack(path, opts = {}) {
  const strict = !!opts.strict;
  const errors = [];
  const warnings = [];
  const tree = parseTree();
  const conceptByCode = new Map(tree.concepts.map((c) => [c.code, c]));

  if (!existsSync(path)) {
    return { ok: false, errors: [{ code: 'FILE_MISSING', message: `文件不存在：${path}` }], warnings, stats: null };
  }

  const lines = readFileSync(path, 'utf8').split(/\r?\n/).filter((l) => l.trim());
  const questions = [];
  lines.forEach((line, i) => {
    const where = `第 ${i + 1} 行`;
    let q;
    try { q = JSON.parse(line); }
    catch (e) { errors.push({ code: 'BAD_JSON', where, message: e.message }); return; }
    questions.push({ q, where });
  });

  const seenIds = new Map();
  const questionsPerNode = new Map();
  const misconUsed = new Map();
  const basisDeps = new Set();   // 题包引用到的第三方素材，供构建层校验署名有没有对应声明
  const nodeBasis = {};
  const infos = [];               // 信息级提示，不计入警告          // 按节点统计 basis，供教材覆盖检查
  const nodeBasisValues = {};   // 该节点下出现过的 basis 取值，用于识别整批标注

  for (const { q, where } of questions) {
    const id = q.id;
    // --- id ---
    if (!id || typeof id !== 'string') {
      errors.push({ code: 'ID_MISSING', where, message: 'id 缺失' });
    } else {
      if (seenIds.has(id)) errors.push({ code: 'ID_DUPLICATE', where, id, message: `id 重复：${id}（首次出现在 ${seenIds.get(id)}）` });
      else seenIds.set(id, where);
      if (id.includes('_')) warnings.push({ code: 'ID_UNDERSCORE', where, id, message: 'id 用了下划线，约定连字符' });
    }

    // --- type ---
    if (!VALID_TYPES.has(q.type)) {
      errors.push({ code: 'TYPE_INVALID', where, id, message: `type 非法：${q.type}，只允许 ${[...VALID_TYPES].join('/')}` });
    }

    // --- options ---
    if (!Array.isArray(q.options)) {
      errors.push({ code: 'OPTIONS_NOT_ARRAY', where, id, message: 'options 不是数组' });
    } else {
      if (q.options.length < 2 || q.options.length > 5) {
        errors.push({ code: 'OPTIONS_COUNT', where, id, message: `options 有 ${q.options.length} 个，需 2-5 个` });
      }
      if (q.options.some((o) => typeof o !== 'string' || !o.trim())) {
        errors.push({ code: 'OPTIONS_EMPTY', where, id, message: 'options 有空项或非字符串' });
      }
      if (new Set(q.options.map((o) => String(o).trim())).size !== q.options.length) {
        warnings.push({ code: 'OPTIONS_DUP', where, id, message: 'options 有重复文本' });
      }
    }

    // --- answer ---
    const letters = parseAnswerKey(q.answer);
    if (letters.length === 0) {
      errors.push({ code: 'ANSWER_MISSING', where, id, message: 'answer 缺失或无法解析' });
    } else if (Array.isArray(q.options) && q.options.length > 0) {
      const overflow = letters.filter((l) => l.charCodeAt(0) - 65 >= q.options.length);
      if (overflow.length) errors.push({ code: 'ANSWER_OUT_OF_RANGE', where, id, message: `answer 字母 ${overflow.join('')} 超出 ${q.options.length} 个选项` });
    }
    if (q.type === 'single_choice' && letters.length !== 1) {
      errors.push({ code: 'ANSWER_COUNT', where, id, message: `单选题 answer 却有 ${letters.length} 个字母` });
    }
    if (q.type === 'judge' && letters.length !== 1) {
      errors.push({ code: 'ANSWER_COUNT', where, id, message: '判断题 answer 必须是单个字母' });
    }
    if (q.type === 'multi_choice' && letters.length < 2) {
      warnings.push({ code: 'MULTI_SINGLE_ANSWER', where, id, message: '多选题只有一个正确答案，退化成单选' });
    }

    // --- nodes ---
    if (!Array.isArray(q.nodes)) {
      errors.push({ code: 'NODES_NOT_ARRAY', where, id, message: 'nodes 不是数组（这是 412 道 MMLU 的通病）' });
    } else if (q.nodes.length === 0) {
      errors.push({ code: 'NODES_EMPTY', where, id, message: 'nodes 为空，挂不上知识树' });
    } else {
      if (q.nodes.length > 1) warnings.push({ code: 'NODES_MULTI', where, id, message: `一道题挂了 ${q.nodes.length} 个节点，Chief 要求一题一概念` });
      for (const n of q.nodes) {
        if (typeof n !== 'string') { errors.push({ code: 'NODE_TYPE', where, id, message: `节点 ${n} 不是字符串` }); continue; }
        if (!conceptByCode.has(n)) { errors.push({ code: 'NODE_UNKNOWN', where, id, message: `节点 ${n} 在知识树里不存在` }); continue; }
        questionsPerNode.set(n, (questionsPerNode.get(n) || 0) + 1);
      }
    }

    // --- 解析 ---
    const ex = String(q.explanation || '').trim();
    if (!ex) {
      errors.push({ code: 'EXPLAIN_MISSING', where, id, message: '没有解析' });
    } else if (ex.length < 20) {
      warnings.push({ code: 'EXPLAIN_SHORT', where, id, message: `解析只有 ${ex.length} 字，太短` });
    } else if (/^MMLU 官方答案[:：]/.test(ex)) {
      errors.push({ code: 'EXPLAIN_TEMPLATE', where, id, message: '解析是 MMLU 模板文本，不是真解析' });
    } else if (Array.isArray(q.options) && q.options.length > 1) {
      // 判断题只有"正确/错误"两个选项，没有干扰项可解释
      // 它要讲的是"为什么这句话成立/不成立"，跟选择题的量尺不同，单独设阈值
      const isJudge = q.type === 'judge' || isTrueFalseShape(q);
      if (isJudge) {
        if (ex.length < 30) {
          warnings.push({
            code: 'EXPLAIN_JUDGE_SHORT',
            where, id,
            message: `判断题解析 ${ex.length} 字，至少要 30 字讲清这句话为什么成立或不成立`,
          });
        }
        // 判断题解析要正面回应题干，但"有没有回应"机器判不准：
        // 好的解析会改写题干（"在测试集上调参"="把测试集变成训练集的一部分"），
        // 字面重叠低不代表没回应。所以只查两件确定能做到的事：
        //   1) 解析首句给出明确判定，且与 answer 一致
        //   2) 解析给出了支撑（反向论证或因果说明），不是干巴巴一句判断
        const head = ex.slice(0, 12);
        const saysRight = /^(正确|对|√|成立)/.test(head);
        const saysWrong = /^(错误|错|×|不成立|不对)/.test(head);
        const expectedRight = parseAnswerKey(q.answer)[0] === 'A';
        if (!saysRight && !saysWrong) {
          warnings.push({
            code: 'EXPLAIN_JUDGE_NO_VERDICT',
            where, id,
            message: '判断题解析开头没有明确给出「正确」或「错误」的判定',
          });
        } else if (saysRight !== expectedRight) {
          errors.push({
            code: 'EXPLAIN_JUDGE_VERDICT_CONFLICT',
            where, id,
            message: `解析判定为「${saysRight ? '正确' : '错误'}」，但 answer 是 ${q.answer}`,
          });
        }
        // 支撑词表的取舍原则：宁可宽，不可窄。
        // 漏判（好解析被报成没支撑）要人工复核，每次都白费一轮；
        // 放宽只是偶尔放过一句略简的结论，代价小得多。
        const SUPPORT = new RegExp(
          '(' + [
            // 因果
            '因为', '由于', '所以', '因此', '从而', '导致', '说明',
            // 否定与转折
            '不成立', '不是', '并非', '并非', '反而', '相反', '但', '除非', '而',
            // 条件与限定
            '若', '一旦', '只有', '才能', '必须', '只能', '否则',
            // 推理与对照
            '意味着', '等于', '取决于', '本质', '前提', '区别', '相比', '对应',
            // 具体化
            '例如', '比如', '典型', '表现为', '特征是', '指的是', '属于',
            // 程度与方向（论证里常见的落点）
            '越大', '越小', '越高', '越低', '越多', '越少', '越大越', '改得',
            '该', '就', '才', '则', '即', '换', '加', '拆', '装',
            // 机制说明
            '来自', '源于', '负责', '不负责', '真正', '消不掉', '存在', '变成', '转而',
          ].join('|') + ')'
        );
        if (!SUPPORT.test(ex)) {
          // 信息级：这条检查已从"抓问题"变成"防退步"。
          // 质量上来后通过率 78/79，但它早期拦下过只复述概念的题，留着兜底。
          // 不进 warnings，避免天天制造噪音。
          infos.push({
            code: 'EXPLAIN_JUDGE_NO_SUPPORT',
            level: 'info',
            where, id,
            message: '判断题解析没识别到论证词，可能漏判，也可能确实只给了结论',
          });
        }
      } else {
        // 质量检查：不看关键词，看有没有真的讲到干扰项
        // 0) 结构残留：批量脚本拆合并句（"B、C 错：…"）时留下的碎片
        const debris = [
          /[A-E]\s*[、，,]\s*[。．.]/g,          // "B、。" "C、。"
          /[：:]\s*[。．.]+/g,                  // "：。" 冒号后面直接句号
          /[、，,]\s*[、，,]/g,                  // 连续标点
          /[A-E]\s*[、，,]\s*[A-E]\s*[、，,]\s*[A-E]\s*[、，,]/g, // "B、C、D、" 后面没内容
          /[（(]\s*[)）]/g,                     // 空括号
          /\s{3,}/g,                            // 三个以上连续空格
        ];
        const found = debris.filter((re) => re.test(ex)).map((re) => ex.match(re)[0]);
        if (found.length) {
          errors.push({
            code: 'EXPLAIN_DEBRIS',
            where, id,
            message: `解析里有残留碎片：${[...new Set(found)].map((s) => `「${s}」`).join(' ')}`,
          });
        }

        // 1) 错项说明条数：4 个选项应有 3 条独立说明
        // 但选项短时（如「欠拟合」3 字）全文包含会互相误伤，
        // 所以先看"不成立/是/即"这类判据，选项短就只在"错项「…」"里找
        const expected0 = parseAnswerKey(q.answer);
        const distractors0 = q.options
          .map((_, i) => String.fromCharCode(65 + i))
          .filter((l) => !expected0.includes(l));
        const explainedOpts = new Set();
        for (let i = 0; i < q.options.length; i += 1) {
          const letter = String.fromCharCode(65 + i);
          const o = String(opt0Text(q, i)).trim();
          if (!o) continue;
          if (o.length < 4) {
            // 短选项：只在解析明确指向它的时候才算讲到
            if (new RegExp(`(错项|选项|「|反对?|无关)["“]?\\s*${escapeRe(o)}`).test(ex)) explainedOpts.add(letter);
          } else {
            const probe = o.length <= 6 ? o : mostSpecificFragment(o);
            if (probe && ex.includes(probe)) explainedOpts.add(letter);
            // 回退：解析里用引号引起来的说法，如果是这个选项的开头一段，也算讲到。
            //
            // 2026-11-05 加。起因：c0901-01 被判"没讲到 D"，其实解析写了
            //   错项「电池容量不够」不成立，因为：题目没提电池是瓶颈……
            // 而选项原文是「电池容量不够，无法支撑大房间」。
            // mostSpecificFragment 取选项正中间 6 字，得到「无法支撑大房」，跟解析里的简称完全对不上，
            // 于是已经把四个选项都讲全的解析被误判成漏了一个。
            //
            // 为什么用"引号里的话 + 必须是选项前缀"两条一起卡，而不是简单按前 N 个字截断：
            //   只按前 N 字截断，"大房间的清扫难度更高"和"大房间的样本太少"前 4 字相同，
            //   讲了一个会被当成两个都讲到。限定"解析里用引号明确引了这段"，说明出题人
            //   是在指着某个选项说话；再要求它是该选项的前缀，避免引的是别的选项的句子。
            //   两者同时满足才计入，宁可漏判（继续报警告），不误判（放走真没写解析的）。
            //
            // 2026-11-05 再加一层，来自 Qbank 指出的 c0403-04：
            //   那道题的选项是 ["0","0.5","1","无法计算"]，解析里引的是「0」和「0.5」。
            //   光看前缀，引文「0」同时也是选项 B「0.5」的前缀——一道题里引文会落到两个选项上。
            //   所以改成：**一条引文只能算给"它匹配得最长"的那个选项**。
            //   引文「0」对选项 A 是完整相等（长度 1 对 1），对 B 只是前缀（1 对 3），
            //   于是只算给 A；引文「0.5」对 B 是完整相等，算给 B。两边都对得上。
            for (const quoted of quotedPhrases(ex)) {
              const qn = stripPunct(quoted);
              if (qn.length < 3 && !/^\d/.test(qn)) continue;   // 引文至少 3 字；纯数字允许短
              const on = stripPunct(o);
              if (!on.startsWith(qn)) continue;
              // 一条引文只算给"它匹配得最长"的那个选项：
              // 如果还有另一个**更短**的选项也以这条引文开头，说明引文更可能指的是那个短的。
              // c0403-04：选项 ["0","0.5","1","无法计算"]，引文「0」既匹配 "0" 也匹配 "0.5"，
              // 但 "0" 更短、匹配更完整，所以算给 "0"，不算给 "0.5"。
              const rival = q.options.some((_, j) => {
                if (j === i) return false;
                const oj = stripPunct(String(opt0Text(q, j)).trim());
                return oj.startsWith(qn) && oj.length < o.length;
              });
              if (!rival) { explainedOpts.add(letter); break; }
            }
          }
        }
        const explainedDistractors = distractors0.filter((l) => explainedOpts.has(l)).length;
        if (distractors0.length >= 2 && explainedDistractors < distractors0.length) {
          const miss = distractors0.filter((l) => !explainedOpts.has(l));
          warnings.push({
            code: 'EXPLAIN_DISTRACTOR_COVERAGE',
            where, id,
            message: `错项 ${distractors0.length} 个，解析只讲到 ${explainedDistractors} 个，没说明的：${miss.join(' ')}`,
          });
        }
        const explained = explainedOpts;
        // 3) 长度是否与选项数匹配：每个待解释的选项大致要 12 字
        const need = 20 + (q.options.length - 1) * 12;
        if (ex.length < need) {
          warnings.push({
            code: 'EXPLAIN_TOO_TERSE',
            where, id,
            message: `解析 ${ex.length} 字，${q.options.length} 个选项至少要约 ${need} 字才讲得开`,
          });
        }
      }
    }

    // --- 误解标注 ---
    // 空值是合法选择：不属于任何误解的题就该留空，空着比硬塞一条错的更诚实。
    // （曾经的规矩是"每题必挂一个误解"，结果 o不沾边的题被默认挂到节点第一条，
    //   属于凑字段，和 basis 整批标注是同一个毛病。）
    // 但只要填了，就必须逐字对得上概念树——这条不放宽。
    const mis = q.misconception;
    if (!mis) {
      // 留空不报，什么都不做
    } else if (Array.isArray(q.nodes) && q.nodes.length === 1) {
      const c = conceptByCode.get(q.nodes[0]);
      if (c && Array.isArray(c.misconceptions) && c.misconceptions.length) {
        if (c.misconceptions.includes(mis)) {
          misconUsed.set(c.code, (misconUsed.get(c.code) || 0) + 1);
        } else {
          warnings.push({ code: 'MISCONCEPTION_UNKNOWN', where, id, message: `误解「${mis}」不在 ${c.code} 的 misconceptions 列表里` });
        }
      }
    }

    // --- 判题自检：标准答案必须判对 ---
    try {
      if (!grade(q, q.answer).correct) {
        errors.push({ code: 'GRADE_SELFTEST', where, id, message: '用自己的标准答案都判不对' });
      }
    } catch (e) {
      errors.push({ code: 'GRADE_CRASH', where, id, message: `判题崩了：${e.message}` });
    }
  }

  // --- 解析里的选项字母是否与 options 实际位置一致 ---
  // 打乱选项时只改 answer、没改解析字母，是必犯的连带错误：
  // 解析写 "C 错：…" 但 C 其实正是正确答案，学生看了会以为被判错。
  const letterMismatches = [];
  for (const { q, where } of questions) {
    const id = q.id;
    const ex = String(q.explanation || '');
    if (!ex || !Array.isArray(q.options)) continue;
    const expected = parseAnswerKey(q.answer);
    if (!expected.length) continue;

    // 抓解析里 "X 错 / X：错 / 选项X错误" 这类指代错项的说法
    const wrongMarks = [...ex.matchAll(/(?:^|[，。；、\s（(])([A-EＡ-Ｅ])\s*(?:项)?\s*(?:错|错误|不对|有误|不正确)/g)]
      .map((m) => m[1].replace(/[Ａ-Ｅ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0)));
    // 抓 "X 对 / X 正确 / 应选 X" 这类指代正确项的说法
    const rightMarks = [...ex.matchAll(/(?:^|[，。；、\s（(])([A-EＡ-Ｅ])\s*(?:项)?\s*(?:对|正确|符合|应选)/g)]
      .map((m) => m[1].replace(/[Ａ-Ｅ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0)));

    const badWrong = wrongMarks.filter((l) => expected.includes(l));
    const badRight = rightMarks.filter((l) => !expected.includes(l));

    if (badWrong.length) {
      letterMismatches.push({ where, id: q.id, kind: '正确项被写成错的', letters: badWrong, answer: q.answer });
      errors.push({
        code: 'EXPLAIN_LETTER_MISMATCH',
        where, id: q.id,
        message: `解析把正确项 ${badWrong.join('')} 写成了"错"，但 answer 就是 ${q.answer}——打乱选项后字母没跟着改`,
      });
    }
    if (badRight.length) {
      letterMismatches.push({ where, id: q.id, kind: '错误项被写成对的', letters: badRight, answer: q.answer });
      errors.push({
        code: 'EXPLAIN_LETTER_MISMATCH',
        where, id: q.id,
        message: `解析把 ${badRight.join('')} 说成正确，但 answer 是 ${q.answer}`,
      });
    }

    // 另一个常见错位：解析里提到的字母，其选项文本内容对不上
    for (const [letter] of [...expected.map((l) => [l])]) {
      const idx = letter.charCodeAt(0) - 65;
      const optText = String(q.options[idx] ?? '').trim();
      if (!optText) continue;
      const m = ex.match(new RegExp(`(?:应选|正确是|答案是)\\s*([A-E])\\s*[.、:：]?\\s*([^。；，]{0,30})`));
      if (m && m[1] === letter) {
        const claimed = m[2].trim();
        if (claimed && claimed.length >= 4 && !optText.includes(claimed) && !claimed.includes(optText)) {
          letterMismatches.push({ where, id: q.id, kind: '解析描述与选项文本不符', letter, claimed, optText });
          warnings.push({
            code: 'EXPLAIN_TEXT_MISMATCH',
            where, id: q.id,
            message: `解析说答案是 ${letter}「${claimed.slice(0, 20)}」，但 ${letter} 的实际选项是「${optText.slice(0, 20)}」`,
          });
        }
      }
    }
    // --- 题目依据标注 basis（Apache-2.0 §4(b) 用） ---
    // 值为 "d2l-zh 4.4" 这类表示依据了第三方教材，构建时会要求声明文件里有对应署名；
    // 自写内容写 "self-authored"。缺失本身先只警告，构建层再按严格度决定要不要拦。
    const basis = q.basis == null ? null : String(q.basis).trim();
    if (basis === null || basis === '') {
      warnings.push({
        code: 'BASIS_MISSING',
        where, id,
        message: '缺 basis 字段，无法追溯题目依据（Apache-2.0 §4(b) 要求改动须可声明）',
      });
    } else {
      // 白名单校验：只认 "self-authored" 或 "d2l-zh <章节>" 这类
      // "self" 这种简写不能静默放过——它会让许可追溯形同虚设
      const SELF = /^(self-authored|自写|原创)$/i;
      const D2L = /^d2l-(zh|en|ai)(\s+[\d.]+)?(\s|$)/i;
      const isD2l = D2L.test(basis);
      if (SELF.test(basis)) {
        // 自写，合法
      } else if (isD2l) {
        basisDeps.add('d2l-zh');
      } else {
        const near = /^self$/i.test(basis) || /^d2l\s*$/i.test(basis);
        errors.push({
          code: 'BASIS_INVALID',
          where, id,
          message: near
            ? `basis 写成「${basis}」是简写，必须写全：自写用 "self-authored"，引用教材用 "d2l-zh 4.4" 这类`
            : `basis「${basis}」不在白名单内（只接受 self-authored 或 d2l-zh <章节>）`,
        });
      }
      // 按节点累计依据，供教材覆盖检查用
      if (Array.isArray(q.nodes)) {
        for (const n of q.nodes) {
          if (!nodeBasis[n]) nodeBasis[n] = { total: 0, d2l: 0, selfAuthored: 0 };
          nodeBasis[n].total += 1;
          if (isD2l) nodeBasis[n].d2l += 1;
          else if (SELF.test(basis)) nodeBasis[n].selfAuthored += 1;
          // 记下该节点下出现过的所有 basis 取值，用于识别整批标注
          if (!nodeBasisValues[n]) nodeBasisValues[n] = { total: 0, values: new Set(), evidenceCount: 0 };
          nodeBasisValues[n].total += 1;
          nodeBasisValues[n].values.add(basis);
          if (q.basis_evidence && String(q.basis_evidence).trim()) nodeBasisValues[n].evidenceCount += 1;
        }
      }
    }
  }

    // --- 题干重复度：同节点内两两比对 ---
  const dupThreshold = opts.dupThreshold ?? 0.75;
  const byNodeQuestions = new Map();
  for (const { q, where } of questions) {
    if (!Array.isArray(q.nodes)) continue;
    for (const n of q.nodes) {
      if (!byNodeQuestions.has(n)) byNodeQuestions.set(n, []);
      byNodeQuestions.get(n).push({ q, where });
    }
  }
  const dupPairs = [];
  for (const [node, list] of byNodeQuestions) {
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const sim = similarity(list[i].q.stem, list[j].q.stem);
        if (sim >= dupThreshold) {
          dupPairs.push({ node, a: list[i].q.id, b: list[j].q.id, sim: Number(sim.toFixed(2)) });
        }
      }
    }
  }
  for (const d of dupPairs) {
    errors.push({ code: 'STEM_DUPLICATE', where: d.node, id: `${d.a} / ${d.b}`, message: `题干重复度 ${d.sim}，同一节点下疑似换个说法重出` });
  }

  // --- 答案位置分布 ---
  const answerPos = { A: 0, B: 0, C: 0, D: 0, E: 0 };
  const multiAnswers = [];
  for (const { q } of questions) {
    const letters = parseAnswerKey(q.answer);
    if (!letters.length) continue;
    if (q.type === 'multi_choice') {
      multiAnswers.push(letters);
    } else {
      const l = letters[0];
      if (l in answerPos) answerPos[l] += 1;
    }
  }
  const singleTotal = answerPos.A + answerPos.B + answerPos.C + answerPos.D + answerPos.E;
  const answerBias = { positions: { ...answerPos }, total: singleTotal, warning: null };
  const maxOpts = maxOptionsOf(questions);
  if (singleTotal >= 10) {
    const top = Object.entries(answerPos).sort((a, b) => b[1] - a[1])[0];
    const share = top[1] / singleTotal;
    // 均匀分布下每个位置应占 1/选项数；单点超过 45% 视为有偏向
    if (share > 0.45) {
      answerBias.warning = `正确答案集中在 ${top[0]}，占 ${Math.round(share * 100)}%（${top[1]}/${singleTotal}），学生靠位置猜就能得分`;
      warnings.push({ code: 'ANSWER_POSITION_BIAS', where: '全卷', message: answerBias.warning });
    }
    const unusedPos = Object.entries(answerPos).filter(([l, n]) => n === 0 && lettersUsed(maxOpts, l)).map(([l]) => l);
    if (unusedPos.length) {
      warnings.push({ code: 'ANSWER_POSITION_UNUSED', where: '全卷', message: `选项位置 ${unusedPos.join('')} 从未作为正确答案` });
    }
  }
  // 多选题答案字母共现：某个字母有没有从不被选
  if (multiAnswers.length >= 10) {
    const letterCount = {};
    for (const ls of multiAnswers) for (const l of ls) { letterCount[l] = (letterCount[l] || 0) + 1; }
    const never = ['A', 'B', 'C', 'D', 'E'].filter((l) => !letterCount[l] && lettersUsed(maxOpts, l));
    if (never.length) {
      warnings.push({ code: 'MULTI_LETTER_SKEW', where: '全卷', message: `多选题里 ${never.join('')} 从未被选为正确答案` });
    }
  }

  // --- 覆盖统计 ---
  const stats = {
    total: questions.length,
    byType: {},
    byNode: {},
    zeroCoverNode: [],
    misconCovered: misconUsed.size,
    dupPairs,
    answerBias,
    basisDeps: [...basisDeps],
    nodeBasis,
    nodeBasisValues,
    basisCovered: questions.filter(({ q }) => q.basis && String(q.basis).trim()).length,
  };
  for (const { q } of questions) {
    stats.byType[q.type] = (stats.byType[q.type] || 0) + 1;
  }
  for (const c of tree.concepts) {
    const n = questionsPerNode.get(c.code) || 0;
    if (n > 0) stats.byNode[c.code] = n;
    else stats.zeroCoverNode.push(c.code);
  }

  // 计算题必须打「计算」标签：盲解对计算题不可靠，将来要机器验算
  const questionList = questions.map(({ q }) => q);
  infos.push(...calcTagFindings(questionList));

  const failCodes = errors.length > 0 || (strict && warnings.length > 0);
  return { ok: !failCodes, errors, warnings, infos, stats };
}

/**
 * 教材覆盖检查：某些节点在 d2l-zh 里有正章，如果整批题里一道 d2l-zh 依据的都没有，
 * 说明要么"该用教材没用"，要么"用了没标"。两种都该报。
 *
 * @param {object} result checkPack 的返回
 * @param {object} [opts] { expectD2l: [{code, chapter, name}] }
 */
export function checkTextbookCoverage(result, opts = {}) {
  const expect = opts.expectD2l || DEFAULT_D2L_NODES;
  const warnings = [];
  const nodeBasis = result?.stats?.nodeBasis || {};
  for (const exp of expect) {
    const basisOfNode = nodeBasis[exp.code];
    if (!basisOfNode) continue; // 这个节点没题，不归这里管
    const d2lCount = basisOfNode.d2l || 0;
    const total = basisOfNode.total || 0;
    if (d2lCount === 0) {
      warnings.push({
        code: 'TEXTBOOK_UNUSED',
        node: exp.code,
        message: `${exp.name}（${exp.code}）在 ${exp.chapter} 有正章，但 ${total} 道题全部标 self-authored——要么该用教材没用，要么用了没标`,
      });
    }
  }
  return warnings;
}

/**
 * 疑似整批标注检查 —— 同一节点下所有题的 basis 完全相同、又没有 basis_evidence，
 * 多半是按节点批量填的，而不是逐题判定。不是硬错误，是提示人工看。
 */
export function checkBatchBasis(result, opts = {}) {
  const minCount = opts.minCount ?? 3;
  const nodeBasis = result?.stats?.nodeBasisValues || {};
  const out = [];
  for (const [code, info] of Object.entries(nodeBasis)) {
    if (info.total < minCount) continue;
    const uniq = info.values.size;
    if (uniq === 1 && info.evidenceCount === 0) {
      out.push({
        code: 'BASIS_BATCH_SUSPECT',
        node: code,
        message: `${code} 下 ${info.total} 道题 basis 全是「${[...info.values][0]}」，且没有 basis_evidence——疑似按节点整批标注`,
      });
    }
  }
  return out;
}

/** d2l-zh 里有正章的节点，用于"该用教材却没用"检查 */
export const DEFAULT_D2L_NODES = [  { code: 'c0401', chapter: 'd2l-zh 4.1 多层感知机', name: '感知机' },
  { code: 'c0402', chapter: 'd2l-zh 4.1 多层感知机', name: '多层感知机 MLP' },
  { code: 'c0403', chapter: 'd2l-zh 4.1 多层感知机', name: '激活函数' },
  { code: 'c0404', chapter: 'd2l-zh 4.4 模型选择', name: '损失函数' },
  { code: 'c0405', chapter: 'd2l-zh 4.7 前向传播反向传播', name: '反向传播' },
  { code: 'c0204', chapter: 'd2l-zh 4.4 模型选择', name: '训练集与测试集' },
  { code: 'c0205', chapter: 'd2l-zh 4.4 模型选择', name: '过拟合' },
  { code: 'c0206', chapter: 'd2l-zh 4.9 泛化', name: '泛化能力' },
  { code: 'c0301', chapter: 'd2l-zh 3.1 线性回归', name: '线性回归' },
  { code: 'c0302', chapter: 'd2l-zh 3.1 线性回归', name: '最小二乘法' },
  { code: 'c0304', chapter: 'd2l-zh 11.3 梯度下降', name: '梯度下降' },
];

function opt0Text(q, i) {
  return Array.isArray(q.options) ? String(q.options[i] ?? '') : '';
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 从选项文本里取一段最能代表它的片段，用来在解析里找痕迹。
 * 思路：取字符二元组中最靠中间的一段 6 字窗口，避开“下列说法”这种通用头尾。
 */
function mostSpecificFragment(text) {
  const t = String(text).replace(/^[\s【\[（(]+|[\s】\]）)。，,]+$/g, '');
  if (t.length <= 6) return t;
  const mid = Math.floor((t.length - 6) / 2);
  return t.slice(mid, mid + 6);
}

/**
 * 去掉标点与空白，只留下用来比对内容的字。
 * 解析里写「电池容量不够」，选项是「电池容量不够，无法支撑大房间」，
 * 差别就在那个逗号——不去掉标点，前缀比对一定失败。
 */
function stripPunct(s) {
  return String(s).replace(/[\s，。、；：！？,.;:!?「」『』“”"'‘’（）()【】\[\]…—－-]/g, '');
}

/**
 * 抽出解析里所有被引号引起来的说法。
 * 中文引号「」『』和英文双引号都认，因为出题人写解析时这几种都出现过。
 * 只要 2 字以上的，太短的（如「A」）没有比对意义。
 */
function quotedPhrases(text) {
  const s = String(text || '');
  const out = [];
  const re = /[「『“"]([^」』”"]{2,40})[」』”"]/g;
  let m;
  while ((m = re.exec(s))) out.push(m[1]);
  return out;
}

/** 卷内最大选项数，用来判断哪些字母位置实际存在 */
function maxOptionsOf(list) {
  let max = 0;
  for (const { q } of list) {
    if (Array.isArray(q.options) && q.options.length > max) max = q.options.length;
  }
  return max;
}

/** 某字母位置是否在该卷里真实存在 */
function lettersUsed(maxOptions, letter) {
  const idx = letter.charCodeAt(0) - 65;
  return idx < maxOptions;
}

/**
 * 题干相似度：字符二元组 Dice 系数，对中文短句效果够用。
 * 先去标点空白，再取 bigram 集合求交集。
 */
export function similarity(a, b) {
  const norm = (s) => String(s || '').replace(/[\s\p{P}\p{S}]/gu, '');
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const grams = (s) => {
    const out = new Set();
    for (let i = 0; i < s.length - 1; i += 1) out.add(s.slice(i, i + 2));
    return out;
  };
  const gx = grams(x);
  const gy = grams(y);
  if (gx.size === 0 || gy.size === 0) return x === y ? 1 : 0;
  let inter = 0;
  for (const g of gx) if (gy.has(g)) inter += 1;
  return (2 * inter) / (gx.size + gy.size);
}

// CLI：只在直接运行时执行，被 import 时跳过
const invokedDirectly = process.argv[1] && /check-pack\.mjs$/.test(process.argv[1]);if (invokedDirectly) {
  const path = process.argv[2];
  const strict = process.argv.includes('--strict');
  if (!path) {
    console.error('用法: node core/check-pack.mjs <题目文件.jsonl> [--strict]');
    process.exit(2);
  }
  const r = checkPack(path, { strict });
  console.log(`文件: ${path}`);
  console.log(`错误 ${r.errors.length}  警告 ${r.warnings.length}`);
  for (const e of r.errors) console.log(`  [错误] ${e.code} ${e.where || ''} ${e.id || ''} ${e.message}`);
  for (const w of r.warnings) console.log(`  [警告] ${w.code} ${w.where || ''} ${w.id || ''} ${w.message}`);
  if (r.stats) {
    console.log(`题量 ${r.stats.total}，类型 ${JSON.stringify(r.stats.byType)}`);
    console.log(`已覆盖节点 ${Object.keys(r.stats.byNode).length}，零覆盖 ${r.stats.zeroCoverNode.length}`);
    if (Object.keys(r.stats.byNode).length) console.log(`分布 ${JSON.stringify(r.stats.byNode)}`);
    console.log(`误解标注覆盖 ${r.stats.misconCovered} 个概念`);
  }
  console.log(r.ok ? '\n结果：通过' : '\n结果：不通过');
  process.exitCode = r.ok ? 0 : 1;
}
