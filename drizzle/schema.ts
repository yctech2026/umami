import { sqliteTable, text, integer, real, blob, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------
export const user = sqliteTable('user', {
  userId: text('user_id').primaryKey(),
  username: text('username').notNull().unique(),
  password: text('password').notNull(),
  role: text('role').notNull(),
  logoUrl: text('logo_url'),
  displayName: text('display_name'),
  createdAt: text('created_at').$defaultFn(() => sql`(datetime('now'))`),
  updatedAt: text('updated_at'),
  deletedAt: text('deleted_at'),
});

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------
export const session = sqliteTable('session', {
  sessionId: text('session_id').primaryKey(),
  websiteId: text('website_id').notNull(),
  browser: text('browser'),
  os: text('os'),
  device: text('device'),
  screen: text('screen'),
  language: text('language'),
  country: text('country'),
  region: text('region'),
  city: text('city'),
  distinctId: text('distinct_id'),
  createdAt: text('created_at').$defaultFn(() => sql`(datetime('now'))`),
}, (table) => [
  index('session_created_at_idx').on(table.createdAt),
  index('session_website_id_idx').on(table.websiteId),
  index('session_website_id_created_at_idx').on(table.websiteId, table.createdAt),
  index('session_website_id_created_at_browser_idx').on(table.websiteId, table.createdAt, table.browser),
  index('session_website_id_created_at_os_idx').on(table.websiteId, table.createdAt, table.os),
  index('session_website_id_created_at_device_idx').on(table.websiteId, table.createdAt, table.device),
  index('session_website_id_created_at_screen_idx').on(table.websiteId, table.createdAt, table.screen),
  index('session_website_id_created_at_language_idx').on(table.websiteId, table.createdAt, table.language),
  index('session_website_id_created_at_country_idx').on(table.websiteId, table.createdAt, table.country),
  index('session_website_id_created_at_region_idx').on(table.websiteId, table.createdAt, table.region),
  index('session_website_id_created_at_city_idx').on(table.websiteId, table.createdAt, table.city),
]);

// ---------------------------------------------------------------------------
// Website
// ---------------------------------------------------------------------------
export const website = sqliteTable('website', {
  websiteId: text('website_id').primaryKey(),
  name: text('name').notNull(),
  domain: text('domain'),
  resetAt: text('reset_at'),
  userId: text('user_id'),
  teamId: text('team_id'),
  createdBy: text('created_by'),
  createdAt: text('created_at').$defaultFn(() => sql`(datetime('now'))`),
  updatedAt: text('updated_at'),
  deletedAt: text('deleted_at'),
  replayEnabled: integer('replay_enabled', { mode: 'boolean' }).notNull().$defaultFn(() => false),
  replayConfig: text('replay_config', { mode: 'json' }),
}, (table) => [
  index('website_user_id_idx').on(table.userId),
  index('website_team_id_idx').on(table.teamId),
  index('website_created_at_idx').on(table.createdAt),
  index('website_created_by_idx').on(table.createdBy),
]);

// ---------------------------------------------------------------------------
// WebsiteEvent
// ---------------------------------------------------------------------------
export const websiteEvent = sqliteTable('website_event', {
  eventId: text('event_id').primaryKey(),
  websiteId: text('website_id').notNull(),
  sessionId: text('session_id').notNull(),
  visitId: text('visit_id').notNull(),
  createdAt: text('created_at').$defaultFn(() => sql`(datetime('now'))`),
  urlPath: text('url_path').notNull(),
  urlQuery: text('url_query'),
  utmSource: text('utm_source'),
  utmMedium: text('utm_medium'),
  utmCampaign: text('utm_campaign'),
  utmContent: text('utm_content'),
  utmTerm: text('utm_term'),
  referrerPath: text('referrer_path'),
  referrerQuery: text('referrer_query'),
  referrerDomain: text('referrer_domain'),
  pageTitle: text('page_title'),
  gclid: text('gclid'),
  fbclid: text('fbclid'),
  msclkid: text('msclkid'),
  ttclid: text('ttclid'),
  liFatId: text('li_fat_id'),
  twclid: text('twclid'),
  eventType: integer('event_type').notNull().$defaultFn(() => 1),
  eventName: text('event_name'),
  tag: text('tag'),
  hostname: text('hostname'),
  lcp: real('lcp'),
  inp: real('inp'),
  cls: real('cls'),
  fcp: real('fcp'),
  ttfb: real('ttfb'),
}, (table) => [
  index('website_event_created_at_idx').on(table.createdAt),
  index('website_event_session_id_idx').on(table.sessionId),
  index('website_event_visit_id_idx').on(table.visitId),
  index('website_event_website_id_idx').on(table.websiteId),
  index('website_event_website_id_created_at_idx').on(table.websiteId, table.createdAt),
  index('website_event_website_id_created_at_url_path_idx').on(table.websiteId, table.createdAt, table.urlPath),
  index('website_event_website_id_created_at_url_query_idx').on(table.websiteId, table.createdAt, table.urlQuery),
  index('website_event_website_id_created_at_referrer_domain_idx').on(table.websiteId, table.createdAt, table.referrerDomain),
  index('website_event_website_id_created_at_page_title_idx').on(table.websiteId, table.createdAt, table.pageTitle),
  index('website_event_website_id_created_at_event_name_idx').on(table.websiteId, table.createdAt, table.eventName),
  index('website_event_website_id_created_at_tag_idx').on(table.websiteId, table.createdAt, table.tag),
  index('website_event_website_id_session_id_created_at_idx').on(table.websiteId, table.sessionId, table.createdAt),
  index('website_event_website_id_visit_id_created_at_idx').on(table.websiteId, table.visitId, table.createdAt),
  index('website_event_website_id_created_at_hostname_idx').on(table.websiteId, table.createdAt, table.hostname),
]);

// ---------------------------------------------------------------------------
// EventData
// ---------------------------------------------------------------------------
export const eventData = sqliteTable('event_data', {
  eventDataId: text('event_data_id').primaryKey(),
  websiteId: text('website_id').notNull(),
  websiteEventId: text('website_event_id').notNull(),
  dataKey: text('data_key').notNull(),
  stringValue: text('string_value'),
  numberValue: real('number_value'),
  dateValue: text('date_value'),
  dataType: integer('data_type').notNull(),
  createdAt: text('created_at').$defaultFn(() => sql`(datetime('now'))`),
}, (table) => [
  index('event_data_created_at_idx').on(table.createdAt),
  index('event_data_website_id_idx').on(table.websiteId),
  index('event_data_website_event_id_idx').on(table.websiteEventId),
  index('event_data_website_id_created_at_idx').on(table.websiteId, table.createdAt),
  index('event_data_website_id_created_at_data_key_idx').on(table.websiteId, table.createdAt, table.dataKey),
]);

// ---------------------------------------------------------------------------
// SessionData
// ---------------------------------------------------------------------------
export const sessionData = sqliteTable('session_data', {
  sessionDataId: text('session_data_id').primaryKey(),
  websiteId: text('website_id').notNull(),
  sessionId: text('session_id').notNull(),
  dataKey: text('data_key').notNull(),
  stringValue: text('string_value'),
  numberValue: real('number_value'),
  dateValue: text('date_value'),
  dataType: integer('data_type').notNull(),
  distinctId: text('distinct_id'),
  createdAt: text('created_at').$defaultFn(() => sql`(datetime('now'))`),
}, (table) => [
  index('session_data_created_at_idx').on(table.createdAt),
  index('session_data_website_id_idx').on(table.websiteId),
  index('session_data_session_id_idx').on(table.sessionId),
  index('session_data_session_id_created_at_idx').on(table.sessionId, table.createdAt),
  index('session_data_website_id_created_at_data_key_idx').on(table.websiteId, table.createdAt, table.dataKey),
]);

// ---------------------------------------------------------------------------
// Team
// ---------------------------------------------------------------------------
export const team = sqliteTable('team', {
  teamId: text('team_id').primaryKey(),
  name: text('name').notNull(),
  accessCode: text('access_code').unique(),
  logoUrl: text('logo_url'),
  createdAt: text('created_at').$defaultFn(() => sql`(datetime('now'))`),
  updatedAt: text('updated_at'),
  deletedAt: text('deleted_at'),
}, (table) => [
  index('team_access_code_idx').on(table.accessCode),
]);

// ---------------------------------------------------------------------------
// TeamUser
// ---------------------------------------------------------------------------
export const teamUser = sqliteTable('team_user', {
  teamUserId: text('team_user_id').primaryKey(),
  teamId: text('team_id').notNull(),
  userId: text('user_id').notNull(),
  role: text('role').notNull(),
  createdAt: text('created_at').$defaultFn(() => sql`(datetime('now'))`),
  updatedAt: text('updated_at'),
}, (table) => [
  index('team_user_team_id_idx').on(table.teamId),
  index('team_user_user_id_idx').on(table.userId),
]);

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
export const report = sqliteTable('report', {
  reportId: text('report_id').primaryKey(),
  userId: text('user_id').notNull(),
  websiteId: text('website_id').notNull(),
  type: text('type').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  parameters: text('parameters', { mode: 'json' }).notNull(),
  createdAt: text('created_at').$defaultFn(() => sql`(datetime('now'))`),
  updatedAt: text('updated_at'),
}, (table) => [
  index('report_user_id_idx').on(table.userId),
  index('report_website_id_idx').on(table.websiteId),
  index('report_type_idx').on(table.type),
  index('report_name_idx').on(table.name),
]);

// ---------------------------------------------------------------------------
// Segment
// ---------------------------------------------------------------------------
export const segment = sqliteTable('segment', {
  segmentId: text('segment_id').primaryKey(),
  websiteId: text('website_id').notNull(),
  type: text('type').notNull(),
  name: text('name').notNull(),
  parameters: text('parameters', { mode: 'json' }).notNull(),
  createdAt: text('created_at').$defaultFn(() => sql`(datetime('now'))`),
  updatedAt: text('updated_at'),
}, (table) => [
  index('segment_website_id_idx').on(table.websiteId),
]);

// ---------------------------------------------------------------------------
// Revenue
// ---------------------------------------------------------------------------
export const revenue = sqliteTable('revenue', {
  revenueId: text('revenue_id').primaryKey(),
  websiteId: text('website_id').notNull(),
  sessionId: text('session_id').notNull(),
  eventId: text('event_id').notNull(),
  eventName: text('event_name').notNull(),
  currency: text('currency').notNull(),
  revenue: real('revenue'),
  createdAt: text('created_at').$defaultFn(() => sql`(datetime('now'))`),
}, (table) => [
  index('revenue_website_id_idx').on(table.websiteId),
  index('revenue_session_id_idx').on(table.sessionId),
  index('revenue_website_id_created_at_idx').on(table.websiteId, table.createdAt),
  index('revenue_website_id_session_id_created_at_idx').on(table.websiteId, table.sessionId, table.createdAt),
]);

// ---------------------------------------------------------------------------
// Link
// ---------------------------------------------------------------------------
export const link = sqliteTable('link', {
  linkId: text('link_id').primaryKey(),
  name: text('name').notNull(),
  url: text('url').notNull(),
  slug: text('slug').notNull().unique(),
  userId: text('user_id'),
  teamId: text('team_id'),
  createdAt: text('created_at').$defaultFn(() => sql`(datetime('now'))`),
  updatedAt: text('updated_at'),
  deletedAt: text('deleted_at'),
}, (table) => [
  index('link_slug_idx').on(table.slug),
  index('link_user_id_idx').on(table.userId),
  index('link_team_id_idx').on(table.teamId),
  index('link_created_at_idx').on(table.createdAt),
]);

// ---------------------------------------------------------------------------
// Pixel
// ---------------------------------------------------------------------------
export const pixel = sqliteTable('pixel', {
  pixelId: text('pixel_id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  userId: text('user_id'),
  teamId: text('team_id'),
  createdAt: text('created_at').$defaultFn(() => sql`(datetime('now'))`),
  updatedAt: text('updated_at'),
  deletedAt: text('deleted_at'),
}, (table) => [
  index('pixel_slug_idx').on(table.slug),
  index('pixel_user_id_idx').on(table.userId),
  index('pixel_team_id_idx').on(table.teamId),
  index('pixel_created_at_idx').on(table.createdAt),
]);

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------
export const board = sqliteTable('board', {
  boardId: text('board_id').primaryKey(),
  type: text('type').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  parameters: text('parameters', { mode: 'json' }).notNull(),
  userId: text('user_id'),
  teamId: text('team_id'),
  createdAt: text('created_at').$defaultFn(() => sql`(datetime('now'))`),
  updatedAt: text('updated_at'),
}, (table) => [
  index('board_user_id_idx').on(table.userId),
  index('board_team_id_idx').on(table.teamId),
  index('board_created_at_idx').on(table.createdAt),
]);

// ---------------------------------------------------------------------------
// Share
// ---------------------------------------------------------------------------
export const share = sqliteTable('share', {
  shareId: text('share_id').primaryKey(),
  entityId: text('entity_id').notNull(),
  name: text('name').notNull(),
  shareType: integer('share_type').notNull(),
  slug: text('slug').notNull().unique(),
  parameters: text('parameters', { mode: 'json' }).notNull(),
  createdAt: text('created_at').$defaultFn(() => sql`(datetime('now'))`),
  updatedAt: text('updated_at'),
}, (table) => [
  index('share_entity_id_idx').on(table.entityId),
]);

// ---------------------------------------------------------------------------
// SessionReplay
// ---------------------------------------------------------------------------
export const sessionReplay = sqliteTable('session_replay', {
  replayId: text('replay_id').primaryKey(),
  websiteId: text('website_id').notNull(),
  sessionId: text('session_id').notNull(),
  visitId: text('visit_id').notNull(),
  chunkIndex: integer('chunk_index').notNull(),
  events: blob('events').notNull(),
  eventCount: integer('event_count').notNull(),
  startedAt: text('started_at').notNull(),
  endedAt: text('ended_at').notNull(),
  createdAt: text('created_at').$defaultFn(() => sql`(datetime('now'))`),
}, (table) => [
  index('session_replay_website_id_idx').on(table.websiteId),
  index('session_replay_session_id_idx').on(table.sessionId),
  index('session_replay_visit_id_idx').on(table.visitId),
  index('session_replay_website_id_session_id_idx').on(table.websiteId, table.sessionId),
  index('session_replay_website_id_visit_id_idx').on(table.websiteId, table.visitId),
  index('session_replay_website_id_created_at_idx').on(table.websiteId, table.createdAt),
  index('session_replay_session_id_chunk_index_idx').on(table.sessionId, table.chunkIndex),
]);

// ---------------------------------------------------------------------------
// SessionReplaySaved
// ---------------------------------------------------------------------------
export const sessionReplaySaved = sqliteTable('session_replay_saved', {
  savedReplayId: text('saved_replay_id').primaryKey(),
  name: text('name').notNull(),
  websiteId: text('website_id').notNull(),
  visitId: text('visit_id').notNull(),
  createdAt: text('created_at').$defaultFn(() => sql`(datetime('now'))`),
  updatedAt: text('updated_at'),
}, (table) => [
  uniqueIndex('session_replay_saved_website_id_visit_id_unique').on(table.websiteId, table.visitId),
  index('session_replay_saved_website_id_idx').on(table.websiteId),
  index('session_replay_saved_visit_id_idx').on(table.visitId),
  index('session_replay_saved_website_id_created_at_idx').on(table.websiteId, table.createdAt),
]);
