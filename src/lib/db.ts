export const D1 = 'd1';
export const CLICKHOUSE = 'clickhouse';
export const PRISMA = 'prisma';

// Fixes issue with converting bigint values
(BigInt.prototype as any).toJSON = function () {
  return Number(this);
};

export function getDatabaseType() {
  return D1;
}

export async function runQuery(queries: any) {
  const db = getDatabaseType();

  if (db === D1) {
    return queries[D1]?.();
  }

  // clickhouse / fallback
  if (queries[db]) {
    return queries[db]();
  }

  throw new Error(`Unknown database type: ${db}`);
}

export function notImplemented() {
  throw new Error('Not implemented.');
}
