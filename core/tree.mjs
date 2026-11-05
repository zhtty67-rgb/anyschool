// 知识树解析 —— 读 concepts-ai.yaml，输出扁平概念清单。
// 只解析本项目约定的子集字段，不引入 YAML 依赖。

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

// 知识树默认放仓库内 data/；设 ANYSCHOOL_DATA_DIR 可指向外部目录
export const DEFAULT_TREE = process.env.ANYSCHOOL_DATA_DIR
  ? join(process.env.ANYSCHOOL_DATA_DIR, 'concepts-ai.yaml')
  : join(HERE, '..', 'data', 'concepts-ai.yaml');

/** 解析 concepts-ai.yaml 为 { meta, modules:[{code,name,concepts:[...]}] } */
export function parseTree(path = DEFAULT_TREE) {
  if (!existsSync(path)) throw new Error(`知识树不存在：${path}`);
  const lines = readFileSync(path, 'utf8').split(/\r?\n/);

  const meta = {};
  const modules = [];
  let curModule = null;
  let curConcept = null;
  let section = null; // 'meta' | 'modules'
  let listKey = null; // 'prereq' | 'misconceptions'

  const unquote = (s) => String(s).trim().replace(/^['"]|['"]$/g, '');

  for (const raw of lines) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    const indent = raw.length - raw.trimStart().length;
    const line = raw.trim();

    if (indent === 0) {
      section = line.startsWith('meta:') ? 'meta' : line.startsWith('modules:') ? 'modules' : null;
      listKey = null;
      continue;
    }

    if (section === 'meta') {
      const m = line.match(/^([A-Za-z_]+):\s*(.*)$/);
      if (m) meta[m[1]] = unquote(m[2]);
      continue;
    }

    if (section !== 'modules') continue;

    // 模块级
    if (indent === 2) {
      const m = line.match(/^-\s*code:\s*(.*)$/);
      if (m) {
        curModule = { code: unquote(m[1]), name: '', skeleton_ref: '', concepts: [] };
        modules.push(curModule);
        curConcept = null;
        listKey = null;
        continue;
      }
      const kv = line.match(/^([a-z_]+):\s*(.*)$/);
      if (kv && curModule) {
        curModule[kv[1]] = unquote(kv[2]);
        continue;
      }
      if (line.startsWith('concepts:')) continue;
    }

    // 模块级字段（name / skeleton_ref 等）：缩进 4，位于 "- code:" 之下
    // 曾漏掉这一层，导致 20 个模块名全为空、界面标题行只剩一个"—"
    if (indent === 4 && curModule && !curConcept) {
      const kv = line.match(/^([a-z_]+):\s*(.*)$/);
      if (kv && kv[1] !== 'concepts') {
        curModule[kv[1]] = unquote(kv[2]);
        continue;
      }
      if (line.startsWith('concepts:')) continue;
    }

    // 概念级
    if (indent === 6) {
      const m = line.match(/^-\s*code:\s*(.*)$/);
      if (m && curModule) {
        curConcept = { code: unquote(m[1]), name: '', def: '', misconceptions: [], prereq: [] };
        curModule.concepts.push(curConcept);
        listKey = null;
      }
      continue;
    }

    if (indent >= 8 && curConcept) {
      const kv = line.match(/^([a-z_]+):\s*(.*)$/);
      if (kv) {
        const [_, k, v] = kv;
        if (v === '') {
          listKey = k;
          continue;
        }
        listKey = null;
        if (k === 'prereq') {
          curConcept.prereq = parseInlineList(v);
        } else {
          curConcept[k] = unquote(v);
        }
        continue;
      }
      if (line.startsWith('- ') && listKey === 'misconceptions') {
        curConcept.misconceptions.push(unquote(line.slice(2)));
        continue;
      }
      if (line.startsWith('- ')) {
        continue;
      }
    }

    // 行内 prereq: [c0101] 形式已由 parseInlineList 处理；其余忽略
  }

  return normalizeTree({ meta, modules });
}

function parseInlineList(v) {
  const m = String(v).match(/\[(.*)\]/);
  if (!m) return [];
  return m[1].split(',').map((s) => s.trim()).filter(Boolean);
}

function normalizeTree(tree) {
  const concepts = [];
  for (const mod of tree.modules) {
    for (const c of mod.concepts) {
      concepts.push({ ...c, module: mod.code, moduleName: mod.name });
    }
  }
  return { ...tree, concepts, total: concepts.length };
}

/** 校验先修关系：是否存在指向不存在节点的 prereq（挂题前先跑这个） */
export function validatePrereq(tree) {
  const codes = new Set(tree.concepts.map((c) => c.code));
  const dangling = [];
  for (const c of tree.concepts) {
    for (const p of c.prereq) {
      if (!codes.has(p)) dangling.push({ from: c.code, missing: p });
    }
  }
  return { ok: dangling.length === 0, dangling };
}
