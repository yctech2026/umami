import { eq, and, or, not, asc, desc, count, like, sql, inArray, isNull } from 'drizzle-orm';
import * as schema from '../../../drizzle/schema';
import { getBoolEnv } from '@/lib/env';
import { ROLES } from '@/lib/constants';
import prisma from '@/lib/prisma';
import type { QueryFilters } from '@/lib/types';

export async function findWebsite(criteria: { where?: Record<string, any> }) {
  const db = prisma.client;
  const conditions: any[] = [];

  if (criteria?.where) {
    for (const [key, value] of Object.entries(criteria.where)) {
      if (key === 'id') {
        conditions.push(eq(schema.website.websiteId, value));
      } else if (key === 'websiteId') {
        conditions.push(eq(schema.website.websiteId, value));
      } else if (key === 'userId') {
        conditions.push(eq(schema.website.userId, value));
      } else if (key === 'teamId') {
        conditions.push(eq(schema.website.teamId, value));
      } else if (key === 'deletedAt') {
        if (value === null) {
          conditions.push(isNull(schema.website.deletedAt));
        } else {
          conditions.push(eq(schema.website.deletedAt, value));
        }
      }
    }
  }

  return db
    .select()
    .from(schema.website)
    .where(and(...conditions))
    .get();
}

export async function getWebsite(websiteId: string) {
  const website = await findWebsite({
    where: {
      id: websiteId,
    },
  });

  if (!website) {
    return null;
  }

  return attachShareIdToWebsite(website);
}

export async function getWebsites(
  criteria: { where?: Record<string, any> } = {},
  filters: QueryFilters,
) {
  const { search } = filters;
  const db = prisma.client;
  const conditions: any[] = [];

  if (criteria?.where) {
    const w = criteria.where as Record<string, any>;
    for (const [key, value] of Object.entries(w)) {
      if (key === 'id') {
        conditions.push(eq(schema.website.websiteId, value));
      } else if (key === 'websiteId') {
        conditions.push(eq(schema.website.websiteId, value));
      } else if (key === 'userId') {
        conditions.push(eq(schema.website.userId, value));
      } else if (key === 'teamId') {
        conditions.push(eq(schema.website.teamId, value));
      } else if (key === 'name') {
        conditions.push(eq(schema.website.name, value));
      } else if (key === 'deletedAt') {
        if (value === null) {
          conditions.push(isNull(schema.website.deletedAt));
        } else {
          conditions.push(eq(schema.website.deletedAt, value));
        }
      } else if (key === 'OR' && Array.isArray(value)) {
        const orConditions: any[] = [];
        for (const orItem of value) {
          orConditions.push(buildWhereCondition(orItem));
        }
        if (orConditions.length > 0) {
          conditions.push(or(...orConditions));
        }
      } else if (key !== 'OR' && typeof value === 'object' && value !== null) {
        // Handle nested relation conditions like { team: { deletedAt: null, members: { some: {...} } } }
        // These are handled separately in calling functions with explicit joins
      }
    }
  }

  conditions.push(isNull(schema.website.deletedAt));

  if (search) {
    conditions.push(
      or(
        like(schema.website.name, `%${search}%`),
        like(schema.website.domain, `%${search}%`),
      ),
    );
  }

  const { page = 1, pageSize, orderBy, sortDescending = false } = filters;
  const size = +pageSize || 50;
  const offset = +size * (+page - 1);
  const direction = sortDescending ? desc : asc;
  const orderColumn = orderBy === 'name' ? schema.website.name : schema.website.createdAt;

  const data = await db
    .select()
    .from(schema.website)
    .where(and(...conditions))
    .orderBy(direction(orderColumn))
    .limit(size)
    .offset(offset);

  const countResult = await db
    .select({ count: count() })
    .from(schema.website)
    .where(and(...conditions))
    .get();

  const result = {
    data,
    count: Number(countResult?.count || 0),
    page: +page,
    pageSize: size,
    orderBy,
    search,
  };

  return attachShareIdToWebsites(result);
}

/**
 * Helper to build a Drizzle where condition from a Prisma-style filter object.
 */
