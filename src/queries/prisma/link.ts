import { eq, and, or, not, asc, desc, count, like, sql, inArray, isNull } from 'drizzle-orm';
import * as schema from '../../../drizzle/schema';
import type { QueryFilters } from '@/lib/types';
import { getDrizzleClient } from '@/lib/drizzle-client';
const DEFAULT_PAGE_SIZE = 50;

let _db: any;

async function getDb(): Promise<any> {
  if (!_db) _db = await getDrizzleClient();
  return _db;
}

export async function findLink(criteria: Record<string, any>) {
  const conditions: any[] = [];

  if (criteria.where?.id) {
    conditions.push(eq(schema.link.linkId, criteria.where.id));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  let query = (await getDb()).select().from(schema.link);
  if (whereClause) query = query.where(whereClause);

  return query.get();
}

export async function getLink(linkId: string) {
  return (await getDb())
    .select()
    .from(schema.link)
    .where(eq(schema.link.linkId, linkId))
    .get();
}

export async function getLinks(
  criteria: Record<string, any>,
  filters: QueryFilters = {},
) {
  const { search, page = 1, pageSize, orderBy, sortDescending = false } = filters;
  const size = +pageSize || DEFAULT_PAGE_SIZE;
  const offset = +size * (+page - 1);

  const conditions: any[] = [];

  if (criteria.where) {
    const { userId, teamId, deletedAt } = criteria.where;
    if (userId) conditions.push(eq(schema.link.userId, userId));
    if (teamId) conditions.push(eq(schema.link.teamId, teamId));
    if (deletedAt === null) conditions.push(isNull(schema.link.deletedAt));
  }

  if (search) {
    conditions.push(
      or(
        like(schema.link.name, `%${search}%`),
        like(schema.link.url, `%${search}%`),
        like(schema.link.slug, `%${search}%`),
      ),
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  let query = (await getDb()).select().from(schema.link);
  if (whereClause) query = query.where(whereClause);

  if (orderBy) {
    const dir = sortDescending ? desc : asc;
    const col = (schema.link as any)[orderBy];
    if (col) query = query.orderBy(dir(col));
  }

  if (size > 0) {
    query = query.limit(size).offset(offset);
  }

  const data = await query;

  let countQuery = (await getDb()).select({ count: count() }).from(schema.link);
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

export async function getUserLinks(userId: string, filters?: QueryFilters) {
  return getLinks(
    {
      where: {
        userId,
        deletedAt: null,
      },
    },
    filters,
  );
}

export async function getTeamLinks(teamId: string, filters?: QueryFilters) {
  return getLinks(
    {
      where: {
        teamId,
      },
    },
    filters,
  );
}

export async function createLink(data: Record<string, any>) {
  return (await getDb())
    .insert(schema.link)
    .values(data)
    .returning()
    .all()
    .then(r => r[0]);
}

export async function updateLink(linkId: string, data: Record<string, any>) {
  return (await getDb())
    .update(schema.link)
    .set(data)
    .where(eq(schema.link.linkId, linkId))
    .returning()
    .all()
    .then(r => r[0]);
}

export async function deleteLink(linkId: string) {
  return (await getDb())
    .delete(schema.link)
    .where(eq(schema.link.linkId, linkId))
    .returning()
    .all()
    .then(r => r[0]);
}
