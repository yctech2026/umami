import clickhouse from '@/lib/clickhouse';
import { DATA_TYPE } from '@/lib/constants';
import { uuid } from '@/lib/crypto';
import { flattenJSON, getStringValue } from '@/lib/data';
import { CLICKHOUSE, PRISMA, runQuery } from '@/lib/db';
import kafka from '@/lib/kafka';
import prisma from '@/lib/prisma';
import * as schema from '../../../../drizzle/schema';
import type { DynamicData } from '@/lib/types';

export interface SaveEventDataArgs {
  websiteId: string;
  eventId: string;
  sessionId?: string;
  urlPath?: string;
  eventName?: string;
  eventData: DynamicData;
  createdAt?: Date;
}

export async function saveEventData(data: SaveEventDataArgs) {
  return runQuery({
    [PRISMA]: () => relationalQuery(data),
    [CLICKHOUSE]: () => clickhouseQuery(data),
  });
}

async function relationalQuery(data: SaveEventDataArgs) {
  const { websiteId, eventId, eventData, createdAt } = data;

  const jsonKeys = flattenJSON(eventData);

  // id, websiteEventId, eventStringValue
  const flattenedData = jsonKeys.map(a => ({
    eventDataId: uuid(),
    websiteEventId: eventId,
    websiteId,
    dataKey: a.key,
    stringValue: getStringValue(a.value, a.dataType),
    numberValue: a.dataType === DATA_TYPE.number ? (a.value as number) : null,
    dateValue: a.dataType === DATA_TYPE.date ? new Date(a.value).toISOString() : null,
    dataType: a.dataType as number,
    createdAt: createdAt?.toISOString(),
  }));

  await prisma.client.insert(schema.eventData).values(flattenedData);
}

async function clickhouseQuery(data: SaveEventDataArgs) {
  const { websiteId, sessionId, eventId, urlPath, eventName, eventData, createdAt } = data;

  const { insert, getUTCString } = clickhouse;
  const { sendMessage } = kafka;

  const jsonKeys = flattenJSON(eventData);

  const messages = jsonKeys.map(({ key, value, dataType }) => {
    return {
      website_id: websiteId,
      session_id: sessionId,
      event_id: eventId,
      url_path: urlPath,
      event_name: eventName,
      data_key: key,
      data_type: dataType,
      string_value: getStringValue(value, dataType),
      number_value: dataType === DATA_TYPE.number ? value : null,
      date_value: dataType === DATA_TYPE.date ? getUTCString(value) : null,
      created_at: getUTCString(createdAt),
    };
  });

  if (kafka.enabled) {
    await sendMessage('event_data', messages);
  } else {
    await insert('event_data', messages);
  }
}
