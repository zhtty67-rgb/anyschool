// 查 关系图为什么在浏览器里不存在
// 现象：HTML 字符串里有 79 个 map-node，但浏览器 DOM 里 #map 不存在、map-node 计数为 0。
// 说明这段 HTML 被解析器吃掉了（多半是未闭合标签把 <section> 吞进了别的元素，或被当成文本）。
import { readFileSync } from 'node:fs';

const html = readFileSync('D:/jiaoyu/work/edu/dist/index.html', 'utf8');

const at = html.indexOf('id="map"');
console.log('id="map" 在 HTML 里的位置: ' + at);
if (at < 0) { console.log('HTML 里根本没有 id="map"'); process.exit(1); }

// 往回找 600 字符，看它前面是什么
const before = html.slice(Math.max(0, at - 700), at);
console.log('\n=== 前面 700 字符 ===');
console.log(before);

// 数一数前面的标签有没有闭合
const opens = (before.match(/<(section|div|main|details|svg|table|ul|ol)\b/gi) || []);
const closes = (before.match(/<\/(section|div|main|details|svg|table|ul|ol)>/gi) || []);
console.log('\n前面块级开标签: ' + opens.length + '，闭标签: ' + closes.length);

// 看 map-wrap 那一段附近有没有 <script> 开始（如果被写进 script 里就会被当文本）
const scriptBefore = html.lastIndexOf('<script', at);
const scriptClose = html.lastIndexOf('</script>', at);
console.log('最近一个 <script 在 ' + scriptBefore + '，最近一个 </script> 在 ' + scriptClose);
console.log('关系图是否落在 script 内部: ' + (scriptBefore > scriptClose));

// 看 <style> 是否闭合
const styleOpen = html.lastIndexOf('<style', at);
const styleClose = html.lastIndexOf('</style>', at);
console.log('关系图是否落在 style 内部: ' + (styleOpen > styleClose));
