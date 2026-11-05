// 第 5 条验证：发布版由 published.json 决定，不由文件名排序决定
//
// 验证标准（Chief 定的）：
//   1. 不传任何参数时，加载到的必须是 published.json 里写的那一版
//   2. 故意把 published.json 改成 v9，确认跟着变成 322 道
//   3. 改回 v8，确认恢复 262 道
//   4. latestQbook() 仍能显式调用，但不再是默认

import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { loadQuestions, latestQbook, readPublished, defaultQbook, PUBLISHED_MANIFEST } from '../core/qbook.mjs';

let pass = 0;
let fail = 0;
function t(name, fn) {
  try { fn(); pass += 1; console.log(`  ok  ${name}`); }
  catch (e) { fail += 1; console.log(`  FAIL ${name}: ${e.message}`); }
}

const original = readFileSync(PUBLISHED_MANIFEST, 'utf8');
const pub = readPublished();
console.log('当前 published.json：', pub.version, '→', pub.file);
console.log('文件路径：', PUBLISHED_MANIFEST, '\n');

try {
  console.log('== 1. 不传参时读的是发布版 ==');
  t('loadQuestions() 不传参 → 读 published.json 指定的文件', () => {
    const r = loadQuestions();
    assert.equal(r.path, pub.path, `实际读了 ${r.path}`);
  });
  t('不传参时题量等于 published.json 声明的题量', () => {
    const r = loadQuestions();
    assert.equal(r.total, pub.questions, `实际 ${r.total} 道，声明 ${pub.questions} 道`);
  });
  t('defaultQbook() 返回的就是 published.json 的 path', () => {
    assert.equal(defaultQbook(), pub.path);
  });

  console.log('\n== 2. 把 published.json 改成 v9，看是否跟着变 ==');
  const v9 = JSON.parse(original);
  v9.version = 'v9';
  v9.file = 'questions-authoring-v9.jsonl';
  v9.path = 'data\\questions-authoring-v9.jsonl';
  v9.questions = 322;
  writeFileSync(PUBLISHED_MANIFEST, JSON.stringify(v9, null, 2), 'utf8');

  t('改锁定文件后立刻生效：加载到 v9', () => {
    const r = loadQuestions();
    assert.equal(r.path, v9.path, `实际读了 ${r.path}`);
    assert.equal(r.total, 322, `实际 ${r.total} 道`);
  });
  t('此时 latestQbook() 仍指向 v9（两者碰巧一致，但机制不同）', () => {
    const latest = latestQbook();
    assert.equal(latest.version, 9);
  });

  console.log('\n== 3. 改回 v8，确认恢复 ==');
  writeFileSync(PUBLISHED_MANIFEST, original, 'utf8');
  t('恢复后加载回 v8 的 262 道', () => {
    const r = loadQuestions();
    assert.equal(r.path, pub.path);
    assert.equal(r.total, 262);
  });

  console.log('\n== 4. latestQbook 降为显式调用，不再是默认 ==');
  t('默认不依赖 latestQbook：即使目录里最新是 v9，默认仍是 v8', () => {
    const latest = latestQbook();
    const def = defaultQbook();
    assert.equal(latest.version, 9, '目录里最新应该是 v9');
    assert.ok(!def.endsWith('v9.jsonl'), `默认路径却指向了 ${def}`);
    assert.ok(def.endsWith('v8.jsonl'), `默认路径应是 v8，实际 ${def}`);
  });
  t('DEFAULT_QBOOK 常量已彻底删除', async () => {
    const mod = await import('../core/qbook.mjs');
    assert.equal(mod.DEFAULT_QBOOK, undefined, 'DEFAULT_QBOOK 仍然存在');
  });

} finally {
  // 无论如何恢复原文件
  writeFileSync(PUBLISHED_MANIFEST, original, 'utf8');
}

// 收尾确认
const after = readPublished();
console.log(`\n收尾：published.json 已恢复为 ${after.version} → ${after.file}`);
console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
if (fail) process.exitCode = 1;
