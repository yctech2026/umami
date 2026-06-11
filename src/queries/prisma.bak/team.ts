import type { Prisma, Team } from '@/lib/drizzle-types';
import { getBoolEnv } from '@/lib/env';
import { ROLES } from '@/lib/constants';
import { uuid } from '@/lib/crypto';
import { eq, and, isNull, inArray, sql } from 'drizzle-orm';
import * as schema from '../../../drizzle/schema';
import prisma from '@/lib/db';
import type { PageResult, QueryFilters } from '@/lib/types';

type TeamFindManyArgs = Prisma.TeamFindManyArgs;

export async function findTeam(criteria: Prisma.TeamFindUniqueArgs): Promise<Team> {
  const { id, accessCode } = criteria.where;

  if (accessCode) {
    return prisma.client
      .select()
      .from(schema.team)
      .where(eq(schema.team.accessCode, accessCode))
      .get();
  }

  return prisma.client
    .select()
    .from(schema.team)
    .where(eq(schema.team.teamId, id))
    .get();
}

export async function getTeam(
  teamId: string,
  options: { includeMembers?: boolean } = {},
): Promise<Team> {
  const { includeMembers } = options;

  const team = await prisma.client
    .select()
    .from(schema.team)
    .where(eq(schema.team.teamId, teamId))
    .get();

  if (!team) return null;

  if (includeMembers) {
    (team as any).members = await prisma.client
      .select()
      .from(schema.teamUser)
      .where(eq(schema.teamUser.teamId, teamId));
  }

  return team;
}

export async function getTeams(
  criteria: TeamFindManyArgs,
  filters: QueryFilters,
): Promise<PageResult<Team[]>> {
  const { getSearchParameters } = prisma;
  const { search } = filters;

  const where: Prisma.TeamWhereInput = {
    ...criteria.where,
    ...getSearchParameters(search, [{ name: 'contains' }]),
  };

  return prisma.pagedQuery<TeamFindManyArgs>(
    'team',
    {
      ...criteria,
      where,
    },
    filters,
  );
}

export async function getUserTeams(userId: string, filters: QueryFilters = {}) {
  return getTeams(
    {
      where: {
        deletedAt: null,
        members: {
          some: { userId },
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
              },
            },
          },
        },
        _count: {
          select: {
            websites: {
              where: { deletedAt: null },
            },
            members: {
              where: {
                user: { deletedAt: null },
              },
            },
          },
        },
      },
    },
    filters,
  );
}

export async function getAllUserTeams(userId: string) {
  // Step 1: 查出 user 所属的所有 teamId
  const userTeamRows = await prisma.client
    .select()
    .from(schema.teamUser)
    .where(eq(schema.teamUser.userId, userId));

  const teamIds = userTeamRows.map(r => r.teamId);

  if (teamIds.length === 0) return [];

  // Step 2: 查出这些 team 的详细信息
  return prisma.client
    .select()
    .from(schema.team)
    .where(and(isNull(schema.team.deletedAt), inArray(schema.team.teamId, teamIds)));
}

export async function getTeamOwner(teamId: string) {
  return prisma.client
    .select()
    .from(schema.teamUser)
    .where(and(eq(schema.teamUser.teamId, teamId), eq(schema.teamUser.role, ROLES.teamOwner)))
    .get();
}

export async function createTeam(data: Prisma.TeamCreateInput, userId: string): Promise<any> {
  const { id } = data;

  return prisma.transaction([
    prisma.client.insert(schema.team).values({
      teamId: id,
      name: data.name,
      accessCode: data.accessCode,
      logoUrl: data.logoUrl,
    }),
    prisma.client.insert(schema.teamUser).values({
      teamUserId: uuid(),
      teamId: id,
      userId,
      role: ROLES.teamOwner,
    }),
  ]);
}

export async function updateTeam(teamId: string, data: Prisma.TeamUpdateInput): Promise<Team> {
  return prisma.client
    .update(schema.team)
    .set({
      ...data,
      updatedAt: sql`(datetime('now'))`,
    })
    .where(eq(schema.team.teamId, teamId))
    .returning()
    .all()
    .then(r => r[0]);
}

export async function deleteTeam(teamId: string) {
  const cloudMode = getBoolEnv('CLOUD_MODE');

  if (cloudMode) {
    return prisma.transaction([
      prisma.client
        .update(schema.team)
        .set({ deletedAt: sql`(datetime('now'))` })
        .where(eq(schema.team.teamId, teamId)),
    ]);
  }

  return prisma.transaction([
    prisma.client.delete(schema.teamUser).where(eq(schema.teamUser.teamId, teamId)),
    prisma.client.delete(schema.team).where(eq(schema.team.teamId, teamId)),
  ]);
}
