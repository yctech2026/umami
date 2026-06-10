import { drizzle } from 'drizzle-orm/d1';
import { drizzle as drizzleLibsql } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import { sql } from 'drizzle-orm';
import * as schema from '../../drizzle/schema';
import debug from 'debug';
import { getBoolEnv, getEnv } from '@/lib/env';
import { DEFAULT_PAGE_SIZE, FILTER_COLUMNS, OPERATORS, SESSION_COLUMNS } from './constants';
import { filtersObjectToArray } from './params';
import type { Operator, QueryFilters, QueryOptions } from './types';

const log = debug('umami:prisma');

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
      return `${table}.${column} = ANY(${value})`;
    case OPERATORS.notEquals:
      return `${table}.${column} != ALL(${value})`;
    case OPERATORS.contains:
      return `${table}.${column} like ${value}`;
    case OPERATORS.doesNotContain:
      return `${table}.${column} not like ${value}`;
    case OPERATORS.regex:
      return `${table}.${column} ~* ${value}`;
    case OPERATORS.notRegex:
      return `${table}.${column} !~* ${value}`;
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
            `and (website_event.referrer_domain != regexp_replace(website_event.hostname, '^www.', '') or website_event.referrer_domain is null)`,
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

// ─── Drizzle & 本地 SQLite 基础设施 ─────────────────────────────────────────────

let drizzleClient: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _libsqlClient: ReturnType<typeof createClient> | null = null;
let _d1Wrapper: any = null;

function getLibsqlClient() {
  if (!_libsqlClient) {
    _libsqlClient = createClient({
      url: 'file:./drizzle/dev.db',
    });
  }
  return _libsqlClient;
}

/**
 * 创建 D1 兼容包装器，让 rawQuery / batch 通过 libsql 工作
 */
function getD1Wrapper(): any {
  if (_d1Wrapper) return _d1Wrapper;

  const libsql = getLibsqlClient();

  _d1Wrapper = {
    prepare: (sql: string) => {
      const stmt: any = {
        _sql: sql,
        _params: [] as any[],
        bind: (...params: any[]) => {
          stmt._params = params;
          const bound: any = {
            all: async () => {
              const result = await libsql.execute({ sql, args: params });
              return { results: result.rows };
            },
            _sql: sql,
            _params: params,
          };
          return bound;
        },
      };
      return stmt;
    },
    batch: async (statements: any[]) => {
      const batchStmts = statements.map((s: any) => ({
        sql: s._sql || s.sql,
        args: s._params || s.params || [],
      }));
      return libsql.batch(batchStmts);
    },
  };

  return _d1Wrapper;
}

/**
 * 获取 Drizzle ORM 实例（D1 → libsql 依次回退）
 */
function getClient() {
  // 1) Cloudflare Workers D1 binding（生产环境）
  const db = (globalThis as any).__D1_DB__;
  if (db) {
    log('Drizzle initialized (D1)');
    return drizzle(db, { schema });
  }

  // 2) 本地开发模式：libsql SQLite
  try {
    const libsql = getLibsqlClient();
    log('Drizzle initialized (libsql SQLite)');
    return drizzleLibsql(libsql, { schema }) as any;
  } catch (e) {
    throw new Error(`Failed to connect to local database: ${e}`);
  }
}

/**
 * 获取缓存的 Drizzle 实例
 */
function getDrizzleClient() {
  if (!drizzleClient) {
    drizzleClient = getClient();
  }
  return drizzleClient;
}

/**
 * 获取底层 D1 绑定（用于直接执行原始 SQL）
 * 本地开发时通过 D1 兼容包装器委托给 libsql
 */
function getD1Binding(): any {
  // 1) Cloudflare Workers D1 binding（生产环境）
  const db = (globalThis as any).__D1_DB__;
  if (db) return db;

  // 2) 本地开发模式：libsql D1 兼容包装器
  try {
    return getD1Wrapper();
  } catch (e) {
    throw new Error(`Database not available: ${e}`);
  }
}

// ─── 核心执行函数 ──────────────────────────────────────────────────────────────

/**
 * 执行原始 SQL 查询（使用 D1 prepared statements）
 * 将 {{param}} 风格命名参数替换为 ? 位置参数
 */
async function rawQuery(sql: string, data: Record<string, any>, name?: string): Promise<any> {
  if (getBoolEnv('LOG_QUERY')) {
    log('QUERY:\n', sql);
    log('PARAMETERS:\n', data);
    log('NAME:\n', name);
  }

  const params: any[] = [];

  const query = sql?.replaceAll(/\{\{\s*(\w+)(::\w+)?\s*}}/g, (...args) => {
    const [, name] = args;
    const value = data[name];
    params.push(value);
    return '?';
  });

  const d1 = getD1Binding();
  const { results } = await d1.prepare(query).bind(...params).all();
  return results;
}

/**
 * 分页查询（使用 D1 raw SQL 实现，兼容现有 string model name 调用）
 * 保留分页/排序逻辑，criteria 中的 Prisma 特定条件需迁移到 Drizzle 后适配
 */
async function pagedQuery<T>(model: string, criteria: any, filters?: QueryFilters) {
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
    `select * from ${model} ${statements}`,
    {},
    `pagedQuery:${model}:data`,
  );

  const count = await rawQuery(
    `select count(*) as num from ${model}`,
    {},
  ).then(res => Number(res[0]?.num || 0));

  return { data, count, page: +page, pageSize: size, orderBy, search };
}

/**
 * 分页原始查询（基于 rawQuery）
 */
async function pagedRawQuery(
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
 */
async function transaction(input: any, options?: any) {
  if (typeof input === 'function') {
    // Callback 模式：使用 Drizzle 的事务 API
    const client = getDrizzleClient();
    return client.transaction(async (tx) => {
      return input(tx);
    });
  }

  // Array 模式：使用 D1 batch / libsql batch 批量执行
  if (Array.isArray(input)) {
    if (input.length === 0) return [];

    const d1 = getD1Binding();

    // 将每个操作转换为 prepared statement SQL
    const preparedStatements = input.map((op: any) => {
      if (typeof op?.toSQL === 'function') {
        const stmt = op.toSQL();
        return d1.prepare(stmt.sql).bind(...stmt.params);
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

// ─── 客户端单例 ───────────────────────────────────────────────────────────────

const client = getDrizzleClient();

export default {
  client,
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
};
