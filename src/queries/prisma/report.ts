import { eq, and, or, not, asc, desc, count, like, sql, inArray, isNull } from 'drizzle-orm';
import * as schema from '../../../drizzle/schema';
import type { QueryFilters } from '@/lib/types';
import { getDrizzleClient } from '@/lib/drizzle-client';

const DEFAULT_PAGE_SIZE = 50;

function getDb() {
  return getDrizzleClient();
}

export async function getReport(reportId: string) {
  return getDb()
    .select()
    .from(schema.report)
    .where(eq(schema.report.reportId, reportId))
    .get();
}

export async function getReports(
  criteria: Record<string, any>,
  filters: QueryFilters = {},
) {
  const { search, page = 1, pageSize, orderBy, sortDescending = false } = filters;
  const size = +pageSize || DEFAULT_PAGE_SIZE;
  const offset = +size * (+page - 1);

  const conditions: any[] = [];

  if (criteria.where) {
    const { userId, websiteId, id, reportId, type } = criteria.where;
    if (userId) conditions.push(eq(schema.report.userId, userId));
    if (websiteId) conditions.push(eq(schema.report.websiteId, websiteId));
    if (id) conditions.push(eq(schema.report.reportId, id));
    if (reportId) conditions.push(eq(schema.report.reportId, reportId));
    if (type) conditions.push(eq(schema.report.type, type));
  }

  if (search) {
    conditions.push(
      or(
        like(schema.report.name, `%${search}%`),
        like(schema.report.description, `%${search}%`),
        like(schema.report.type, `%${search}%`),
      ),
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Handle include: website relation
  const includeWebsite = criteria.include?.website;

  let query;

  if (includeWebsite) {
    query = getDb()
      .select({
        reportId: schema.report.reportId,
        userId: schema.report.userId,
        websiteId: schema.report.websiteId,
        type: schema.report.type,
        name: schema.report.name,
        description: schema.report.description,
        parameters: schema.report.parameters,
        createdAt: schema.report.createdAt,
        updatedAt: schema.report.updatedAt,
        website: {
          domain: schema.website.domain,
          userId: schema.website.userId,
        },
      })
      .from(schema.report)
      .leftJoin(
        schema.website,
        eq(schema.report.websiteId, schema.website.websiteId),
      );
  } else {
    query = getDb().select().from(schema.report);
  }

  if (whereClause) query = query.where(whereClause);

  if (orderBy) {
    const dir = sortDescending ? desc : asc;
    const col = (schema.report as any)[orderBy];
    if (col) query = query.orderBy(dir(col));
  }

  if (size > 0) {
    query = query.limit(size).offset(offset);
  }

  const data = await query;

  let countQuery = getDb().select({ count: count() }).from(schema.report);
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

export async function getUserReports(userId: string, filters?: QueryFilters) {
  return getReports(
    {
      where: {
        userId,
      },
      include: {
        website: {
          select: {
            domain: true,
            userId: true,
          },
        },
      },
    },
    filters,
  );
}

export async function getWebsiteReports(
  websiteId: string,
  filters: QueryFilters = {},
) {
  return getReports(
    {
      where: {
        websiteId,
      },
    },
    filters,
  );
}

export async function createReport(data: Record<string, any>) {
  return getDb()
    .insert(schema.report)
    .values(data)
    .returning()
    .all()
    .then(r => r[0]);
}

export async function updateReport(reportId: string, data: Record<string, any>) {
  return getDb()
    .update(schema.report)
    .set(data)
    .where(eq(schema.report.reportId, reportId))
    .returning()
    .all()
    .then(r => r[0]);
}

export async function deleteReport(reportId: string) {
  return getDb()
    .delete(schema.report)
    .where(eq(schema.report.reportId, reportId))
    .returning()
    .all()
    .then(r => r[0]);
}
