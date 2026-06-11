import { uuid } from '@/lib/crypto';
import { eq, and, like, desc, count } from 'drizzle-orm';
import * as schema from '../../../drizzle/schema';
import prisma from '@/lib/prisma';
import type { QueryFilters } from '@/lib/types';

const db = prisma.client;

export interface CreateReplayChunkArgs {
  websiteId: string;
  sessionId: string;
  visitId: string;
  chunkIndex: number;
  events: Uint8Array;
  eventCount: number;
  startedAt: Date;
  endedAt: Date;
}

export async function getReplayChunks(websiteId: string, visitId: string) {
  return db
    .select()
    .from(schema.sessionReplay)
    .where(
      and(
        eq(schema.sessionReplay.websiteId, websiteId),
        eq(schema.sessionReplay.visitId, visitId),
      ),
    )
    .orderBy(schema.sessionReplay.chunkIndex)
    .all();
}

export async function createReplayChunk({
  websiteId,
  sessionId,
  visitId,
  chunkIndex,
  events,
  eventCount,
  startedAt,
  endedAt,
}: CreateReplayChunkArgs) {
  return db
    .insert(schema.sessionReplay)
    .values({
      replayId: uuid(),
      websiteId,
      sessionId,
      visitId,
      chunkIndex,
      events: new Uint8Array(events),
      eventCount,
      startedAt,
      endedAt,
    } as any)
    .returning()
    .all()
    .then(r => r[0]);
}

export async function deleteReplaysByWebsite(websiteId: string) {
  return db
    .delete(schema.sessionReplay)
    .where(eq(schema.sessionReplay.websiteId, websiteId))
    .run();
}

export async function getReplaySaved(websiteId: string, visitId: string): Promise<boolean> {
  const record = await db
    .select()
    .from(schema.sessionReplaySaved)
    .where(
      and(
        eq(schema.sessionReplaySaved.websiteId, websiteId),
        eq(schema.sessionReplaySaved.visitId, visitId),
      ),
    )
    .get();
  return record !== undefined;
}

export async function createReplaySaved(websiteId: string, visitId: string, name: string) {
  return db
    .insert(schema.sessionReplaySaved)
    .values({ savedReplayId: uuid(), websiteId, visitId, name } as any)
    .returning()
    .all()
    .then(r => r[0]);
}

export async function updateReplaySaved(websiteId: string, visitId: string, name: string) {
  return db
    .update(schema.sessionReplaySaved)
    .set({ name })
    .where(
      and(
        eq(schema.sessionReplaySaved.websiteId, websiteId),
        eq(schema.sessionReplaySaved.visitId, visitId),
      ),
    )
    .run();
}

export async function deleteReplaySaved(websiteId: string, visitId: string) {
  return db
    .delete(schema.sessionReplaySaved)
    .where(
      and(
        eq(schema.sessionReplaySaved.websiteId, websiteId),
        eq(schema.sessionReplaySaved.visitId, visitId),
      ),
    )
    .run();
}

export async function getSavedReplays(websiteId: string, filters: QueryFilters) {
  const { search, page = 1, pageSize } = filters;
  const size = +pageSize || 20;
  const offset = +size * (+page - 1);

  const conditions = [eq(schema.sessionReplaySaved.websiteId, websiteId)];

  if (search) {
    conditions.push(like(schema.sessionReplaySaved.name, `%${search}%`));
  }

  const data = await db
    .select()
    .from(schema.sessionReplaySaved)
    .where(and(...conditions))
    .orderBy(desc(schema.sessionReplaySaved.createdAt))
    .limit(size)
    .offset(offset)
    .all();

  const countResult = await (db as any)
    .select({ count: count() })
    .from(schema.sessionReplaySaved)
    .where(and(...conditions))
    .get() as { count: number } | undefined;

  return {
    data,
    count: Number(countResult?.count ?? 0),
    page: +page,
    pageSize: size,
    orderBy: 'createdAt',
    search,
  };
}
