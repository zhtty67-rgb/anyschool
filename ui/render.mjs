// UI 外壳（单文件，无构建、无依赖）—— 知识点树主屏 + 做题界面 + 进度
// 数据源可切换：mock / 真实题库。切换只改 state.source，不改渲染逻辑。
//
// 打开方式：直接双击 index.html，或 node ui/serve.mjs

import { parseTree } from '../core/tree.mjs';
import { masteryOfTree, pickNext, MIN_SAMPLES, MASTERED, WEAK, clientSource } from '../core/mastery.mjs';
import { grade, parseAnswerKey, isTrueFalseShape } from '../core/grade.mjs';
import { loadQuestions, selectPack, questionsForNode } from '../core/qbook.mjs';
import { buildMock, buildMockRecords } from '../mock/build-mock.mjs';
import { writeFileSync, readFileSync } from 'node:fs';
import { scriptFor as peerScript, hasLines as peerHasLines, POSITION_LABEL as PEER_LABEL, PEER_NAME } from '../peer/index.mjs';
import { append as appendNote } from './peer-notes.mjs';
import { briefFor } from './node-details.mjs';
import { renderOnboarding, pickStartNode, ONBOARD_CSS } from './onboarding.mjs';
import { LINES as PEER_LINES } from '../peer/lines.mjs';
import { loadExcluded, filterExcluded } from '../core/excluded-nodes.mjs';
import { buildGraph, topoLayers, weakNodes, WEAK_THRESHOLD } from '../core/graph.mjs';

// ── 数据层：mock 与真实题库走同一形状 ──────────────────────────
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.ANYSCHOOL_DATA_DIR || join(HERE, '..', 'data');
const REAL_PACK = join(DATA_DIR, 'questions-authoring-v8.jsonl');

function loadRealPack(path = REAL_PACK) {
  const tree = parseTree();
  const lines = readFileSync(path, 'utf8').split(/\r?\n/).filter((l) => l.trim());
  const questions = lines.map((l) => JSON.parse(l));
  return { tree, questions, records: [], label: `真实题包（${questions.length} 道）` };
}

function loadData(source) {
  if (source === 'mock') {
    const { tree, questions } = buildMock();
    return { tree, questions, records: buildMockRecords(questions), label: 'mock 数据' };
  }
  if (source && source !== 'real' && source.endsWith('.jsonl')) {
    return loadRealPack(source);
  }
  if (source === 'real' || source === undefined) {
    return loadRealPack();
  }
  const tree = parseTree();
  const { questions } = loadQuestions();
  const pack = selectPack(questions, 'local');
  return { tree, questions: pack, records: [], label: '现有题库（未挂载，无法做题）' };
}

export function snapshot(source = 'mock') {
  const { tree, questions: allQuestions, records, label } = loadData(source);
  // 节点排除在数据入口做，不在渲染做。
  // 理由：掌握度、起点推荐、树上的题数都是从 questions 算出来的，
  // 只在渲染时藏起来，那些数还会把被排除节点的题算进去——那是假的。
  const excluded = loadExcluded();
  const { kept: questions, dropped } = filterExcluded(allQuestions, excluded.nodes);
  if (dropped.length) {
    console.log(`  节点排除：${[...excluded.nodes].join('、')} → 去掉 ${dropped.length} 道题`);
  }
  const result = masteryOfTree(tree.concepts, records, {
    // ── 分母：用实发题包算出的有题节点，不是整棵树（2026-11-05，v12 阶段 1）──
    //
    // 原来这里只传两个参数，mastery.mjs 里 opts.nodeCodesWithQuestions 一直没被用上，
    // 于是 summary.total 恒等于整棵树 79，coverage 被 30 多个无题节点摊薄。
    // 单测之所以全过，是因为单测直接给 masteryOfTree 传了 opts —— 产品层一个数都没变。
    //
    // 为什么用 questions（实发）而不是 allQuestions（题包）：
    //   被 excluded 挡在外面的节点，用户在界面上点不到，永远不会有作答记录。
    //   若计入分母，用户把能做的全做完，覆盖率也到不了 100%（45/46≈97.8%）。
    nodeCodesWithQuestions: new Set(questions.flatMap((q) => q.nodes || [])),
  });
  return {
    label,
    // 本次构建排除了哪些节点、去掉多少题——写进快照，MANIFEST 和界面都能查
    excluded: {
      nodes: [...excluded.nodes],
      entries: excluded.entries.map((e) => ({ node: e.node, reason: e.reason, decided_by: e.decided_by, decided_at: e.decided_at })),
      questions_dropped: dropped.length,
    },
    tree: {
      meta: tree.meta,
      modules: tree.modules.map((m) => ({
        code: m.code,
        name: m.name,
        concepts: m.concepts.map((c) => {
          const n = result.nodes.find((x) => x.code === c.code);
          return {
            code: c.code,
            name: c.name,
            def: c.def,
            misconceptions: c.misconceptions,
            prereq: c.prereq,
            mastery: n ? n.mastery : { state: 'unknown', score: null, samples: 0 },
            questionCount: questionsForNode(questions, c.code).length,
          };
        }),
      })),
    },
    summary: result.summary,
    nextUp: result.nextUp,
    questions,
    records,
    // AI 同学的语句库随页面一起带出，供客户端挑句；纯数据，不含任何学习事件
    peerLines: PEER_LINES,
    peerName: PEER_NAME,
    peerLabels: PEER_LABEL,
    // 节点简介：扩写版优先，客户端据此渲染"先看懂这个概念"
    briefs: Object.fromEntries(tree.concepts.map(function(c){var b=briefFor(c.code);return [c.code, b?{main:b.main,example:b.example,original:b.original,hasExpanded:b.hasExpanded,misconceptions:b.misconceptions,asks:b.asks}:null]}).filter(function(p){return p[1]})),
    // 首次使用的起点：按先修顺序挑第一个可做的节点
    startNode: (() => {
      const covered = questions.flatMap((q) => q.nodes || []);
      const s = pickStartNode(tree, covered);
      return s ? { code: s.code, name: s.name } : null;
    })(),
    stats: {
      questions: questions.length,
      nodesWithQuestions: new Set(questions.flatMap((q) => q.nodes || [])).size,
    },
    // ── 关系图（v12 阶段 2）──────────────────────────────────────
    //
    // 数据由 core/graph.mjs 产出：79 个概念 + 91 条先修边 + 拓扑分层。
    // 掌握度从 result.nodes 传进去，graph.mjs 自己不算掌握度（禁区 2：不许两套真源）。
    //
    // 布局用 Kahn 拓扑分层、不做力导向：力导向每次跑出来的坐标都不一样，
    // 没法截图对账；拓扑分层是确定的，同一份输入永远画成同一张图。
    graph: (() => {
      const masteryByCode = new Map(result.nodes.map((n) => [n.code, n.mastery]));
      const g = buildGraph(tree, questions, masteryByCode);
      const layers = topoLayers(g);
      return {
        nodes: g.nodes,
        edges: g.edges,
        stats: g.stats,
        // 拓扑分层：第 i 层放哪些 code。客户端按层摆 y 坐标，同层均匀铺开 x。
        //
        // topoLayers 返回的层里，元素**本身就是 code 字符串**，不是节点对象。
        // 2026-11-05 踩过：写成 l.map(n => n.code) 会得到一串 undefined，
        // 经 JSON.stringify 落进 __SNAP__ 就变成 [null]，渲染时 byCode.get(null) 取不到节点。
        layers: layers.map((l) => l.map((x) => (typeof x === 'string' ? x : x.code))),
        weakThreshold: WEAK_THRESHOLD,
      };
    })(),
  };
}

// ── 渲染 ───────────────────────────────────────────────────
const STATE_COLOR = {
  unknown: '#8b93a7',
  weak: '#e5484d',
  learning: '#f5a524',
  mastered: '#30a46c',
};
const STATE_LABEL = {
  unknown: '还没做',
  weak: '薄弱',
  learning: '在学',
  mastered: '已掌握',
};

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function pct(m) {
  if (m.score == null) return '—';
  return `${Math.round(m.score * 100)}%`;
}

/** 节点圆环：分数用弧长表示，未开始画虚线圈 */
function ring(m, size = 34) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const color = STATE_COLOR[m.state];
  if (m.score == null) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${color}" stroke-width="2.5" stroke-dasharray="3 4" opacity=".55"/>
    </svg>`;
  }
  const dash = c * m.score;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="#e6e8ee" stroke-width="3"/>
    <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${color}" stroke-width="3"
      stroke-dasharray="${dash} ${c - dash}" stroke-linecap="round"
      transform="rotate(-90 ${size/2} ${size/2})"/>
    <text x="50%" y="50%" text-anchor="middle" dy="4" font-size="9" fill="${color}" font-weight="600">${pct(m)}</text>
  </svg>`;
}

function moduleBar(concepts) {
  const scored = concepts.filter((c) => c.mastery.score != null);
  const mean = scored.length ? scored.reduce((s, c) => s + c.mastery.score, 0) / scored.length : null;
  const parts = { mastered: 0, learning: 0, weak: 0, unknown: 0 };
  for (const c of concepts) parts[c.mastery.state] += 1;
  return { mean, parts, count: concepts.length };
}

/**
 * 给"没有题"的节点配一句话。必须分清两种"没有题"：
 *   ①本来就没出题      → 「还没题」
 *   ②题包里有，本版被挡下 → 「本版不出题」
 * 混成一句「还没题」，等于把"被挡掉了"说成"根本没有题"（Qbank 2026-11-05 抓出来）。
 * 措辞理由（小白原话）：不能写成"暂未发出"——读者会以为要等、要去解锁。
 * 模块级，供 renderMap / renderSnapshot 共用；客户端另有一份同措辞的实现。
 */
function noQuestionLabel(snap, code) {
  const list = (snap && snap.excluded && Array.isArray(snap.excluded.nodes)) ? snap.excluded.nodes : [];
  return list.some((x) => String(x) === String(code)) ? '（本版不出题）' : '（还没题）';
}

