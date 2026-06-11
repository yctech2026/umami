import { eq, and, or, not, asc, desc, count, like, sql, inArray, isNull } from 'drizzle-orm';
import * as schema from '../../../drizzle/schema';
import { BOARD_TYPES } from '@/lib/boards';
import type { QueryFilters } from '@/lib/types';
import { getDrizzleClient } from '@/lib/drizzle-client';
const DEFAULT_PAGE_SIZE = 50;

let _db: any;

async function getDb(): Promise<any> {
  if (!_db) _db = await getDrizzleClient();
  return _db;
}

export async function findBoard(criteria: Record<string, any>) {
  const conditions: any[] = [];

  if (criteria.where?.id) {
    conditions.push(eq(schema.board.boardId, criteria.where.id));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  let query = (await getDb()).select().from(schema.board);
  if (whereClause) query = query.where(whereClause);

  return query.get();
}

export async function getBoard(boardId: string) {
  return (await getDb())
    .select()
    .from(schema.board)
    .where(eq(schema.board.boardId, boardId))
    .get();
}

export async function getBoards(
  criteria: Record<string, any>,
  filters: QueryFilters = {},
) {
  const { search, page = 1, pageSize, orderBy, sortDescending = false } = filters;
  const size = +pageSize || DEFAULT_PAGE_SIZE;
  const offset = +size * (+page - 1);

  const conditions: any[] = [];

  if (criteria.where) {
    const { userId, teamId, type } = criteria.where;
    if (userId) conditions.push(eq(schema.board.userId, userId));
    if (teamId) conditions.push(eq(schema.board.teamId, teamId));
    if (type?.not) {
      conditions.push(not(eq(schema.board.type, type.not)));
    }
  }

  if (search) {
    conditions.push(
      or(
        like(schema.board.name, `%${search}%`),
        like(schema.board.description, `%${search}%`),
      ),
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  let query = (await getDb()).select().from(schema.board);
  if (whereClause) query = query.where(whereClause);

  if (orderBy) {
    const dir = sortDescending ? desc : asc;
    const col = (schema.board as any)[orderBy];
    if (col) query = query.orderBy(dir(col));
  }

  if (size > 0) {
    query = query.limit(size).offset(offset);
  }

  const data = await query;

  let countQuery = (await getDb()).select({ count: count() }).from(schema.board);
  if (whereClause) countQuery = countQuery.where(whereClause);
  const countResult = await countQuery.get();

  return {
    data,
    count: Number(countResult?.count ?? 0),
    page: +page,
    pageSize: size,
    orderBy,
    search,
  };
}

export async function getUserBoards(userId: string, filters?: QueryFilters) {
  return getBoards(
    {
      where: {
        userId,
        type: {
          not: BOARD_TYPES.dashboard,
        },
      },
    },
    filters,
  );
}

export async function getTeamBoards(teamId: string, filters?: QueryFilters) {
  return getBoards(
    {
      where: {
        teamId,
        type: {
          not: BOARD_TYPES.dashboard,
        },
      },
    },
    filters,
  );
}

export async function createBoard(data: Record<string, any>) {
  return (await getDb())
    .insert(schema.board)
    .values(data)
    .returning()
    .all()
    .then(r => r[0]);
}

export async function updateBoard(boardId: string, data: Record<string, any>) {
  return (await getDb())
    .update(schema.board)
    .set(data)
    .where(eq(schema.board.boardId, boardId))
    .returning()
    .all()
    .then(r => r[0]);
}

export async function deleteBoard(boardId: string) {
  return (await getDb())
    .delete(schema.board)
    .where(eq(schema.board.boardId, boardId))
    .returning()
    .all()
    .then(r => r[0]);
}
