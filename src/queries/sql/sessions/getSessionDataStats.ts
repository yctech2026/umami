import clickhouse from '@/lib/clickhouse';
import { CLICKHOUSE, PRISMA, runQuery } from '@/lib/db';
import prisma from '@/lib/db';
import type { QueryFilters } from '@/lib/types';

const FUNCTION_NAME = 'getSessionDataStats';

export interface SessionDataStats {
  label: string;
  activity: number;
  sessions: number;
  visits: number;
  views: number;
  events: number;
}

export async function getSessionDataStats(
  ...args: [websiteId: string, filters: QueryFilters & { propertyName?: string }]
): Promise<SessionDataStats[]> {
  return runQuery({
    [PRISMA]: () => relationalQuery(...args),
    [CLICKHOUSE]: () => clickhouseQuery(...args),
  });
}

async function relationalQuery(
  websiteId: string,
  filters: QueryFilters & { propertyName?: string },
): Promise<SessionDataStats[]> {
  const { rawQuery, parseFilters, getDateSQL } = prisma;
  const { filterQuery, joinSessionQuery, cohortQuery, queryParams } = parseFilters({
    ...filters,
    websiteId,
  });

  return rawQuery(
    `
    select
      case
        when session_data.data_type = 2 then replace(session_data.string_value, '.0000', '')
        when session_data.data_type = 4 then ${getDateSQL('session_data.date_value', 'hour')}
        else session_data.string_value
      end as "label",
      count(*) as "activity",
      count(distinct session_data.session_id) as "sessions",
      count(distinct website_event.visit_id) as "visits",
      count(distinct website_event.event_id) as "views",
      sum(case when website_event.event_type = 2 then 1 else 0 end) as "events"
    from website_event
    ${cohortQuery}
    ${joinSessionQuery}
    join session_data
        on session_data.session_id = website_event.session_id
          and session_data.website_id = website_event.website_id
    where website_event.website_id = {{websiteId}}
      and website_event.created_at between {{startDate}} and {{endDate}}
      and session_data.data_key = {{propertyName}}
    ${filterQuery}
    group by label
    order by 2 desc
    limit 100
    `,
    queryParams,
    FUNCTION_NAME,
  );
}

async function clickhouseQuery(
  websiteId: string,
  filters: QueryFilters & { propertyName?: string },
): Promise<SessionDataStats[]> {
  const { rawQuery, parseFilters } = clickhouse;
  const { filterQuery, cohortQuery, queryParams } = parseFilters({ ...filters, websiteId });

  return rawQuery(
    `
    select
      multiIf(session_data.data_type = 2, replaceAll(session_data.string_value, '.0000', ''),
              session_data.data_type = 4, toString(date_trunc('hour', session_data.date_value)),
              session_data.string_value) as "label",
      count(*) as "activity",
      uniq(session_data.session_id) as "sessions",
      uniq(website_event.visit_id) as "visits",
      uniq(website_event.event_id) as "views",
      sumIf(1, website_event.event_type = 2) as "events"
    from website_event
    ${cohortQuery}
    join session_data final
      on session_data.session_id = website_event.session_id
        and session_data.website_id = {websiteId:UUID}
    where website_event.website_id = {websiteId:UUID}
      and website_event.created_at between {startDate:DateTime64} and {endDate:DateTime64}
      and session_data.data_key = {propertyName:String}
    ${filterQuery}
    group by label
    order by 2 desc
    limit 100
    `,
    queryParams,
    FUNCTION_NAME,
  );
}
