#!/usr/bin/env node
'use strict';

/**
 * D1 数据库管理工具 (Cloudflare D1)
 *
 * 零外部依赖，通过 npx wrangler d1 execute 操作 D1 数据库。
 * 支持内联 SQL、文件 SQL、快捷命令、JSON 输出。
 *
 * 用法:
 *   node scripts/sql.js "SELECT * FROM user;"
 *   node scripts/sql.js --file path/to/query.sql
 *   node scripts/sql.js --json "SELECT * FROM user;"
 *   node scripts/sql.js .tables
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ── 路径工具 ──────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

// ── 常量 ──────────────────────────────────────────────────
const D1_DATABASE = 'umami-db';
const EXIT_SUCCESS = 0;
const EXIT_ERROR = 1;

// ── 写保护 ────────────────────────────────────────────────
let ALLOW_WRITE = false;
let WRITE_WARNING_SHOWN = false;

// ── SQL 写入检测 ──────────────────────────────────────────

/**
 * 检测 SQL 是否包含写入操作
 * @param {string} sql - 要检测的 SQL
 * @returns {{ isWrite: boolean, matched: string|null, statements: string[] }}
 */
function isWriteSQL(sql) {
  const WRITE_KEYWORDS = [
    'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER',
    'TRUNCATE', 'REPLACE', 'VACUUM', 'ATTACH', 'DETACH',
    'REINDEX', 'ANALYZE', 'EXECUTE', 'IMPORT', 'EXPORT',
  ];

  // 1. 移除 SQL 注释（-- 行注释 和 /* 块注释 */）
  let cleaned = sql.replace(/\/\*[\s\S]*?\*\//g, '');
  cleaned = cleaned.replace(/--.*$/gm, '');

  // 2. 按分号拆分为多条语句
  const statements = cleaned.split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  if (statements.length === 0) {
    return { isWrite: false, matched: null, statements: [] };
  }

  for (const stmt of statements) {
    // 3. 提取第一个非空 token
    const tokens = stmt.split(/\s+/);
    const firstToken = tokens[0]?.toUpperCase();
    if (!firstToken) continue;

    // 4. 检查是否为写入指令
    if (WRITE_KEYWORDS.includes(firstToken)) {
      return { isWrite: true, matched: firstToken, statements };
    }

    // 5. 处理 WITH 子句
    if (firstToken === 'WITH') {
      const mainKeyword = getMainKeywordAfterCTE(stmt);
      if (mainKeyword && WRITE_KEYWORDS.includes(mainKeyword)) {
        return { isWrite: true, matched: mainKeyword, statements };
      }
    }
  }

  return { isWrite: false, matched: null, statements };
}

/**
 * 解析 WITH 子句后的主关键字
 * @param {string} stmt - 以 WITH 开头的 SQL 语句
 * @returns {string|null} 主关键字（如 SELECT, DELETE 等）
 */
function getMainKeywordAfterCTE(stmt) {
  const WRITE_KEYWORDS = [
    'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER',
    'TRUNCATE', 'REPLACE', 'VACUUM', 'ATTACH', 'DETACH',
    'REINDEX', 'ANALYZE', 'EXECUTE', 'IMPORT', 'EXPORT',
  ];
  const ALL_KEYWORDS = new Set([
    ...WRITE_KEYWORDS,
    'SELECT', 'WITH', 'PRAGMA', 'EXPLAIN',
  ]);

  // 确认以 WITH 开头
  if (!/^WITH\b/i.test(stmt)) return null;
  let s = stmt.trim().replace(/^WITH\s+/i, '');

  let i = 0;

  while (i < s.length) {
    // 跳过空白
    while (i < s.length && /\s/.test(s[i])) i++;
    if (i >= s.length) break;

    // 跳过逗号（间隔多个 CTE）
    if (s[i] === ',') { i++; continue; }

    // 读取下一个单词（CTE 名称或主关键字）
    const wordStart = i;
    while (i < s.length && /[A-Za-z_0-9]/.test(s[i])) i++;
    if (wordStart === i) { i++; continue; }

    const word = s.slice(wordStart, i).toUpperCase();

    // 如果是已知关键字（SELECT / INSERT / DELETE 等），直接返回
    if (ALL_KEYWORDS.has(word)) {
      return word;
    }

    // 否则是 CTE 名称，跳过可选的列名 (col1, col2)
    while (i < s.length && /\s/.test(s[i])) i++;
    if (i < s.length && s[i] === '(') {
      i = skipBalancedParens(s, i);
    }

    // 跳过空白，期望 AS
    while (i < s.length && /\s/.test(s[i])) i++;
    if (i + 1 < s.length && s.slice(i, i + 2).toUpperCase() === 'AS') {
      i += 2;
    } else {
      break;
    }

    // 跳过空白，期望 ( 子查询
    while (i < s.length && /\s/.test(s[i])) i++;
    if (i < s.length && s[i] === '(') {
      i = skipBalancedParens(s, i);
    } else {
      break;
    }
  }

  return null;
}

/**
 * 跳过平衡的括号内容，返回结束位置
 * @param {string} str - 源字符串
 * @param {number} start - 开始位置（必须是 '('）
 * @returns {number} 匹配的 ')' 之后的位置
 */
function skipBalancedParens(str, start) {
  if (start >= str.length || str[start] !== '(') return start;
  let depth = 1;
  let i = start + 1;
  while (i < str.length && depth > 0) {
    if (str[i] === '(') depth++;
    else if (str[i] === ')') depth--;
    i++;
  }
  return i;
}

// ── 参数解析 ──────────────────────────────────────────────

/**
 * 解析命令行参数
 * @returns {{ sql: string|null, filePath: string|null, isRepl: boolean, isJson: boolean, shortcut: string|null, allowWrite: boolean }}
 */
function parseArgs() {
  const args = process.argv.slice(2);
  let sql = null;
  let filePath = null;
  let isRepl = false;
  let isJson = false;
  let shortcut = null;
  let allowWrite = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--file') {
      filePath = args[++i];
      if (!filePath) {
        console.error('错误：--file 后需要指定文件路径');
        process.exit(EXIT_ERROR);
      }
    } else if (arg === '--json') {
      isJson = true;
    } else if (arg === '--dangerously-allow-writes') {
      allowWrite = true;
    } else if (arg.startsWith('.')) {
      // 快捷命令：.tables, .schema xxx, .indexes xxx, .help
      shortcut = arg;
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('-') && !nextArg.startsWith('.')) {
        shortcut += ' ' + nextArg;
        i++;
      }
    } else {
      sql = arg;
    }
  }

  // 无参数时打印用法
  if (!sql && !filePath && !shortcut && !isRepl) {
    printHelp();
    process.exit(EXIT_SUCCESS);
  }

  return { sql, filePath, isRepl, isJson, shortcut, allowWrite };
}

