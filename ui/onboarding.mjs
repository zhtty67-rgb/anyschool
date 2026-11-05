// 首次使用引导 —— 新人打开看到 79 个节点，得告诉他从哪开始
// 只做三件事：给一条明确的起点、说清界面怎么用、说完就收起不再打扰
import { readFileSync } from 'node:fs';

// 判断用户是否第一次来：看本地有没有存过"已看过引导"的标记
export const FIRST_VISIT_KEY = 'anylearn.onboarded';

/**
 * 挑一个起点节点：按先修顺序，找最先没有前置要求的那个有题节点。
 * 不读掌握度、不读答题记录，纯按知识树结构选。
 */
export function pickStartNode(tree, coveredCodes) {
  const covered = new Set(coveredCodes);
  const ordered = tree.concepts.filter((c) => covered.has(c.code));
  // 先修已经满足（prereq 为空，或先修本身不在有题范围内）的第一个
  const first = ordered.find((c) => (c.prereq || []).every((p) => !covered.has(p)));
  return first || ordered[0] || null;
}

export function renderOnboarding(startNode, stats) {
  if (!startNode) return '';
  return `
  <section class="onboard" id="onboard">
    <div class="onboard-title">第一次来？从这里开始</div>
    <div class="onboard-steps">
      <div class="onboard-step"><b>1</b> 点这个节点进去，先看概念讲解</div>
      <div class="onboard-step"><b>2</b> 做几道题，答完能看到解析</div>
      <div class="onboard-step"><b>3</b> 做满 3 道，掌握度就会显示出来</div>
    </div>
    <div class="onboard-start">
      <button class="btn-primary" data-act="study" data-node="${startNode.code}">
        从「${startNode.name}」开始
      </button>
      <button class="btn-ghost" data-act="onboard-dismiss">我先自己看看</button>
    </div>
    <div class="onboard-foot">现在有 ${stats.nodesWithQuestions} 个节点可以练习，共 ${stats.questions} 道题</div>
  </section>`;
}

export const ONBOARD_CSS = `
.onboard{background:linear-gradient(135deg,#eef4ff,#fff 70%);border:1px solid #d6e0fa;border-radius:14px;padding:18px 22px;margin:0 22px 18px;max-width:1080px}
.onboard-title{font-size:15px;font-weight:700;color:#2b4c9b;margin-bottom:12px}
.onboard-steps{display:flex;flex-direction:column;gap:7px;margin-bottom:14px}
.onboard-step{font-size:13.5px;color:#3a4560;display:flex;gap:10px;align-items:baseline}
.onboard-step b{display:inline-flex;width:19px;height:19px;border-radius:50%;background:#3b6df6;color:#fff;font-size:11px;align-items:center;justify-content:center;flex:none}
.onboard-start{display:flex;gap:10px;align-items:center;margin-bottom:10px}
.onboard-foot{font-size:12px;color:#7a849c}
`;
