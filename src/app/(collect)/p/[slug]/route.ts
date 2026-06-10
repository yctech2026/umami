export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { POST } from '@/app/api/send/route';
import type { Pixel } from '@/lib/drizzle-types';
import redis from '@/lib/redis';
import { notFound } from '@/lib/response';
import { findPixel } from '@/queries/prisma';

const base64Str = 'R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw';
const binaryStr = atob(base64Str);
const image = new Uint8Array(binaryStr.length);
for (let i = 0; i < binaryStr.length; i++) {
  image[i] = binaryStr.charCodeAt(i);
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  let pixel: Pixel;

  if (redis.enabled) {
    pixel = await redis.client.fetch(
      `pixel:${slug}`,
      async () => {
        return findPixel({
          where: {
            slug,
          },
        });
      },
      86400,
    );

    if (!pixel) {
      return notFound();
    }
  } else {
    pixel = await findPixel({
      where: {
        slug,
      },
    });

    if (!pixel) {
      return notFound();
    }
  }

  const payload = {
    type: 'event',
    payload: {
      pixel: pixel.id,
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

  return new NextResponse(image, {
    headers: {
      'Content-Type': 'image/gif',
      'Content-Length': image.length.toString(),
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    },
  });
}
