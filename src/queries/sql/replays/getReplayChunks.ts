import clickhouse from '@/lib/clickhouse';
import { CLICKHOUSE, PRISMA, runQuery } from '@/lib/db';
import prisma from '@/lib/prisma';

async function gunzipAsync(data: Uint8Array): Promise<Uint8Array> {
  const cs = new DecompressionStream('gzip');
  const writer = cs.writable.getWriter();
  writer.write(data as BufferSource);
  writer.close();
  const reader = cs.readable.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

const FUNCTION_NAME = 'getReplayChunks';

export interface ReplayChunk {
  sessionId: string;
  visitId: string;
  events: any[];
  chunkIndex: number;
  eventCount: number;
  startedAt: Date;
  endedAt: Date;
}

export async function getReplayChunks(websiteId: string, visitId: string): Promise<ReplayChunk[]> {
  return runQuery({
    [PRISMA]: () => relationalQuery(websiteId, visitId),
    [CLICKHOUSE]: () => clickhouseQuery(websiteId, visitId),
  });
}

async function relationalQuery(websiteId: string, visitId: string): Promise<ReplayChunk[]> {
  const { rawQuery } = prisma;

  const chunks: {
    sessionId: string;
    visitId: string;
    events: Buffer;
    chunkIndex: number;
    eventCount: number;
    startedAt: Date;
    endedAt: Date;
  }[] = await rawQuery(
    `
    select
      session_id as "sessionId",
      visit_id as "visitId",
      events,
      chunk_index as "chunkIndex",
      event_count as "eventCount",
      started_at as "startedAt",
      ended_at as "endedAt"
    from session_replay
    where website_id = {{websiteId}}
      and visit_id = {{visitId}}
    order by chunk_index asc
    `,
    { websiteId, visitId },
    FUNCTION_NAME,
  );

  return Promise.all(
    chunks.map(async chunk => ({
      ...chunk,
      events: JSON.parse(
        new TextDecoder().decode(await gunzipAsync(new Uint8Array(chunk.events))),
      ),
    })),
  );
}

async function clickhouseQuery(websiteId: string, visitId: string): Promise<ReplayChunk[]> {
  const { rawQuery } = clickhouse;

  const results = await rawQuery<
    {
      sessionId: string;
      visitId: string;
      events: string;
      chunk_index: number;
      event_count: number;
      started_at: string;
      ended_at: string;
    }[]
  >(
    `
    select
      session_id as sessionId,
      visit_id as visitId,
      events,
      chunk_index,
      event_count,
      started_at,
      ended_at
    from session_replay
    where website_id = {websiteId:UUID}
      and visit_id = {visitId:UUID}
    order by chunk_index asc
    `,
    { websiteId, visitId },
    FUNCTION_NAME,
  );

  return results.map(row => ({
    sessionId: row.sessionId,
    visitId: row.visitId,
    events: JSON.parse(row.events),
    chunkIndex: row.chunk_index,
    eventCount: row.event_count,
    startedAt: new Date(row.started_at),
    endedAt: new Date(row.ended_at),
  }));
}
