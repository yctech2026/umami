// ─── IMPORTS ─────────────────────────────────────────────────────────────────
import { sql } from 'drizzle-orm';
import * as schema from '@/drizzle/schema';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle as drizzleD1 } from 'drizzle-orm/d1';
import { drizzle as drizzleLibsql } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import debug from 'debug';
import { getBoolEnv, getEnv, getEnvString } from '@/lib/env';
import { DEFAULT_PAGE_SIZE, FILTER_COLUMNS, OPERATORS, SESSION_COLUMNS } from './constants';
import { filtersObjectToArray } from './params';
import type { Operator, QueryFilters, QueryOptions } from './types';

const log = debug('umami:prisma');

// ═══════════════════════════════════════════════════════════════════════════════
// 第一部分：Drizzle Client 基础设施（原 drizzle-client.ts）
// ═══════════════════════════════════════════════════════════════════════════════

export type DrizzleClient = ReturnType<typeof drizzleD1> | ReturnType<typeof drizzleLibsql>;

let cachedClient: DrizzleClient | null = null;
let cachedRawDB: any = null; // raw D1 binding or D1-compatible wrapper

function isWorkerdRuntime(): boolean {
  return typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers';
}

function createD1WrapperFromLibsql(libsqlClient: any): any {
  const stmts = new Map<string, any>();
  return {
    prepare: (sql: string) => {
      if (!stmts.has(sql)) stmts.set(sql, { sql });
      const entry = stmts.get(sql);
      return {
        bind: (...params: any[]) => {
          entry.params = params;
          return entry;
        },
        all: async () => {
          const res = await libsqlClient.execute({ sql: entry.sql, args: entry.params || [] });
          return { results: res.rows, success: true };
        },
        first: async () => {
          const res = await libsqlClient.execute({ sql: entry.sql, args: entry.params || [] });
          return res.rows[0] || null;
        },
        run: async () => {
          const res = await libsqlClient.execute({ sql: entry.sql, args: entry.params || [] });
          return { success: true, meta: { changes: 0, duration: 0 } };
        },
      };
    },
    batch: async (statements: any[]) => {
      // simple serial execution
      const results = [];
      for (const stmt of statements) {
        if (stmt.params) {
          const res = await libsqlClient.execute({ sql: stmt.sql, args: stmt.params });
          results.push({ results: res.rows, success: true });
        }
      }
      return results;
    },
    transaction: () => libsqlClient.transaction(),
  };
}

export async function getDrizzleClient(): Promise<DrizzleClient> {
  if (cachedClient) return cachedClient;
  const raw = await getRawDB();
  // Infer which drizzle driver to use based on the raw binding type
  if (typeof raw?.prepare === 'function' && raw?.constructor?.name !== 'Object') {
    // D1 binding
    cachedClient = drizzleD1(raw, { schema });
  } else {
    // libsql client
    cachedClient = drizzleLibsql(raw, { schema });
  }
  return cachedClient!;
}

export async function getRawDB(): Promise<any> {
  if (cachedRawDB) return cachedRawDB;

  // 1) 生产环境：通过 getCloudflareContext 获取 D1 binding
  try {
    const cloudflareContext = getCloudflareContext({ async: false });
    if ((cloudflareContext.env as any)?.DB) {
      const rawDB = (cloudflareContext.env as any).DB;
      cachedRawDB = wrapD1WithRetry(rawDB);
      console.log('[drizzle] Using D1 via getCloudflareContext');
      return cachedRawDB;
    }
  } catch {
    // 开发环境不可用
  }

  // 2) 备用：globalThis.__D1_DB__ (wrangler dev)
  if (typeof globalThis.__D1_DB__ !== 'undefined') {
    cachedRawDB = globalThis.__D1_DB__;
    console.log('[drizzle] Using D1 via __D1_DB__');
    return cachedRawDB;
  }

  // 3) 本地开发：libsql SQLite
  if (!isWorkerdRuntime()) {
    const libsql = createClient({ url: 'file:./drizzle/dev.db' });
    cachedRawDB = createD1WrapperFromLibsql(libsql);
    console.log('[drizzle] Using libsql SQLite (local dev)');
    return cachedRawDB;
  }

  throw new Error('[drizzle] No database backend available on workerd runtime');
}

export async function getD1Binding(): Promise<any> {
  return getRawDB();
}

