import { z } from 'zod';
import { saveAuth } from '@/lib/auth';
import { ROLES } from '@/lib/constants';
import { checkPassword } from '@/lib/password';
import { parseRequest } from '@/lib/request';
import { json, unauthorized } from '@/lib/response';
import { getAllUserTeams, getUserByUsername } from '@/queries/drizzle';

export async function POST(request: Request) {
  const schema = z.object({
    username: z.string(),
    password: z.string(),
  });

  const { body, error } = await parseRequest(request, schema, { skipAuth: true });

  if (error) {
    return error();
  }

  const { username, password } = body;

  // D1 冷启动保护：反复重试直到查到用户或超时
  // D1 冷启动时查询不抛错但返回空结果（Durable Object 未就绪）
  // 策略：在 25 秒内不断重试，指数退避最多 3 秒
  // 热启动下第 1 次即命中，零额外延迟
  const MAX_WAIT = 25000;
  const startTime = Date.now();
  let user = null;

  for (let i = 0; ; i++) {
    // 第 0 次是首次查询，之后是重试
    user = await getUserByUsername(username, { includePassword: true });
    if (user) break;

    const elapsed = Date.now() - startTime;
    if (elapsed >= MAX_WAIT) break;

    // 指数退避: 500ms, 1000ms, 2000ms, 3000ms（上限）
    const delay = Math.min(500 * Math.pow(2, i), 3000);
    const remaining = MAX_WAIT - elapsed;
    const actualDelay = Math.min(delay, remaining);
    if (actualDelay <= 0) break;

    console.log(`[login] D1 cold start retry ${i + 1}, wait ${actualDelay}ms (elapsed ${elapsed}ms)`);
    await new Promise(resolve => setTimeout(resolve, actualDelay));
  }

  if (!user || !(await checkPassword(password, user.password))) {
    return unauthorized({ code: 'incorrect-username-password' });
  }

  const { userId: id, role, createdAt } = user;

  const token = await saveAuth({ userId: id, role });

  const teams = await getAllUserTeams(id);

  return json({
    token,
    user: { id, username, role, createdAt, isAdmin: role === ROLES.admin, teams },
  });
}
