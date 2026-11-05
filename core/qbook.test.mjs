// nodesWithQuestions 测试 —— 纯 Node，无第三方依赖
// 跑法：node core/qbook.test.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nodesWithQuestions, questionsForNode, latestQbook, defaultQbook, loadQuestions, FALLBACK_QBOOK, readPublished } from './qbook.mjs';

let pass = 0;
let fail = 0;
const t = (name, fn) => {
  try {
    fn();
    pass += 1;
    console.log(`  ok  ${name}`);
  } catch (e) {
    fail += 1;
    console.log(`  FAIL ${name}\n       ${e.message}`);
    process.exitCode = 1;
  }
};

console.log('== nodesWithQuestions ==');

t('基本收集：去重并返回全部出现过的 nodeCode', () => {
  const qs = [
    { id: 'a', nodes: ['c0101'] },
    { id: 'b', nodes: ['c0101', 'c0102'] },
    { id: 'c', nodes: ['c0201'] },
  ];
  const s = nodesWithQuestions(qs);
  assert.ok(s instanceof Set);
  assert.equal(s.size, 3);
  assert.deepEqual([...s].sort(), ['c0101', 'c0102', 'c0201']);
});

t('一题多挂载：每个概念都算覆盖', () => {
  const s = nodesWithQuestions([{ nodes: ['c0301', 'c0302', 'c0303'] }]);
  assert.equal(s.size, 3);
});

t('空数组输入 → 空 Set', () => {
  const s = nodesWithQuestions([]);
  assert.ok(s instanceof Set);
  assert.equal(s.size, 0);
});

t('非数组输入 → 空 Set，不抛错', () => {
  for (const bad of [null, undefined, 42, 'abc', {}]) {
    const s = nodesWithQuestions(bad);
    assert.ok(s instanceof Set, `输入 ${String(bad)} 应返回 Set`);
    assert.equal(s.size, 0);
  }
});

t('nodes 缺失 / 非数组 / 为 null → 跳过，不抛错', () => {
  const qs = [
    { id: 'a' },
    { id: 'b', nodes: null },
    { id: 'c', nodes: 'c0101' },
    { id: 'd', nodes: 123 },
    { id: 'e', nodes: ['c0102'] },
  ];
  const s = nodesWithQuestions(qs);
  assert.deepEqual([...s], ['c0102']);
});

t('空串与纯空白 → 跳过', () => {
  const s = nodesWithQuestions([{ nodes: ['', '   ', 'c0101'] }]);
  assert.deepEqual([...s], ['c0101']);
});

t('非字符串元素 → 跳过', () => {
  const s = nodesWithQuestions([{ nodes: [null, 42, {}, 'c0101'] }]);
  assert.deepEqual([...s], ['c0101']);
});

t('数组内重复 → 只算一次', () => {
  const s = nodesWithQuestions([{ nodes: ['c0101', 'c0101', 'c0101'] }]);
  assert.equal(s.size, 1);
});

t('纯函数：不修改入参', () => {
  const qs = [{ nodes: ['c0101'] }];
  const snapshot = JSON.stringify(qs);
  nodesWithQuestions(qs);
  assert.equal(JSON.stringify(qs), snapshot);
});

t('纯函数：同样的输入两次调用结果相同', () => {
  const qs = [{ nodes: ['c0101', 'c0102'] }, { nodes: ['c0102'] }];
  assert.deepEqual([...nodesWithQuestions(qs)].sort(), [...nodesWithQuestions(qs)].sort());
});

t('与 questionsForNode 一致：有题的概念才在集合里', () => {
  const qs = [
    { id: 'a', nodes: ['c0101'] },
    { id: 'b', nodes: ['c0201'] },
  ];
  const s = nodesWithQuestions(qs);
  for (const code of s) {
    assert.ok(questionsForNode(qs, code).length > 0, `${code} 在集合里却取不到题`);
  }
  for (const code of ['c9999', 'c0301']) {
    assert.ok(!s.has(code), `${code} 不应在集合里`);
  }
});