// ── SQL 执行 ──────────────────────────────────────────────

/**
 * 通过 npx wrangler d1 execute 执行 SQL
 * 使用 --command 参数传递 SQL，JSON.stringify 确保引号正确转义
 * @param {string} sql - 要执行的 SQL 语句
 * @returns {Array} wrangler 返回的解析后 JSON 数组
 */
function executeSQL(sql) {
  const trimmed = sql.trim();

  if (!trimmed) {
    return [];
  }

  // ── 写保护检查 ──────────────────────────────────────────
  const writeCheck = isWriteSQL(trimmed);
  if (!ALLOW_WRITE && writeCheck.isWrite) {
    const { matched, statements } = writeCheck;
    // 找出被阻止的语句
    let blockedStmt = statements.find(s => {
      const cleaned = s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '').trim();
      const firstToken = cleaned.split(/\s+/)[0]?.toUpperCase();
      return firstToken === matched ||
        (firstToken === 'WITH' && getMainKeywordAfterCTE(cleaned) === matched);
    });
    if (!blockedStmt) blockedStmt = statements[0];

    console.error(`\n❌ 写操作被阻止`);
    console.error(`   检测到写入语句类型：${matched}`);
    console.error(`   语句：${blockedStmt?.trim()?.substring(0, 80)}...`);
    console.error(`\n   如需执行写入，请添加 --dangerously-allow-writes 参数：`);
    console.error(`   node scripts/sql.js --dangerously-allow-writes "${matched.toLowerCase()} ..."`);
    console.error(`   node scripts/sql.js --file query.sql --dangerously-allow-writes`);
    process.exit(1);
  }

  // ── 写模式警告 ──────────────────────────────────────────
  if (ALLOW_WRITE && writeCheck.isWrite && !WRITE_WARNING_SHOWN) {
    printWriteWarning();
    WRITE_WARNING_SHOWN = true;
  }

  // 用 --command 参数传递 SQL，双引号包裹让 shell 处理内部引号
  const cmd = `npx wrangler d1 execute ${D1_DATABASE} --command "${trimmed}" --json`;

  try {
    const output = execSync(cmd, {
      encoding: 'utf-8',
      cwd: PROJECT_ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 60000,
    });

    return parseWranglerOutput(output);
  } catch (err) {
    // wrangler 命令不存在或执行失败
    if (err.code === 'ENOENT' || (err.stderr && err.stderr.includes('command not found'))) {
      console.error('错误：请确保 wrangler 已安装（npm install -g wrangler）');
    } else if (err.stderr) {
      const stderr = err.stderr.trim();
      if (stderr) {
        console.error('wrangler 错误:', stderr);
      }
    } else if (err.stdout) {
      // wrangler 可能返回非零退出码但仍有 JSON 输出
      try {
        return parseWranglerOutput(err.stdout);
      } catch {
        console.error('执行 SQL 时出错:', err.message);
      }
    } else {
      console.error('执行 SQL 时出错:', err.message);
    }
    process.exit(EXIT_ERROR);
  }
}

