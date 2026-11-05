// 验证「合并一批后折叠区数字会自动变」——改快照里一个节点的 questionCount，重新渲染，再看数字
import { readFileSync, writeFileSync } from 'node:fs';

const P = 'data';
const orig = readFileSync(P, 'utf8');
const before = (orig.match(/还有 (\d+) 个知识点/) || [])[1];
console.log('篡改前折叠区显示:', before);

// 找一个有题节点的 questionCount:12，清零
const idx = orig.indexOf('"questionCount":12');
if (idx < 0) { console.log('未找到 questionCount:12'); process.exit(1); }
const patched = orig.slice(0, idx) + '"questionCount":0' + orig.slice(idx + '"questionCount":12'.length);
writeFileSync(P, patched, 'utf8');
console.log('已把一个 questionCount:12 清零，等待核对脚本');