export function renderSnapshot(snap, opts = {}) {  const { tree, summary, nextUp } = snap;
  const view = opts.view || 'tree';
  const activeNode = opts.activeNode || null;

  const head = `
  <header class="top">
    <div class="brand">AnyLearn · 人工智能基础</div>
    <div class="src">数据源：<b>${esc(snap.label)}</b><a class="onboard-link" href="javascript:void 0" data-act="onboard-show">新手引导</a></div>
  </header>`;

  // 进度条带（第一屏突出显示）
  const totalQuestions = snap.questions.length;
  const nodesWithQ = new Set(snap.questions.flatMap((q) => q.nodes || [])).size;
  const nodeCount = tree.modules.reduce((s, m) => s + m.concepts.length, 0);
  const lackQuestions = Math.max(0, nodeCount * 10 - totalQuestions);
  // 已掌握度可算的节点 = 有题目、且作答记录够阈值的节点（有答题数据才可能算出来）
  const scoredNodes = tree.modules
    .flatMap((m) => m.concepts)
    .filter((c) => c.questionCount > 0 && c.mastery.samples >= MIN_SAMPLES).length;
  // ── 45 与 46 的差，必须在界面上说得清（2026-11-05）──────────
  // 题包里有 46 个节点带题，界面只呈现 45 个：c1103 的 12 道题被
  // excluded-nodes.json 挡在发布之外。用户从"45/79"这行字里算不出这个差，
  // 发布后一定有人问"为什么不是 46"。
  // 措辞的由来（小白原话）：如果只说"暂未发出"，读者会以为要等、会去找怎么解锁。
  // 所以必须直接说清"这版就没有，跟你没关系"，不能留成待解锁的语气。
  const excludedNodes = (snap.excluded && Array.isArray(snap.excluded.nodes)) ? snap.excluded.nodes : [];
  // 每个被排除节点带多少道题：从 dropped 里数（已经被 filterExcluded 扣掉的）
  const excludedCount = excludedNodes.length;
  const excludedNote = excludedCount === 0 ? '' : `
      <div class="band-gap band-excluded">有题可做的知识点是 <b>${nodesWithQ}</b> 个，不是全部。另有 <b>${excludedCount}</b> 个知识点（${excludedNodes.map((e) => esc(String(e))).join('、')}）<b>这一版没有放它的题</b>——不是你没解锁，也不是要等，这版就是这样。</div>`;
  const band = `
  <section class="band">
    <div class="band-main">
      <div class="band-num">${summary.total}</div>
      <div class="band-label">概念节点</div>
      <div class="band-sep"></div>
      <div class="band-num">${summary.mastered}</div>
      <div class="band-label">已掌握</div>
      <div class="band-sep"></div>
      <div class="band-num">${nodesWithQ}<span class="slash">/${nodeCount}</span></div>
      <div class="band-label">现在有题可做</div>
      <div class="band-sep"></div>
      ${scoredNodes === 0
        ? `<div class="band-num">0</div><div class="band-label">你开始做了没</div>
      <div class="band-gap">题库共 <b>${totalQuestions}</b> 道题，<b>${nodesWithQ}</b> 个知识点有题 · 你还没开始。随便挑一个做满 <b>${MIN_SAMPLES}</b> 道，就能看到自己学得怎么样</div>${excludedNote}`
        : `<div class="band-num">${scoredNodes}<span class="slash">/${nodesWithQ}</span></div><div class="band-label">看得出学得怎么样</div>
      <div class="band-gap">题库共 <b>${totalQuestions}</b> 道题 · 有题可做 <b>${nodesWithQ}</b> 个知识点 · 已经看得出水平的 <b>${scoredNodes}</b> 个（每个至少做 ${MIN_SAMPLES} 道）· 继续做，这个数会跟着涨</div>${excludedNote}`}
    </div>
    <div class="band-next">
      ${nextUp
        ? `<div class="next-tag">下一步</div>
           <div class="next-title">${esc(nextUp.name)}</div>
           <div class="next-reason">${esc(nextUp.reason)}</div>
           <button class="btn-primary" data-act="study" data-node="${esc(nextUp.code)}" ${(tree.modules.flatMap(m=>m.concepts).find(c=>c.code===nextUp.code)||{}).questionCount===0?'disabled style="opacity:.5;cursor:not-allowed"':''}>开始学</button>`
        : `<div class="next-tag">全部完成</div><div class="next-title">没有待学节点</div>`}
    </div>
  </section>`;

  if (view === 'quiz' && activeNode) {
    return `${head}${band}${renderQuiz(snap, activeNode, opts)}`;
  }

  // 知识树主屏
  // 只看能用的部分：有题节点正常展示，无题节点收进底部折叠区
  // （曾经把 52 个空节点连同红色“缺 10 道”一起平铺，新用户以为产品是坏的）
  const usable = tree.modules
    .map((m) => ({ ...m, concepts: m.concepts.filter((c) => c.questionCount > 0) }))
    .filter((m) => m.concepts.length > 0);
  const comingModules = tree.modules
    .map((m) => ({ ...m, concepts: m.concepts.filter((c) => c.questionCount === 0) }))
    .filter((m) => m.concepts.length > 0);
  const comingCount = comingModules.reduce((a, m) => a + m.concepts.length, 0);

  const groups = usable.map((m) => {
    const b = moduleBar(m.concepts);
    const pctText = b.mean == null ? '—' : `${Math.round(b.mean * 100)}%`;
    const segs = ['mastered', 'learning', 'weak', 'unknown']
      .filter((k) => b.parts[k] > 0)
      .map((k) => `<i style="flex:${b.parts[k]};background:${STATE_COLOR[k]}"></i>`)
      .join('');
    return `
    <section class="module">
      <div class="module-head">
        <h2>${esc(m.name)}</h2>
        <span class="module-meta">${m.concepts.length} 个概念${b.mean == null ? '' : ` · ${pctText}`}</span>
        <div class="mini-bar">${segs}</div>
      </div>
      <div class="nodes">
        ${m.concepts.map((c) => renderNodeCard(c)).join('')}
      </div>
    </section>`;
  }).join('');

  // 没题的知识点：名字可以看，但不挂红色缺口数字，也不做成可点卡片
  // 数字用 <span data-coming-count> 占位，由运行时的 treeView() 按当前快照填写。
  // 构建时写进模板的那份会在数据变动后过时（合并一批就会错一次），所以不在模板里落死。
  const coming = comingCount === 0 ? '' : `
  <details class="coming">
    <summary>还有 <span data-coming-count>${comingCount}</span> 个知识点正在准备中（暂时没有题目，先看看吧）</summary>
    <div class="coming-body">
      ${comingModules.map((m) => `
        <div class="coming-module">
          <div class="coming-module-name">${esc(m.name)}</div>
          <div class="coming-names">${m.concepts.map((c) => `<span>${esc(c.name)}</span>`).join('')}</div>
        </div>`).join('')}
    </div>
  </details>`;

  // 看过就默认收起；给一段内联脚本在渲染前判断，避免闪一下再消失
  // 首次进入必须直接展开引导；是否已经看过由 localStorage 的 anylearn.onboarded 决定
  // （曾误加 data-default-collapsed="1"，导致新用户一进来就是收起状态，等于没有引导）
  const onboard = renderOnboarding(snap.startNode, snap.stats);
  return `${head}${onboard}${band}${renderMap(snap)}<main class="tree">${groups}${coming}</main>`;
}

/**
 * 关系图：79 个概念按先修关系排成 DAG。
 *
 * 布局：Kahn 拓扑分层。第 i 层一个 y，层内按序号均分 x。
 * **不做力导向**——力导向每次跑出来坐标都不一样，没法截图对账；
 * 拓扑分层是确定的，同一份输入永远画成同一张图。
 *
 * 读图规则（写进图例，让外行不用猜）：
 *   箭头方向 = 先修 → 后继，看箭头要往回找"我该先学什么"
 *   琥珀色描边 = 掌握度 < 0.7 的薄弱点，就是"我卡在哪"
 */
function renderMap(snap) {
  const g = snap.graph;
  if (!g || !g.nodes || !g.nodes.length) return '';

  const NODE_W = 88, NODE_H = 26, GAP_X = 14, LAYER_H = 62, PAD = 18;
  const maxPerLayer = Math.max(...g.layers.map((l) => l.length));
  const width = Math.max(720, maxPerLayer * (NODE_W + GAP_X) + PAD * 2);
  const height = g.layers.length * LAYER_H + PAD * 2;

  // 每个 code 在画布上的坐标
  const pos = new Map();
  g.layers.forEach((layer, li) => {
    const totalW = layer.length * NODE_W + (layer.length - 1) * GAP_X;
    const startX = (width - totalW) / 2;
    layer.forEach((code, i) => {
      pos.set(code, {
        x: startX + i * (NODE_W + GAP_X),
        y: PAD + li * LAYER_H,
      });
    });
  });

  const byCode = new Map(g.nodes.map((n) => [n.code, n]));
  // weakNodes 返回的是**题号数组**（string[]），不是对象数组。
  // 传进去的 mastery 可能是 null（无题节点），weakNodes 内部会跳过非数字 score。
  const weak = new Set(weakNodes(new Map(g.nodes.map((n) => [n.code, n.mastery])), g.weakThreshold));
  // 掌握度一律从树里取：graph.nodes[].mastery 是构建时快照，
  // 用户答完题后 applyRecords 只更新树，不会回头改 graph。
  const liveMastery = new Map();
  for (const mod of (snap.tree?.modules || [])) {
    for (const c of mod.concepts || []) liveMastery.set(c.code, c.mastery);
  }
  const masteryOf = (code) => liveMastery.get(code) ?? byCode.get(code)?.mastery ?? null;

  // 边：先修 → 后继，用二次贝塞尔画弧，避免穿过中间节点
  const edges = g.edges.map((e) => {
    const a = pos.get(e.from), b = pos.get(e.to);
    if (!a || !b) return '';
    const x1 = a.x + NODE_W / 2, y1 = a.y + NODE_H;
    const x2 = b.x + NODE_W / 2, y2 = b.y;
    const my = (y1 + y2) / 2;
    const cls = e.crossModule ? 'map-edge cross' : 'map-edge';
    return `<path class="${cls}" d="M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}" marker-end="url(#arr)"/>`;
  }).join('');

  // 节点
  // ── 起点标记（2026-11-05 补）─────────────────────────────
  // 原来图上没有任何东西指向"从哪儿开始"：全新用户所有节点都是 unknown，
  // 一个弱项都不高亮，79 个方块长得一模一样。这图就成了纯装饰。
  // 所以把 startNode（pickStartNode 挑的第一个可做节点）在图上标出来：
  //   绿色描边 + 「从这里开始」角标。已有进度时它自然不再是第一个节点，
  //   因为 pickStartNode 是按先修顺序挑"当前能做的第一个"。
  const startCode = snap.startNode?.code || null;
  const nodes = g.layers.map((layer) => layer.map((code) => {
    const n = byCode.get(code);
    const p = pos.get(code);
    const isWeak = weak.has(code);
    const isStart = code === startCode;
    const m = masteryOf(code);
    const score = m && m.score != null ? Math.round(m.score * 100) + '%' : '';
    const fill = !n.hasQuestions ? '#f4f6fa' : (isWeak ? '#fdf5e6' : (isStart ? '#eefaf2' : '#fff'));
    const stroke = isWeak ? '#f5a524' : (isStart ? '#30a46c' : (n.hasQuestions ? '#d7dde9' : '#e8ecf3'));
    const sw = isWeak || isStart ? 2 : 1;
    const label = n.name.length > 7 ? n.name.slice(0, 7) + '…' : n.name;
    // ── 起点角标必须落在可点区域内（2026-11-05 修）──────────────
    // 原来贴在 rect 上方（y = p.y - 5），实测文字框 y 325–337、rect y 340–366，
    // 两者完全不重叠：用户瞄着「从这里开始」四个字点，命中的是 svg 背景，
    // closest 拿不到节点，点击穿透，面板不响应。
    // 小白就是照着这四个字点的，三次都没反应。这不是它点偏，是字画在了死区。
    // 现在移进 rect 内部右上角，仍在同一个 <g> 里，点字=点节点。
    const startTag = isStart
      ? `<text class="map-start-tag" x="${p.x + NODE_W - 5}" y="${p.y + 10}" text-anchor="end">从这里开始</text>`
      : '';
    // ── 可点性与键盘可达（2026-11-05 修）──────────────────────
    // 两个问题一次解决：
    // ① SVG <g> 原生不可聚焦，Tab 会整张图跳过去（实测：全产物只有 2 个 tabindex，
    //    都在做题页，80 个 map-node 一个没有）。小白按 Tab 从「开始学」直接飞到页面底部。
    // ② 自适应缩放后节点只剩 55×16 像素（1200×650 视口实测 79 个全都一样），
    //    两重缩放换算下极难点中。
    // 解法：<g> 加 tabindex="0" + role="button" 让键盘能到；再加一个比 rect 大 10px 的
    // 透明热区，视觉不变、可点范围变大。
    const HIT_PAD = 10;
    return `<g class="map-node" data-act="map-node" data-node="${esc(code)}" tabindex="0" role="button" aria-label="${esc(n.name)}">`
      + `<title>${esc(n.name)}${n.hasQuestions ? '' : noQuestionLabel(snap, code)}${isWeak ? ' · 薄弱' : ''}${isStart ? ' · 建议从这里开始' : ''}${score ? ' · 掌握度 ' + score : ''}</title>`
      + `<rect class="map-hit" x="${p.x - HIT_PAD}" y="${p.y - HIT_PAD}" width="${NODE_W + HIT_PAD * 2}" height="${NODE_H + HIT_PAD * 2}" fill="transparent" stroke="none"/>`
      + `<rect x="${p.x}" y="${p.y}" width="${NODE_W}" height="${NODE_H}" rx="7" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" pointer-events="none"/>`
      + `<text class="map-label" x="${p.x + NODE_W / 2}" y="${p.y + NODE_H / 2 + 3.5}" text-anchor="middle">${esc(label)}</text>`
      + startTag
      + `</g>`;
  }).join('')).join('');

  return `
  <section class="map-wrap" id="map">
    <div class="map-head">
      <div>
        <div class="map-title">知识关系图</div>
        <div class="map-sub">箭头指向"下一个该学的"；同一条线的节点没有先后要求</div>
      </div>
      <div class="map-legend">
        <span><i style="background:#f5a524"></i>薄弱（掌握度 &lt; 70%）</span>
        <span><i style="background:#fff;border:1px solid #d7dde9"></i>有题可练</span>
        <span><i style="background:#f4f6fa;border:1px solid #e8ecf3"></i>还没题</span>
        <span>共 ${g.stats.nodes} 个概念 · ${g.stats.edges} 条先修关系</span>
      </div>
    </div>
    <svg class="map-svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="知识关系图，${g.stats.nodes} 个概念">
      <defs><marker id="arr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
        <path d="M0,0 L8,4 L0,8 z" fill="#c6cede"/>
      </marker></defs>
      ${edges}
      ${nodes}
    </svg>
    <div class="map-detail" id="map-detail"><span class="dim">点任意一个概念，看它卡在哪。</span></div>
  </section>`;
}

