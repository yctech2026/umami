import clickhouse from '@/lib/clickhouse';
import { DEFAULT_PAGE_SIZE } from '@/lib/constants';
import { CLICKHOUSE, PRISMA, runQuery } from '@/lib/db';
import prisma from '@/lib/db';
import type { QueryFilters } from '@/lib/types';

const FUNCTION_NAME = 'getSessionDataPivot';

export interface SessionDataPivotRow {
  sessionId: string;
  distinctId: string;
  createdAt: string;
  propertyKeys: string[];
  propertyValues: string[];
}

export interface SessionDataPivotResult {
  data: SessionDataPivotRow[];
  count: number;
  page: number;
  pageSize: number;
}

export async function getSessionDataPivot(
  ...args: [websiteId: string, filters: QueryFilters & { propertyName?: string }]
): Promise<SessionDataPivotResult> {
  return runQuery({
    [PRISMA]: () => relationalQuery(...args),
    [CLICKHOUSE]: () => clickhouseQuery(...args),
  });
}

async function relationalQuery(
  websiteId: string,
  filters: QueryFilters & { propertyName?: string },
): Promise<SessionDataPivotResult> {
  const { rawQuery, parseFilters } = prisma;
  const { page = 1, pageSize, propertyName } = filters;
  const size = +pageSize || DEFAULT_PAGE_SIZE;
  const offset = +size * (+page - 1);

  const { filterQuery, cohortQuery, joinSessionQuery, queryParams } = parseFilters({
    ...filters,
    websiteId,
  });

  // Adds optional property name filter
  const propertyNameFilter = propertyName
    ? `and session_data.data_key = {{propertyName}}`
    : '';

  // Selects distinct session IDs matching all filters
  const sessionQuery = `
    select session_data.session_id
    from website_event
    join session_data
        on session_data.session_id = website_event.session_id
          and session_data.website_id = website_event.website_id
          and session_data.created_at between {{startDate}} and {{endDate}}
    ${cohortQuery}
    ${joinSessionQuery}
    where website_event.website_id = {{websiteId}}
      and website_event.created_at between {{startDate}} and {{endDate}}
      ${filterQuery}
      ${propertyNameFilter}
    group by session_data.session_id
  `;

  const count = await rawQuery(
    `select count(*) as num from (${sessionQuery}) t`,
    { ...queryParams, propertyName },
  ).then((res: any) => Number(res[0]?.num || 0));

  const data = await rawQuery(
    `
    with paged_sessions as (
      ${sessionQuery}
      order by max(website_event.created_at) desc
      limit ${size} offset ${offset}
    )
    select
      session_data.session_id as "sessionId",
      session.distinct_id as "distinctId",
      max(session_data.created_at) as "createdAt",
      json_group_array(session_data.data_key order by session_data.data_key) as "propertyKeys",
      json_group_array(session_data.string_value order by session_data.data_key) as "propertyValues"
    from session_data
    join session
        on session.session_id = session_data.session_id
          and session.website_id = session_data.website_id
    join paged_sessions
        on paged_sessions.session_id = session_data.session_id
    where session_data.website_id = {{websiteId}}
      and session_data.created_at between {{startDate}} and {{endDate}}
    group by session_data.session_id
    order by max(session_data.created_at) desc
    `,
    { ...queryParams, propertyName },
    FUNCTION_NAME,
  );

  // Parse the JSON arrays from SQLite json_group_array
  const parsed = (data || []).map((row: any) => ({
    ...row,
    propertyKeys: JSON.parse(row.propertyKeys || '[]'),
    propertyValues: JSON.parse(row.propertyValues || '[]'),
  }));

  return { data: parsed, count, page: +page, pageSize: size };
}

async function clickhouseQuery(
  websiteId: string,
  filters: QueryFilters & { propertyName?: string },
): Promise<SessionDataPivotResult> {
  const { rawQuery, parseFilters } = clickhouse;
  const { page = 1, pageSize, propertyName } = filters;
  const size = +pageSize || DEFAULT_PAGE_SIZE;
  const offset = +size * (+page - 1);

  const { filterQuery, cohortQuery, queryParams } = parseFilters({ ...filters, websiteId });

  // Adds optional property name filter
  const propertyNameFilter = propertyName
    ? `and session_data.data_key = {propertyName:String}`
    : '';

  // Selects distinct session IDs matching all filters
  const sessionQuery = `
    select session_data.session_id
    from website_event
    any left join session_data final
        on session_data.session_id = website_event.session_id
          and session_data.website_id = {websiteId:UUID}
          and session_data.created_at between {startDate:DateTime64} and {endDate:DateTime64}
    ${cohortQuery}
    where website_event.website_id = {websiteId:UUID}
      and website_event.created_at between {startDate:DateTime64} and {endDate:DateTime64}
      ${filterQuery}
      ${propertyNameFilter}
    group by session_data.session_id
  `;

  const count = await rawQuery(
    `select count(*) as num from (${sessionQuery}) t`,
    { ...queryParams, propertyName },
  ).then((res: any) => Number(res[0]?.num || 0));

  const data = await rawQuery<SessionDataPivotRow[]>(
    `
    with paged_sessions as (
      ${sessionQuery}
      order by max(website_event.created_at) desc
      limit ${size} offset ${offset}
    )
    select
      session_data.session_id as sessionId,
      any(session.distinct_id) as distinctId,
      max(session_data.created_at) as createdAt,
      groupArray(session_data.data_key) as propertyKeys,
      groupArray(session_data.string_value) as propertyValues
    from session_data final
    any left join (
      select session_id, website_id, distinct_id
      from session
      where website_id = {websiteId:UUID}
    ) session
      on session.session_id = session_data.session_id
        and session.website_id = session_data.website_id
    inner join paged_sessions
        on paged_sessions.session_id = session_data.session_id
    where session_data.website_id = {websiteId:UUID}
      and session_data.created_at between {startDate:DateTime64} and {endDate:DateTime64}
    group by session_data.session_id
    order by max(session_data.created_at) desc
    `,
    { ...queryParams, propertyName },
    FUNCTION_NAME,
  );

  return { data: data || [], count, page: +page, pageSize: size };
}
