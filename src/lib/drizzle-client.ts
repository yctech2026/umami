import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import { drizzle as drizzleLibsql } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from '../../drizzle/schema';

let db: DrizzleD1Database<typeof schema> | null = null;

export function getDrizzleClient(): DrizzleD1Database<typeof schema> {
  // Cloudflare Workers 模式：从全局获取 D1 binding（生产环境）
  if (typeof globalThis !== 'undefined' && (globalThis as any).__D1_DB__) {
    if (!db) {
      db = drizzle((globalThis as any).__D1_DB__, { schema });
    }
    return db;
  }

  // 本地开发模式：使用 libsql SQLite
  try {
    if (!db) {
      const libsql = createClient({ url: 'file:./drizzle/dev.db' });
      db = drizzleLibsql(libsql, { schema }) as any;
    }
    return db;
  } catch (e) {
    throw new Error(`Failed to connect to local database: ${e}`);
  }
}
