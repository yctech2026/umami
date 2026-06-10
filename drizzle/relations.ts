import { relations } from 'drizzle-orm';
import * as schema from './schema';

// ---------------------------------------------------------------------------
// User relations
// ---------------------------------------------------------------------------
export const userRelations = relations(schema.user, ({ many, one }) => ({
  websites: many(schema.website, { relationName: 'user' }),
  createdWebsites: many(schema.website, { relationName: 'createUser' }),
  links: many(schema.link, { relationName: 'user' }),
  pixels: many(schema.pixel, { relationName: 'user' }),
  teams: many(schema.teamUser),
  reports: many(schema.report),
  boards: many(schema.board, { relationName: 'user' }),
}));

// ---------------------------------------------------------------------------
// Session relations
// ---------------------------------------------------------------------------
export const sessionRelations = relations(schema.session, ({ many, one }) => ({
  websiteEvents: many(schema.websiteEvent),
  sessionData: many(schema.sessionData),
  revenue: many(schema.revenue),
}));

// ---------------------------------------------------------------------------
// Website relations
// ---------------------------------------------------------------------------
export const websiteRelations = relations(schema.website, ({ many, one }) => ({
  user: one(schema.user, {
    fields: [schema.website.userId],
    references: [schema.user.userId],
    relationName: 'user',
  }),
  createUser: one(schema.user, {
    fields: [schema.website.createdBy],
    references: [schema.user.userId],
    relationName: 'createUser',
  }),
  team: one(schema.team, {
    fields: [schema.website.teamId],
    references: [schema.team.teamId],
  }),
  eventData: many(schema.eventData),
  reports: many(schema.report),
  revenue: many(schema.revenue),
  segments: many(schema.segment),
  sessionData: many(schema.sessionData),
  sessionReplays: many(schema.sessionReplay),
  sessionReplaysSaved: many(schema.sessionReplaySaved),
}));

// ---------------------------------------------------------------------------
// WebsiteEvent relations
// ---------------------------------------------------------------------------
export const websiteEventRelations = relations(schema.websiteEvent, ({ many, one }) => ({
  eventData: many(schema.eventData),
  session: one(schema.session, {
    fields: [schema.websiteEvent.sessionId],
    references: [schema.session.sessionId],
  }),
}));

// ---------------------------------------------------------------------------
// EventData relations
// ---------------------------------------------------------------------------
export const eventDataRelations = relations(schema.eventData, ({ one }) => ({
  website: one(schema.website, {
    fields: [schema.eventData.websiteId],
    references: [schema.website.websiteId],
  }),
  websiteEvent: one(schema.websiteEvent, {
    fields: [schema.eventData.websiteEventId],
    references: [schema.websiteEvent.eventId],
  }),
}));

// ---------------------------------------------------------------------------
// SessionData relations
// ---------------------------------------------------------------------------
export const sessionDataRelations = relations(schema.sessionData, ({ one }) => ({
  website: one(schema.website, {
    fields: [schema.sessionData.websiteId],
    references: [schema.website.websiteId],
  }),
  session: one(schema.session, {
    fields: [schema.sessionData.sessionId],
    references: [schema.session.sessionId],
  }),
}));

// ---------------------------------------------------------------------------
// Team relations
// ---------------------------------------------------------------------------
export const teamRelations = relations(schema.team, ({ many }) => ({
  websites: many(schema.website),
  members: many(schema.teamUser),
  links: many(schema.link),
  pixels: many(schema.pixel),
  boards: many(schema.board),
}));

// ---------------------------------------------------------------------------
// TeamUser relations
// ---------------------------------------------------------------------------
export const teamUserRelations = relations(schema.teamUser, ({ one }) => ({
  team: one(schema.team, {
    fields: [schema.teamUser.teamId],
    references: [schema.team.teamId],
  }),
  user: one(schema.user, {
    fields: [schema.teamUser.userId],
    references: [schema.user.userId],
  }),
}));

// ---------------------------------------------------------------------------
// Report relations
// ---------------------------------------------------------------------------
export const reportRelations = relations(schema.report, ({ one }) => ({
  user: one(schema.user, {
    fields: [schema.report.userId],
    references: [schema.user.userId],
  }),
  website: one(schema.website, {
    fields: [schema.report.websiteId],
    references: [schema.website.websiteId],
  }),
}));

// ---------------------------------------------------------------------------
// Segment relations
// ---------------------------------------------------------------------------
export const segmentRelations = relations(schema.segment, ({ one }) => ({
  website: one(schema.website, {
    fields: [schema.segment.websiteId],
    references: [schema.website.websiteId],
  }),
}));

// ---------------------------------------------------------------------------
// Revenue relations
// ---------------------------------------------------------------------------
export const revenueRelations = relations(schema.revenue, ({ one }) => ({
  website: one(schema.website, {
    fields: [schema.revenue.websiteId],
    references: [schema.website.websiteId],
  }),
  session: one(schema.session, {
    fields: [schema.revenue.sessionId],
    references: [schema.session.sessionId],
  }),
}));

// ---------------------------------------------------------------------------
// Link relations
// ---------------------------------------------------------------------------
export const linkRelations = relations(schema.link, ({ one }) => ({
  user: one(schema.user, {
    fields: [schema.link.userId],
    references: [schema.user.userId],
    relationName: 'user',
  }),
  team: one(schema.team, {
    fields: [schema.link.teamId],
    references: [schema.team.teamId],
  }),
}));

// ---------------------------------------------------------------------------
// Pixel relations
// ---------------------------------------------------------------------------
export const pixelRelations = relations(schema.pixel, ({ one }) => ({
  user: one(schema.user, {
    fields: [schema.pixel.userId],
    references: [schema.user.userId],
    relationName: 'user',
  }),
  team: one(schema.team, {
    fields: [schema.pixel.teamId],
    references: [schema.team.teamId],
  }),
}));

// ---------------------------------------------------------------------------
// Board relations
// ---------------------------------------------------------------------------
export const boardRelations = relations(schema.board, ({ one }) => ({
  user: one(schema.user, {
    fields: [schema.board.userId],
    references: [schema.user.userId],
    relationName: 'user',
  }),
  team: one(schema.team, {
    fields: [schema.board.teamId],
    references: [schema.team.teamId],
  }),
}));

// ---------------------------------------------------------------------------
// SessionReplay relations
// ---------------------------------------------------------------------------
export const sessionReplayRelations = relations(schema.sessionReplay, ({ one }) => ({
  website: one(schema.website, {
    fields: [schema.sessionReplay.websiteId],
    references: [schema.website.websiteId],
  }),
}));

// ---------------------------------------------------------------------------
// SessionReplaySaved relations
// ---------------------------------------------------------------------------
export const sessionReplaySavedRelations = relations(schema.sessionReplaySaved, ({ one }) => ({
  website: one(schema.website, {
    fields: [schema.sessionReplaySaved.websiteId],
    references: [schema.website.websiteId],
  }),
}));
