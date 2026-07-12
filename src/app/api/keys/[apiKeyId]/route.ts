import { json } from '@/lib/response';
import { parseRequest } from '@/lib/request';
import { getApiKeyById, deleteApiKey } from '@/queries/drizzle/apiKey';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ apiKeyId: string }> },
) {
  const { auth, error } = await parseRequest(request);

  if (error) {
    return error();
  }

  const { apiKeyId } = await params;
  const key = await getApiKeyById(apiKeyId, auth.user.userId);

  if (!key) {
    return Response.json(
      { error: { message: 'API key not found' } },
      { status: 404 },
    );
  }

  return json({
    id: key.apiKeyId,
    name: key.name,
    prefix: key.prefix,
    lastChars: key.lastChars,
    role: key.role,
    isActive: key.isActive,
    createdAt: key.createdAt,
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ apiKeyId: string }> },
) {
  const { auth, error } = await parseRequest(request);

  if (error) {
    return error();
  }

  const { apiKeyId } = await params;
  const key = await deleteApiKey(apiKeyId, auth.user.userId);

  if (!key) {
    return Response.json(
      { error: { message: 'API key not found' } },
      { status: 404 },
    );
  }

  return json({ ok: true });
}
