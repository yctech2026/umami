import prisma from '@/lib/prisma';

const FUNCTION_NAME = 'createSession';

interface SessionCreateInput {
  id: string;
  websiteId: string;
  browser?: string;
  os?: string;
  device?: string;
  screen?: string;
  language?: string;
  country?: string;
  region?: string;
  city?: string;
  distinctId?: string;
  createdAt?: string | Date;
}

export async function createSession(data: SessionCreateInput) {
  const { rawQuery } = prisma;

  await rawQuery(
    `
    insert into session (
      session_id,
      website_id,
      browser,
      os,
      device,
      screen,
      language,
      country,
      region,
      city,
      distinct_id,
      created_at
    )
    values (
      {{id}},
      {{websiteId}},
      {{browser}},
      {{os}},
      {{device}},
      {{screen}},
      {{language}},
      {{country}},
      {{region}},
      {{city}},
      {{distinctId}},
      {{createdAt}}
    )
    on conflict (session_id) do nothing
    `,
    data,
    FUNCTION_NAME,
  );
}
