import * as schema from '../../drizzle/schema';

// ---------------------------------------------------------------------------
// Entity types – inferred from Drizzle schema (replaces Prisma-generated types)
// ---------------------------------------------------------------------------

export type User = typeof schema.user.$inferSelect;
export type Website = typeof schema.website.$inferSelect;
export type Session = typeof schema.session.$inferSelect;
export type Link = typeof schema.link.$inferSelect;
export type Pixel = typeof schema.pixel.$inferSelect;
export type Team = typeof schema.team.$inferSelect;
export type Board = typeof schema.board.$inferSelect;
export type EventData = typeof schema.eventData.$inferSelect;
export type Report = typeof schema.report.$inferSelect;

// ---------------------------------------------------------------------------
// Query / input types – replaces Prisma client namespace types
// (Used for backward compatibility in the migration phase)
// ---------------------------------------------------------------------------

export namespace Prisma {
  export type TeamFindManyArgs = { where?: any; include?: any; orderBy?: any; skip?: number; take?: number; [key: string]: any };
  export type TeamFindUniqueArgs = { where: { id?: string; accessCode?: string; [key: string]: any }; [key: string]: any };
  export type TeamWhereInput = Record<string, any>;
  export type TeamCreateInput = { id: string; name: string; accessCode?: string; logoUrl?: string; [key: string]: any };
  export type TeamUpdateInput = Record<string, any>;

  export type TeamUserFindManyArgs = { where?: any; include?: any; orderBy?: any; skip?: number; take?: number; [key: string]: any };
  export type TeamUserFindUniqueArgs = { where: { id: string }; [key: string]: any };
  export type TeamUserWhereInput = Record<string, any>;
  export type TeamUserUpdateInput = Record<string, any>;

  export type SessionCreateInput = Record<string, any>;
}