function buildWhereCondition(obj: Record<string, any>): any {
  const conditions: any[] = [];

  for (const [key, value] of Object.entries(obj)) {
    if (key === 'userId') {
      conditions.push(eq(schema.website.userId, value));
    } else if (key === 'teamId') {
      conditions.push(eq(schema.website.teamId, value));
    } else if (key === 'id') {
      conditions.push(eq(schema.website.websiteId, value));
    } else if (key === 'deletedAt') {
      if (value === null) {
        conditions.push(isNull(schema.website.deletedAt));
      } else {
        conditions.push(eq(schema.website.deletedAt, value));
      }
    } else if (key === 'name') {
      conditions.push(eq(schema.website.name, value));
    } else if (key === 'domain') {
      conditions.push(eq(schema.website.domain, value));
    } else if (key === 'OR' && Array.isArray(value)) {
      const orConditions = value.map((item: any) => buildWhereCondition(item));
      conditions.push(or(...orConditions));
    }
  }

  return and(...conditions);
}

export async function getAllUserWebsitesIncludingTeamOwner(
  userId: string,
  filters?: QueryFilters,
) {
  const { search } = filters || {};
  const db = prisma.client;
  const conditions: any[] = [];

  conditions.push(
    or(
      eq(schema.website.userId, userId),
      sql`EXISTS (
        SELECT 1 FROM ${schema.team}
        INNER JOIN ${schema.teamUser} ON ${schema.teamUser.teamId} = ${schema.team.teamId}
        WHERE ${schema.team.teamId} = ${schema.website.teamId}
          AND ${schema.team.deletedAt} IS NULL
          AND ${schema.teamUser.role} = ${ROLES.teamOwner}
          AND ${schema.teamUser.userId} = ${userId}
      )`,
    ),
  );

  conditions.push(isNull(schema.website.deletedAt));

  if (search) {
    conditions.push(
      or(
        like(schema.website.name, `%${search}%`),
        like(schema.website.domain, `%${search}%`),
      ),
    );
  }

  const { page = 1, pageSize, orderBy = 'name', sortDescending = false } = filters || {};
  const size = +pageSize || 50;
  const offset = +size * (+page - 1);
  const direction = sortDescending ? desc : asc;
  const orderColumn = orderBy === 'name' ? schema.website.name : schema.website.createdAt;

  const data = await db
    .selectDistinct()
    .from(schema.website)
    .where(and(...conditions))
    .orderBy(direction(orderColumn))
    .limit(size)
    .offset(offset);

  const countResult = await db
    .select({ count: count() })
    .from(schema.website)
    .where(and(...conditions))
    .get();

  const result = {
    data,
    count: Number(countResult?.count || 0),
    page: +page,
    pageSize: size,
    orderBy,
    search,
  };

  return attachShareIdToWebsites(result);
}

export async function getUserWebsites(userId: string, filters?: QueryFilters) {
  const { search } = filters || {};
  const db = prisma.client;
  const conditions: any[] = [];

  conditions.push(eq(schema.website.userId, userId));
  conditions.push(isNull(schema.website.deletedAt));

  if (search) {
    conditions.push(
      or(
        like(schema.website.name, `%${search}%`),
        like(schema.website.domain, `%${search}%`),
      ),
    );
  }

  const { page = 1, pageSize, orderBy = 'name', sortDescending = false } = filters || {};
  const size = +pageSize || 50;
  const offset = +size * (+page - 1);
  const direction = sortDescending ? desc : asc;
  const orderColumn = orderBy === 'name' ? schema.website.name : schema.website.createdAt;

  const rows = await db
    .select({
      website: schema.website,
      user: {
        id: schema.user.userId,
        username: schema.user.username,
      },
    })
    .from(schema.website)
    .leftJoin(schema.user, eq(schema.website.userId, schema.user.userId))
    .where(and(...conditions))
    .orderBy(direction(orderColumn))
    .limit(size)
    .offset(offset);

  // Flatten join results to match Prisma include format
  const data = rows.map(row => ({
    ...row.website,
    user: row.user,
  }));

  const countResult = await db
    .select({ count: count() })
    .from(schema.website)
    .where(and(...conditions))
    .get();

  const result = {
    data,
    count: Number(countResult?.count || 0),
    page: +page,
    pageSize: size,
    orderBy,
    search,
  };

  return attachShareIdToWebsites(result);
}