t('覆盖率用法：能算出去重后概念数与给定总数之比', () => {
  const qs = [{ nodes: ['c0101'] }, { nodes: ['c0102'] }, { nodes: ['c0101'] }];
  const covered = nodesWithQuestions(qs).size;
  assert.equal(covered, 2);
  assert.ok(Math.abs(covered / 20 - 0.1) < 1e-9);
});

console.log('\n== latestQbook 版本自动发现 ==');

/** 建一个临时目录，批量放文件 */
function tmpBook(names) {
  const d = mkdtempSync(join(tmpdir(), 'qbook-'));
  for (const n of names) writeFileSync(join(d, n), '', 'utf8');
  return d;
}

t('取版本号最大的那个', () => {
  const d = tmpBook(['questions-authoring-v1.jsonl', 'questions-authoring-v8.jsonl', 'questions-authoring-v3.jsonl']);
  try {
    const r = latestQbook(d);
    assert.ok(r);
    assert.equal(r.version, 8);
    assert.ok(r.path.endsWith('questions-authoring-v8.jsonl'));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

t('两位数版本按数值比，不按字典序（v10 > v9）', () => {
  const d = tmpBook(['questions-authoring-v9.jsonl', 'questions-authoring-v10.jsonl', 'questions-authoring-v2.jsonl']);
  try {
    assert.equal(latestQbook(d).version, 10);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

t('忽略不符合命名规则的文件', () => {
  const d = tmpBook([
    'questions-authoring-v5.jsonl',
    'questions-authoring-v99.jsonl.bak',
    'questions-authoring-vabc.jsonl',
    'questions-ai-foundations-20261104.jsonl',
    'notes.txt',
    'questions-authoring-stage12-v1.jsonl',
  ]);
  try {
    assert.equal(latestQbook(d).version, 5);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

t('目录不存在 → null，不抛错', () => {
  const r = latestQbook(join(tmpdir(), 'qbook-does-not-exist-' + Date.now()));
  assert.equal(r, null);
});

t('目录里没有版本化题库 → null', () => {
  const d = tmpBook(['random.jsonl', 'a.txt']);
  try {
    assert.equal(latestQbook(d), null);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

t('空目录 → null', () => {
  const d = mkdtempSync(join(tmpdir(), 'qbook-'));
  try {
    assert.equal(latestQbook(d), null);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

console.log('\n== defaultQbook 默认路径 ==');

t('defaultQbook 指向 published.json 指定的发布版，不是目录里最新的', () => {
  // 行为已改：发布版由 published.json 决定，与文件名排序无关。
  // 目录里最新是 v9，但发布版是 v8——两者不该相等，这正是要防的误选。
  const latest = latestQbook();
  const pub = readPublished();
  assert.equal(defaultQbook(), pub.path, '默认应等于 published.json 的 path');
  assert.ok(pub.version, 'published.json 应有 version');
  if (latest && latest.version > Number(String(pub.version).replace(/^v/i, ''))) {
    assert.notEqual(defaultQbook(), latest.path, '默认不该跟着最新文件走');
  }
});

t('FALLBACK_QBOOK 仍是老备份路径（仅在无版本化题库时使用）', () => {
  assert.ok(FALLBACK_QBOOK.includes('questions-ai-foundations'));
});

console.log('\n== loadQuestions 默认走最新版 ==');

t('不传参时加载的是版本化题库，不是 1311 题的老题库', () => {
  const bak = process.env.EDU_QBOOK_PATH;
  delete process.env.EDU_QBOOK_PATH;
  try {
    const { path, total } = loadQuestions();
    assert.ok(/questions-authoring-v\d+\.jsonl$/.test(path), `应加载版本化题库，实际 ${path}`);
    assert.notEqual(total, 1311, '不应再默认加载 1311 题的老板题库');
    assert.ok(total > 0);
  } finally {
    if (bak !== undefined) process.env.EDU_QBOOK_PATH = bak;
  }
});

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);