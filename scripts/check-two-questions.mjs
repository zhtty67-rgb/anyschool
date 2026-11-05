// 逐项查看两道关键题的「解析讲到哪几个选项」判定归属
//
// 用途（2026-11-05，Chief 要求）：
//   检查器改了「引号内容 vs 选项前缀」这层回退之后，不能只看警告数归零，
//   还要确认识别归属是对的：
//     · c0901-01 的 D 项，应该靠引文「电池容量不够」认出来（修 bug 成功）
//     · c0403-04 的 B 项（"0.5"，正确答案），不能被引文「0」误判成讲过（没引入新误报）
import { readFileSync } from 'node:fs';

const PACK = 'D:/jiaoyu/outputs/questions-authoring-v11.jsonl';

const stripPunct = (s) => String(s).replace(/[\s，。、；：！？,.;:!?「」『』“”"'‘’（）()【】\[\]…—－-]/g, '');
const quoted = (t) => {
  const out = [];
  const re = /[「『“"]([^」』”"]{2,40})[」』”"]/g;
  let m;
  while ((m = re.exec(String(t || '')))) out.push(m[1]);
  return out;
};

const rows = readFileSync(PACK, 'utf8').split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));

for (const id of ['c0901-01', 'c0403-04']) {
  const q = rows.find((x) => x.id === id);
  if (!q) { console.log(id + '：文件里没有'); continue; }
  console.log('=== ' + id + '  答案=' + q.answer + ' ===');
  const qs = quoted(q.explanation || '');
  console.log('解析里的引文：' + JSON.stringify(qs));
  for (let i = 0; i < q.options.length; i += 1) {
    const letter = String.fromCharCode(65 + i);
    const on = stripPunct(q.options[i]);
    const hit = qs.map(stripPunct).find((qn) => {
      if (qn.length < 3 && !/^\d/.test(qn)) return false;
      if (!on.startsWith(qn)) return false;
      const rival = q.options.some((_, j) => {
        if (j === i) return false;
        const oj = stripPunct(q.options[j]);
        return oj.startsWith(qn) && oj.length < on.length;
      });
      return !rival;
    });
    console.log('  选项' + letter + '「' + q.options[i] + '」  ' + (hit ? '✅ 靠引文「' + hit + '」认出来' : '— 引文没命中'));
  }
  console.log('');
}
