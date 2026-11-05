// 「伪情境题」检查器 —— 把 Searcher 那条判据做成可执行的检查
//
// 判据（Searcher 提出，Chief 采纳）：
//   删掉题干里的情境部分，如果仍然答得出来，它就是概念题披了层情境皮。
//
// 难点与办法：
//   "删掉还答不答得出来"本是语义判断，正则做不到。所以这里不直接判语义，
//   而是判「题干里到底有没有一个真正的情境」——这才可机器判定：
//     · 情境 = 具体的角色/对象 + 具体的条件/数值/事件
//     · 纯定义 = 「XX 的基本机制是」「XX 指的是」这类，题干就是待补全的定义主干
//
// 两类判据：
//   DEFINITION_STEM  题干是待补全的定义句（以"是：""指的是：""包括："收尾），
//                    或长度极短且无具体主体 → 概念题
//   NO_SITUATION     要标成 application/scenario，却找不到具体情境要素
//                    （无具体主体、无数值、无"某/一个/某次"这类指代）→ 伪情境
//
// 用法：node scripts/check-pseudo-scenario.mjs <题包.jsonl>
import { readFileSync, existsSync } from 'node:fs';

// 定义句式的收尾：题干到冒号就结束，答案是一句定义
const DEFINITION_END = /(是|指的是|包括|有|为|在于|含义是|基本机制是|核心目标是|基本结构是|核心思想是|核心做法是|基本做法是|主要代价是|作用是把?)：?\s*$/;

// 情境要素的三个信号（Chief 定的判法：三条满足两条即算有情境）
//   1. 主体：显式人称，或隐含主体（训练时/过程中这类工程语境的省略主语）
//   2. 因果连接：结果/导致/却/于是 → 后面有后果
//   3. 时间推进：开始→后来→再后来、第一轮 → 在描述过程
// 另外必须有具体数值或具体名词，光有连接词不算情境。
//
// 关键区分（双向验证逼出来的）：显式主体 vs 隐含主体。
//   "一只在游戏里学走路的虚拟生物…"——显式主体，它本身就是情境，一条就够
//   "训练 GAN 时把判别器训得太好…"——隐含主体，需要再有一条信号支撑
// 早先把两者一视同仁，导致 c0901-07 / c0901-09 两道真场景题被误报。
// 显式主体：真正在描述某个具体对象的行为或遭遇
// 关键教训：不能把"系统/模型/判别器"这类名词直接当主体——"GAN 的判别器本质上是在学…"
// 是概念题，但含"判别器"三个字。要看的是**有没有具体动作或事件在发生**。
const EXPLICIT_AGENT = /(一个|一位|一只|有人|某人|某训练|某系统|某模型|某次|某台|小明|用户|玩家|这只|这家|它(每|上|学|把|会|在))/;
// 具体事件：主体做了某事／遇到某事。没有事件的名词罗列不算情境。
// 「有人说……这个说法错在哪」属于错法分析，也是真情境的一种（有具体主张 + 要判断错处）。
const EVENT_SIGNAL = /(学会|学到|拿到了|赚|摔倒|举起|前倾|撤销|下假单|上线|训练几百万轮|每次都|一直|突然|逐渐|崩成|绕开|撞墙|通关|收盘前|弃权|跌破|回升|有人说|有人认为|有同学说|这个说法错在|错在哪|最可能的原因是|说明了什么)/;
const IMPLICIT_AGENT = /(训练时|训练 GAN|训练过程中|过程中|运行时|上线后|部署后|实际|当|如果|假如|假设)/;
const CAUSAL = /(结果|导致|于是|却|反而|所以|因此|这是为什么|最可能的原因|最合理的解释|学会了|这说明)/;
const TIME_FLOW = /(开始[^，。]{0,10}后来|后来[^，。]{0,12}再|第一轮|起初|随后|逐渐|一开始|几百万轮|每走两步)/;
// 具体量：数值，或明确的具体对象/单位
const CONCRETE = /(\d|百分之|百分比|数字图像|图像|曲线|损失|奖励值|准确率|成功率|余额|棋子|分|轮|步|次|秒|元)/;

const NUMERIC = /\d/;

/**
 * 判断一道题的实质类型
 * @returns {{kind:'definition'|'pseudo'|'plain'|'ok', reason:string, evidence:string[]}}
 */
