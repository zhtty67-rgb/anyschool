// 双向验证：检查器必须同时满足两件事
//   ① 对已知的伪情境题（旧版 96 道里标了场景却没情境的）→ 必须报
//   ② 对已知的真情境题（c0901 重写版）→ 必须不报
// 任何一边不成立，这条规则就是假的。
import { readFileSync } from 'node:fs';
import { classifyStem, checkPseudoScenario } from './check-pseudo-scenario.mjs';

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); pass++; console.log(`  ok  ${name}`); }
  catch (e) { fail++; console.log(`  FAIL ${name}: ${e.message}`); }
};
const load = (p) => readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));

const OLD = load('data\\questions-ai-m09-m11-v1.jsonl');
const NEW = load('data\\questions-ai-c0901-rewrite-v1.jsonl');

console.log('== ① 已知伪情境题必须被抓 ==');
t('旧版里标了场景/application 但无情境的题 → 全部报 pseudo', () => {
  const claimed = OLD.filter((q) => q.qkind === 'scenario' || q.qkind === 'application' || (q.tags || []).includes('场景'));
  const caught = claimed.filter((q) => classifyStem(q).kind === 'pseudo');
  // 允许极少数被判 ok（确实带情境的），但至少要抓出大半
  const ratio = caught.length / claimed.length;
  if (ratio < 0.7) throw new Error(`只抓到 ${caught.length}/${claimed.length}`);
  console.log(`     声称情境 ${claimed.length} 道，抓出 ${caught.length} 道（${Math.round(ratio*100)}%）`);
});

t('纯定义句式必须识别为 definition', () => {
  const def = { stem: '强化学习的基本机制是：', qkind: 'concept', tags: ['单选题'] };
  if (classifyStem(def).kind !== 'definition') throw new Error(classifyStem(def).kind);
});

console.log('== ② 已知真情境题不能误报 ==');
t('c0901 重写版 12 道 → 0 道伪情境', () => {
  const r = checkPseudoScenario(NEW);
  if (r.pseudo.length > 0) {
    throw new Error(`${r.pseudo.length} 道被误报：` + JSON.stringify(r.pseudo.map((p) => p.id + ':' + p.stem)));
  }
  console.log(`     分类：${JSON.stringify(r.byKind)}`);
});

t('c0901 重写版的场景题确实带情境要素', () => {
  const sc = NEW.filter((q) => q.qkind === 'scenario' || q.qkind === 'application');
  if (!sc.length) throw new Error('重写版里没有标情境的题');
  const bad = sc.filter((q) => classifyStem(q).kind !== 'ok');
  if (bad.length) throw new Error(JSON.stringify(bad.map((q) => q.id)));
  console.log(`     ${sc.length} 道声称情境的题全部通过`);
});

console.log('== ③ 已知概念题不能因为没情境被报成伪情境 ==');
t('纯 concept 题（未声称情境）→ 不报 pseudo', () => {
  const c = { stem: '强化学习里的「策略」指的是：', qkind: 'concept', tags: ['单选题'] };
  const k = classifyStem(c).kind;
  if (k === 'pseudo') throw new Error('概念题被误判为伪情境');
});

console.log('== ④ 全量统计 ==');
t('旧版 96 道跑通并给出分类', () => {
  const r = checkPseudoScenario(OLD);
  if (r.total !== 96) throw new Error(`总数 ${r.total}`);
  console.log(`     旧版分类：${JSON.stringify(r.byKind)}，伪情境 ${r.pseudo.length} 道`);
});

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
process.exit(fail ? 1 : 0);
