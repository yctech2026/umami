import type { Prisma } from '@/lib/drizzle-types';
import { uuid } from '@/lib/crypto';
import { eq, and } from 'drizzle-orm';
import * as schema from '../../../drizzle/schema';
import prisma from '@/lib/prisma';
import type { QueryFilters } from '@/lib/types';

type TeamUserFindManyArgs = Prisma.TeamUserFindManyArgs;

export async function findTeamUser(criteria: Prisma.TeamUserFindUniqueArgs) {
  return prisma.client
    .select()
    .from(schema.teamUser)
    .where(eq(schema.teamUser.teamUserId, criteria.where.id))
    .get();
}

export async function getTeamUser(teamId: string, userId: string) {
  return prisma.client
    .select()
    .from(schema.teamUser)
    .where(and(eq(schema.teamUser.teamId, teamId), eq(schema.teamUser.userId, userId)))
    .get();
}

export async function getTeamUsers(criteria: TeamUserFindManyArgs, filters?: QueryFilters) {
  const { search } = filters;

  const where: Prisma.TeamUserWhereInput = {
    ...criteria.where,
    ...prisma.getSearchParameters(search, [{ user: { username: 'contains' } }]),
  };

  return prisma.pagedQuery(
    'teamUser',
    {
      ...criteria,
      where,
    },
    filters,
  );
}

export async function createTeamUser(userId: string, teamId: string, role: string) {
  return prisma.client
    .insert(schema.teamUser)
    .values({
      teamUserId: uuid(),
      userId,
      teamId,
      role,
    })
    .returning()
    .all()
    .then(r => r[0]);
}

export async function updateTeamUser(teamUserId: string, data: Prisma.TeamUserUpdateInput) {
  return prisma.client
    .update(schema.teamUser)
    .set(data)
    .where(eq(schema.teamUser.teamUserId, teamUserId))
    .returning()
    .all()
    .then(r => r[0]);
}

export async function deleteTeamUser(teamId: string, userId: string) {
  return prisma.client
    .delete(schema.teamUser)
    .where(and(eq(schema.teamUser.teamId, teamId), eq(schema.teamUser.userId, userId)))
    .run();
}