export async function getTeamWebsites(teamId: string, filters?: QueryFilters) {
  const { search } = filters || {};
  const db = prisma.client;
  const conditions: any[] = [];

  conditions.push(eq(schema.website.teamId, teamId));
  conditions.push(isNull(schema.website.deletedAt));

  if (search) {
    conditions.push(
      or(
        like(schema.website.name, `%${search}%`),
        like(schema.website.domain, `%${search}%`),
      ),
    );
  }

  const { page = 1, pageSize, orderBy, sortDescending = false } = filters || {};
  const size = +pageSize || 50;
  const offset = +size * (+page - 1);
  const direction = sortDescending ? desc : asc;
  const orderColumn = orderBy === 'name' ? schema.website.name : schema.website.createdAt;

  const rows = await db
    .select({
      website: schema.website,
      createUser: {
        id: schema.user.userId,
        username: schema.user.username,
      },
    })
    .from(schema.website)
    .leftJoin(schema.user, eq(schema.website.createdBy, schema.user.userId))
    .where(and(...conditions))
    .orderBy(direction(orderColumn))
    .limit(size)
    .offset(offset);

  const data = rows.map(row => ({
    ...row.website,
    createUser: row.createUser,
  }));

  const countResult = await db
    .select({ count: count() })
    .from(schema.website)
    .where(and(...conditions))
    .get();

  const result = {
    data,
    count: Number(countResult?.count || 0),
    page: +page,
    pageSize: size,
    orderBy,
    search,
  };

  return attachShareIdToWebsites(result);
}

export async function createWebsite(
  data: Record<string, any>,
) {
  const values: Record<string, any> = {};

  // Map Prisma-style field names to Drizzle schema field names
  if (data.id) values.websiteId = data.id;
  if (data.name !== undefined) values.name = data.name;
  if (data.domain !== undefined) values.domain = data.domain;
  if (data.userId !== undefined) values.userId = data.userId;
  if (data.teamId !== undefined) values.teamId = data.teamId;
  if (data.createdBy !== undefined) values.createdBy = data.createdBy;
  if (data.replayEnabled !== undefined) values.replayEnabled = data.replayEnabled;
  if (data.replayConfig !== undefined) values.replayConfig = data.replayConfig;

  const columns = Object.keys(values);
  const colList = columns.join(', ');
  const paramList = columns.map(c => `{{${c}}}`).join(', ');

  return prisma
    .rawQuery(
      `INSERT INTO website (${colList}) VALUES (${paramList}) RETURNING *`,
      values,
      'createWebsite',
    )
    .then(r => r[0]);
}

export async function updateWebsite(
  websiteId: string,
  data: Record<string, any>,
) {
  const db = prisma.client;
  const setValues: Record<string, any> = {};

  if (data.name !== undefined) setValues.name = data.name;
  if (data.domain !== undefined) setValues.domain = data.domain;
  if (data.userId !== undefined) setValues.userId = data.userId;
  if (data.teamId !== undefined) setValues.teamId = data.teamId;
  if (data.createdBy !== undefined) setValues.createdBy = data.createdBy;
  if (data.resetAt !== undefined) setValues.resetAt = data.resetAt;
  if (data.deletedAt !== undefined) setValues.deletedAt = data.deletedAt;
  if (data.replayEnabled !== undefined) setValues.replayEnabled = data.replayEnabled;
  if (data.replayConfig !== undefined) setValues.replayConfig = data.replayConfig;

  return db
    .update(schema.website)
    .set(setValues)
    .where(eq(schema.website.websiteId, websiteId))
    .returning()
    .all()
    .then(r => r[0]);
}

export async function resetWebsite(websiteId: string) {
  const db = prisma.client;

  return prisma.transaction(
    async (tx: typeof db) => {
      await tx.delete(schema.sessionReplaySaved).where(eq(schema.sessionReplaySaved.websiteId, websiteId)).run();
      await tx.delete(schema.sessionReplay).where(eq(schema.sessionReplay.websiteId, websiteId)).run();
      await tx.delete(schema.revenue).where(eq(schema.revenue.websiteId, websiteId)).run();
      await tx.delete(schema.eventData).where(eq(schema.eventData.websiteId, websiteId)).run();
      await tx.delete(schema.sessionData).where(eq(schema.sessionData.websiteId, websiteId)).run();
      await tx.delete(schema.websiteEvent).where(eq(schema.websiteEvent.websiteId, websiteId)).run();
      await tx.delete(schema.session).where(eq(schema.session.websiteId, websiteId)).run();

      const website = await tx
        .update(schema.website)
        .set({ resetAt: sql`(datetime('now'))` })
        .where(eq(schema.website.websiteId, websiteId))
        .returning()
        .all()
        .then(r => r[0]);

      return website;
    },
    {
      timeout: 30000,
    },
  );
}

