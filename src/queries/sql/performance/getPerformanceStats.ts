import clickhouse from '@/lib/clickhouse';
import { CLICKHOUSE, PRISMA, runQuery } from '@/lib/db';
import prisma from '@/lib/db';
import type { QueryFilters } from '@/lib/types';

export interface PerformanceStatsResult {
  lcp: number;
  inp: number;
  cls: number;
  fcp: number;
  ttfb: number;
  count: number;
}

export async function getPerformanceStats(...args: [websiteId: string, filters: QueryFilters]) {
  return runQuery({
    [PRISMA]: () => relationalQuery(...args),
    [CLICKHOUSE]: () => clickhouseQuery(...args),
  });
}

async function relationalQuery(
  websiteId: string,
  filters: QueryFilters,
): Promise<PerformanceStatsResult> {
  const { rawQuery, parseFilters } = prisma;
  const { filterQuery, joinSessionQuery, cohortQuery, queryParams } = parseFilters({
    ...filters,
    websiteId,
  });

  const result = await rawQuery(
    `
    with stats as (
      select
        lcp, inp, cls, fcp, ttfb,
        row_number() over (order by lcp) as lcp_rn,
        row_number() over (order by inp) as inp_rn,
        row_number() over (order by cls) as cls_rn,
        row_number() over (order by fcp) as fcp_rn,
        row_number() over (order by ttfb) as ttfb_rn,
        count(*) over () as cnt
      from website_event
      ${cohortQuery}
      ${joinSessionQuery}
      where website_event.website_id = {{websiteId}}
        and website_event.event_type = 5
        and website_event.created_at between {{startDate}} and {{endDate}}
        ${filterQuery}
    )
    select
      (select lcp from stats where lcp_rn = round(cnt * 0.75)) as lcp,
      (select inp from stats where inp_rn = round(cnt * 0.75)) as inp,
      (select cls from stats where cls_rn = round(cnt * 0.75)) as cls,
      (select fcp from stats where fcp_rn = round(cnt * 0.75)) as fcp,
      (select ttfb from stats where ttfb_rn = round(cnt * 0.75)) as ttfb,
      (select count(*) from stats) as count
    `,
    queryParams,
  );

  return result?.[0] || { lcp: 0, inp: 0, cls: 0, fcp: 0, ttfb: 0, count: 0 };
}

async function clickhouseQuery(
  websiteId: string,
  filters: QueryFilters,
): Promise<PerformanceStatsResult> {
  const { rawQuery, parseFilters } = clickhouse;
  const { filterQuery, cohortQuery, queryParams } = parseFilters({ ...filters, websiteId });

  const result = await rawQuery<PerformanceStatsResult>(
    `
    select
      quantile(0.75)(lcp) as lcp,
      quantile(0.75)(inp) as inp,
      quantile(0.75)(cls) as cls,
      quantile(0.75)(fcp) as fcp,
      quantile(0.75)(ttfb) as ttfb,
      count() as count
    from website_event
    ${cohortQuery}
    where website_event.website_id = {websiteId:UUID}
      and website_event.event_type = 5
      and website_event.created_at between {startDate:DateTime64} and {endDate:DateTime64}
      ${filterQuery}
    `,
    queryParams,
  );

  return result?.[0] || { lcp: 0, inp: 0, cls: 0, fcp: 0, ttfb: 0, count: 0 };
}
