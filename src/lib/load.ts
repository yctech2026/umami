import type { Session, Website } from '@/lib/drizzle-types';
import { getWebsite } from '@/queries/drizzle';
import { getWebsiteSession } from '@/queries/sql';

export async function fetchWebsite(websiteId: string): Promise<Website> {
  const website = (await getWebsite(websiteId)) as unknown as Website;

  if (!website || website.deletedAt) {
    return null;
  }

  return website;
}

export async function fetchSession(websiteId: string, sessionId: string): Promise<Session> {
  const session = await getWebsiteSession(websiteId, sessionId);

  if (!session) {
    return null;
  }

  return session;
}

export async function fetchAccount(_userId: string) {
  return null;
}

export async function fetchTeam(_teamId: string) {
  return null;
}
