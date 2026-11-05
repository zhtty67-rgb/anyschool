// mock 数据生成 —— 只用于 UI 外壳开发，不进入题库。
// 每题带 mock:true 标记，接入真实题库时整体替换。

import { parseTree } from '../core/tree.mjs';

/** 生成带节点的假题：每个概念节点若干道，内容明确标注为 mock */
export function buildMock(seed = 1) {
  const tree = parseTree();
  const questions = [];
  let n = 0;
  const variants = [
    { type: 'single_choice', options: ['选项 A', '选项 B', '选项 C', '选项 D'], answer: 'B' },
    { type: 'single_choice', options: ['选项 A', '选项 B', '选项 C', '选项 D'], answer: 'C' },
    { type: 'judge', options: ['正确 √', '错误 ×'], answer: 'A' },
    { type: 'multi_choice', options: ['选项 A','选项 B','选项 C','选项 D','选项 E'], answer: 'ACD' },
  ];
  for (const c of tree.concepts) {
    const count = 6 + (n % 4); // 6-9 道
    for (let i = 0; i < count; i += 1) {
      const v = variants[(n + i) % variants.length];
      questions.push({
        id: `mock-${c.code}-${String(i + 1).padStart(2, '0')}`,
        type: v.type,
        stem: `【mock】关于「${c.name}」，下列说法正确的是？`,
        options: v.options,
        answer: v.answer,
        explanation: `【mock 解析】${c.def || c.name}`,
        tags: ['mock'],
        difficulty: 1 + ((n + i) % 5),
        nodes: [c.code],
        mock: true,
      });
    }
    n += 1;
  }
  return { tree, questions };
}

/** 生成一批作答记录，让初始界面能看到不同掌握度状态 */
export function buildMockRecords(questions, seed = 7) {
  const records = [];
  const rnd = mulberry32(seed);
  const base = Date.parse('2026-10-20T09:00:00Z');
  for (const q of questions) {
    const node = q.nodes[0];
    // 每个节点给不同的历史长度，制造 unknown / learning / mastered / weak 四种状态
    const h = hash(node + q.id);
    const attempts = h % 7; // 0-6 次，0 次就是 unknown
    for (let i = 0; i < attempts; i += 1) {
      const r = rnd();
      const correct = r > 0.42;
      records.push({
        questionId: q.id,
        nodeCode: node,
        correct,
        at: new Date(base + (h % 400) * 3600e3 + i * 86400e3).toISOString(),
      });
    }
  }
  return records;
}

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function mulberry32(a) {
  return function next() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
