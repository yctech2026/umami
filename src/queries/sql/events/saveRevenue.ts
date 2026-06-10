import { uuid } from '@/lib/crypto';
import { eq, and } from 'drizzle-orm';
import * as schema from '../../../../drizzle/schema';
import { PRISMA, runQuery } from '@/lib/db';
import prisma from '@/lib/prisma';

const db = prisma.client;

export interface SaveRevenueArgs {
  websiteId: string;
  sessionId: string;
  eventId: string;
  eventName: string;
  currency: string;
  revenue: number;
  createdAt: Date;
}

export async function saveRevenue(data: SaveRevenueArgs) {
  return runQuery({
    [PRISMA]: () => relationalQuery(data),
  });
}

async function relationalQuery(data: SaveRevenueArgs) {
  const { websiteId, sessionId, eventId, eventName, currency, revenue, createdAt } = data;

  return db
    .insert(schema.revenue)
    .values({
      id: uuid(),
      websiteId,
      sessionId,
      eventId,
      eventName,
      currency,
      revenue,
      createdAt,
    })
    .returning()
    .all()
    .then(r => r[0]);
}
