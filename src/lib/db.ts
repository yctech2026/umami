// ─── IMPORTS ─────────────────────────────────────────────────────────────────
import { sql } from 'drizzle-orm';
import * as schema from '@/drizzle/schema';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle as drizzleD1 } from 'drizzle-orm/d1';
import { drizzle as drizzleLibsql } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
// 注意：不用 React.cache()，因为 workerd 运行时无 React 组件上下文。
// 直接每次调用获取新客户端，getCloudflareContext() 由 OpenNext 自动 memo 化。
import debug from 'debug';
import { getBoolEnv, getEnv, getEnvString } from '@/lib/env';
import { DEFAULT_PAGE_SIZE, FILTER_COLUMNS, OPERATORS, SESSION_COLUMNS } from './constants';
import { filtersObjectToArray } from './params';
import type { Operator, QueryFilters, QueryOptions } from './types';

const log = debug('umami:prisma');

// ═══════════════════════════════════════════════════════════════════════════════
// 第一部分：Drizzle Client 基础设施（原 drizzle-client.ts）
// ── 每请求（workerd）或单例（dev）的客户端工厂 ──
// ═══════════════════════════════════════════════════════════════════════════════

export type DrizzleClient = ReturnType<typeof drizzleD1> | ReturnType<typeof drizzleLibsql>;

// Node.js 本地开发模式的单例（无请求复用问题）
let _devRawDB: any = null;
let _devDrizzleClient: DrizzleClient | null = null;

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

// ── 每请求 Raw DB 工厂（workerd） ────────────────────────────────────
//
// 在 workerd 运行时：每次调用获取新的 D1 binding。
// getCloudflareContext() 由 OpenNext 内部 memo 化，多次调用代价低。
// drizzleD1() 是轻量包装，频繁创建无性能问题。
//
// 关键：不在 workerd 中做任何模块级缓存（防止跨请求 Promise hanging）。
//
// 在 Node.js 本地开发：使用单例（无请求复用问题）
// ────────────────────────────────────────────────────────────────────────

/**
 * 获取 D1 binding 或 libsql raw client（每请求新鲜获取）
 * workerd 中无缓存，每次返回新包装（避免跨请求状态泄漏）
 */
function getRawDBForRequest(): any {
  if (isWorkerdRuntime()) {
    return _getWorkerdRawDB();
  }
  return _getDevRawDB();
}

/** workerd 环境：每次新鲜获取 D1 binding */
function _getWorkerdRawDB(): any {
  // 1) 生产环境：通过 getCloudflareContext 获取 D1 binding
  try {
    const cloudflareContext = getCloudflareContext({ async: false });
    if ((cloudflareContext.env as any)?.DB) {
      const rawDB = (cloudflareContext.env as any).DB;
      console.log('[drizzle] Using D1 via getCloudflareContext (per-request)');
      return wrapD1WithRetry(rawDB);
    }
  } catch {
    // fall through
  }

  // 2) 备用：globalThis.__D1_DB__ (wrangler dev)
  if (typeof globalThis.__D1_DB__ !== 'undefined') {
    console.log('[drizzle] Using D1 via __D1_DB__');
    return globalThis.__D1_DB__;
  }

  throw new Error('[drizzle] No database backend available on workerd runtime');
}

/** Node.js 开发环境：单例 libsql client */
function _getDevRawDB(): any {
  if (!_devRawDB) {
    const libsql = createClient({ url: 'file:./drizzle/dev.db' });
    _devRawDB = createD1WrapperFromLibsql(libsql);
    console.log('[drizzle] Using libsql SQLite (local dev)');
  }
  return _devRawDB;
}

/**
 * 获取 Drizzle 客户端（每请求新鲜创建）
 * workerd 中每次调用创建新实例（drizzleD1 是轻量包装，无额外开销）
 */
export function getDrizzleClient(): DrizzleClient {
  if (isWorkerdRuntime()) {
    const raw = getRawDBForRequest();
    return drizzleD1(raw, { schema });
  }
  return _getDevDrizzleClient();
}

function _getDevDrizzleClient(): DrizzleClient {
  if (!_devDrizzleClient) {
    _devDrizzleClient = drizzleLibsql(getRawDBForRequest(), { schema });
  }
  return _devDrizzleClient;
}

/**
 * 获取 D1 binding（别名，保持兼容）
 */
export function getD1Binding(): any {
  return getRawDBForRequest();
}

/**
 * 获取 Raw DB（别名，保持兼容 — 旧版异步 export 签名）
 */
export function getRawDB(): any {
  return getRawDBForRequest();
}

// ═══════════════════════════════════════════════════════════════════════════════
// D1 重试包装函数
// ═══════════════════════════════════════════════════════════════════════════════
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

  async function withRetry(fn: () => Promise<any>, retries = 5): Promise<any> {
    for (let i = 0; i <= retries; i++) {
      try {
        return await fn();
      } catch (err) {
        if (i === retries || !isRetryable(err)) throw err;
        // 指数退避 + jitter: 200ms, 400ms, 800ms, 1600ms, 3200ms (最大 ~6.2s)
        const baseDelay = 200 * Math.pow(2, i);
        const jitter = Math.random() * 200; // 0-200ms 随机抖动，防止羊群效应
        const delay = Math.min(baseDelay + jitter, 5000); // 上限 5s
        const errMsg = err instanceof Error ? err.message : String(err ?? '');
        console.log(`[drizzle] D1 transient error, retry ${i + 1}/${retries} after ${delay}ms:`, errMsg.slice(0, 100));
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
// 第四部分：每请求惰性客户端 Proxy（原 prisma.ts）
// ═══════════════════════════════════════════════════════════════════════════════
//
// 原理：每个方法调用（如 .select(), .$count(), .insert()）都获取
// 当前请求的新 Drizzle 客户端（通过 getDrizzleClient()），并将调用委
// 托给该客户端。链式调用（如 .select().from().where()）在首次
// .select() 获取真实查询构建器后，后续链式调用在真实的 Drizzle 查询
// 构建器对象上自然进行，无需代理介入。
//
// workerd 中 getCloudflareContext() 由 OpenNext 内部 memo 化，
// 每次请求内多次调用开销极低。Node.js 开发模式使用单例 libsql 客户端。
// ─────────────────────────────────────────────────────────────────────────

/**
 * 每请求惰性 Proxy 客户端
 *
 * 每次方法调用（如 .select(), .$count(), .insert()）通过
 * getDrizzleClient() 获取当前请求的新 Drizzle 客户端，
 * 并将调用委托给该客户端。
 *
 * - 首次方法调用（如 .select()）获取新鲜客户端并调用对应方法
 * - 返回的真实查询构建器可自然链式调用（.from().where().get()）
 * - 直接方法（如 .$count()）直接返回 Promise 结果
 * - 无需链记录与回放逻辑，大幅简化
 */
const client = new Proxy({} as DrizzleClient, {
  get(_target, prop) {
    return (...args: any[]) => {
      const db = getDrizzleClient();
      const value = (db as any)[prop];
      if (typeof value === 'function') {
        return value.apply(db, args);
      }
      return value;
    };
  },
});

/**
 * getClient — 保留导出兼容性
 * 现在直接返回 getDrizzleClient()，避免跨请求缓存
 */
export function getClient(): DrizzleClient {
  return getDrizzleClient();
}

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


