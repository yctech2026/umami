import { eq, and, isNull, desc } from 'drizzle-orm';
import * as schema from '../../../drizzle/schema';
import prisma from '@/lib/db';

const db = prisma.client;

export async function getApiKeys(userId: string) {
  return db
    .select()
    .from(schema.apiKey)
    .where(and(eq(schema.apiKey.userId, userId), isNull(schema.apiKey.deletedAt)))
    .orderBy(desc(schema.apiKey.createdAt));
}

export async function getApiKey(keyHash: string) {
  return db
    .select()
    .from(schema.apiKey)
    .where(
      and(
        eq(schema.apiKey.keyHash, keyHash),
        eq(schema.apiKey.isActive, true),
        isNull(schema.apiKey.deletedAt),
      ),
    )
    .limit(1)
    .then(rows => rows[0] || null);
}

export async function getApiKeyById(apiKeyId: string, userId: string) {
  return db
    .select()
    .from(schema.apiKey)
    .where(
      and(
        eq(schema.apiKey.apiKeyId, apiKeyId),
        eq(schema.apiKey.userId, userId),
        isNull(schema.apiKey.deletedAt),
      ),
    )
    .limit(1)
    .then(rows => rows[0] || null);
}

export async function createApiKey(data: any) {
  return db
    .insert(schema.apiKey)
    .values(data)
    .returning()
    .all()
    .then(rows => rows[0]);
}

export async function deleteApiKey(apiKeyId: string, userId: string) {
  return db
    .update(schema.apiKey)
    .set({ deletedAt: new Date().toISOString() })
    .where(and(eq(schema.apiKey.apiKeyId, apiKeyId), eq(schema.apiKey.userId, userId)))
    .returning()
    .all()
    .then(rows => rows[0] || null);
}
