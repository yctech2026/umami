import clickhouse from '@/lib/clickhouse';
import { DATA_TYPE } from '@/lib/constants';
import { uuid } from '@/lib/crypto';
import { flattenJSON, getStringValue } from '@/lib/data';
import { CLICKHOUSE, PRISMA, runQuery } from '@/lib/db';
import kafka from '@/lib/kafka';
import { eq, and } from 'drizzle-orm';
import * as schema from '../../../../drizzle/schema';
import prisma from '@/lib/db';
import type { DynamicData } from '@/lib/types';

export interface SaveSessionDataArgs {
  websiteId: string;
  sessionId: string;
  sessionData: DynamicData;
  distinctId?: string;
  createdAt?: Date;
}

export async function saveSessionData(data: SaveSessionDataArgs) {
  return runQuery({
    [PRISMA]: () => relationalQuery(data),
    [CLICKHOUSE]: () => clickhouseQuery(data),
  });
}

export async function relationalQuery({
  websiteId,
  sessionId,
  sessionData,
  distinctId,
  createdAt,
}: SaveSessionDataArgs) {
  const { client } = prisma;

  const jsonKeys = flattenJSON(sessionData);

  const flattenedData = jsonKeys.map(a => ({
    sessionDataId: uuid(),
    websiteId,
    sessionId,
    dataKey: a.key,
    stringValue: getStringValue(a.value, a.dataType),
    numberValue: a.dataType === DATA_TYPE.number ? (a.value as number) : null,
    dateValue: a.dataType === DATA_TYPE.date ? new Date(a.value).toISOString() : null,
    dataType: a.dataType as number,
    distinctId,
    createdAt: createdAt?.toISOString(),
  }));

  for (const item of flattenedData) {
    const { sessionId, dataKey, ...props } = item;

    // Try to update existing record using compound where clause
    // This is safer than using id from a previous query due to race conditions
    const existing = await client
      .select()
      .from(schema.sessionData)
      .where(and(eq(schema.sessionData.sessionId, sessionId), eq(schema.sessionData.dataKey, dataKey)))
      .limit(1)
      .all()
      .then(r => r[0]);

    if (existing) {
      await client
        .update(schema.sessionData)
        .set(props)
        .where(and(eq(schema.sessionData.sessionId, sessionId), eq(schema.sessionData.dataKey, dataKey)));
    } else {
      await client.insert(schema.sessionData).values(item);
    }
  }
}

async function clickhouseQuery({
  websiteId,
  sessionId,
  sessionData,
  distinctId,
  createdAt,
}: SaveSessionDataArgs) {
  const { insert, getUTCString } = clickhouse;
  const { sendMessage } = kafka;

  const jsonKeys = flattenJSON(sessionData);

  const messages = jsonKeys.map(({ key, value, dataType }) => {
    return {
      website_id: websiteId,
      session_id: sessionId,
      data_key: key,
      data_type: dataType,
      string_value: getStringValue(value, dataType),
      number_value: dataType === DATA_TYPE.number ? value : null,
      date_value: dataType === DATA_TYPE.date ? getUTCString(value) : null,
      distinct_id: distinctId,
      created_at: getUTCString(createdAt),
    };
  });

  if (kafka.enabled) {
    await sendMessage('session_data', messages);
  } else {
    await insert('session_data', messages);
  }
}
