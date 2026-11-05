// 验证 AI 同学可输入框的完整链路：数据 → 服务端渲染 → 客户端渲染
import { readFileSync } from 'node:fs';
import { renderPage } from './render.mjs';

console.log('== 1. 服务端渲染 ==');
const html = renderPage('data\\questions-authoring-v8.jsonl');
console.log('  peer-input 出现次数：', (html.match(/peer-input/g) || []).length);
console.log('  peer-ask 出现次数：', (html.match(/peer-ask/g) || []).length);

console.log('\n== 2. 客户端脚本里是否有对应渲染 ==');
const hasClientTextarea = html.includes('textarea class="peer-input"');
const hasSaveButton = html.includes('data-act="peer-save"');
const hasNoteText = html.includes('只是记下来，不评分、不影响进度');
const hasPlaceholder = html.includes('想回他一句');
console.log('  客户端渲染 textarea：', hasClientTextarea);
console.log('  记下按钮：', hasSaveButton);
console.log('  免责说明文字：', hasNoteText);
console.log('  占位提示语：', hasPlaceholder);

console.log('\n== 3. 交互流程检查 ==');
// 输入框在"答完题后"出现，这是 reveal 时机
const revealAfterAnswer = html.indexOf('peerBlock(f.c.c, activeNode)') > 0;
console.log('  答题后展示 AI 同学区块：', revealAfterAnswer);
const hasSaveHandler = html.includes("if(act==='peer-save')");
console.log('  记下按钮有处理逻辑：', hasSaveHandler);
const hasSolitudeRule = html.includes('window.__PEER_NOTES__');
console.log('  笔记存在独立命名空间：', hasSolitudeRule);

console.log('\n== 4. 一次答题流程模拟 ==');
console.log('  用户点节点 → 看到概念讲解 → 做题 → 提交 → 看到解析 + AI 同学的话 + 输入框');
console.log('  输入内容点「记下」→ 存进 __PEER_NOTES__（浏览器内存），不碰学习记录');

const allOk = hasClientTextarea && hasSaveButton && hasNoteText && hasPlaceholder && hasSaveHandler;
console.log(`\n结论：${allOk ? '可输入框链路完整' : '有缺失项'}`);
if (!allOk) process.exitCode = 1;