// 新增：D1 重试包装函数
function wrapD1WithRetry(db: any): any {
  const RETRYABLE_ERRORS = [
    'Network connection lost',
    'storage caused object to be reset',
    'reset because its code was updated',
    'isolate exceeded its memory limit',
    'transient issue on remote node',
    'is overloaded. Requests queued',
    'Internal error in D1 DB',
    'Internal error while starting up',
  ];

  function isRetryable(err: any): boolean {
    const msg = String(err?.message || err || '');
    return RETRYABLE_ERRORS.some(pattern => msg.includes(pattern));
  }

  async function withRetry(fn: () => Promise<any>, retries = 2): Promise<any> {
    for (let i = 0; i <= retries; i++) {
      try {
        return await fn();
      } catch (err) {
        if (i === retries || !isRetryable(err)) throw err;
        const delay = 50 * Math.pow(2, i);
        console.log(`[drizzle] D1 transient error, retry ${i + 1}/${retries} after ${delay}ms:`, String(err.message || err).slice(0, 100));
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // 包装 D1PreparedStatement
  function wrapStatement(stmt: any): any {
    return new Proxy(stmt, {
      get(target, prop) {
        const value = Reflect.get(target, prop);
        if (typeof value !== 'function') return value;
        if (prop === 'all' || prop === 'first' || prop === 'run') {
          return (...args: any[]) => withRetry(() => value.apply(target, args));
        }
        return (...args: any[]) => value.apply(target, args);
      },
    });
  }

  return new Proxy(db, {
    get(target, prop) {
      const value = Reflect.get(target, prop);
      if (typeof value !== 'function') return value;

      if (prop === 'prepare') {
        return (sql: string) => {
          const stmt = value.call(target, sql);
          return wrapStatement(stmt);
        };
      }

      if (['all', 'first', 'run', 'raw', 'exec', 'batch', 'dump'].includes(prop as string)) {
        return (...args: any[]) => withRetry(() => value.apply(target, args));
      }

      return (...args: any[]) => value.apply(target, args);
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 第二部分：SQL 辅助函数（原 prisma.ts）
// ═══════════════════════════════════════════════════════════════════════════════

// ─── 日期格式 ─────────────────────────────────────────────────────────────

const DATE_FORMATS: Record<string, string> = {
  minute: '%Y-%m-%d %H:%M:00',
  hour: '%Y-%m-%d %H:00:00',
  day: '%Y-%m-%d %H:00:00',
  month: '%Y-%m-01 %H:00:00',
  year: '%Y-01-01 %H:00:00',
};

const DATE_FORMATS_UTC: Record<string, string> = {
  minute: '%Y-%m-%dT%H:%M:00Z',
  hour: '%Y-%m-%dT%H:00:00Z',
  day: '%Y-%m-%dT%H:00:00Z',
  month: '%Y-%m-01T%H:00:00Z',
  year: '%Y-01-01T%H:00:00Z',
};

function getAddIntervalQuery(field: string, interval: string): string {
  return `datetime(${field}, '+${interval}')`;
}

function getDayDiffQuery(field1: string, field2: string): string {
  return `julianday(${field1}) - julianday(${field2})`;
}

function getCastColumnQuery(field: string, type: string): string {
  return `CAST(${field} AS ${type})`;
}

function getDateSQL(field: string, unit: string, timezone?: string): string {
  if (timezone && timezone !== 'utc') {
    return `strftime('${DATE_FORMATS[unit]}', ${field})`;
  }
  return `strftime('${DATE_FORMATS_UTC[unit]}', ${field})`;
}

function getDateWeeklySQL(field: string, timezone?: string) {
  return `concat(cast(strftime('%w', ${field}) as integer), ':', strftime('%H', ${field}))`;
}

export function getTimestampSQL(field: string) {
  return `cast(strftime('%s', ${field}) as integer)`;
}

function getTimestampDiffSQL(field1: string, field2: string): string {
  return `cast((strftime('%s', ${field2}) - strftime('%s', ${field1})) as integer)`;
}

function getSearchSQL(column: string, param: string = 'search'): string {
  return `and ${column} like {{${param}}}`;
}

function mapFilter(
  column: string,
  operator: string,
  name: string,
  type: string = '',
  paramName?: string,
) {
  const param = paramName ?? name;
  const value = `{{${param}${type ? `::${type}` : ''}}}`;

  if (name.startsWith('cohort_')) {
    name = name.slice('cohort_'.length);
  }

  const table = SESSION_COLUMNS.includes(name) ? 'session' : 'website_event';

  switch (operator) {
    case OPERATORS.equals:
      return `${table}.${column} IN (${value})`;
    case OPERATORS.notEquals:
      return `${table}.${column} NOT IN (${value})`;
    case OPERATORS.contains:
      return `${table}.${column} like ${value}`;
    case OPERATORS.doesNotContain:
      return `${table}.${column} not like ${value}`;
    case OPERATORS.regex:
      return `LOWER(${table}.${column}) LIKE LOWER(${value})`;
    case OPERATORS.notRegex:
      return `LOWER(${table}.${column}) NOT LIKE LOWER(${value})`;
    default:
      return '';
  }
}

function getFilterQuery(filters: Record<string, any>, options: QueryOptions = {}): string {
  const { isCohort, cohortMatch, cohortActionName } = options;
  const isOr = isCohort ? cohortMatch === 'any' : filters.match === 'any';
  const orClauses: string[] = [];
  const andClauses: string[] = [];

  filtersObjectToArray(filters, options).forEach(
    ({ name, column, operator, prefix = '', paramName }) => {
      if (isCohort) {
        column = FILTER_COLUMNS[name.slice('cohort_'.length)];
      }

      if (column) {
        const clause = mapFilter(`${prefix}${column}`, operator, name, '', paramName);
        const isAlwaysAnd = name === 'eventType' || (isCohort && name === cohortActionName);

        if (isAlwaysAnd) {
          andClauses.push(`and ${clause}`);
        } else if (isOr) {
          orClauses.push(clause);
        } else {
          andClauses.push(`and ${clause}`);
        }

        if (name === 'referrer') {
          andClauses.push(
            `and (website_event.referrer_domain != CASE WHEN substr(website_event.hostname, 1, 4) = 'www.' THEN substr(website_event.hostname, 5) ELSE website_event.hostname END or website_event.referrer_domain is null)`,
          );
        }
      }
    },
  );

  const parts: string[] = [];

  if (orClauses.length > 0) {
    parts.push(`and (\n  ${orClauses.join('\n  or ')}\n)`);
  }

  parts.push(...andClauses);

  return parts.join('\n');
}

function getCohortQuery(filters: QueryFilters = {}) {
  if (!filters || Object.keys(filters).length === 0) {
    return '';
  }

  const cohortMatch = (filters as any).cohort_match;
  const cohortActionName = (filters as any).cohort_actionName;

  const filterQuery = getFilterQuery(filters, { isCohort: true, cohortMatch, cohortActionName });

  return `join
    (select distinct website_event.session_id
    from website_event
    join session on session.session_id = website_event.session_id
      and session.website_id = website_event.website_id
    where website_event.website_id = {{websiteId}}
      and website_event.created_at between {{cohort_startDate}} and {{cohort_endDate}}
      ${filterQuery}
    ) cohort
    on cohort.session_id = website_event.session_id
    `;
}

function getExcludeBounceQuery(filters: Record<string, any>) {
  if (filters.excludeBounce !== true) {
    return '';
  }

  return `join
    (select distinct session_id, visit_id
    from website_event
    where website_id = {{websiteId}}
      and created_at between {{startDate}} and {{endDate}}
      and event_type = 1
    group by session_id, visit_id
    having count(*) > 1
    ) excludeBounce
    on excludeBounce.session_id = website_event.session_id
      and excludeBounce.visit_id = website_event.visit_id
    `;
}

function getDateQuery(filters: Record<string, any>) {
  const { startDate, endDate } = filters;

  if (startDate) {
    if (endDate) {
      return `and website_event.created_at between {{startDate}} and {{endDate}}`;
    } else {
      return `and website_event.created_at >= {{startDate}}`;
    }
  }

  return '';
}

function getQueryParams(filters: Record<string, any>) {
  return {
    ...filters,
    ...filtersObjectToArray(filters).reduce((obj, { name, column, operator, value, paramName }) => {
      const resolvedColumn =
        column || (name?.startsWith('cohort_') && FILTER_COLUMNS[name.slice('cohort_'.length)]);

      if (!resolvedColumn) return obj;

      const key = paramName ?? name;

      if (([OPERATORS.contains, OPERATORS.doesNotContain] as Operator[]).includes(operator)) {
        obj[key] = `%${value}%`;
      } else if (([OPERATORS.equals, OPERATORS.notEquals] as Operator[]).includes(operator)) {
        obj[key] = Array.isArray(value) ? value : [value];
      } else {
        obj[key] = value;
      }

      return obj;
    }, {}),
  };
}

function parseFilters(filters: Record<string, any>, options?: QueryOptions) {
  const joinSession = Object.keys(filters).find(key => {
    const baseName = key.replace(/\d+$/, '');
    return ['referrer', ...SESSION_COLUMNS].includes(baseName);
  });

  const cohortFilters = Object.fromEntries(
    Object.entries(filters).filter(([key]) => key.startsWith('cohort_')),
  );

  return {
    joinSessionQuery:
      options?.joinSession || joinSession
        ? `inner join session on website_event.session_id = session.session_id and website_event.website_id = session.website_id`
        : '',
    dateQuery: getDateQuery(filters),
    filterQuery: getFilterQuery(filters, options),
    queryParams: getQueryParams(filters),
    cohortQuery: getCohortQuery(cohortFilters),
    excludeBounceQuery: getExcludeBounceQuery(filters),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 第三部分：核心执行函数（原 prisma.ts）
// ═══════════════════════════════════════════════════════════════════════════════

/** 数据库类型常量（兼容旧 import 方式） */
export const CLICKHOUSE = 'clickhouse';
export const PRISMA = 'prisma';

/**
 * 占位函数：表示该查询在 relational 后端尚未实现
 */
export function notImplemented(): never {
  throw new Error('This query is not implemented for the relational database backend. Please use ClickHouse.');
}

/**
 * 根据当前数据库后端，选择执行 clickhouse 或 relational 查询
 */
export async function runQuery(props: Record<string, () => Promise<any>>): Promise<any> {
  const isClickhouse = Boolean(getEnvString('CLICKHOUSE_URL'));
  if (isClickhouse && props[CLICKHOUSE]) {
    return props[CLICKHOUSE]();
  }
  return props[PRISMA]();
}

/**
 * 执行原始 SQL 查询（使用 D1 prepared statements）
 * 将 {{param}} 风格命名参数替换为 ? 位置参数
 */
export async function rawQuery(sql: string, data: Record<string, any>, name?: string): Promise<any> {
  if (getBoolEnv('LOG_QUERY')) {
    log('QUERY:\n', sql);
    log('PARAMETERS:\n', data);
    log('NAME:\n', name);
  }

  const params: any[] = [];

  const query = sql?.replaceAll(/\{\{\s*(\w+)(::\w+)?\s*}}/g, (...args) => {
    const [, name] = args;
    const value = data[name];
    if (Array.isArray(value)) {
      value.forEach(v => params.push(v === undefined ? null : v instanceof Date ? v.toISOString() : v));
      return value.map(() => '?').join(', ');
    }
    params.push(value === undefined ? null : value instanceof Date ? value.toISOString() : value);
    return '?';
  });

  const d1 = await getD1Binding();
  const { results } = await d1.prepare(query).bind(...params).all();
  return results;
}

/**
 * Prisma 模型名到 Drizzle 表名的映射。
 * Prisma 使用 camelCase 模型名（如 teamUser），但 Drizzle raw SQL 需要 snake_case 表名（如 team_user）。
 */
const MODEL_TABLE_MAP: Record<string, string> = {
  teamUser: 'team_user',
  websiteEvent: 'website_event',
  eventData: 'event_data',
  sessionData: 'session_data',
  sessionReplay: 'session_replay',
  sessionReplaySaved: 'session_replay_saved',
  user: 'user',
  website: 'website',
  session: 'session',
  team: 'team',
  pixel: 'pixel',
  report: 'report',
  segment: 'segment',
  revenue: 'revenue',
  link: 'link',
  board: 'board',
  share: 'share',
};

/**
 * 分页查询（使用 D1 raw SQL 实现，兼容现有 string model name 调用）
 * 保留分页/排序逻辑，criteria 中的 Prisma 特定条件需迁移到 Drizzle 后适配
 *
 * model 参数使用 Prisma 风格 camelCase 名称（如 teamUser），
 * 通过 MODEL_TABLE_MAP 映射为 Drizzle 实际 snake_case 表名。
 */
export async function pagedQuery<T>(model: string, criteria: any, filters?: QueryFilters) {
  const tableName = MODEL_TABLE_MAP[model] || model;
  const { page = 1, pageSize, orderBy, sortDescending = false, search } = filters || {};
  const size = +pageSize || DEFAULT_PAGE_SIZE;
  const offset = +size * (+page - 1);
  const direction = sortDescending ? 'desc' : 'asc';

  const statements = [
    orderBy && `order by ${orderBy} ${direction}`,
    +size > 0 && `limit ${+size} offset ${offset}`,
  ]
    .filter(n => n)
    .join('\n');

  const data = await rawQuery(
    `select * from ${tableName} ${statements}`,
    {},
    `pagedQuery:${model}:data`,
  );

  const count = await rawQuery(
    `select count(*) as num from ${tableName}`,
    {},
  ).then(res => Number(res[0]?.num || 0));

  return { data, count, page: +page, pageSize: size, orderBy, search };
}

/**
 * 分页原始查询（基于 rawQuery）
 */
export async function pagedRawQuery(
  query: string,
  queryParams: Record<string, any>,
  filters: QueryFilters,
  name?: string,
) {
  const { page = 1, pageSize, orderBy, sortDescending = false } = filters;
  const size = +pageSize || DEFAULT_PAGE_SIZE;
  const offset = +size * (+page - 1);
  const direction = sortDescending ? 'desc' : 'asc';

  const statements = [
    orderBy && `order by ${orderBy} ${direction}`,
    +size > 0 && `limit ${+size} offset ${offset}`,
  ]
    .filter(n => n)
    .join('\n');

  const count = await rawQuery(`select count(*) as num from (${query}) t`, queryParams).then(
    res => Number(res[0]?.num || 0),
  );

  const data = await rawQuery(`${query}${statements}`, queryParams, name);

  return { data, count, page: +page, pageSize: size, orderBy };
}

function getSearchParameters(query: string, filters: Record<string, any>[]) {
  if (!query) return;

  const parseFilter = (filter: Record<string, any>) => {
    const [[key, value]] = Object.entries(filter);

    return {
      [key]:
        typeof value === 'string'
          ? {
              [value]: query,
              mode: 'insensitive',
            }
          : parseFilter(value),
    };
  };

  const params = filters.map(filter => parseFilter(filter));

  return {
    AND: {
      OR: params,
    },
  };
}

/**
 * 事务支持
 * - callback 模式: transaction(async tx => { ... }, { timeout })
 * - array 模式: transaction([op1, op2, ...]) → 通过 D1 batch 实现
 *
 * 注意：drizzle-orm/d1 的 SQLiteD1Session.transaction() 使用 SQL BEGIN 语句，
 * 但 Cloudflare D1 禁止 SQL BEGIN/COMMIT（必须用 JavaScript API）。
 * 因此对于 D1 后端，我们不调用 client.transaction()，而是直接执行 callback。
 */
async function transaction(input: any, options?: any) {
  if (typeof input === 'function') {
    // Callback 模式
    const client = await getDrizzleClient();
    const raw = await getRawDB();

    // 检测是否为 D1 binding（而非 libsql wrapper）
    const isD1 =
      typeof raw?.prepare === 'function' &&
      raw?.constructor?.name !== 'Object';

    if (isD1) {
      // D1 不支持 SQL BEGIN/COMMIT，直接执行回调
      // D1 单语句是 ACID 的；如需原子多语句应使用 batch()
      return input(client);
    }

    // libsql 后端：使用 drizzle 的事务 API
    return client.transaction(async (tx) => {
      return input(tx);
    });
  }

  // Array 模式：使用 D1 batch / libsql batch 批量执行
  if (Array.isArray(input)) {
    if (input.length === 0) return [];

    const d1 = await getD1Binding();

    // 将每个操作转换为 prepared statement SQL
    const preparedStatements = input.map((op: any) => {
      if (typeof op?.toSQL === 'function') {
        const stmt = op.toSQL();
        const sanitizedParams = stmt.params.map((p: any) =>
          p === undefined ? null : p instanceof Date ? p.toISOString() : p,
        );
        return d1.prepare(stmt.sql).bind(...sanitizedParams);
      }
      // 如果是原始 SQL 字符串
      if (typeof op === 'string') {
        return d1.prepare(op);
      }
      throw new Error('Unsupported transaction operation type');
    });

    return d1.batch(preparedStatements);
  }

  throw new Error('Unsupported transaction input type');
}

function getSchema() {
  return schema;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 第四部分：客户端单例与惰性 Proxy（原 prisma.ts）
// ═══════════════════════════════════════════════════════════════════════════════

let _cachedClient: DrizzleClient | null = null;
let _clientPromise: Promise<DrizzleClient> | null = null;

/**
 * 异步获取 Drizzle 客户端（首次调用时惰性初始化）
 * 完全异步，不依赖同步 getCloudflareContext
 */
export async function getClient(): Promise<DrizzleClient> {
  if (_cachedClient) return _cachedClient;

  if (!_clientPromise) {
    _clientPromise = getDrizzleClient().then((c) => {
      _cachedClient = c;
      log('Drizzle client initialized (async)');
      return c;
    });
  }

  return _clientPromise;
}

// ─── 链感知的延迟代理 ────────────────────────────────────────────────────
//
// 原理：记录方法调用链（如 select → from → where → get），在客户端就绪后「回放」
// 场景 A — 客户端已就绪：直接回放调用链，返回真实 Drizzle 对象（同步）
// 场景 B — 客户端未就绪：通过 Promise 链逐步解析（await 时自动等待）
//
// 这解决了 Cloudflare Worker 中无法同步调用 getCloudflareContext({ async: false }) 的问题
// ─────────────────────────────────────────────────────────────────────────

type ChainCall = { prop: PropertyKey; args: any[] };

/**
 * 如果客户端已就绪，回放调用链获取真实对象
 */
function replayChain(calls: ChainCall[]): any {
  if (!_cachedClient) return undefined;

  let result: any = _cachedClient;
  for (const { prop, args } of calls) {
    if (result && typeof result[prop] === 'function') {
      result = result[prop](...args);
    } else {
      return undefined;
    }
  }
  return result;
}

/**
 * 构建 Promise 链（客户端未就绪时使用）
 */
function buildPromiseChain(calls: ChainCall[]): Promise<any> {
  let promise = _clientPromise!;
  for (const { prop, args } of calls) {
    promise = promise.then((target: any) => {
      if (target && typeof target[prop] === 'function') {
        return target[prop](...args);
      }
      return undefined;
    });
  }
  return promise;
}

/**
 * 创建一个链节点 Proxy，记录调用链
 */
function createChainNode(calls: ChainCall[]): any {
  return new Proxy(function () {}, {
    get(_, prop) {
      // ── 尝试同步回放（客户端已就绪时） ──
      if (_cachedClient) {
        const resolved = replayChain(calls);
        if (resolved !== undefined) {
          const value = Reflect.get(resolved, prop, resolved);
          if (typeof value === 'function') {
            return (...args: any[]) => value.apply(resolved, args);
          }
          return value;
        }
      }

      // ── 终端属性：Promise 协议（await / .then / .catch） ──
      if (prop === 'then' || prop === 'catch' || prop === 'finally') {
        const promise = buildPromiseChain(calls);
        return promise[prop].bind(promise);
      }

      // ── 继续链式调用 ──
      return (...args: any[]) => {
        const newCalls = [...calls, { prop, args }];
        return createChainNode(newCalls);
      };
    },

    apply(_, __, args) {
      const newCalls = [...calls, { prop: undefined, args }];
      return createChainNode(newCalls);
    },
  });
}

/**
 * 惰性 Proxy 客户端
 *
 * - 首次访问属性时触发异步初始化（不会同步抛错）
 * - 初始化完成前：返回链节点 Proxy，记录调用链
 * - 初始化完成后：直接透传到底层 DrizzleClient
 * - 支持链式调用：.select().from().where().get()
 * - 支持事务：.insert().values() → .toSQL()
 * - 支持 await：终端调用自动转为 Promise
 */
const client = new Proxy({} as DrizzleClient, {
  get(_, prop) {
    // ── 客户端已就绪：直接透传 ──
    if (_cachedClient) {
      const value = Reflect.get(_cachedClient!, prop, _cachedClient!);
      return typeof value === 'function' ? value.bind(_cachedClient) : value;
    }

    // ── 触发异步初始化（仅首次） ──
    if (!_clientPromise) {
      _clientPromise = getClient().then((c) => {
        _cachedClient = c;
        return c;
      });
    }

    // ── 返回延迟链节点 ──
    return (...args: any[]) => createChainNode([{ prop, args }]);
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// 第五部分：导出（原 prisma.ts default export）
// ═══════════════════════════════════════════════════════════════════════════════

const default_export = {
  client,
  getClient,
  getDrizzleClient,
  transaction,
  getAddIntervalQuery,
  getCastColumnQuery,
  getDayDiffQuery,
  getDateSQL,
  getDateWeeklySQL,
  getFilterQuery,
  getSearchParameters,
  getTimestampDiffSQL,
  getSearchSQL,
  pagedQuery,
  pagedRawQuery,
  parseFilters,
  rawQuery,
  CLICKHOUSE,
  PRISMA,
  runQuery,
  notImplemented,
};

export default default_export;


