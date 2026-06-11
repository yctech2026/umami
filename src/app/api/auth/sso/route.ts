import { saveAuth } from '@/lib/auth';
import { parseRequest } from '@/lib/request';
import { json } from '@/lib/response';

export async function POST(request: Request) {
  const { auth, error } = await parseRequest(request);

  if (error) {
    return error();
  }

  const token = await saveAuth({ userId: auth.user.userId }, 86400);

  return json({ user: auth.user, token });
}