function renderNodeCard(c) {  const m = c.mastery;
  const empty = c.questionCount === 0;
  // 无题节点：不可点，明确标出，并显示还缺多少题
  const lack = Math.max(0, 10 - c.questionCount);
  const tip = empty
    ? '还没有题目，点开也做不了'
    : m.score == null
      ? `作答 ${m.samples} 次，不足 ${MIN_SAMPLES} 次不判定`
      : `近 ${m.recent} 次正确率 ${pct(m)}，共作答 ${m.samples} 次`;
  const cls = empty ? 'node node-empty' : 'node';
  const badge = empty
    ? `<div class="node-state" style="color:#b0b6c4">无题</div>`
    : `<div class="node-state" style="color:${STATE_COLOR[m.state]}">${STATE_LABEL[m.state]}</div>`;
  const sub = empty
    ? `<span style="color:#b0b6c4">暂无题目</span>`
    : `${c.questionCount} 道题${m.state === 'unknown' ? ' · 你还没做' : ''}`;
  return `
  <article class="${cls}" ${empty ? '' : `data-node="${esc(c.code)}"`} title="${esc(tip)}">
    ${empty
      ? `<svg width="34" height="34" viewBox="0 0 34 34"><circle cx="17" cy="17" r="14" fill="none" stroke="#d8dce6" stroke-width="2" stroke-dasharray="2 4"/></svg>`
      : ring(m)}
    <div class="node-body">
      <div class="node-name">${esc(c.name)}</div>
      <div class="node-sub">${sub}</div>
    </div>
    ${badge}
  </article>`;
}

function renderQuiz(snap, nodeCode, opts) {
  const module = snap.tree.modules.find((m) => m.concepts.some((c) => c.code === nodeCode));
  const concept = module?.concepts.find((c) => c.code === nodeCode);
  if (!concept) return `<main class="quiz"><p>找不到节点 ${esc(nodeCode)}</p></main>`;

  const pool = snap.questions.filter((q) => Array.isArray(q.nodes) && q.nodes.includes(nodeCode));
  const idx = opts.qIndex || 0;
  const q = pool[idx];
  const lastResult = opts.lastResult || null;
  const done = lastResult && lastResult.id === q?.id;

  if (!pool.length) {
    return `<main class="quiz">
      <a class="back" data-act="back">← 返回知识树</a>
      <div class="empty">该节点还没有题目。</div>
    </main>`;
  }

  const isMulti = q.type === 'multi_choice' || parseAnswerKey(q.answer).length > 1;
  const isTF = q.type === 'judge' || isTrueFalseShape(q);

  return `
  <main class="quiz">
    <a class="back" data-act="back">← 返回知识树</a>
    <div class="quiz-head">
      <div class="crumb">${esc(module.name)} / ${esc(concept.name)}</div>
      <div class="quiz-count">${idx + 1} / ${pool.length}</div>
    </div>
    ${renderConceptBrief(concept)}
    <div class="stem">${esc(q.stem)}</div>
    <div class="hint">${isMulti ? '多选：选出全部正确项' : isTF ? '判断' : '单选'}</div>
    <div class="options" data-multi="${isMulti}">
      ${q.options.map((o, i) => {
        const letter = String.fromCharCode(65 + i);
        const chosen = done && lastResult.given.includes(letter);
        const right = done && lastResult.expected.includes(letter);
        const cls = done ? (right ? 'opt right' : chosen ? 'opt wrong' : 'opt') : 'opt';
        return `<button class="${cls}" data-opt="${letter}" ${done ? 'disabled' : ''}>
          <span class="letter">${letter}</span><span class="otext">${esc(o)}</span>
        </button>`;
      }).join('')}
    </div>
    ${done ? `
      <div class="feedback ${lastResult.correct ? 'ok' : 'bad'}">
        <b>${lastResult.correct ? '答对了' : '答错了'}</b>
        ${lastResult.note ? `<span>${esc(lastResult.note)}</span>` : ''}
      </div>
      <!-- 整条横条都可点：data-act 挂在容器上，里面的按钮只是视觉标签。
           曾经只有中间蓝按钮能点，用户点横条两端就没反应，看着像"点了没反应"。 -->
      <div class="quiz-actions" data-act="next" data-node="${esc(nodeCode)}" data-idx="${idx}" role="button" tabindex="0">
        <span class="btn-primary">${idx + 1 < pool.length ? '下一题' : '回知识树'}</span>
      </div>
      <div class="explain"><b>解析</b>${esc(q.explanation || '暂无解析')}</div>
      ${renderPeer(nodeCode, concept, idx)}
    ` : `<div class="quiz-actions" data-act="submit" data-node="${esc(nodeCode)}" data-idx="${idx}" role="button" tabindex="0"><span class="btn-primary">提交</span></div>`}
  </main>`;
}

/**
 * AI 同学区域 —— 只在有语句库的概念上出现。
 * 关键：这里只拿 concept 的 code/name 去查语句库，
 * 不传 q、不传 lastResult，所以它拿不到对错，也就无从评价学习者。
 */
function renderPeer(nodeCode, concept) {
  if (!concept || !peerHasLines(nodeCode)) return '';
  const lines = peerScript({ code: concept.code, name: concept.name }, 1);
  if (!lines.length) return '';
  const line = lines[0];
  return `
    <div class="peer">
      <div class="peer-head">
        <span class="peer-avatar">同</span>
        <span class="peer-name">${esc(PEER_NAME)}</span>
        <span class="peer-tag">${esc(PEER_LABEL[line.position] || '')}</span>
      </div>
      <div class="peer-quote">${esc(line.quote)}</div>
      <div class="peer-ask">
        <textarea class="peer-input" rows="2" placeholder="想回他一句？说说哪里不对、或者你自己怎么想的"></textarea>
        <div class="peer-ask-foot">
          <span class="peer-ask-note">只是记下来，不评分、不影响进度</span>
          <button class="btn-ghost" data-act="peer-save">记下</button>
        </div>
      </div>
    </div>`;
}

/**
 * 节点开场：先讲清楚这个概念是什么、常见误解有哪些，再进题。
 * 数据全部来自概念树；def 太短的（<25 字）标成"一句话定义"，提示后面会展开。
 */
function renderConceptBrief(concept) {
  if (!concept) return '';
  const b = briefFor(concept.code);
  if (!b) return '';
  const def = String(b.main || '').trim();
  const mis = b.misconceptions;
  if (!def && !mis.length) return '';
  const isBrief = !b.hasExpanded && def.length > 0 && def.length < 25;
  return `
    ${b.asks ? `<div class="brief-asks">${esc(b.asks)}</div>` : ''}
    <details class="brief">
      <summary class="brief-title">想先看看这个概念？<span class="brief-hint">不看也能直接做题</span></summary>
      <div class="brief-body">
      ${def ? `
        <div class="brief-label">${isBrief ? '一句话定义' : '定义'}</div>
        <div class="brief-def">${esc(def)}</div>
      ` : ''}
      ${b.example ? `
        <details class="brief-example">
          <summary>举个例子</summary>
          <div class="brief-example-body">${esc(b.example)}</div>
        </details>
      ` : ''}
      ${mis.length ? `
        <div class="brief-mis-title">常见的误解（这些说法是错的）</div>
        <ul class="brief-mis">
          ${mis.map((m) => `<li><span class="mis-x">✕</span>${esc(m)}</li>`).join('')}
        </ul>
        <div class="brief-tip">下面做题时，留意这些误解会不会冒出来。</div>
      ` : ''}
      </div>
    </details>`;
}

