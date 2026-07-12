import clickhouse from '@/lib/clickhouse';
import { DEFAULT_PAGE_SIZE } from '@/lib/constants';
import { CLICKHOUSE, PRISMA, runQuery } from '@/lib/db';
import prisma from '@/lib/db';
import type { QueryFilters } from '@/lib/types';

const FUNCTION_NAME = 'getEventDataPivot';

export interface EventDataPivotRow {
  eventId: string;
  sessionId: string;
  eventName: string;
  urlPath: string;
  createdAt: string;
  propertyKeys: string[];
  propertyValues: string[];
}

export interface EventDataPivotResult {
  data: EventDataPivotRow[];
  count: number;
  page: number;
  pageSize: number;
}

export async function getEventDataPivot(
  ...args: [websiteId: string, filters: QueryFilters & { eventName?: string }]
): Promise<EventDataPivotResult> {
  return runQuery({
    [PRISMA]: () => relationalQuery(...args),
    [CLICKHOUSE]: () => clickhouseQuery(...args),
  });
}

async function relationalQuery(
  websiteId: string,
  filters: QueryFilters & { eventName?: string },
): Promise<EventDataPivotResult> {
  const { rawQuery, parseFilters } = prisma;
  const { page = 1, pageSize, eventName } = filters;
  const size = +pageSize || DEFAULT_PAGE_SIZE;
  const offset = +size * (+page - 1);

  const { filterQuery, cohortQuery, joinSessionQuery, queryParams } = parseFilters({
    ...filters,
    websiteId,
  });

  // Adds optional event name filter
  const eventNameFilter = eventName
    ? `and website_event.event_name = {{eventName}}`
    : '';

  // Selects distinct event IDs matching all filters
  const eventQuery = `
    select website_event.event_id
    from website_event
    join event_data on event_data.website_event_id = website_event.event_id
      and event_data.website_id = {{websiteId}}
      and event_data.created_at between {{startDate}} and {{endDate}}
    ${cohortQuery}
    ${joinSessionQuery}
    where website_event.website_id = {{websiteId}}
      and website_event.created_at between {{startDate}} and {{endDate}}
      and website_event.event_type = 2
      ${eventNameFilter}
      ${filterQuery}
    group by website_event.event_id
  `;

  const count = await rawQuery(
    `select count(*) as num from (${eventQuery}) t`,
    { ...queryParams, eventName },
  ).then((res: any) => Number(res[0]?.num || 0));

  const data = await rawQuery(
    `
    with paged_events as (
      ${eventQuery}
      order by max(website_event.created_at) desc
      limit ${size} offset ${offset}
    )
    select
      event_data.website_event_id as "eventId",
      website_event.session_id as "sessionId",
      website_event.event_name as "eventName",
      website_event.url_path as "urlPath",
      max(event_data.created_at) as "createdAt",
      json_group_array(event_data.data_key order by event_data.data_key) as "propertyKeys",
      json_group_array(event_data.string_value order by event_data.data_key) as "propertyValues"
    from event_data
    join website_event on website_event.event_id = event_data.website_event_id
      and website_event.website_id = {{websiteId}}
      and website_event.created_at between {{startDate}} and {{endDate}}
    join paged_events on paged_events.event_id = event_data.website_event_id
    where event_data.website_id = {{websiteId}}
      and event_data.created_at between {{startDate}} and {{endDate}}
    group by event_data.website_event_id
    order by max(event_data.created_at) desc
    `,
    { ...queryParams, eventName },
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
  filters: QueryFilters & { eventName?: string },
): Promise<EventDataPivotResult> {
  const { rawQuery, parseFilters } = clickhouse;
  const { page = 1, pageSize, eventName } = filters;
  const size = +pageSize || DEFAULT_PAGE_SIZE;
  const offset = +size * (+page - 1);

  const { filterQuery, cohortQuery, queryParams } = parseFilters({ ...filters, websiteId });

  // Adds optional event name filter
  const eventNameFilter = eventName
    ? `and website_event.event_name = {eventName:String}`
    : '';

  // Selects distinct event IDs matching all filters
  const eventQuery = `
    select event_data.event_id
    from event_data
    any left join (
      select event_id, session_id, website_id, event_name, url_path, created_at
      from website_event
      where website_id = {websiteId:UUID}
        and created_at between {startDate:DateTime64} and {endDate:DateTime64}
        and event_type = 2
    ) website_event
    on website_event.event_id = event_data.event_id
      and website_event.session_id = event_data.session_id
      and website_event.website_id = event_data.website_id
    ${cohortQuery}
    where event_data.website_id = {websiteId:UUID}
      and event_data.created_at between {startDate:DateTime64} and {endDate:DateTime64}
      ${eventNameFilter}
      ${filterQuery}
    group by event_data.event_id
  `;

  const count = await rawQuery(
    `select count(*) as num from (${eventQuery}) t`,
    { ...queryParams, eventName },
  ).then((res: any) => Number(res[0]?.num || 0));

  const data = await rawQuery<EventDataPivotRow[]>(
    `
    with paged_events as (
      ${eventQuery}
      order by max(event_data.created_at) desc
      limit ${size} offset ${offset}
    )
    select
      event_data.event_id as eventId,
      any(website_event.session_id) as sessionId,
      any(website_event.event_name) as eventName,
      any(website_event.url_path) as urlPath,
      max(event_data.created_at) as createdAt,
      groupArray(event_data.data_key) as propertyKeys,
      groupArray(event_data.string_value) as propertyValues
    from event_data
    any left join (
      select event_id, session_id, website_id, event_name, url_path
      from website_event
      where website_id = {websiteId:UUID}
        and created_at between {startDate:DateTime64} and {endDate:DateTime64}
        and event_type = 2
    ) website_event
    on website_event.event_id = event_data.event_id
      and website_event.session_id = event_data.session_id
      and website_event.website_id = event_data.website_id
    inner join paged_events on paged_events.event_id = event_data.event_id
    where event_data.website_id = {websiteId:UUID}
      and event_data.created_at between {startDate:DateTime64} and {endDate:DateTime64}
    group by event_data.event_id
    order by max(event_data.created_at) desc
    `,
    { ...queryParams, eventName },
    FUNCTION_NAME,
  );

  return { data: data || [], count, page: +page, pageSize: size };
}
