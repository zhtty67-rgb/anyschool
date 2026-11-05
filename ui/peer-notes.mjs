// AI 同学对话记录 —— 独立存储，和判分链路物理隔离
//
// 硬约束（Chief 定的底线）：
//   1. 记录只写这个文件，不进入 records（学习事件）
//   2. 不参与掌握度计算，不影响 pickNext 排序
//   3. 本模块不 import grade / mastery / qbook
//
// 怎么做到"物理隔离"：
//   - 只依赖 node:fs 和 node:path，不引入任何判分相关模块
//   - 导出只有 append / readAll / count，没有"算分""改分"这类入口
//   - 文件路径默认落在 .user-notes/ 下，和题库、学习记录不在同一目录

import { appendFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const NOTES_DIR = join(HERE, '..', '.user-notes');
export const NOTES_FILE = join(NOTES_DIR, 'peer-notes.jsonl');

const MAX_LEN = 1000;

/**
 * 记一条用户对 AI 同学说的话。
 * 只记录，不判断对错，不返回任何评分信息。
 *
 * @param {{conceptCode:string, conceptName?:string, peerQuote:string, userText:string}} input
 * @returns {{ok:boolean, reason?:string}}
 */
export function append(input) {
  const text = String(input?.userText ?? '').trim();
  if (!text) return { ok: false, reason: '空的，没记' };
  if (text.length > MAX_LEN) return { ok: false, reason: `太长了（${text.length} 字，上限 ${MAX_LEN}）` };

  const record = {
    at: new Date().toISOString(),
    conceptCode: input.conceptCode || null,
    conceptName: input.conceptName || null,
    peerQuote: input.peerQuote || null,
    userText: text,
  };

  try {
    mkdirSync(NOTES_DIR, { recursive: true });
    appendFileSync(NOTES_FILE, JSON.stringify(record) + '\n', 'utf8');
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: `写入失败：${e.message}` };
  }
}

/** 读出所有记录（只有人看，程序不据此做事） */
export function readAll() {
  if (!existsSync(NOTES_FILE)) return [];
  return readFileSync(NOTES_FILE, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    })
    .filter(Boolean);
}

/** 某个概念下记了几条 */
export function count(conceptCode) {
  return readAll().filter((r) => r.conceptCode === conceptCode).length;
}
