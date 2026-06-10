import { eq, and, or, like, count } from 'drizzle-orm';
import * as schema from '../../../drizzle/schema';
import prisma from '@/lib/prisma';
import type { QueryFilters } from '@/lib/types';

const db = prisma.client;

export async function findPixel(criteria: { where?: { id?: string; slug?: string } }) {
  const { where } = criteria;
  if (!where) return null;

  const conditions: any[] = [];
  if (where.id) conditions.push(eq(schema.pixel.pixelId, where.id));
  if (where.slug) conditions.push(eq(schema.pixel.slug, where.slug));

  return db.select().from(schema.pixel).where(and(...conditions)).get();
}

export async function getPixel(pixelId: string) {
  return findPixel({
    where: {
      id: pixelId,
    },
  });
}

export async function getPixels(criteria: any, filters: QueryFilters = {}) {
  const { search } = filters;

  const conditions: any[] = [];

  if (criteria?.where) {
    if (criteria.where.userId) conditions.push(eq(schema.pixel.userId, criteria.where.userId));
    if (criteria.where.teamId) conditions.push(eq(schema.pixel.teamId, criteria.where.teamId));
  }

  if (search) {
    conditions.push(
      or(
        like(schema.pixel.name, `%${search}%`),
        like(schema.pixel.slug, `%${search}%`),
      ),
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  return prisma.pagedQuery('pixel', { ...criteria, where }, filters);
}

export async function getUserPixels(userId: string, filters?: QueryFilters) {
  return getPixels(
    {
      where: {
        userId,
      },
    },
    filters,
  );
}

export async function getTeamPixels(teamId: string, filters?: QueryFilters) {
  return getPixels(
    {
      where: {
        teamId,
      },
    },
    filters,
  );
}

export async function createPixel(data: any) {
  return db.insert(schema.pixel).values(data).returning().all().then(r => r[0]);
}

export async function updatePixel(pixelId: string, data: any) {
  return db
    .update(schema.pixel)
    .set(data)
    .where(eq(schema.pixel.pixelId, pixelId))
    .returning()
    .get();
}

export async function deletePixel(pixelId: string) {
  return db
    .delete(schema.pixel)
    .where(eq(schema.pixel.pixelId, pixelId))
    .returning()
    .get();
}