// ── 输出解析 ──────────────────────────────────────────────

/**
 * 解析 wrangler 返回的 JSON 输出
 * 兼容格式：
 *   1. 单行 JSON 数组：[{...}]
 *   2. 多行格式化 JSON 数组：\n[\n  {\n    ...
  }\n]
 *   3. 多行 NDJSON：每行一个 JSON 对象
 * @param {string} output - wrangler 的原始 stdout 输出
 * @returns {Array} 解析后的 JSON 数组
 */
function parseWranglerOutput(output) {
  const trimmed = output.trim();
  const allResults = [];

  // 尝试将整个输出作为一个 JSON 解析
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return [parsed];
  } catch {
    // 不是整体有效的 JSON，尝试逐行解析（NDJSON 格式）
    const lines = trimmed.split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line.trim());
        if (Array.isArray(parsed)) {
          allResults.push(...parsed);
        } else {
          allResults.push(parsed);
        }
      } catch {
        // 跳过非 JSON 行（如 wrangler 的日志输出）
        continue;
      }
    }
  }

  return allResults;
}

/**
 * 将 wrangler 输出结构化
 * @param {Array} parsed - parseWranglerOutput 的返回结果
 * @returns {{ results: Array, meta: Object|null, success: boolean, error: string|null }}
 */
function parseOutput(parsed) {
  const result = {
    results: [],
    meta: null,
    success: true,
    error: null,
  };

  if (!parsed || parsed.length === 0) {
    return result;
  }

  const first = parsed[0];

  if (first.error) {
    result.success = false;
    // error 可能是 { text: "..." } 或字符串
    if (typeof first.error === 'object' && first.error !== null) {
      result.error = first.error.text || JSON.stringify(first.error);
    } else {
      result.error = String(first.error);
    }
    return result;
  }

  result.success = first.success !== false;

  if (Array.isArray(first.results)) {
    result.results = first.results;
  }

  if (first.meta) {
    result.meta = first.meta;
  }

  // 如果有多个 batch，合并所有 results
  if (parsed.length > 1) {
    for (let i = 1; i < parsed.length; i++) {
      const batch = parsed[i];
      if (Array.isArray(batch.results)) {
        result.results.push(...batch.results);
      }
      if (batch.meta) {
        result.meta = batch.meta;
      }
    }
  }

  return result;
}

// ── 格式化 ─────────────────────────────────────────────────

/**
 * 计算每列的最大宽度
 * @param {Array<Object>} rows - 数据行
 * @returns {Array<{ name: string, width: number }>}
 */
function columnWidths(rows) {
  if (!rows || rows.length === 0) {
    return [];
  }

  const keys = Object.keys(rows[0]);
  return keys.map(key => {
    let maxWidth = key.length;
    for (const row of rows) {
      const val = row[key] !== null && row[key] !== undefined ? String(row[key]) : 'NULL';
      if (val.length > maxWidth) {
        maxWidth = val.length;
      }
    }
    return { name: key, width: Math.max(maxWidth + 2, 6) };
  });
}

/**
 * 填充字符串到指定宽度
 * @param {string} str - 要填充的字符串
 * @param {number} width - 目标宽度
 * @returns {string}
 */
function pad(str, width) {
  const s = str !== null && str !== undefined ? String(str) : 'NULL';
  const padding = width - s.length;
  if (padding <= 0) return s;
  return s + ' '.repeat(padding);
}

