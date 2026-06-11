import { eq, and, desc, count } from 'drizzle-orm';
import * as schema from '../../../drizzle/schema';
import prisma from '@/lib/db';
import type { QueryFilters } from '@/lib/types';

const db = prisma.client;

export async function findShare(criteria: { where?: { id?: string; slug?: string } }) {
  const { where } = criteria;
  if (!where) return null;

  const conditions: any[] = [];
  if (where.id) conditions.push(eq(schema.share.shareId, where.id));
  if (where.slug) conditions.push(eq(schema.share.slug, where.slug));

  return db.select().from(schema.share).where(and(...conditions)).get();
}

export async function getShare(shareId: string) {
  return findShare({
    where: {
      id: shareId,
    },
  });
}

export async function getShareByCode(slug: string) {
  return findShare({
    where: {
      slug,
    },
  });
}

export async function getShareByEntityId(entityId: string) {
  return db
    .select()
    .from(schema.share)
    .where(eq(schema.share.entityId, entityId))
    .orderBy(desc(schema.share.createdAt))
    .get();
}

export async function getSharesByEntityId(entityId: string, filters?: QueryFilters) {
  const { page = 1, pageSize = 20 } = filters || {};

  const where = eq(schema.share.entityId, entityId);
  const size = +pageSize || 20;
  const offset = size * (+page - 1);

  const data = await db
    .select()
    .from(schema.share)
    .where(where)
    .orderBy(desc(schema.share.createdAt))
    .limit(size)
    .offset(offset);

  const countRows = await (db as any)
    .select({ count: count() })
    .from(schema.share)
    .where(where) as { count: number }[];

  return { data, count: Number(countRows[0]?.count ?? 0), page: +page, pageSize: size };
}

export async function createShare(data: any) {
  return db.insert(schema.share).values(data).returning().all().then(r => r[0]);
}

export async function updateShare(shareId: string, data: any) {
  return db
    .update(schema.share)
    .set(data)
    .where(eq(schema.share.shareId, shareId))
    .returning()
    .all()
    .then(r => r[0]);
}

export async function deleteShare(shareId: string) {
  return db
    .delete(schema.share)
    .where(eq(schema.share.shareId, shareId))
    .returning()
    .all()
    .then(r => r[0]);
}

export async function deleteSharesByEntityId(entityId: string) {
  return db
    .delete(schema.share)
    .where(eq(schema.share.entityId, entityId))
    .run();
}
