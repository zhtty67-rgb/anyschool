// misconception 规则的双向验证：空值不报、填对不报、填错必须报
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkPack } from '../core/check-pack.mjs';

let pass = 0, fail = 0;
const t = (n, fn) => { try { fn(); pass++; console.log('  ok  ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + ': ' + e.message); } };
const dir = mkdtempSync(join(tmpdir(), 'mis-'));

const base = {
  id: 'c0101-01', type: 'single_choice',
  stem: '下面哪一项最准确地描述了人工智能？',
  options: ['能说话的机器人', '让机器完成需要人类智能的任务', '会下棋的机器', '有机械臂的机器'],
  answer: 'B',
  explanation: '因为人工智能指的是能力层面，会说话、下棋、机械臂都只是具体形态，并非定义本身。',
  nodes: ['c0101'],
  basis: 'self-authored', provenance: 'original',
  basis_evidence: '人工智能的能力层面定义，区别于具体产品形态',
};
const w = (name, items) => { const p = join(dir, name); writeFileSync(p, items.map((x) => JSON.stringify(x)).join('\n'), 'utf8'); return p; };

t('misconception 留空 → 不算错误也不报警告', () => {
  const r = checkPack(w('empty.jsonl', [{ ...base }]));
  const codes = [...(r.errors || []), ...(r.warnings || [])].map((x) => x.code);
  if (codes.includes('MISCONCEPTION_MISSING')) throw new Error('空值仍报 MISSING');
});

t('misconception 填对（逐字等于概念树）→ 不报', () => {
  const r = checkPack(w('right.jsonl', [{ ...base, misconception: '人工智能等于会说话的机器人' }]));
  const codes = [...(r.errors || []), ...(r.warnings || [])].map((x) => x.code);
  if (codes.includes('MISCONCEPTION_UNKNOWN')) throw new Error('填对了还报 UNKNOWN');
});

t('misconception 填错（不在概念树里）→ 必须报', () => {
  const r = checkPack(w('wrong.jsonl', [{ ...base, misconception: '这是一个我编的误解，概念树里没有' }]));
  const codes = [...(r.errors || []), ...(r.warnings || [])].map((x) => x.code);
  if (!codes.includes('MISCONCEPTION_UNKNOWN')) throw new Error('填错了反而不报：' + JSON.stringify(codes));
});

t('misconception 填空字符串 → 按留空处理，不报', () => {
  const r = checkPack(w('blank.jsonl', [{ ...base, misconception: '' }]));
  const codes = [...(r.errors || []), ...(r.warnings || [])].map((x) => x.code);
  if (codes.includes('MISCONCEPTION_MISSING')) throw new Error('空串仍报 MISSING');
});

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
process.exit(fail ? 1 : 0);