/**
 * 格式化 meta 信息
 * @param {Object} meta - 元信息对象
 * @returns {string}
 */
function formatMeta(meta) {
  if (!meta) return '';
  const parts = [];
  if (meta.rows_read !== undefined) parts.push(`rows_read: ${meta.rows_read}`);
  if (meta.rows_written !== undefined) parts.push(`rows_written: ${meta.rows_written}`);
  if (meta.duration !== undefined) {
    const dur = typeof meta.duration === 'number' ? meta.duration.toFixed(3) : meta.duration;
    parts.push(`duration: ${dur}s`);
  }
  return parts.join(' | ');
}

/**
 * 格式化查询结果为美观表格
 * @param {Array<Object>} results - 查询结果行
 * @param {Object|null} meta - 元信息
 * @returns {string}
 */
function formatResults(results, meta) {
  if (!results || results.length === 0) {
    const metaStr = formatMeta(meta);
    if (metaStr) {
      return `（0 行） | ${metaStr}`;
    }
    return '（0 行）';
  }

  const widths = columnWidths(results);
  const keys = widths.map(w => w.name);

  const totalWidth = widths.reduce((sum, w) => sum + w.width + 3, 0) + 1;

  const lines = [];

  // 顶部边框
  const topBorder = '┌' + widths.map(w => '─'.repeat(w.width)).join('┬') + '┐';
  lines.push(topBorder);

  // 表头
  const header = '│' + widths.map(w => {
    const name = w.name;
    const leftPad = Math.floor((w.width - name.length) / 2);
    const rightPad = w.width - name.length - leftPad;
    return ' '.repeat(leftPad) + name + ' '.repeat(rightPad);
  }).join('│') + '│';
  lines.push(header);

  // 表头分隔线
  const separator = '├' + widths.map(w => '─'.repeat(w.width)).join('┼') + '┤';
  lines.push(separator);

  // 数据行
  for (const row of results) {
    const dataLine = '│' + widths.map(w => {
      const val = row[w.name] !== null && row[w.name] !== undefined ? String(row[w.name]) : 'NULL';
      return ' ' + pad(val, w.width - 2) + ' ';
    }).join('│') + '│';
    lines.push(dataLine);
  }

  // meta 信息行
  const metaStr = formatMeta(meta);
  if (metaStr) {
    const metaBorder = '├' + widths.map(w => '─'.repeat(w.width)).join('┴') + '┤';
    lines.push(metaBorder);
    const metaLine = '│ ' + pad(metaStr, totalWidth - 3) + ' │';
    lines.push(metaLine);
  }

  // 底部边框
  const bottomBorder = '└' + widths.map(w => '─'.repeat(w.width)).join('┴') + '┘';
  lines.push(bottomBorder);

  return lines.join('\n');
}

/**
 * 格式化 DDL/DML 操作的结果
 * @param {Object} meta - 元信息
 * @returns {string}
 */
function formatDMLResult(meta) {
  const metaStr = formatMeta(meta);
  const rowsAffected = meta && meta.rows_written !== undefined ? `影响 ${meta.rows_written} 行` : '';
  const parts = [rowsAffected, metaStr].filter(Boolean);
  return `✓ 成功（${parts.join(' | ')}）`;
}

// ── 快捷命令 ──────────────────────────────────────────────

/**
 * 处理快捷命令（.xxx）
 * @param {string} cmd - 快捷命令字符串
 * @returns {{ sql: string|null, action: string }}
 */
function handleShortcut(cmd) {
  if (!cmd || !cmd.startsWith('.')) {
    return { sql: null, action: 'unknown' };
  }

  const parts = cmd.slice(1).split(/\s+/);
  const command = parts[0].toLowerCase();
  const arg = parts.slice(1).join(' ');

  switch (command) {
    case 'tables':
      return {
        sql: "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;",
        action: 'tables',
      };

    case 'schema':
      if (arg) {
        return {
          sql: `SELECT sql FROM sqlite_master WHERE type='table' AND name='${arg.replace(/'/g, "''")}';`,
          action: 'schema',
        };
      }
      return {
        sql: "SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name;",
        action: 'schema',
      };

    case 'indexes':
      if (arg) {
        return {
          sql: `SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='${arg.replace(/'/g, "''")}';`,
          action: 'indexes',
        };
      }
      return {
        sql: "SELECT name, tbl_name, sql FROM sqlite_master WHERE type='index' ORDER BY tbl_name, name;",
        action: 'indexes',
      };

    case 'help':
      return { sql: null, action: 'help' };

    default:
      console.error(`未知快捷命令: .${command}，输入 .help 查看可用命令`);
      return { sql: null, action: 'error' };
  }
}

