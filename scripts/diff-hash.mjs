import { readFileSync } from 'node:fs';
import { stemHash as hCollision } from './check-id-collision.mjs';
import { stemHash as hMerge } from './merge-guessable.mjs';
import { stemHash as hPick } from './pick-by-hash.mjs';

const stem = '训练一个扫地机器人：每走一步扣 0.1 分，每清完一个房间加 5 分，电池耗尽则本局结束。它学了一段时间后，总是绕开最大的那个房间不去。最可能的原因是：';
console.log('题干:', stem.slice(0, 40), '…');
console.log('check-id-collision :', hCollision(stem));
console.log('merge-guessable    :', hMerge(stem));
console.log('pick-by-hash       :', hPick(stem));

// 直接看标注文件里存的 hash 是什么
const labels = readFileSync('data\\questions-m09-m11-threeway-v1.jsonl', 'utf8')
  .split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
const q = labels.find((x) => x.id === 'c0901-01');
console.log('\n标注文件 c0901-01 里存的 stem_hash:', q.stem_hash);
console.log('标注文件里的 stem 前40:', String(q.stem).slice(0, 40));
console.log('这几个哈希它们自己算一遍：');
console.log('  对标注里的 stem 用 collision 算:', hCollision(q.stem));
console.log('  对标注里的 stem 用 merge 算    :', hMerge(q.stem));
