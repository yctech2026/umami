import { z } from 'zod';
import { uuid, hash } from '@/lib/crypto';
import { parseRequest } from '@/lib/request';
import { json } from '@/lib/response';
import { SECRET_SALT } from '@/lib/constants';
import { getApiKeys, createApiKey } from '@/queries/drizzle/apiKey';

async function generateApiKey(): Promise<{
  key: string;
  prefix: string;
  keyHash: string;
  lastChars: string;
}> {
  const randomHex = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  const key = `uma_${randomHex}`;
  const prefix = key.slice(0, 10) + '...';
  const lastChars = key.slice(-4);
  const keyHash = await hash(key, SECRET_SALT);
  return { key, prefix, keyHash, lastChars };
}

export async function GET(request: Request) {
  const { auth, error } = await parseRequest(request);

  if (error) {
    return error();
  }

  const keys = await getApiKeys(auth.user.userId);

  return json(
    keys.map(k => ({
      id: k.apiKeyId,
      name: k.name,
      prefix: k.prefix,
      lastChars: k.lastChars,
      keyValue: k.keyValue,
      role: k.role,
      isActive: k.isActive,
      createdAt: k.createdAt,
    })),
  );
}

export async function POST(request: Request) {
  const schema = z.object({
    name: z.string().min(1).max(100),
  });

  const { auth, body, error } = await parseRequest(request, schema);

  if (error) {
    return error();
  }

  const { name } = body;
  const apiKeyId = uuid();
  const { key, prefix, keyHash, lastChars } = await generateApiKey();

  await createApiKey({
    apiKeyId,
    userId: auth.user.userId,
    name: name.trim(),
    prefix,
    keyHash,
    lastChars,
    keyValue: key,
    role: auth.user.role,
  });

  return Response.json(
    {
      id: apiKeyId,
      name: name.trim(),
      prefix,
      lastChars,
      key,
      role: auth.user.role,
      createdAt: new Date().toISOString(),
    },
    { status: 201 },
  );
}