export function classifyStem(q) {
  const stem = String(q?.stem || '').trim();
  const declared = q?.qkind || null;
  const tags = Array.isArray(q?.tags) ? q.tags : [];

  const isDefinitionStem = DEFINITION_END.test(stem);
  const short = stem.length < 20;
  const hasExplicitAgent = EXPLICIT_AGENT.test(stem);
  const hasImplicitAgent = IMPLICIT_AGENT.test(stem);
  const hasEvent = EVENT_SIGNAL.test(stem);
  const sigCausal = CAUSAL.test(stem);
  const sigTime = TIME_FLOW.test(stem);
  const concrete = CONCRETE.test(stem);
  // 判据核心：情境 = 有主体 + 有事件（主体做了什么/遇到什么）。
  // 只有名词没有事件，就是概念题——"GAN 的判别器本质上是在学一个评分函数"没有事件，不算情境。
  const strongSituation = (hasExplicitAgent || hasImplicitAgent) && (hasEvent || sigCausal || sigTime);

  // 声明成情境题，却没有情境要素 —— 这才叫伪情境题
  // 注意：concept 题本来就没有情境，那是它该有的样子，绝不能报。
  const claimsScenario = declared === 'scenario' || declared === 'application' || tags.includes('场景');
  if (claimsScenario) {
    if (strongSituation && concrete) {
      return { kind: 'ok', reason: `有${hasExplicitAgent ? '显式' : '隐含'}主体${concrete ? '且含具体量' : ''}`, evidence: [stem] };
    }
    // 定义句式且无任何主体 → 披皮定义题
    if (isDefinitionStem && !hasExplicitAgent && !hasImplicitAgent) {
      return {
        kind: 'pseudo',
        reason: '标为情境题，但题干是待补全的定义句且没有具体主体',
        evidence: [stem],
      };
    }
    if (!strongSituation) {
      return {
        kind: 'pseudo',
        reason: `标为 ${declared || tags.join('/')}，但题干没有可识别的主体（显式/隐含都无）`,
        evidence: [stem],
      };
    }
    return {
      kind: 'pseudo',
      reason: `标为 ${declared || tags.join('/')}，有主体但无具体量（题干太抽象）`,
      evidence: [stem],
    };
  }

  // 未声称情境的题：定义句或过短就是概念题，属正常。
  if (isDefinitionStem) return { kind: 'definition', reason: '概念题（未声称情境）', evidence: [stem] };
  if (short) return { kind: 'definition', reason: '概念题（题干极短）', evidence: [stem] };
  if (!strongSituation && !sigCausal && !sigTime) {
    return { kind: 'plain', reason: '未声称情境，题干也无情境要素（疑似概念题但未标注）', evidence: [stem] };
  }
  return { kind: 'ok', reason: '未声称情境', evidence: [stem] };
}

/** 批量检查 */
export function checkPseudoScenario(questions) {
  const pseudo = [];
  const byKind = {};
  for (const q of questions || []) {
    const r = classifyStem(q);
    byKind[r.kind] = (byKind[r.kind] || 0) + 1;
    if (r.kind === 'pseudo') pseudo.push({ id: q.id, qkind: q.qkind, reason: r.reason, stem: String(q.stem).slice(0, 50) });
  }
  return { pseudo, byKind, total: (questions || []).length };
}

// CLI
const invokedDirectly = process.argv[1] && /check-pseudo-scenario\.mjs$/.test(process.argv[1]);
if (invokedDirectly) {
  const path = process.argv[2];
  if (!path || !existsSync(path)) { console.error('用法: node scripts/check-pseudo-scenario.mjs <题包.jsonl>'); process.exit(2); }
  const qs = readFileSync(path, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
  const r = checkPseudoScenario(qs);
  console.log(`题包：${path}`);
  console.log(`总数 ${r.total}，分类：${JSON.stringify(r.byKind)}`);
  console.log(`伪情境题：${r.pseudo.length} 道`);
  r.pseudo.slice(0, 20).forEach((p) => console.log(`  ${p.id} [${p.qkind}] ${p.reason}\n    ${p.stem}`));
  if (r.pseudo.length > 20) console.log(`  …还有 ${r.pseudo.length - 20} 道`);
}
