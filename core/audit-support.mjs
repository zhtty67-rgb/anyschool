// 放宽支撑词表后，确认没把"真没讲道理"的题放过去
// 做法：找出所有"支撑词表判为通过、但实际论证很薄"的题，人工看几条
import { readFileSync } from 'node:fs';
import { parseAnswerKey } from '../core/grade.mjs';

const PACK = 'data\\questions-authoring-v8.jsonl';
const qs = readFileSync(PACK, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));

// 放宽后的支撑词（与 check-pack.mjs 保持一致的关键子集）
const SUPPORT = /(因为|由于|所以|因此|从而|导致|说明|不成立|不是|并非|反而|相反|但|除非|而|若|一旦|只有|才能|必须|只能|否则|意味着|等于|取决于|本质|前提|区别|相比|对应|例如|比如|典型|表现为|特征是|指的是|属于|越大|越小|越高|越低|越多|越少|改得|该|就|才|则|即|换|加|拆|装|来自|源于|负责|不负责|真正|消不掉|存在|变成|转而)/;

const judges = qs.filter((q) => q.type === 'judge');
console.log(`判断题 ${judges.length} 道\n`);

// 1) 被判"有支撑"的题里，看解析长度和是否讲了机制
const passed = judges.filter((q) => SUPPORT.test(q.explanation));
const thin = passed.filter((q) => String(q.explanation).length < 45);

console.log('== 被判有支撑的判断题 ==');
console.log(`  共 ${passed.length} 道，其中解析短于 45 字的 ${thin.length} 道\n`);

console.log('== 最短的 8 道（最可能是蒙混过关的）==');
const sorted = [...passed].sort((a, b) => String(a.explanation).length - String(b.explanation).length);
for (const q of sorted.slice(0, 8)) {
  const ans = parseAnswerKey(q.answer)[0];
  console.log(`\n  ── ${q.id}（${String(q.explanation).length} 字，答案 ${ans}）──`);
  console.log(`  题干：${q.stem}`);
  console.log(`  解析：${q.explanation}`);
}

// 2) 反向检查：没被判有支撑的那几道，确认是真没讲道理还是漏判
const failed = judges.filter((q) => !SUPPORT.test(q.explanation));
console.log(`\n\n== 被判"没支撑"的判断题：${failed.length} 道 ==`);
for (const q of failed) {
  console.log(`\n  ── ${q.id} ──`);
  console.log(`  题干：${q.stem}`);
  console.log(`  解析：${q.explanation}`);
}

// 3) 结论
console.log('\n\n== 结论 ==');
console.log(`  放松后放过 ${passed.length} 道，拦下 ${failed.length} 道`);
console.log(`  需人工复核的薄解析（<45 字）：${thin.length} 道`);
