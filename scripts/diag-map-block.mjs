// 看 map-wrap 那一段的完整内容，找让它被解析器丢弃的原因
import { readFileSync } from 'node:fs';

const html = readFileSync('D:/jiaoyu/work/edu/dist/index.html', 'utf8');
const start = html.indexOf('<section class="map-wrap"');
if (start < 0) { console.log('找不到 map-wrap'); process.exit(1); }
const end = html.indexOf('</section>', start);
console.log('map-wrap 起止: ' + start + ' ~ ' + end + '，长度 ' + (end - start));

const block = html.slice(start, end + 10);
console.log('\n=== 前 400 字符 ===');
console.log(block.slice(0, 400));
console.log('\n=== 后 300 字符 ===');
console.log(block.slice(-300));

// 检查是否有会打断 HTML 的东西
const checks = {
  '未转义的 </script>': /<\/script>/i.test(block),
  '未转义 <script': /<script/i.test(block),
  '未转义 & 后跟非法实体': /&(?![a-zA-Z]+;|#\d+;|#x[0-9a-fA-F]+;)/.test(block),
  'CDATA': /<!\[CDATA\[/.test(block),
  '注释未闭合': (block.match(/<!--/g) || []).length !== (block.match(/-->/g) || []).length,
  '自闭合 div/section（HTML 不认）': /<(div|section)[^>]*\/>/.test(block),
  'svg 未闭合': (block.match(/<svg\b/g) || []).length !== (block.match(/<\/svg>/g) || []).length,
  'text 里含 < 或 >': /<text[^>]*>[^<]*[<>][^<]*<\/text>/.test(block),
};
console.log('\n=== 危险字符检查 ===');
for (const [k, v] of Object.entries(checks)) console.log((v ? '⚠ ' : '✔ ') + k + ': ' + v);

// 找第一个会被解析器吃掉的异常点：对比标签平衡
const tagRe = /<\/?([a-zA-Z][\w:-]*)[^>]*>/g;
let m, depth = 0, firstBadAt = -1;
const stack = [];
while ((m = tagRe.exec(block))) {
  const full = m[0], name = m[1].toLowerCase();
  const selfClose = /\/>$/.test(full) || ['path', 'rect', 'circle', 'line', 'marker', 'br', 'img', 'input', 'meta', 'link'].includes(name);
  if (full.startsWith('</')) {
    const top = stack.pop();
    if (top !== name) { if (firstBadAt < 0) firstBadAt = m.index; }
  } else if (!selfClose) {
    stack.push(name);
  }
}
console.log('\n未闭合标签栈（从内到外）: ' + (stack.length ? stack.slice(-8).join(' < ') : '（空，全部闭合）'));
if (firstBadAt >= 0) console.log('第一个不匹配位置: ' + firstBadAt + '，附近: ' + block.slice(Math.max(0, firstBadAt - 80), firstBadAt + 80));
