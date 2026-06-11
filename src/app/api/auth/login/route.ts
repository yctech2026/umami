import { z } from 'zod';
import { saveAuth } from '@/lib/auth';
import { ROLES } from '@/lib/constants';
import { checkPassword } from '@/lib/password';
import { parseRequest } from '@/lib/request';
import { json, unauthorized } from '@/lib/response';
import { getAllUserTeams, getUserByUsername } from '@/queries/prisma';

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

  const user = await getUserByUsername(username, { includePassword: true });

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
