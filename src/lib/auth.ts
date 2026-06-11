import debug from 'debug';
import { ROLE_PERMISSIONS, ROLES, SHARE_CONTEXT_HEADER, SHARE_TOKEN_HEADER } from '@/lib/constants';
import { secret } from '@/lib/crypto';
import { createSecureToken, parseSecureToken, parseToken } from '@/lib/jwt';
import { ensureArray } from '@/lib/utils';
import { getUser } from '@/queries/drizzle/user';

const log = debug('umami:auth');

export function getBearerToken(request: Request) {
  const auth = request.headers.get('authorization');

  return auth?.split(' ')[1];
}

export async function checkAuth(request: Request) {
  const token = getBearerToken(request);
  const payload = await parseSecureToken(token, await secret());
  const shareToken = await parseShareToken(request);

  let user = null;
  const { userId } = payload || {};

  if (userId) {
    user = await getUser(userId);
  }

  log({ token, payload, shareToken, user });

  if (!user?.userId && !shareToken) {
    log('User not authorized');
    return null;
  }

  if (!user?.userId && shareToken) {
    const shareContext = request.headers.get(SHARE_CONTEXT_HEADER);
    if (!shareContext) {
      log('Share token used outside share context');
      return null;
    }
  }

  if (user) {
    user.isAdmin = user.role === ROLES.admin;
  }

  return {
    token,
    shareToken,
    user,
  };
}

export async function saveAuth(data: any, _expire = 0) {
  return createSecureToken(data, await secret());
}

export async function hasPermission(role: string, permission: string | string[]) {
  return ensureArray(permission).some(e => ROLE_PERMISSIONS[role]?.includes(e));
}

export async function parseShareToken(request: Request) {
  try {
    return parseToken(request.headers.get(SHARE_TOKEN_HEADER), await secret());
  } catch (e) {
    log(e);
    return null;
  }
}
