import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle as drizzleD1 } from "drizzle-orm/d1";
import { drizzle as drizzleLibsql } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "@/drizzle/schema";

export type DrizzleClient = ReturnType<typeof drizzleD1> | ReturnType<typeof drizzleLibsql>;

let cachedClient: DrizzleClient | null = null;
let cachedRawDB: any = null;  // raw D1 binding or D1-compatible wrapper

function isWorkerdRuntime(): boolean {
  return typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";
}

function createD1WrapperFromLibsql(libsqlClient: any): any {
  const stmts = new Map<string, any>();
  return {
    prepare: (sql: string) => {
      if (!stmts.has(sql)) stmts.set(sql, { sql });
      const entry = stmts.get(sql);
      return {
        bind: (...params: any[]) => {
          entry.params = params;
          return entry;
        },
        all: async () => {
          const res = await libsqlClient.execute({ sql: entry.sql, args: entry.params || [] });
          return { results: res.rows, success: true };
        },
        first: async () => {
          const res = await libsqlClient.execute({ sql: entry.sql, args: entry.params || [] });
          return res.rows[0] || null;
        },
        run: async () => {
          const res = await libsqlClient.execute({ sql: entry.sql, args: entry.params || [] });
          return { success: true, meta: { changes: 0, duration: 0 } };
        },
      };
    },
    batch: async (statements: any[]) => {
      // simple serial execution
      const results = [];
      for (const stmt of statements) {
        if (stmt.params) {
          const res = await libsqlClient.execute({ sql: stmt.sql, args: stmt.params });
          results.push({ results: res.rows, success: true });
        }
      }
      return results;
    },
  };
}

export async function getDrizzleClient(): Promise<DrizzleClient> {
  if (cachedClient) return cachedClient;
  const raw = await getRawDB();
  // Infer which drizzle driver to use based on the raw binding type
  if (typeof raw?.prepare === 'function' && raw?.constructor?.name !== 'Object') {
    // D1 binding
    cachedClient = drizzleD1(raw, { schema });
  } else {
    // libsql client
    cachedClient = drizzleLibsql(raw, { schema });
  }
  return cachedClient!;
}

export async function getRawDB(): Promise<any> {
  if (cachedRawDB) return cachedRawDB;

  // 1) 生产环境：通过 getCloudflareContext 获取 D1 binding
  try {
    const cloudflareContext = getCloudflareContext({ async: false });
    if ((cloudflareContext.env as any)?.DB) {
      cachedRawDB = (cloudflareContext.env as any).DB;
      console.log("[drizzle] Using D1 via getCloudflareContext");
      return cachedRawDB;
    }
  } catch {
    // 开发环境不可用
  }

  // 2) 备用：globalThis.__D1_DB__ (wrangler dev)
  if (typeof globalThis.__D1_DB__ !== "undefined") {
    cachedRawDB = globalThis.__D1_DB__;
    console.log("[drizzle] Using D1 via __D1_DB__");
    return cachedRawDB;
  }

  // 3) 本地开发：libsql SQLite
  if (!isWorkerdRuntime()) {
    const libsql = createClient({ url: "file:./drizzle/dev.db" });
    cachedRawDB = createD1WrapperFromLibsql(libsql);
    console.log("[drizzle] Using libsql SQLite (local dev)");
    return cachedRawDB;
  }

  throw new Error("[drizzle] No database backend available on workerd runtime");
}

export async function getD1Binding(): Promise<any> {
  return getRawDB();
}
