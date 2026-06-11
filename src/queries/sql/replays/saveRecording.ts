import clickhouse from '@/lib/clickhouse';
import { uuid } from '@/lib/crypto';
import { CLICKHOUSE, PRISMA, runQuery } from '@/lib/db';
import kafka from '@/lib/kafka';
import prisma from '@/lib/db';
import * as schema from '../../../../drizzle/schema';

async function gzipAsync(data: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream('gzip');
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

export interface SaveRecordingArgs {
  websiteId: string;
  sessionId: string;
  visitId: string;
  chunkIndex: number;
  events: any[];
  eventCount: number;
  startedAt: Date;
  endedAt: Date;
}

export async function saveRecording(args: SaveRecordingArgs) {
  return runQuery({
    [PRISMA]: () => relationalQuery(args),
    [CLICKHOUSE]: () => clickhouseQuery(args),
  });
}

async function relationalQuery({
  websiteId,
  sessionId,
  visitId,
  chunkIndex,
  events,
  eventCount,
  startedAt,
  endedAt,
}: SaveRecordingArgs) {
  const compressed = await gzipAsync(new TextEncoder().encode(JSON.stringify(events)));

  return prisma.client.insert(schema.sessionReplay).values({
    replayId: uuid(),
    websiteId,
    sessionId,
    visitId,
    chunkIndex,
    events: compressed,
    eventCount,
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
  });
}

async function clickhouseQuery({
  websiteId,
  sessionId,
  visitId,
  chunkIndex,
  events,
  eventCount,
  startedAt,
  endedAt,
}: SaveRecordingArgs) {
  const { insert, getUTCString } = clickhouse;
  const { sendMessage } = kafka;

  const message = {
    replay_id: uuid(),
    website_id: websiteId,
    session_id: sessionId,
    visit_id: visitId,
    chunk_index: chunkIndex,
    events: JSON.stringify(events),
    event_count: eventCount,
    started_at: getUTCString(startedAt),
    ended_at: getUTCString(endedAt),
  };

  if (kafka.enabled) {
    return sendMessage('session_replay', message);
  }

  return insert('session_replay', [message]);
}