export async function deleteWebsite(websiteId: string) {
  const db = prisma.client;
  const cloudMode = getBoolEnv('CLOUD_MODE');

  return prisma.transaction(
    async (tx: typeof db) => {
      await tx.delete(schema.sessionReplaySaved).where(eq(schema.sessionReplaySaved.websiteId, websiteId)).run();
      await tx.delete(schema.sessionReplay).where(eq(schema.sessionReplay.websiteId, websiteId)).run();
      await tx.delete(schema.revenue).where(eq(schema.revenue.websiteId, websiteId)).run();
      await tx.delete(schema.eventData).where(eq(schema.eventData.websiteId, websiteId)).run();
      await tx.delete(schema.sessionData).where(eq(schema.sessionData.websiteId, websiteId)).run();
      await tx.delete(schema.websiteEvent).where(eq(schema.websiteEvent.websiteId, websiteId)).run();
      await tx.delete(schema.session).where(eq(schema.session.websiteId, websiteId)).run();
      await tx.delete(schema.report).where(eq(schema.report.websiteId, websiteId)).run();
      await tx.delete(schema.segment).where(eq(schema.segment.websiteId, websiteId)).run();
      await tx.delete(schema.share).where(eq(schema.share.entityId, websiteId)).run();

      const website = cloudMode
        ? await tx
            .update(schema.website)
            .set({ deletedAt: sql`(datetime('now'))` })
            .where(eq(schema.website.websiteId, websiteId))
            .returning()
            .all()
            .then(r => r[0])
        : await tx
            .delete(schema.website)
            .where(eq(schema.website.websiteId, websiteId))
            .returning()
            .all()
            .then(r => r[0]);

      return website;
    },
    {
      timeout: 30000,
    },
  );
}

export async function getWebsiteCount(userId: string) {
  const db = prisma.client;

  const result = await db
    .select({ count: count() })
    .from(schema.website)
    .where(
      and(
        eq(schema.website.userId, userId),
        isNull(schema.website.deletedAt),
      ),
    )
    .get();

  return Number(result?.count || 0);
}

export async function attachShareIdToWebsite(website: Record<string, any>) {
  const db = prisma.client;

  const share = await db
    .select({
      slug: schema.share.slug,
    })
    .from(schema.share)
    .where(eq(schema.share.entityId, website.id ?? website.websiteId))
    .orderBy(desc(schema.share.createdAt))
    .limit(1)
    .get();

  return {
    ...website,
    shareId: share?.slug ?? null,
  };
}

export async function attachShareIdToWebsites(websites: {
  data: any[];
  count: any;
  page: number;
  pageSize: number;
  orderBy: string;
  search: string;
}) {
  const websiteIds = websites.data.map((website: any) => website.id ?? website.websiteId);

  if (websiteIds.length === 0) {
    return {
      ...websites,
      data: websites.data.map((website: any) => ({ ...website, shareId: null })),
    };
  }

  const db = prisma.client;

  const shares = await db
    .select()
    .from(schema.share)
    .where(inArray(schema.share.entityId, websiteIds))
    .orderBy(desc(schema.share.createdAt));

  // Deduplicate by entityId to match Prisma's `distinct: ['entityId']`
  const seen = new Set<string>();
  const uniqueShares = shares.filter(share => {
    if (seen.has(share.entityId)) return false;
    seen.add(share.entityId);
    return true;
  });

  const shareByWebsiteId = new Map(uniqueShares.map(share => [share.entityId, share.slug]));

  return {
    ...websites,
    data: websites.data.map((website: any) => ({
      ...website,
      shareId: shareByWebsiteId.get(website.id ?? website.websiteId) ?? null,
    })),
  };
}
