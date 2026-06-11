import { hasPermission } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/constants';
import type { Auth } from '@/lib/types';
import { getLink, getTeamUser } from '@/queries/drizzle';

export async function canViewLink({ user, shareToken }: Auth, linkId: string) {
  if (user?.isAdmin) {
    return true;
  }

  if (shareToken?.linkId === linkId || shareToken?.websiteId === linkId || shareToken?.linkIds?.includes(linkId)) {
    return true;
  }

  if (!user) {
    return false;
  }

  const link = await getLink(linkId);

  if (link.userId) {
    return user.userId === link.userId;
  }

  if (link.teamId) {
    const teamUser = await getTeamUser(link.teamId, user.userId);

    return !!teamUser;
  }

  return false;
}

export async function canUpdateLink({ user }: Auth, linkId: string) {
  if (!user) {
    return false;
  }

  if (user.isAdmin) {
    return true;
  }

  const link = await getLink(linkId);

  if (link.userId) {
    return user.userId === link.userId;
  }

  if (link.teamId) {
    const teamUser = await getTeamUser(link.teamId, user.userId);

    return teamUser && hasPermission(teamUser.role, PERMISSIONS.websiteUpdate);
  }

  return false;
}

export async function canDeleteLink({ user }: Auth, linkId: string) {
  if (!user) {
    return false;
  }

  if (user.isAdmin) {
    return true;
  }

  const link = await getLink(linkId);

  if (link.userId) {
    return user.userId === link.userId;
  }

  if (link.teamId) {
    const teamUser = await getTeamUser(link.teamId, user.userId);

    return teamUser && hasPermission(teamUser.role, PERMISSIONS.websiteDelete);
  }

  return false;
}