// ── 帮助 ──────────────────────────────────────────────────

/**
 * 打印帮助信息
 */
function printHelp() {
  const help = `
D1 数据库管理工具 (Cloudflare D1)

用法:
  node scripts/sql.js "SQL"                                          执行 SQL 查询
  node scripts/sql.js --file <path>                                  从文件执行 SQL
  node scripts/sql.js --json "SQL"                                   JSON 格式输出
  node scripts/sql.js --dangerously-allow-writes "SQL"              启用写模式

快捷命令:
  .tables               列出所有表
  .schema [表名]        查看表结构
  .indexes [表名]       查看索引
  .help                 显示帮助

示例:
  node scripts/sql.js "SELECT * FROM user;"
  node scripts/sql.js .tables
  node scripts/sql.js --dangerously-allow-writes "UPDATE user SET ..."
`;
  console.log(help);
}

/**
 * 打印写模式安全警告
 */
function printWriteWarning() {
  console.error('\n' + '╔'.padEnd(55, '═') + '╗');
  console.error('║  ⚠️  危险模式已启用                              ║');
  console.error('║                                                  ║');
  console.error('║  你正在绕过所有保护机制直接写入数据库：             ║');
  console.error('║    • 密码哈希需要 PEPPER_KEY，SQL 无法生成正确哈希  ║');
  console.error('║    • 绕过所有业务校验（重复检查、权限、约束）       ║');
  console.error('║    • 操作不可回滚                                 ║');
  console.error('║                                                  ║');
  console.error('║  请确认这是你真正想要做的操作。                     ║');
  console.error('╚'.padEnd(55, '═') + '╝\n');
}

// ── 主入口 ────────────────────────────────────────────────

/**
 * 主入口
 */
async function run() {
  const args = parseArgs();
  const { sql, filePath, isRepl, isJson, shortcut, allowWrite } = args;

  // 设置写模式
  ALLOW_WRITE = allowWrite;

  // 优先处理快捷命令
  if (shortcut) {
    const { sql: shortcutSql, action } = handleShortcut(shortcut);

    if (action === 'help') {
      printHelp();
      process.exit(EXIT_SUCCESS);
    }

    if (shortcutSql) {
      const parsed = executeSQL(shortcutSql);
      const { results, meta, success, error } = parseOutput(parsed);

      if (!success) {
        console.error(`错误: ${error}`);
        process.exit(EXIT_ERROR);
      }

      if (isJson) {
        console.log(JSON.stringify({ results, meta }, null, 2));
      } else {
        console.log(formatResults(results, meta));
      }
      process.exit(EXIT_SUCCESS);
    }

    process.exit(EXIT_ERROR);
  }

  // 从文件读取 SQL
  let finalSql = sql;
  if (filePath) {
    try {
      finalSql = fs.readFileSync(path.resolve(filePath), 'utf-8');
    } catch (err) {
      if (err.code === 'ENOENT') {
        console.error(`错误：文件不存在 — ${filePath}`);
      } else {
        console.error(`错误：读取文件失败 — ${err.message}`);
      }
      process.exit(EXIT_ERROR);
    }
  }

  // 执行 SQL
  if (!finalSql || !finalSql.trim()) {
    console.error('错误：没有输入 SQL');
    process.exit(EXIT_ERROR);
  }

  const parsed = executeSQL(finalSql);
  const { results, meta, success, error } = parseOutput(parsed);

  if (!success) {
    console.error(`错误: ${error}`);
    process.exit(EXIT_ERROR);
  }

  // JSON 输出
  if (isJson) {
    console.log(JSON.stringify({ results, meta }, null, 2));
    process.exit(EXIT_SUCCESS);
  }

  // 表格输出
  if (results && results.length > 0) {
    console.log(formatResults(results, meta));
  } else if (meta && (meta.rows_written !== undefined || meta.rows_read !== undefined)) {
    console.log(formatDMLResult(meta));
  } else {
    const metaStr = formatMeta(meta);
    console.log(metaStr ? `✓ 成功（${metaStr}）` : '✓ 成功');
  }

  process.exit(EXIT_SUCCESS);
}

// ── 启动 ──────────────────────────────────────────────────
run().catch(err => {
  console.error('未预期的错误:', err.message);
  process.exit(EXIT_ERROR);
});
