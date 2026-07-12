import { z } from 'zod';
import { saveAuth } from '@/lib/auth';
import { ROLES } from '@/lib/constants';
import { uuid } from '@/lib/crypto';
import { hashPassword } from '@/lib/password';
import { parseRequest } from '@/lib/request';
import { badRequest, forbidden, json } from '@/lib/response';
import { createUser, getUserByUsername, getUsers } from '@/queries/drizzle';

export async function POST(request: Request) {
  if (process.env.DISABLE_SIGNUP === '1') {
    return forbidden({ message: 'Sign up is disabled', code: 'signup-disabled' });
  }

  const schema = z.object({
    username: z.string().min(1).max(255),
    password: z.string().min(8).max(255),
    name: z.string().optional(),
  });

  const { body, error } = await parseRequest(request, schema, { skipAuth: true });

  if (error) {
    return error();
  }

  const { username, password, name } = body;

  const existingUser = await getUserByUsername(username);

  if (existingUser) {
    return badRequest({ message: 'User already exists' });
  }

  const { count } = await getUsers({}, { page: 1, pageSize: 1 });
  const role = count === 0 ? ROLES.admin : ROLES.user;

  const user = await createUser({
    id: uuid(),
    username,
    password: await hashPassword(password),
    role,
    displayName: name || username,
  });

  const token = await saveAuth({ userId: user.id, role });

  return json({ token, user: { ...user, isAdmin: role === ROLES.admin } });
}