// ── 页面 ───────────────────────────────────────────────────
export function renderPage(source = 'mock') {
  const snap = snapshot(source);
  const body = renderSnapshot(snap, { view: 'tree' });
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AnyLearn · 人工智能基础</title>
<style>${CSS}</style></head>
<body>
<div id="app">${body}</div>
<script>window.__SNAP__ = ${JSON.stringify(snap)};</script>
<script>${CLIENT}</script>
</body></html>`;
}

const CSS = ONBOARD_CSS + `
.onboard-link{margin-left:12px;font-size:12px;color:#3b6df6;text-decoration:none;border-bottom:1px dashed #b9cdfc}
.onboard-link:hover{color:#2b4c9b}
:root{--ink:#1a1d24;--ink2:#5b6478;--line:#e6e8ee;--bg:#f7f8fa;--card:#fff;--accent:#3b6df6}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.6 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif}
.top{display:flex;justify-content:space-between;align-items:center;padding:14px 22px;background:var(--card);border-bottom:1px solid var(--line);position:relative}
.brand{font-weight:700;font-size:15px}
.src{font-size:12px;color:var(--ink2)}
/* 顶部条带吸顶：用户往下翻十几屏找节点时，也要一直看得见自己的进度。
   之前是普通流式布局，一滚就没了——小白在列表中间时说"读不到现在有题可做"。 */
.band{position:relative;display:grid;grid-template-columns:1fr auto;gap:20px;margin:18px 22px;padding:20px 24px;background:linear-gradient(135deg,#f0f4ff,#fff 60%);border:1px solid #dde4f7;border-radius:14px;box-shadow:0 4px 14px rgba(20,30,60,.06)}
.band-main{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.band-num{font-size:30px;font-weight:700;letter-spacing:-.5px}
.band-label{color:var(--ink2);font-size:12px;margin-right:14px}
.band-sep{width:1px;height:26px;background:var(--line);margin-right:10px;align-self:center}
.slash{font-size:15px;color:var(--ink2);font-weight:500}
.band-next{text-align:right;min-width:220px}
.next-tag{font-size:11px;color:var(--accent);font-weight:600;letter-spacing:1px}
.next-title{font-size:17px;font-weight:650;margin:2px 0}
.next-reason{font-size:12px;color:var(--ink2);margin-bottom:10px}
.btn-primary{background:var(--accent);color:#fff;border:0;border-radius:9px;padding:9px 20px;font-size:13px;font-weight:600;cursor:pointer}
.btn-primary:hover{filter:brightness(1.06)}
.tree{padding:0 22px 40px;max-width:1080px;margin:0 auto}
.module{margin-bottom:26px}
.module-head{display:flex;align-items:center;gap:12px;margin-bottom:10px}
.module-head h2{font-size:14px;margin:0;font-weight:650}
.module-meta{font-size:12px;color:var(--ink2)}
.mini-bar{display:flex;height:5px;width:120px;border-radius:3px;overflow:hidden;background:#eef0f5;margin-left:auto}
.mini-bar i{display:block}
.nodes{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px}
.node{display:flex;align-items:center;gap:12px;padding:12px 14px;background:var(--card);border:1px solid var(--line);border-radius:11px;cursor:pointer;transition:.15s}
.node:hover{border-color:#c3cff5;box-shadow:0 2px 10px rgba(59,109,246,.08);transform:translateY(-1px)}
.node-empty{background:#fafbfc;border-style:dashed;cursor:default;opacity:.92}
.node-empty:hover{border-color:var(--line);box-shadow:none;transform:none}
.lack{color:#e5484d;font-size:11px}
/* 折叠区在列表末尾，但要让人一眼看出"这里是结尾、下面是还没做的"。
   之前只是个普通虚线框，小白说"看不出是标题还是内容，像夹在卡片中间"。
   改成带分隔线和居中标题的收尾块：天然读作"到此为止，后面还有这些"。 */
.coming{margin:28px 0 56px;padding:0 22px;position:relative}
.coming:before{content:"";position:absolute;left:22px;right:22px;top:-14px;height:1px;background:#e6e8ee}
.coming summary{cursor:pointer;color:#6b7386;font-size:13px;padding:14px 18px;background:#f6f7fa;
  border:1px solid #e2e6ef;border-radius:12px;list-style:none;text-align:center;
  display:flex;align-items:center;justify-content:center;gap:8px}
.coming summary::-webkit-details-marker{display:none}
.coming summary:before{content:"▸";color:#b0b6c4;font-size:11px}
.coming[open] summary:before{content:"▾"}
.coming summary:hover{background:#eef1f7;color:#4a5468;border-color:#d3d9e6}
.coming-body{padding:14px 4px 0;border-top:1px dashed #e6e8ee;margin-top:12px}
.coming-module{margin-bottom:14px}
.coming-module-name{font-size:13px;font-weight:600;color:#6b7386;margin-bottom:6px}
.coming-names{display:flex;flex-wrap:wrap;gap:6px}
.coming-names span{font-size:12px;color:#8b93a7;background:#f2f4f8;border-radius:6px;padding:3px 9px}
.band-gap{margin-top:10px;font-size:12px;color:var(--ink2)}
.band-excluded{margin-top:4px;padding-top:6px;border-top:1px dashed var(--line);font-size:11.5px;color:#8a93a3}
.band-gap b{color:#e5484d}
.node-body{flex:1;min-width:0}
/* ── 关系图（v12 阶段 2）─────────────────────────────────
   拓扑分层绘制，不做力导向：力导向每次坐标都不一样，没法截图对账。
   弱项（掌握度 < 0.7）用琥珀色描边，和树视图的 learning 色一致。 */
.map-wrap{margin:0 22px 24px;padding:16px 18px;background:var(--card);border:1px solid var(--line);border-radius:14px;overflow-x:auto}
/* 图宽 1770px，容器通常只有 1470px，右侧 300px 被裁、要横向拖动才看得全。
   小白原话："上面一片空白、节点挤在下面、右侧被截断"——其实是横向溢出导致的观感。
   改成按容器宽度自适应缩放，整张图一屏看全，不再需要横向拖动（2026-11-05）。 */
.map-svg{display:block;width:100%;height:auto;max-width:100%}
.map-head{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px;flex-wrap:wrap;gap:8px}
.map-title{font-size:14px;font-weight:600}
.map-sub{font-size:12px;color:var(--ink2)}
.map-legend{display:flex;gap:14px;flex-wrap:wrap;font-size:11.5px;color:var(--ink2)}
.map-legend i{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:4px;vertical-align:middle}
.map-svg{display:block;min-width:100%}
.map-node{cursor:pointer}.map-node rect{transition:.12s}
.basis{margin-top:8px;font-size:12px}
.basis summary{cursor:pointer;color:#2b5fd9}
.basis-body{margin-top:6px;padding:8px 10px;background:#f7f9fc;border:1px solid var(--line);border-radius:8px;line-height:1.7}
.basis-row{display:flex;gap:10px;align-items:flex-start;margin:2px 0}
.basis-k{flex:0 0 168px;color:#7a828f}
.basis-v{flex:1;word-break:break-all}
.basis-v code{background:#eef2f8;padding:1px 5px;border-radius:4px;font-size:11px}
.basis-why{color:#1f7a4d;font-size:12px}
.map-node:hover rect{filter:brightness(.96)}
.map-edge{stroke:#d6dbe6;stroke-width:1;fill:none}
.map-edge.cross{stroke:#c9d3ea;stroke-dasharray:3 3}
.map-label{font-size:10px;fill:#5b6376;pointer-events:none}
.map-start-tag{font-size:9.5px;fill:#2f9e63;font-weight:600}
.map-detail{margin-top:12px;padding:12px 14px;background:#f7f9fd;border:1px solid #e3e9f5;border-radius:10px;font-size:12.5px;line-height:1.7}
.map-detail b{color:var(--ink)}
.map-detail .dim{color:var(--ink2)}
.node-name{font-weight:600;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.node-sub{font-size:11.5px;color:var(--ink2)}
.node-state{font-size:11px;font-weight:600}
/* 底部留白必须 >= 操作条高度(64) + 呼吸空间，否则最后几行正文会被固定条压住。
   用 --bar-h 统一，改操作条高度时这里自动跟着走。 */
/* 底部留白恢复 24px（大副 2026-11-05 放行）。
   实测说明：改回 24 并不会增加"可滚动量"——页面本来就能滚
   （1200x650 下 scrollHeight-innerHeight=189，一直是正数），
   留白加在操作条下方，只影响页面总高，不影响能否滚动。
   但这一改无害，且此前 51B99C0A（24px）在小白的浏览器里滚得动，
   保持与那版一致，减少变量。 */
.quiz{max-width:760px;margin:0 auto;padding:8px 22px 24px}
.back{display:inline-block;color:var(--ink2);font-size:13px;cursor:pointer;margin-bottom:14px;text-decoration:none}
.back:hover{color:var(--accent)}
.quiz-head{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px}
.crumb{font-size:12px;color:var(--ink2)}
.quiz-count{font-size:12px;color:var(--ink2);font-variant-numeric:tabular-nums}
.stem{font-size:17px;font-weight:600;line-height:1.65;margin:8px 0 6px}
.hint{font-size:12px;color:var(--ink2);margin-bottom:16px}
.options{display:flex;flex-direction:column;gap:9px;margin-bottom:18px}
.opt{display:flex;gap:12px;align-items:flex-start;text-align:left;padding:13px 16px;background:var(--card);border:1.5px solid var(--line);border-radius:11px;cursor:pointer;font-size:14px;color:inherit;transition:.12s}
.opt:hover:not(:disabled){border-color:#c3cff5}
.opt[aria-pressed=true]{border-color:var(--accent);background:#f5f8ff}
.opt.right{border-color:#30a46c;background:#f1fbf5}
.opt.wrong{border-color:#e5484d;background:#fef3f3}
.opt:disabled{cursor:default}
.letter{font-weight:700;color:var(--ink2);width:16px;flex:none}
.otext{flex:1}
.feedback{padding:12px 16px;border-radius:10px;margin-bottom:10px;display:flex;gap:10px;align-items:baseline;font-size:13px}
.feedback.ok{background:#f1fbf5;color:#1a7f4b}
.feedback.bad{background:#fef3f3;color:#c0242a}
.explain{background:#fbfbfd;border:1px solid var(--line);border-radius:10px;padding:12px 16px;font-size:13px;color:var(--ink2);margin-bottom:18px}
.explain b{display:block;color:var(--ink);margin-bottom:4px;font-size:12px}
.quiz-foot{margin-top:6px}
/* 答题操作条：固定在视口底部，永远在同一个位置、同一块区域。
   之前按钮跟着内容走，长解析一顶就贴到屏幕边缘（实测 top=826 / 视口 902，只有 76px 余量，
   中心还容易命中到别的元素），用户滚来滚去找不到，看着像"点了没反应"。
   用 fixed 而不是 sticky：sticky 仍受内容流影响，长页面下还是会滑到边缘。 */
/* 答题操作条：固定在视口底部，永远在同一个位置。
   注意：fixed 元素会盖住正文，所以 .quiz 底部必须留出比它更高的空白（见下方 .quiz 的 padding-bottom）。
   之前留 110px 不够——实测操作条占 740~802，而「答对了」在 y=773、解析在 y=829，
   正文被整块遮住，用户看到的是"提交后什么都没有"。 */
/* 操作条：跟着内容排布，不再 position:fixed（2026-11-05 改）
   原来是 fixed + bottom:0，脱离文档流盖在内容上。实测 1200x650 视口：
   进入做题页滚动 0 时，A 露出，B/C/D 全部被它盖住（露出 0px）。
   小白原话："只出现 A 一个选项，B C D 完全没出现"——不是没画，是被盖住。
   加 padding-bottom 无效（那只增加页面总高，不改变选项初始位置，实测仍 3 个不可见）。
   改成正常流式排布后它不盖任何东西，四个选项天然全可见，也不需要自动滚动。
   min-height 和视觉样式保留。 */
.quiz-actions{position:relative;display:flex;gap:10px;align-items:center;justify-content:center;
  min-height:64px;padding:12px 22px calc(12px + env(safe-area-inset-bottom));background:rgba(255,255,255,.98);
  border-top:1px solid #e6e8ee;box-shadow:0 -2px 12px rgba(20,30,60,.06);
  cursor:pointer;user-select:none;-webkit-tap-highlight-color:transparent}
/* 整条都是可点区域，所以整条都要有"能点"的视觉反馈——不是只有中间那块 */
.quiz-actions:hover{background:#eef2fb}
.quiz-actions:active{background:#e3eaf9}
.quiz-actions:focus-visible{outline:2px solid #3b6df6;outline-offset:-3px}
.quiz-actions .btn-primary{min-width:168px;pointer-events:none;box-shadow:0 2px 8px rgba(59,109,246,.28)}
.brief{background:#f6f9ff;border:1px solid #dbe4f8;border-radius:12px;padding:16px 18px;margin-bottom:18px}
.brief-title{font-size:12px;font-weight:700;color:#3b6df6;letter-spacing:.5px;margin-bottom:8px;cursor:pointer;list-style:none;display:flex;align-items:center;gap:8px}
.brief-title::-webkit-details-marker{display:none}
.brief-title:before{content:"▸";color:#8fa9e8;transition:transform .15s}
.brief[open] .brief-title:before{content:"▾"}
.brief-title:hover{color:#2b4c9b}
.brief-hint{font-weight:400;color:#9aa6c0;font-size:11.5px;letter-spacing:0}
.brief-body{padding-top:2px}
.brief-asks{font-size:14px;color:#3a4560;line-height:1.65;margin-bottom:12px;padding:10px 14px;background:#f3f7ff;border-left:3px solid #8fa9e8;border-radius:0 8px 8px 0}
.brief-def{font-size:15px;line-height:1.75;color:#1a1d24;margin-bottom:12px}
.brief-mis-title{font-size:12px;font-weight:650;color:#8a5a12;margin-bottom:6px}
.brief-mis{margin:0;padding-left:18px;font-size:13.5px;line-height:1.8;color:#4a3a20}
.brief-mis li{margin-bottom:2px}
.brief-tip{font-size:12px;color:var(--ink2);margin-top:8px}
.brief-label{font-size:11px;color:#5b6478;margin-bottom:4px}
.mis-x{color:#e5484d;font-weight:700;margin-right:6px}
.peer-ask{margin-top:10px}
.peer-input{width:100%;box-sizing:border-box;border:1px solid #e8d5b0;border-radius:9px;padding:9px 12px;font:13px/1.6 inherit;color:var(--ink);background:#fff;resize:vertical;outline:none}
.peer-input:focus{border-color:#e8a33d;box-shadow:0 0 0 3px rgba(232,163,61,.12)}
.peer-ask-foot{display:flex;align-items:center;justify-content:space-between;margin-top:8px}
.peer-ask-note{font-size:11.5px;color:#a08a66}
.btn-ghost{background:#fff;border:1px solid #e8d5b0;color:#8a5a12;border-radius:8px;padding:6px 16px;font-size:12.5px;font-weight:600;cursor:pointer}
.btn-ghost:hover{background:#fdf6ec}
.peer-saved{font-size:12px;color:#30a46c;margin-top:6px}
.brief-example{margin:6px 0 12px}
.brief-example summary{cursor:pointer;font-size:12.5px;color:#3b6df6;font-weight:600;list-style:none}
.brief-example summary::-webkit-details-marker{display:none}
.brief-example summary:before{content:'▸ ';font-weight:400}
.brief-example[open] summary:before{content:'▾ '}
.brief-example-body{font-size:13px;line-height:1.8;color:#4a3a20;background:#fff;border:1px solid #e6e8ee;border-radius:8px;padding:10px 12px;margin-top:6px}
.peer{background:#fdfbf6;border:1px solid #f0e4cc;border-radius:12px;padding:14px 16px;margin-bottom:18px}
.peer-head{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.peer-purpose{font-size:12px;color:#a08a66;line-height:1.6;margin-bottom:10px;padding:8px 10px;background:#faf3e6;border-radius:8px}
.peer-avatar{width:22px;height:22px;border-radius:50%;background:#e8a33d;color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;flex:none}
.peer-name{font-size:13px;font-weight:650;color:#8a5a12}
.peer-tag{font-size:11px;color:#b08a4a;border:1px solid #e8d5b0;border-radius:999px;padding:1px 8px}
.peer-quote{font-size:14px;line-height:1.7;color:#4a3a20}
.peer-hint{font-size:12px;color:#a08a66;margin-top:8px}
.empty{padding:40px;text-align:center;color:var(--ink2)}
`;

// 客户端脚本：处理点击，重新渲染对应视图
//
// masteryClientSource：真源 core/mastery.mjs 生成的浏览器端纯函数源码。
// 放在模板字符串外算好，避免每次渲染都重新生成；也避免真源里出现反引号时打断模板。
const masteryClientSource = clientSource();

const CLIENT = `
(function(){
  var snap = window.__SNAP__;

  // ── 掌握度算法（与 core/mastery.mjs 同源，内联供页面运行时重算）──────────
  // 构建时算一次快照只够"第一次打开"用；用户作答后必须用本地记录重算，
  // 否则刷新页面进度就归零。参数必须与 core/mastery.mjs 保持一致。
  // ── 掌握度算法：由 core/mastery.mjs 的 clientSource() 生成，不在这里手写 ──
  //
  // 2026-11-05（v12 阶段 1）改法：
  //   原来这里手抄了一份 masteryOfNode / reasonFor / pickNext，注释写着
  //   "参数必须与 core/mastery.mjs 保持一致"。这条约定失效过两次：
  //     · reasonFor 文案改过一次，两边不同步
  //     · 分母口径改过一次，客户端仍用 all.length（整棵树）
  //   而且客户端常量叫 MIN_SHOWN，真源叫 MIN_SAMPLES —— 值一样、名字不一样，
  //   说明当初就是手抄的。手抄的副本最危险：看着"一致"，随时再分叉。
  //
  // 现在这份源码由真源生成，参数（MIN_SAMPLES/WINDOW/DECAY/…）也从真源常量来。
  // 改 core/mastery.mjs 的 DECAY 再重建，下面这段里的数字会跟着变 —— 这是可验的。
${masteryClientSource}

  // 把本地记录灌回快照，重算每个节点的掌握度与"下一步"
  //
  // 2026-11-05（v12 阶段 1）：这里原来写死 snap.summary={total: all.length, ...}，
  // all 是整棵树。也就是说就算构建时快照的分母修好了，用户答一道题、触发一次
  // applyRecords，分母立刻又变回 79。**修快照不修这里，等于没修。**
  //
  // 现在分母与构建时同源：都用"有题节点数"，且算法本身来自 core/mastery.mjs
  // 生成的 masteryOfTreeClient，不再自己拼 summary。
  function applyRecords(records){
    // ── 记录形状归一（2026-11-05 修）─────────────────────────
    // 真源 mastery.mjs 读的是 r.questionId，而 localStorage 里存的是 r.id
    // （见 saveRecord：{id,node,correct,at}）。字段名对不上导致
    // basis.attempts 全是 "undefined"，证据链等于没有。
    // 在这里转成真源要求的形状，不要在真源里加兼容分支——
    // 真源只认一种输入，谁存谁负责对齐。
    // 真源两处字段名不同，别想当然：
    //   masteryOfNode（构建/服务端）读 r.questionId + r.nodeCode
    //   masteryOfTreeClient（客户端）按 r.node 建索引，内部再调 masteryOfNode
    // 所以这里必须两个名都带上，否则要么分不到节点、要么 attempts 全是 undefined。
    records=(records||[]).map(function(r){
      if(!r)return r;
      return {
        questionId:r.questionId||r.id,
        node:r.node,
        nodeCode:r.nodeCode||r.node,
        correct:r.correct,
        at:r.at,
        qkind:r.qkind
      };
    });
    var byNode={};
    (records||[]).forEach(function(r){
      if(!r||!r.node)return;
      (byNode[r.node]=byNode[r.node]||[]).push(r);
    });
    var all=[];
    snap.tree.modules.forEach(function(m){m.concepts.forEach(function(c){all.push(c)})});
    // 有题节点集合：从快照里带出来的题算，和构建时同一口径
    var withQ={};
    (snap.questions||[]).forEach(function(q){(q.nodes||[]).forEach(function(n){withQ[n]=1})});
    var withQSet=new Set(Object.keys(withQ));
    var r=masteryOfTreeClient(all, records, withQSet);
    snap.summary=r.summary;
    snap.nextUp=r.nextUp;
    snap.records=records||[];
  }

  var app = document.getElementById('app');
  var view = 'tree', activeNode = null, qIndex = 0, lastResult = null, chosen = [];

  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function ringSvg(m,size){size=size||34;var r=(size-6)/2,c=2*Math.PI*r;
    var col={unknown:'#8b93a7',weak:'#e5484d',learning:'#f5a524',mastered:'#30a46c'}[m.state];
    if(m.score==null) return '<svg width="'+size+'" height="'+size+'"><circle cx="'+(size/2)+'" cy="'+(size/2)+'" r="'+r+'" fill="none" stroke="'+col+'" stroke-width="2.5" stroke-dasharray="3 4" opacity=".55"/></svg>';
    var d=c*m.score;
    return '<svg width="'+size+'" height="'+size+'"><circle cx="'+(size/2)+'" cy="'+(size/2)+'" r="'+r+'" fill="none" stroke="#e6e8ee" stroke-width="3"/><circle cx="'+(size/2)+'" cy="'+(size/2)+'" r="'+r+'" fill="none" stroke="'+col+'" stroke-width="3" stroke-dasharray="'+d+' '+(c-d)+'" stroke-linecap="round" transform="rotate(-90 '+(size/2)+' '+(size/2)+')"/><text x="50%" y="50%" text-anchor="middle" dy="4" font-size="9" fill="'+col+'" font-weight="600">'+(m.score==null?'—':Math.round(m.score*100)+'%')+'</text></svg>';
  }
  var COLOR={unknown:'#8b93a7',weak:'#e5484d',learning:'#f5a524',mastered:'#30a46c'};
  var LABEL={unknown:'还没做',weak:'薄弱',learning:'在学',mastered:'已掌握'};

  function baseName(s){return String(s||'').replace(/[\\s\\p{P}\\p{S}]/gu,'')}
  function sim(a,b){a=baseName(a);b=baseName(b);if(!a||!b)return 0;if(a===b)return 1;
    var G=function(s){var o={};for(var i=0;i<s.length-1;i++)o[s.slice(i,i+2)]=1;return Object.keys(o)};
    var x=G(a),y=G(b),set=new Set(y),inter=0;for(var j=0;j<x.length;j++)if(set.has(x[j]))inter++;
    return x.length&&y.length?2*inter/(x.length+y.length):0}

  function head(){
    return '<header class="top"><div class="brand">AnyLearn · 人工智能基础</div><div class="src">数据源：<b>'+esc(snap.label)+'</b></div></header>';
  }
  function band(){
    var s=snap.summary,n=snap.nextUp;
    var nodesWithQ={};snap.questions.forEach(function(q){(q.nodes||[]).forEach(function(x){nodesWithQ[x]=1})});
    var nwq=Object.keys(nodesWithQ).length;
    var nodeCount=0;snap.tree.modules.forEach(function(m){nodeCount+=m.concepts.length});
    var lack=Math.max(0,nodeCount*10-snap.questions.length);
    var MIN=3,scored=0;
    snap.tree.modules.forEach(function(m){m.concepts.forEach(function(c){if(c.questionCount>0&&c.mastery.samples>=MIN)scored++})});
    var nextOk=true;
    if(n){snap.tree.modules.forEach(function(m){m.concepts.forEach(function(c){if(c.code===n.code&&c.questionCount===0)nextOk=false})})}
    // 45 与 46 的差：与构建端同一句文案（措辞理由见构建端注释，小白原话定的）
    var excNodes=(snap.excluded&&Array.isArray(snap.excluded.nodes))?snap.excluded.nodes:[];
    var excNote=excNodes.length?(function(){
      var names=excNodes.map(function(x){return esc(String(x))}).join('、');
      return '<div class="band-gap band-excluded">有题可做的知识点是 <b>'+nwq+'</b> 个，不是全部。另有 <b>'+excNodes.length+'</b> 个知识点（'+names+'）<b>这一版没有放它的题</b>——不是你没解锁，也不是要等，这版就是这样。</div>';
    })():'';
    return '<section class="band"><div class="band-main">'+
      '<div class="band-num">'+s.total+'</div><div class="band-label">概念节点</div><div class="band-sep"></div>'+
      '<div class="band-num">'+s.mastered+'</div><div class="band-label">已掌握</div><div class="band-sep"></div>'+
      '<div class="band-num">'+nwq+'<span class="slash">/'+nodeCount+'</span></div><div class="band-label">现在有题可做</div><div class="band-sep"></div>'+
      (scored===0
        ? '<div class="band-num">0</div><div class="band-label">你开始做了没</div>'+
          '<div class="band-gap" style="flex-basis:100%">题库共 <b>'+snap.questions.length+'</b> 道题，<b>'+nwq+'</b> 个知识点有题 · 你还没开始。随便挑一个做满 <b>3</b> 道，就能看到自己学得怎么样</div>'+excNote+'</div>'
        : '<div class="band-num">'+scored+'<span class="slash">/'+nwq+'</span></div><div class="band-label">看得出学得怎么样</div>'+
          '<div class="band-gap" style="flex-basis:100%">题库共 <b>'+snap.questions.length+'</b> 道题 · 有题可做 <b>'+nwq+'</b> 个知识点 · 已经看得出水平的 <b>'+scored+'</b> 个 · 继续做，这个数会跟着涨</div>'+excNote+'</div>')+
      '<div class="band-next">'+(n?'<div class="next-tag">下一步</div><div class="next-title">'+esc(n.name)+'</div><div class="next-reason">'+esc(n.reason)+'</div><button class="btn-primary" data-act="study" data-node="'+esc(n.code)+'"'+(nextOk?'':' disabled style="opacity:.5;cursor:not-allowed"')+'>开始学</button>':'<div class="next-tag">全部完成</div><div class="next-title">没有待学节点</div>')+'</div></section>';
  }
  function treeView(){
    var html='', coming='';
    snap.tree.modules.forEach(function(m){
      // 只渲染有题的节点；无题的收到底部折叠区。两条渲染路径必须一致，
      // 否则从节点返回知识树时会又冒出一片灰色卡片。
      var use=m.concepts.filter(function(c){return c.questionCount>0});
      var miss=m.concepts.filter(function(c){return c.questionCount===0});
      if(!use.length&&!miss.length)return;
      if(miss.length){
        coming+='<div class="coming-module"><div class="coming-module-name">'+esc(m.name)+'</div><div class="coming-names">'+
          miss.map(function(c){return '<span>'+esc(c.name)+'</span>'}).join('')+'</div></div>';
      }
      if(!use.length)return;
      var parts={mastered:0,learning:0,weak:0,unknown:0},sum=0,sc=0;
      use.forEach(function(c){parts[c.mastery.state]++;if(c.mastery.score!=null){sum+=c.mastery.score;sc++}});
      var segs=['mastered','learning','weak','unknown'].filter(function(k){return parts[k]>0}).map(function(k){return '<i style="flex:'+parts[k]+';background:'+COLOR[k]+'"></i>'}).join('');
      var h='<section class="module"><div class="module-head"><h2>'+esc(m.name)+'</h2><span class="module-meta">'+use.length+' 个概念'+(sc?' · '+Math.round(sum/sc*100)+'%':'')+'</span><div class="mini-bar">'+segs+'</div></div><div class="nodes">';
      use.forEach(function(c){var mm=c.mastery;
        var sub=c.questionCount+' 道题'+(mm.state==='unknown'?' · 你还没做':'');
        var badge='<div class="node-state" style="color:'+COLOR[mm.state]+'">'+LABEL[mm.state]+'</div>';
        h+='<article class="node" data-node="'+esc(c.code)+'">'+
           ringSvg(mm)+
           '<div class="node-body"><div class="node-name">'+esc(c.name)+'</div><div class="node-sub">'+sub+'</div></div>'+badge+'</article>';
      });
      html+=h+'</div></section>';
    });
    if(coming){
      var missCount=(function(){var n=0;snap.tree.modules.forEach(function(m){m.concepts.forEach(function(c){if(c.questionCount===0)n++})});return n})();
      html+='<details class="coming"><summary>还有 '+missCount+' 个知识点正在准备中（暂时没有题目，先看看吧）</summary><div class="coming-body">'+coming+'</div></details>';
    }
    return '<main class="tree">'+html+'</main>';
  }
  // ── 关系图（客户端版）────────────────────────────────────
  // 2026-11-05 修：关系图原来只在构建时静态写进 HTML，而 paint() 用
  // innerHTML 覆盖 #app 时只写 head+band+treeView，把整块 <section id="map">
  // 抹掉了。结果 HTML 里有 79 个 map-node，浏览器里一个都没有。
  // 现在是同一份逻辑的第二处实现，两处必须一致；构建端改动时这里要跟着改。
  function mapView(){
    var g=snap.graph;
    if(!g||!g.nodes||!g.nodes.length)return '';
    // 两种"没有题"必须分开说（与构建端同一套措辞，理由见构建端注释）
    var excSet={};
    ((snap.excluded&&Array.isArray(snap.excluded.nodes))?snap.excluded.nodes:[]).forEach(function(x){excSet[String(x)]=1});
    function noQLabel(code){return excSet[String(code)]?'（本版不出题）':'（还没题）'}
    var NODE_W=88,NODE_H=26,GAP_X=14,LAYER_H=62,PAD=18;
    var maxPerLayer=Math.max.apply(null,g.layers.map(function(l){return l.length}));
    var width=Math.max(720,maxPerLayer*(NODE_W+GAP_X)+PAD*2);
    var height=g.layers.length*LAYER_H+PAD*2;
    var pos={};
    g.layers.forEach(function(layer,li){
      var totalW=layer.length*NODE_W+(layer.length-1)*GAP_X;
      var startX=(width-totalW)/2;
      layer.forEach(function(code,i){pos[code]={x:startX+i*(NODE_W+GAP_X),y:PAD+li*LAYER_H}});
    });
    var byCode={};g.nodes.forEach(function(n){byCode[n.code]=n});
    // 薄弱点一律按树上当前掌握度算：graph.nodes[].mastery 是构建时的快照，
    // 用户答完题后 applyRecords 只更新树，不会回头改 graph。
    var live={};snap.tree.modules.forEach(function(m){m.concepts.forEach(function(c){live[c.code]=c.mastery})});
    var weakSet={};
    g.nodes.forEach(function(n){
      var m=live[n.code]||n.mastery;
      if(m&&m.score!=null&&m.score<g.weakThreshold)weakSet[n.code]=true;
    });
    var edges=g.edges.map(function(e){
      var a=pos[e.from],b=pos[e.to];if(!a||!b)return '';
      var x1=a.x+NODE_W/2,y1=a.y+NODE_H,x2=b.x+NODE_W/2,y2=b.y,my=(y1+y2)/2;
      return '<path class="'+(e.crossModule?'map-edge cross':'map-edge')+'" d="M'+x1+','+y1+' C'+x1+','+my+' '+x2+','+my+' '+x2+','+y2+'" marker-end="url(#arr)"/>';
    }).join('');
    var startCode=snap.startNode?snap.startNode.code:null;
    var nodes=g.layers.map(function(layer){return layer.map(function(code){
      var n=byCode[code],p=pos[code],isWeak=!!weakSet[code],isStart=code===startCode;
      var m=live[code]||n.mastery;
      var score=(m&&m.score!=null)?Math.round(m.score*100)+'%':'';
      var fill=!n.hasQuestions?'#f4f6fa':(isWeak?'#fdf5e6':(isStart?'#eefaf2':'#fff'));
      var stroke=isWeak?'#f5a524':(isStart?'#30a46c':(n.hasQuestions?'#d7dde9':'#e8ecf3'));
      var sw=(isWeak||isStart)?2:1;
      var label=n.name.length>7?n.name.slice(0,7)+'…':n.name;
      var tip=esc(n.name)+(n.hasQuestions?'':noQLabel(code))+(isWeak?' · 薄弱':'')+(isStart?' · 建议从这里开始':'')+(score?' · 掌握度 '+score:'');
      var tag=isStart?'<text class="map-start-tag" x="'+(p.x+NODE_W-5)+'" y="'+(p.y+10)+'" text-anchor="end">从这里开始</text>':'';
      // 与构建端同一套：tabindex/role 让键盘能到，透明热区放大可点范围
      var HP=10;
      return '<g class="map-node" data-act="map-node" data-node="'+esc(code)+'" tabindex="0" role="button" aria-label="'+esc(n.name)+'"><title>'+tip+'</title>'+
        '<rect class="map-hit" x="'+(p.x-HP)+'" y="'+(p.y-HP)+'" width="'+(NODE_W+HP*2)+'" height="'+(NODE_H+HP*2)+'" fill="transparent" stroke="none"/>'+
        '<rect x="'+p.x+'" y="'+p.y+'" width="'+NODE_W+'" height="'+NODE_H+'" rx="7" fill="'+fill+'" stroke="'+stroke+'" stroke-width="'+sw+'" pointer-events="none"/>'+
        '<text class="map-label" x="'+(p.x+NODE_W/2)+'" y="'+(p.y+NODE_H/2+3.5)+'" text-anchor="middle">'+esc(label)+'</text>'+tag+'</g>';
    }).join('')}).join('');
    return '<section class="map-wrap" id="map"><div class="map-head"><div>'+
      '<div class="map-title">知识关系图</div>'+
      '<div class="map-sub">箭头指向"下一个该学的"；同一条线的节点没有先后要求</div></div>'+
      '<div class="map-legend">'+
      '<span><i style="background:#f5a524"></i>薄弱（掌握度 &lt; 70%）</span>'+
      '<span><i style="background:#fff;border:1px solid #d7dde9"></i>有题可练</span>'+
      '<span><i style="background:#f4f6fa;border:1px solid #e8ecf3"></i>还没题</span>'+
      '<span>共 '+g.stats.nodes+' 个概念 · '+g.stats.edges+' 条先修关系</span></div></div>'+
      '<svg class="map-svg" viewBox="0 0 '+width+' '+height+'" width="'+width+'" height="'+height+'" role="img" aria-label="知识关系图，'+g.stats.nodes+' 个概念">'+
      '<defs><marker id="arr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">'+
      '<path d="M0,0 L8,4 L0,8 z" fill="#c6cede"/></marker></defs>'+edges+nodes+'</svg>'+
      '<div class="map-detail" id="map-detail"><span class="dim">点任意一个概念，看它卡在哪。</span></div></section>';
  }
  // 模板里的数字只在构建那一刻正确，合并一批题之后就会过时。
  // 每次重绘后按当前数据重写一遍，让数字由数据说了算；全都有题时折叠区整块消失。
  function syncComingCount(){
    var n=0;
    snap.tree.modules.forEach(function(m){m.concepts.forEach(function(c){if(c.questionCount===0)n++})});
    var box=document.querySelector('details.coming');
    if(!box)return n;
    if(n===0){box.remove();return 0}
    var spots=box.querySelectorAll('[data-coming-count]');
    for(var i=0;i<spots.length;i++)spots[i].textContent=String(n);
    return n;
  }
  function findConcept(code){
    for(var i=0;i<snap.tree.modules.length;i++){var m=snap.tree.modules[i];for(var j=0;j<m.concepts.length;j++)if(m.concepts[j].code===code)return {m:m,c:m.concepts[j]}}
    return null;
  }
  function quizView(){
    var f=findConcept(activeNode);
    if(!f) return '<main class="quiz"><p>找不到节点</p></main>';
    var pool=snap.questions.filter(function(q){return q.nodes&&q.nodes.indexOf(activeNode)>=0});
    var q=pool[qIndex];
    if(!q) return '<main class="quiz"><a class="back" data-act="back">← 返回知识树</a><div class="empty">该节点还没有题目。</div></main>';
    var done=lastResult&&lastResult.id===q.id;
    var isMulti=q.type==='multi_choice'||(q.answer&&q.answer.length>1);
    var opts=q.options.map(function(o,i){
      var L=String.fromCharCode(65+i),cl='opt';
      if(done){if(lastResult.expected.indexOf(L)>=0)cl='opt right';else if(lastResult.given.indexOf(L)>=0)cl='opt wrong'}
      else if(chosen.indexOf(L)>=0)cl='opt';
      var pressed=!done&&chosen.indexOf(L)>=0?' aria-pressed="true"':'';
      return '<button class="'+cl+'" data-opt="'+L+'"'+pressed+(done?' disabled':'')+'><span class="letter">'+L+'</span><span class="otext">'+esc(o)+'</span></button>';
    }).join('');
    var tail;
    if(done){
      tail='<div class="feedback '+(lastResult.correct?'ok':'bad')+'"><b>'+(lastResult.correct?'答对了':'答错了')+'</b>'+(lastResult.note?'<span>'+esc(lastResult.note)+'</span>':'')+'</div>'+
        '<div class="quiz-actions" data-act="next" data-node="'+esc(activeNode)+'" role="button" tabindex="0"><span class="btn-primary">'+(qIndex+1<pool.length?'下一题':'回知识树')+'</span></div>'+
        '<div class="explain"><b>解析</b>'+esc(q.explanation||'暂无解析')+'</div>'+
        peerBlock(f.c.c, activeNode);
    }else{
      tail='<div class="quiz-actions" data-act="submit" data-node="'+esc(activeNode)+'" role="button" tabindex="0"><span class="btn-primary">提交</span></div>';
    }
    return '<main class="quiz"><a class="back" data-act="back">← 返回知识树</a>'+
      '<div class="quiz-head"><div class="crumb">'+esc(f.m.name)+' / '+esc(f.c.name)+'</div><div class="quiz-count">'+(qIndex+1)+' / '+pool.length+'</div></div>'+
      briefBlock(activeNode, f.c)+
      '<div class="stem">'+esc(q.stem)+'</div><div class="hint">'+(isMulti?'多选：选出全部正确项':'单选')+'</div>'+
      '<div class="options">'+opts+'</div>'+tail+'</main>';
  }
  function peerBlock(concept, code){
    var lines=snap.peerLines&&snap.peerLines[code];
    if(!lines||!lines.length)return '';
    var line=lines[0];
    return '<div class="peer"><div class="peer-head"><span class="peer-avatar">同</span><span class="peer-name">'+esc(snap.peerName||'同学')+'</span><span class="peer-tag">'+esc(snap.peerLabels[line.position]||'')+'</span></div><div class="peer-purpose">这不一定是个人，也不一定说得对：它常把容易混的地方想岔。你可以看着它说，也可以在下面写一句。</div><div class="peer-quote">'+esc(line.quote)+'</div><div class="peer-ask"><textarea class="peer-input" rows="2" placeholder="它哪里想错了？或者你自己怎么理解的"></textarea><div class="peer-ask-foot"><span class="peer-ask-note">只是记下来，不评分、不影响进度</span><button class="btn-ghost" data-act="peer-save">记下</button></div></div></div>';
  }

  function briefBlock(code, concept){
    var b = snap.briefs && snap.briefs[code];
    var def = b ? b.main : (concept?concept.def:'');
    var mis = b ? (b.misconceptions||[]) : ((concept&&concept.misconceptions)||[]);
    if(!def && !mis.length) return '';
    var isBrief = b ? !b.hasExpanded && def.length>0 && def.length<25 : (def.length<25);
    // 「这个节点在考什么」——具体情境的一句话，先给用户一个抓手
    var asks = b && b.asks ? '<div class="brief-asks">'+esc(b.asks)+'</div>' : '';
    // 讲解默认折叠：做题是主任务，讲解是想看才看的东西。
    // （曾经默认展开，新用户以为"必须读完才能做题"，把入口当成了门槛）
    var h = asks + '<details class="brief"><summary class="brief-title">想先看看这个概念？<span class="brief-hint">不看也能直接做题</span></summary><div class="brief-body">';
    if(def) h += '<div class="brief-label">'+(isBrief?'一句话定义':'定义')+'</div><div class="brief-def">'+esc(def)+'</div>';
    if(b && b.example) h += '<details class="brief-example"><summary>举个例子</summary><div class="brief-example-body">'+esc(b.example)+'</div></details>';
    if(mis.length){
      h += '<div class="brief-mis-title">常见的误解（这些说法是错的）</div><ul class="brief-mis">';
      mis.forEach(function(m){ h += '<li><span class="mis-x">✕</span>'+esc(m)+'</li>'; });
      h += '</ul><div class="brief-tip">下面做题时，留意这些误解会不会冒出来。</div>';
    }
    return h + '</div></details>';
  }

  // 关系图必须在这里重绘：paint() 用 innerHTML 整个覆盖 #app，
  // 只靠构建时静态写进 HTML 的那一份，会在第一次重绘时就被抹掉。
  //
  // ── 底部留白：把 --bar-h 真正接上（2026-11-05 修）────────────
  // CSS 里 .quiz 用的是 padding-bottom: calc(var(--bar-h, 64px) + 48px)，
  // 注释写着"改操作条高度时这里自动跟着走"——但整个产物里没有任何代码给
  // --bar-h 赋值，所以它永远是默认 64px，留白恒为 112px。
  // 而 .quiz-actions 是 position:fixed + min-height:64px + 上下 padding，
  // 实际更高，最后一行选项被压在固定条下面（小白实测"A 只露出一半、滚不动"）。
  // 修法：每次重绘后量出操作条真实高度写回变量，注释说的"自动跟着走"才成立。
  function syncBarHeight(){
    try{
      var bar=document.querySelector('.quiz-actions');
      var h=bar?Math.round(bar.getBoundingClientRect().height):0;
      document.documentElement.style.setProperty('--bar-h', (h>0?h:64)+'px');
    }catch(e){}
  }
  function paint(){
    app.innerHTML=head()+band()+(view==='quiz'?quizView():mapView()+treeView());
    syncBarHeight();
    // 不自动滚。曾经想在这里 scrollIntoView，但：
    //   ①大副指出这条路我踩过坑（滚动吞掉点击，小白当时的症状就是"点了没反应"）；
    //   ②实测它也没解决问题（小视口下仍 3 个选项不可见）。
    // 要不要替用户滚、怎么滚，是设计决策，不是改代码能定的。留给人决定。
  }
  // 窗口尺寸变化时底栏高度会变，重新量一次
  window.addEventListener('resize', syncBarHeight);

  // 键盘可达（2026-11-05 补）：<g tabindex="0" role="button"> 能被 Tab 聚焦，
  // 但 SVG 元素不会把 Enter/Space 自动转成 click，必须自己接。
  // 实测：Tab 能停到节点上，但按 Enter 面板不出来——差的就是这一条。
  app.addEventListener('keydown',function(e){
    if(e.key!=='Enter'&&e.key!==' '&&e.key!=='Spacebar')return;
    var t=e.target;
    if(!t||!t.getAttribute)return;
    var act=t.getAttribute('data-act');
    if(act==='map-node'){e.preventDefault();showMapNode(t.getAttribute('data-node'));return}
  });

  app.addEventListener('click',function(e){
    var t=e.target.closest('[data-act],[data-opt],.node');
    if(!t)return;
    var act=t.getAttribute('data-act');
    if(t.classList.contains('node')&&!act){openNode(t.getAttribute('data-node'));return}
    if(act==='study'){openNode(t.getAttribute('data-node'));return}
    // 关系图节点：不跳转，原地展开"这个点卡在哪"
    if(act==='map-node'){showMapNode(t.getAttribute('data-node'));return}
    if(act==='back'){view='tree';activeNode=null;qIndex=0;lastResult=null;chosen=[];paint();return}
    if(act==='onboard-dismiss'){var ob=document.getElementById('onboard');if(ob)ob.remove();try{localStorage.setItem('anylearn.onboarded','1')}catch(e){};return}
    if(act==='onboard-show'){
      var old=document.getElementById('onboard');if(old)old.remove();
      view='tree';activeNode=null;paint();
      var fresh=document.getElementById('onboard');
      if(fresh){fresh.style.display='';}
      try{localStorage.removeItem('anylearn.onboarded')}catch(e){}
      return;
    }
    if(act==='submit'){submit(t.getAttribute('data-node'));return}
    if(act==='peer-save'){
      var ta=app.querySelector('.peer-input');
      var txt=ta?ta.value.trim():'';
      if(!txt){alert('先写一句再记下');return}
      var qq=app.querySelector('.peer-quote');
      window.__PEER_NOTES__=(window.__PEER_NOTES__||[]);
      window.__PEER_NOTES__.push({at:new Date().toISOString(),conceptCode:activeNode,peerQuote:qq?qq.textContent:'',userText:txt});
      ta.value='';
      var box=ta.closest('.peer-ask');
      var tip=box.querySelector('.peer-saved');
      if(!tip){tip=document.createElement('div');tip.className='peer-saved';box.appendChild(tip)}
      tip.textContent='记下了：'+txt.slice(0,40)+(txt.length>40?'…':'');
      return;
    }
    if(act==='next'){
      var pool=snap.questions.filter(function(q){return q.nodes&&q.nodes.indexOf(activeNode)>=0});
      if(qIndex+1<pool.length){qIndex++;lastResult=null;chosen=[];paint()}else{view='tree';activeNode=null;qIndex=0;lastResult=null;chosen=[];paint()}
      return;
    }
    var opt=t.getAttribute('data-opt');
    if(opt){
      var pool2=snap.questions.filter(function(q){return q.nodes&&q.nodes.indexOf(activeNode)>=0});
      var q=pool2[qIndex];
      var isMulti=q.type==='multi_choice'||(q.answer&&q.answer.length>1);
      if(!isMulti){chosen=[opt]}else{
        var k=chosen.indexOf(opt);if(k>=0)chosen.splice(k,1);else chosen.push(opt)
      }
      paint();
    }
  });

  function openNode(code){view='quiz';activeNode=code;qIndex=0;lastResult=null;chosen=[];paint()}

  // 关系图节点详情：原地展开，不跳页
  // 说的是"这个点现在什么情况、卡在哪、要练几道"，不是只报一个百分比
  function showMapNode(code){
    var box=document.getElementById('map-detail');
    if(!box||!snap.graph) return;    var g=snap.graph;
    var n=null;
    for(var i=0;i<g.nodes.length;i++){ if(g.nodes[i].code===code){n=g.nodes[i];break} }
    if(!n){box.innerHTML='<span class="dim">找不到这个节点。</span>';return}
    // 从树里补 questionCount 和**最新掌握度**
    // 注意：snap.graph.nodes[].mastery 是构建时算的，用户答完题后 applyRecords
    // 只更新了 snap.tree 里的 mastery，不会回头改 graph。所以要读树上的那份，
    // 否则点开图详情看到的永远是第一次打开时的状态。
    var cnt=0, latest=null;
    snap.tree.modules.forEach(function(m){m.concepts.forEach(function(c){if(c.code===code){cnt=c.questionCount||0;latest=c.mastery}})});
    var m=latest||n.mastery||{state:'unknown',score:null,samples:0};
    var weak=g.weakThreshold;
    var verdict;
    if(!n.hasQuestions) verdict='这个点<b>还没有题</b>，暂时练不了。';
    else if(m.score==null) verdict='还没做过（或做得不够 '+MIN_SAMPLES+' 道），判断不了水平。';
    else if(m.score<weak) verdict='<b style="color:#c2410c">这就是你卡住的地方</b>——正确率 '+Math.round(m.score*100)+'%。';
    else if(m.state==='mastered') verdict='这个点已经稳了（'+Math.round(m.score*100)+'%）。';
    else verdict='这个点在进步（'+Math.round(m.score*100)+'%），还没到最后一步。';
    // 先修：谁指向我
    var pre=[]; g.edges.forEach(function(e){ if(e.to===code) pre.push(e.from) });
    var preNames=pre.map(function(c){var q=null;g.nodes.forEach(function(x){if(x.code===c)q=x});return q?q.name:c});
    // ── 证据链（阶段3）──────────────────────────────────────
    // 掌握度这个数字不是凭空来的：展开就能看到它引用的每一次作答、被排除的题、以及公式参数。
    // 这就是"这个数是怎么来的"。
    var basis=m&&m.basis;
    var evidence='';
    if(basis){
      var att=(basis.attempts||[]);
      var ids=att.length?att.map(function(x){return '<code>'+esc(String(x))+'</code>'}).join('、'):'<span class="dim">（没有作答）</span>';
      var exc=(basis.excluded||[]);
      var excHtml=exc.length
        ? exc.map(function(e){return '<code>'+esc(String(e.id||e.questionId||''))+'</code> <span class="dim">'+esc(e.why||e.reason||'')+'</span>'}).join('<br>')
        : '<span class="dim">没有题被排除</span>';
      // 0 次作答时，下面那三行（排除项/公式/版本）读者不知道拿它干嘛——
      // 小白原话：「0 次的时候，下面那三行我不知道该拿它们干什么」（2026-11-05）。
      // 所以 0 次时先给一句结论，再说清下面三行是"等有作答了才开始起作用"的。
      var zeroNote=(att.length===0)
        ? '<div class="basis-zero">你还没做过，所以这个数<b>还算不出来</b>。下面几行是这把尺子的规格——等你做满 3 道，同一个框里就会列出用了哪几次作答。</div>'
        : '';
      evidence='<details class="basis"><summary>这个数是<b>怎么算出来的</b>（点开看依据）</summary>'
        +'<div class="basis-body">'
        +zeroNote
        +'<div class="basis-row"><span class="basis-k">算这个数用了哪几次作答</span><span class="basis-v">'
        +(att.length?att.length+' 次：'+ids:'0 次')+'</span></div>'
        +'<div class="basis-row"><span class="basis-k">被排除的题</span><span class="basis-v">'+excHtml+'</span></div>'
        +'<div class="basis-row"><span class="basis-k">公式参数</span><span class="basis-v"><code>'+esc(String(basis.formula||''))+'</code></span></div>'
        +'<div class="basis-row"><span class="basis-k">算法版本 / 算到什么时候</span><span class="basis-v"><code>'+esc(String(basis.projectionVersion||''))+'</code> · '+esc(String(basis.asOf||''))+'</span></div>'
        +'</div></details>';
    }
    // 起点框的理由：不能只说"从这里开始"，要说清为什么是它
    var isStart=snap.startNode&&snap.startNode.code===code;
    var startWhy=isStart
      ? '<br><span class="basis-why">为什么是这里：<b>它没有任何前置</b>，是最底层的地基；'+preNames.length+' 个前置之外，其他点都要先学会别的才能学。</span>'
      : '';
    box.innerHTML='<b>'+esc(n.name)+'</b>'
      +'　<span class="dim">'+esc(code)+' · '+(n.hasQuestions?cnt+' 道题':((snap.excluded&&Array.isArray(snap.excluded.nodes)&&snap.excluded.nodes.indexOf(code)>=0)?'本版不出题':'还没题'))+'</span><br>'
      +verdict
      +(preNames.length?'<br><span class="dim">要先会的：'+esc(preNames.join('、'))+'</span>':'<br><span class="dim">没有前置，可以直接开始</span>')
      +startWhy
      +evidence
      +(n.hasQuestions?'　<button class="btn-primary" style="margin-left:8px;padding:4px 12px;font-size:12px" data-act="study" data-node="'+esc(code)+'">去练这个</button>':'');
    // ── 点完要把结果带到用户眼前（2026-11-05 修）────────────────
    // 图有 1100px 高，用户看着图中间点节点时，详情块在视口下方约 280px，
    // 更新了但看不见 —— 用户的实际体验就是"点了没反应"。
    // 小白在系统浏览器里点了三次都说没变化，不是它点错了，是结果在屏幕外。
    // 只在详情块确实不在视口内时才滚，已经在视野里就不打扰。
    try{
      var vr=box.getBoundingClientRect();
      if(vr.top>=window.innerHeight||vr.bottom<=0){
        // 用瞬时滚动，不用 smooth：平滑滚动期间用户再点会被吞，
        // 实测"滚动后点击面板不更新"就是这么来的（2026-11-05）
        box.scrollIntoView({block:'center'});
      }
    }catch(e){}
  }
  function submit(code){
    var pool=snap.questions.filter(function(q){return q.nodes&&q.nodes.indexOf(code)>=0});
    var q=pool[qIndex];if(!q)return;
    if(!chosen.length){alert('还没选答案');return}
    var expected=(q.answer||'').toUpperCase().match(/[A-Z]/g)||[];
    expected=Array.from(new Set(expected)).sort();
    var given=chosen.slice().sort();
    var correct=given.length===expected.length&&given.every(function(x,i){return x===expected[i]});
    var note='';
    if(!correct){
      if(q.type==='multi_choice'){
        var miss=expected.filter(function(x){return given.indexOf(x)<0}),extra=given.filter(function(x){return expected.indexOf(x)<0});
        note=[miss.length?'漏选 '+miss.join(''):'',extra.length?'多选 '+extra.join(''):''].filter(Boolean).join('，');
      }else{note='正确选项为 '+expected.join('')}
    }
    lastResult={id:q.id,correct:correct,expected:expected,given:given,note:note};
    saveRecord(q, code, correct);
    paint();
  }

  // 作答记录持久化：只存判分结果（对/错 + 时间 + 节点），供掌握度计算用。
  // 不写学习事件、不写 AI 同学笔记，避免与判分链路混淆。
  function loadRecords(){
    try{
      var raw=localStorage.getItem('anylearn.records');
      var arr=raw?JSON.parse(raw):[];
      if(!Array.isArray(arr))return [];
      return arr.filter(function(r){return r&&typeof r.id==='string'&&r.node&&typeof r.correct==='boolean'});
    }catch(e){return []}
  }
  function saveRecord(q,code,correct){
    try{
      var arr=loadRecords();
      arr.push({id:q.id,node:code,correct:correct,at:new Date().toISOString()});
      if(arr.length>4000)arr=arr.slice(arr.length-4000);
      localStorage.setItem('anylearn.records',JSON.stringify(arr));
      applyRecords(arr);   // 立即重算掌握度与下一步，界面和存储保持同一份事实
    }catch(e){}
  }

  function applyOnboardState(){
    var ob=document.getElementById('onboard');
    if(!ob) return;
    var seen=false;
    try{seen=localStorage.getItem('anylearn.onboarded')==='1'}catch(e){}
    ob.style.display = seen ? 'none' : '';
  }

  var __paint = paint;
  paint = function(){ __paint(); applyOnboardState(); syncComingCount(); };

  // 启动：先把本地记录读回来重算，再渲染。顺序反了会闪一下 0 再跳数字。
  applyRecords(loadRecords());
  paint();
})();
`;

// 直接运行：产出 html
if (process.argv[1] && /render\.mjs$/.test(process.argv[1])) {
  const html = renderPage(process.argv[2] || 'mock');
  const out = new URL('./index.html', import.meta.url);
  writeFileSync(out, html, 'utf8');
  console.log(`已生成 ${out.pathname}  (${(html.length / 1024).toFixed(1)} KB)`);
}
