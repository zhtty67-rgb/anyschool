// 汇总 m04/m05 的"不学也能猜"结果，与题干对照自检
import { readFileSync } from 'node:fs';
import { M45_LOOKUP } from './m45-lookup-result.mjs';

const qs = readFileSync('data\\questions-authoring-v10.jsonl', 'utf8')
  .split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
const m45 = qs.filter((q) => (q.nodes || []).some((n) => /^c0[45]/.test(n)));

const NODE_NAMES = {
  c0401: '感知机', c0402: '多层感知机 MLP', c0403: '激活函数', c0404: '损失函数', c0405: '反向传播',
  c0501: '深度学习定义', c0502: 'CNN 卷积网络', c0503: 'RNN 与 LSTM', c0504: 'Dropout 正则化', c0505: '批归一化',
};

let total = 0, guessable = 0;
const rows = [];
for (const [node, list] of Object.entries(M45_LOOKUP)) {
  const all = m45.filter((q) => q.nodes.includes(node));
  const g = all.filter((q) => list.includes(q.id));
  total += all.length; guessable += g.length;
  rows.push({ node, name: NODE_NAMES[node] || '', n: all.length, g: g.length, pct: Math.round((g.length / all.length) * 100), ids: list });
}

console.log('节点 | 名称 | 总题 | 不学可猜 | 占比');
console.log('---'.padEnd(4));
rows.forEach((r) => console.log(`${r.node} | ${r.name} | ${r.n} | ${r.g} | ${r.pct}%`));
console.log(`\n合计：${total} 道，不学可猜 ${guessable} 道，占 ${Math.round((guessable / total) * 100)}%`);

// 自检：确保每个被标记的题号真实存在且属于该节点
console.log('\n=== 自检 ===');
let bad = 0;
for (const [node, list] of Object.entries(M45_LOOKUP)) {
  for (const id of list) {
    const q = m45.find((x) => x.id === id);
    if (!q) { console.log(`  ✗ ${id} 不存在`); bad++; continue; }
    if (!q.nodes.includes(node)) { console.log(`  ✗ ${id} 不属于 ${node}`); bad++; }
  }
}
console.log(bad ? `${bad} 处错误` : '  全部题号有效且归属正确');

// 反向自检：判断被标为"可猜"的题，是否真的大部分是定义句式
const DEF = /(指的是|作用是|描述的是|基本结构|基本工作方式|核心作用|核心思想|基本机制|主要作用|属于哪一类|主要目的是|的基本操作是)/;
const hitDef = rows.flatMap((r) => r.ids).filter((id) => { const q = m45.find((x) => x.id === id); return q && DEF.test(q.stem); });
console.log(`\n被标"可猜"的 ${guessable} 道里，题干是显式定义句式的 ${hitDef.length} 道（${Math.round((hitDef.length / guessable) * 100)}%）`);
console.log('其余是判断题式的"某说法对不对"——这类同样是背了定义就能答，不需要理解。');
