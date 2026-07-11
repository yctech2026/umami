import clickhouse from '@/lib/clickhouse';
import { SESSION_COLUMNS } from '@/lib/constants';
import { CLICKHOUSE, PRISMA, runQuery } from '@/lib/db';
import prisma from '@/lib/db';
import type { QueryFilters } from '@/lib/types';
import type { PerformanceParameters } from './getPerformance';

export interface PerformanceMetricsData {
  name: string;
  p50: number;
  p75: number;
  p95: number;
  count: number;
}

export async function getPerformanceMetrics(
  ...args: [
    websiteId: string,
    parameters: PerformanceParameters,
    filters: QueryFilters,
    column: string,
    limit?: number,
  ]
) {
  return runQuery({
    [PRISMA]: () => relationalQuery(...args),
    [CLICKHOUSE]: () => clickhouseQuery(...args),
  });
}

async function relationalQuery(
  websiteId: string,
  parameters: PerformanceParameters,
  filters: QueryFilters,
  column: string,
  limit?: number,
): Promise<PerformanceMetricsData[]> {
  const { startDate, endDate, metric = 'lcp' } = parameters;
  const { rawQuery, parseFilters } = prisma;
  const { filterQuery, joinSessionQuery, cohortQuery, queryParams } = parseFilters(
    { ...filters, websiteId },
    { joinSession: SESSION_COLUMNS.includes(column) },
  );

  return rawQuery(
    `
    with ordered as (
      select
        ${column} as "name",
        ${metric} as val,
        row_number() over (partition by ${column} order by ${metric}) as rn,
        count(*) over (partition by ${column}) as cnt
      from website_event
      ${cohortQuery}
      ${joinSessionQuery}
      where website_event.website_id = {{websiteId}}
        and website_event.event_type = 5
        and website_event.created_at between {{startDate}} and {{endDate}}
        ${filterQuery}
    )
    select name,
      max(case when rn = round(cnt * 0.5) then val end) as p50,
      max(case when rn = round(cnt * 0.75) then val end) as p75,
      max(case when rn = round(cnt * 0.95) then val end) as p95,
      max(cnt) as count
    from ordered
    group by name
    order by p75 desc
    ${limit ? `limit ${limit}` : ''}
    `,
    { ...queryParams, startDate, endDate },
  );
}

async function clickhouseQuery(
  websiteId: string,
  parameters: PerformanceParameters,
  filters: QueryFilters,
  column: string,
  limit?: number,
): Promise<PerformanceMetricsData[]> {
  const { startDate, endDate, metric = 'lcp' } = parameters;
  const { rawQuery, parseFilters } = clickhouse;
  const { filterQuery, cohortQuery, queryParams } = parseFilters({ ...filters, websiteId });

  return rawQuery<PerformanceMetricsData[]>(
    `
    select
      ${column} as "name",
      quantile(0.5)(${metric}) as p50,
      quantile(0.75)(${metric}) as p75,
      quantile(0.95)(${metric}) as p95,
      count() as count
    from website_event
    ${cohortQuery}
    where website_event.website_id = {websiteId:UUID}
      and website_event.event_type = 5
      and website_event.created_at between {startDate:DateTime64} and {endDate:DateTime64}
      ${filterQuery}
    group by ${column}
    order by p75 desc
    ${limit ? `limit ${limit}` : ''}
    `,
    { ...queryParams, startDate, endDate },
  );
}
