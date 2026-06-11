import { eq, and, or, not, asc, desc, count, like, sql, inArray, isNull } from 'drizzle-orm';
import * as schema from '../../../drizzle/schema';
import { getBoolEnv } from '@/lib/env';
import { ROLES } from '@/lib/constants';
import { getRandomChars } from '@/lib/generate';
import prisma from '@/lib/prisma';
import type { QueryFilters, Role } from '@/lib/types';

export interface GetUserOptions {
  includePassword?: boolean;
  showDeleted?: boolean;
}

async function findUser(criteria: { where?: Record<string, any> }, options: GetUserOptions = {}) {
  const { includePassword = false, showDeleted = false } = options;
  const db = prisma.client;
  const conditions: any[] = [];

  if (criteria?.where) {
    for (const [key, value] of Object.entries(criteria.where)) {
      if (key === 'id') {
        conditions.push(eq(schema.user.userId, value));
      } else if (key === 'username') {
        conditions.push(eq(schema.user.username, value));
      } else if (key === 'deletedAt') {
        if (value === null) {
          conditions.push(isNull(schema.user.deletedAt));
        } else {
          conditions.push(eq(schema.user.deletedAt, value));
        }
      }
    }
  }

  if (!showDeleted) {
    conditions.push(isNull(schema.user.deletedAt));
  }

  const result = await db
    .select()
    .from(schema.user)
    .where(and(...conditions))
    .get();

  if (!result) return null;
  if (!includePassword) {
    const { password, ...rest } = result;
    return rest as any;
  }
  return result;
}

export async function getUser(userId: string, options: GetUserOptions = {}) {
  return findUser({ where: { id: userId } }, options);
}

export async function getUserByUsername(username: string, options: GetUserOptions = {}) {
  return findUser({ where: { username } }, options);
}

export async function getUsers(criteria: { where?: Record<string, any> } = {}, filters: QueryFilters = {}) {
  const { search } = filters;
  const db = prisma.client;
  const conditions: any[] = [];

  if (criteria?.where) {
    for (const [key, value] of Object.entries(criteria.where)) {
      if (key === 'id') {
        conditions.push(eq(schema.user.userId, value));
      } else if (key === 'userId') {
        conditions.push(eq(schema.user.userId, value));
      } else if (key === 'username') {
        conditions.push(eq(schema.user.username, value));
      } else if (key === 'role') {
        conditions.push(eq(schema.user.role, value));
      } else if (key === 'deletedAt') {
        if (value === null) {
          conditions.push(isNull(schema.user.deletedAt));
        } else {
          conditions.push(eq(schema.user.deletedAt, value));
        }
      }
    }
  }

  conditions.push(isNull(schema.user.deletedAt));

  if (search) {
    conditions.push(
      or(
        like(schema.user.username, `%${search}%`),
      ),
    );
  }

  const { page = 1, pageSize, orderBy, sortDescending = false } = filters;
  const size = +pageSize || 50;
  const offset = +size * (+page - 1);
  const direction = sortDescending ? desc : asc;
  const orderColumn = orderBy === 'username' ? schema.user.username : schema.user.createdAt;

  const data = await db
    .select()
    .from(schema.user)
    .where(and(...conditions))
    .orderBy(direction(orderColumn))
    .limit(size)
    .offset(offset);

  const count = await db.$count(schema.user, and(...conditions));

  return {
    data,
    count,
    page: +page,
    pageSize: size,
    orderBy,
    search,
  };
}

export async function createUser(data: {
  id: string;
  username: string;
  password: string;
  role: Role;
}) {
  const db = prisma.client;

  return db
    .insert(schema.user)
    .values({
      userId: data.id,
      username: data.username,
      password: data.password,
      role: data.role,
    })
    .returning({
      id: schema.user.userId,
      username: schema.user.username,
      role: schema.user.role,
    })
    .get();
}

export async function updateUser(userId: string, data: Record<string, any>) {
  const db = prisma.client;
  const setValues: Record<string, any> = {};

  if (data.username !== undefined) setValues.username = data.username;
  if (data.password !== undefined) setValues.password = data.password;
  if (data.role !== undefined) setValues.role = data.role;
  if (data.deletedAt !== undefined) setValues.deletedAt = data.deletedAt;

  return db
    .update(schema.user)
    .set(setValues)
    .where(eq(schema.user.userId, userId))
    .returning({
      id: schema.user.userId,
      username: schema.user.username,
      role: schema.user.role,
      createdAt: schema.user.createdAt,
    })
    .get();
}

export async function deleteUser(userId: string) {
  const db = prisma.client;
  const cloudMode = getBoolEnv('CLOUD_MODE');

  const websites = await db
    .select()
    .from(schema.website)
    .where(eq(schema.website.userId, userId));

  const websiteIds = websites.length > 0 ? websites.map(a => a.websiteId) : [];

  const teams = await db
    .select()
    .from(schema.team)
    .innerJoin(schema.teamUser, eq(schema.team.teamId, schema.teamUser.teamId))
    .where(
      and(
        eq(schema.teamUser.userId, userId),
        eq(schema.teamUser.role, ROLES.teamOwner),
      ),
    );

  const teamIds = teams.map(a => a.team.teamId);

  if (cloudMode) {
    return prisma.transaction([
      db
        .update(schema.website)
        .set({ deletedAt: sql`(datetime('now'))` })
        .where(inArray(schema.website.websiteId, websiteIds)),
      db
        .update(schema.user)
        .set({
          username: getRandomChars(32),
          deletedAt: sql`(datetime('now'))`,
        })
        .where(eq(schema.user.userId, userId)),
    ]);
  }

  return prisma.transaction([
    db.delete(schema.eventData).where(inArray(schema.eventData.websiteId, websiteIds)),
    db.delete(schema.sessionData).where(inArray(schema.sessionData.websiteId, websiteIds)),
    db.delete(schema.websiteEvent).where(inArray(schema.websiteEvent.websiteId, websiteIds)),
    db.delete(schema.session).where(inArray(schema.session.websiteId, websiteIds)),
    db.delete(schema.teamUser).where(
      or(
        inArray(schema.teamUser.teamId, teamIds),
        eq(schema.teamUser.userId, userId),
      ),
    ),
    db.delete(schema.team).where(inArray(schema.team.teamId, teamIds)),
    db.delete(schema.report).where(
      or(
        inArray(schema.report.websiteId, websiteIds),
        eq(schema.report.userId, userId),
      ),
    ),
    db.delete(schema.website).where(inArray(schema.website.websiteId, websiteIds)),
    db.delete(schema.user).where(eq(schema.user.userId, userId)),
  ]);
}
