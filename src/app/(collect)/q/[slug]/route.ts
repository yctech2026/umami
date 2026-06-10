export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { POST } from '@/app/api/send/route';
import type { Link } from '@/lib/drizzle-types';
import { notFound } from '@/lib/response';
import { findLink } from '@/queries/prisma';

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const link: Link = await findLink({
    where: {
      slug,
    },
  });

  if (!link) {
    return notFound();
  }

  const payload = {
    type: 'event',
    payload: {
      link: link.linkId,
      url: request.url,
      referrer: request.headers.get("referer") || undefined,
    },
  };

  const req = new Request(request.url, {
    method: 'POST',
    headers: request.headers,
    body: JSON.stringify(payload),
  });

  await POST(req);

  return NextResponse.redirect(link.url);
}
