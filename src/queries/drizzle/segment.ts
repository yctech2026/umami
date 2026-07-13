import { eq, and, or, not, asc, desc, count, like, sql, inArray, isNull } from 'drizzle-orm';
import * as schema from '../../../drizzle/schema';
import type { QueryFilters } from '@/lib/types';
import { getDrizzleClient } from '@/lib/db';
const DEFAULT_PAGE_SIZE = 50;

function getDb(): any {
  return getDrizzleClient();
}

export async function getSegment(segmentId: string) {
  return (await getDb())
    .select()
    .from(schema.segment)
    .where(eq(schema.segment.segmentId, segmentId))
    .get();
}

export async function getSegments(
  criteria: Record<string, any>,
  filters: QueryFilters,
) {
  const { search, page = 1, pageSize, orderBy, sortDescending = false } = filters;
  const size = +pageSize || DEFAULT_PAGE_SIZE;
  const offset = +size * (+page - 1);

  const conditions: any[] = [];

  if (criteria.where) {
    const { websiteId, type, id, segmentId } = criteria.where;
    if (websiteId) conditions.push(eq(schema.segment.websiteId, websiteId));
    if (type) conditions.push(eq(schema.segment.type, type));
    if (id) conditions.push(eq(schema.segment.segmentId, id));
    if (segmentId) conditions.push(eq(schema.segment.segmentId, segmentId));
  }

  if (search) {
    conditions.push(like(schema.segment.name, `%${search}%`));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  let query = (await getDb()).select().from(schema.segment);
  if (whereClause) query = query.where(whereClause);

  if (orderBy) {
    const dir = sortDescending ? desc : asc;
    const col = (schema.segment as any)[orderBy];
    if (col) query = query.orderBy(dir(col));
  }

  if (size > 0) {
    query = query.limit(size).offset(offset);
  }

  const data = await query;

  let countQuery = (await getDb()).select({ count: count() }).from(schema.segment);
  if (whereClause) countQuery = countQuery.where(whereClause);
  const countResult = await countQuery.get();

  return {
    data,
    count: Number(countResult?.count ?? 0),
    page: +page,
    pageSize: size,
    orderBy,
    search,
  };
}

export async function getWebsiteSegment(websiteId: string, segmentId: string) {
  return (await getDb())
    .select()
    .from(schema.segment)
    .where(
      and(
        eq(schema.segment.segmentId, segmentId),
        eq(schema.segment.websiteId, websiteId),
      ),
    )
    .get();
}

export async function getWebsiteSegments(
  websiteId: string,
  type: string,
  filters?: QueryFilters,
) {
  return getSegments(
    {
      where: {
        websiteId,
        type,
      },
    },
    filters,
  );
}

export async function createSegment(data: Record<string, any>) {
  const { id, ...rest } = data;
  return (await getDb())
    .insert(schema.segment)
    .values({ segmentId: id, ...rest })
    .returning()
    .all()
    .then(r => r[0]);
}

export async function updateSegment(segmentId: string, data: Record<string, any>) {
  return (await getDb())
    .update(schema.segment)
    .set(data)
    .where(eq(schema.segment.segmentId, segmentId))
    .returning()
    .all()
    .then(r => r[0]);
}

export async function deleteSegment(segmentId: string) {
  return (await getDb())
    .delete(schema.segment)
    .where(eq(schema.segment.segmentId, segmentId))
    .returning()
    .all()
    .then(r => r[0]);
}
