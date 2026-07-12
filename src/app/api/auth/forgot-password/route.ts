import { z } from 'zod';
import { parseRequest } from '@/lib/request';
import { json } from '@/lib/response';
import { getUserByUsername } from '@/queries/drizzle';

const schema = z.object({
  username: z.string().min(1).max(255),
});

export async function POST(request: Request) {
  const { body, error } = await parseRequest(request, schema, { skipAuth: true });

  if (error) {
    return error();
  }

  // For security, check if user exists but always return the same message
  // to avoid leaking whether a particular username is registered.
  const user = await getUserByUsername(body.username);

  // In self-hosted mode, email sending is not available.
  // If email integration is added in the future, this is where the
  // reset link / token would be generated and sent.
  if (user) {
    // TODO: Generate reset token and send email
    // const token = await createResetToken(user.userId);
    // await sendResetEmail(user.username, token);
  }

  return json({
    ok: true,
    message:
      'If that user exists, a password reset link has been sent. (Self-hosted mode: please contact your administrator to reset the password.)',
  });
}
