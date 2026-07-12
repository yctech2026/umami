import clickhouse from '@/lib/clickhouse';
import { CLICKHOUSE, PRISMA, runQuery } from '@/lib/db';
import prisma from '@/lib/db';

export async function getRecorder(websiteId: string) {
  return runQuery({
    [PRISMA]: () => relationalQuery(websiteId),
    [CLICKHOUSE]: () => clickhouseQuery(websiteId),
  });
}

async function relationalQuery(websiteId: string) {
  const { rawQuery } = prisma;
  const rows = await rawQuery(
    `SELECT replay_enabled as replayEnabled,
            replay_config as replayConfig
     FROM website
     WHERE website_id = {{websiteId}}`,
    { websiteId },
  );

  if (!rows || rows.length === 0) return null;

  const row = rows[0];
  const config = row.replayConfig ? JSON.parse(row.replayConfig) : {};

  return {
    enabled: row.replayEnabled === 1,
    replayEnabled: row.replayEnabled === 1,
    heatmapEnabled: config.heatmapEnabled ?? false,
    sampleRate: config.sampleRate ?? 0.15,
    heatmapSampleRate: config.heatmapSampleRate ?? 0.15,
    maskLevel: config.maskLevel ?? 'moderate',
    maxDuration: config.maxDuration ?? 300000,
    blockSelector: config.blockSelector ?? '',
  };
}

async function clickhouseQuery(websiteId: string) {
  const { rawQuery } = clickhouse;
  const rows = await rawQuery<{ replayEnabled: number; replayConfig: string }[]>(
    `SELECT replay_enabled as replayEnabled,
            replay_config as replayConfig
     FROM umami.website
     WHERE website_id = {websiteId:UUID}
     LIMIT 1`,
    { websiteId },
  );

  if (!rows || rows.length === 0) return null;

  const row = rows[0];
  const config = row.replayConfig ? JSON.parse(row.replayConfig) : {};

  return {
    enabled: row.replayEnabled === 1,
    replayEnabled: row.replayEnabled === 1,
    heatmapEnabled: config.heatmapEnabled ?? false,
    sampleRate: config.sampleRate ?? 0.15,
    heatmapSampleRate: config.heatmapSampleRate ?? 0.15,
    maskLevel: config.maskLevel ?? 'moderate',
    maxDuration: config.maxDuration ?? 300000,
    blockSelector: config.blockSelector ?? '',
  };
}
