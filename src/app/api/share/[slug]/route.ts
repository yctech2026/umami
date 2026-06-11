import { getBoardEntityIds } from '@/lib/boards';
import { ENTITY_TYPE, ROLES } from '@/lib/constants';
import { secret } from '@/lib/crypto';
import { createToken } from '@/lib/jwt';
import { eq, and } from 'drizzle-orm';
import * as schema from '../../../../../drizzle/schema';
import prisma from '@/lib/prisma';
import { json, notFound } from '@/lib/response';
import type { BoardParameters, WhiteLabel } from '@/lib/types';
import { getBoard, getLink, getPixel, getShareByCode, getWebsite } from '@/queries/prisma';

const db = prisma.client;

async function getAccountId(entity: { userId?: string; teamId?: string }): Promise<string | null> {
  if (entity.userId) {
    return entity.userId;
  }

  if (entity.teamId) {
    const teamOwner = await db
      .select()
      .from(schema.teamUser)
      .where(
        and(
          eq(schema.teamUser.teamId, entity.teamId),
          eq(schema.teamUser.role, ROLES.teamOwner),
        ),
      )
      .get();

    return teamOwner?.userId || null;
  }

  return null;
}

async function getWhiteLabel(_accountId: string): Promise<WhiteLabel | null> {
  return null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const share = await getShareByCode(slug);

  if (!share) {
    return notFound();
  }

  const data: Record<string, any> = {
    shareId: share.shareId,
    shareType: share.shareType,
    parameters: share.parameters,
  };

  let entity: { userId?: string; teamId?: string } | null = null;

  if (share.shareType === ENTITY_TYPE.board) {
    const board = await getBoard(share.entityId);
    if (!board) return notFound();
    entity = board as any;
    data.boardId = share.entityId;
    const boardEntityIds = getBoardEntityIds({
      type: board.type,
      parameters: board.parameters as BoardParameters,
    });
    data.websiteIds = boardEntityIds.websiteIds;
    data.pixelIds = boardEntityIds.pixelIds;
    data.linkIds = boardEntityIds.linkIds;
  } else if (share.shareType === ENTITY_TYPE.website) {
    entity = (await getWebsite(share.entityId)) as any;
    if (!entity) return notFound();
    data.websiteId = share.entityId;
  } else if (share.shareType === ENTITY_TYPE.pixel) {
    entity = (await getPixel(share.entityId)) as any;
    if (!entity) return notFound();
    data.websiteId = share.entityId;
    data.pixelId = share.entityId;
  } else if (share.shareType === ENTITY_TYPE.link) {
    entity = (await getLink(share.entityId)) as any;
    if (!entity) return notFound();
    data.websiteId = share.entityId;
    data.linkId = share.entityId;
  } else {
    return notFound();
  }

  data.token = await createToken(data, await secret());

  const accountId = await getAccountId(entity);

  if (accountId) {
    const whiteLabel = await getWhiteLabel(accountId);
    if (whiteLabel) {
      data.whiteLabel = whiteLabel;
    }
  }

  return json(data);
}
