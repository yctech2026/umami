import { SignJWT, jwtVerify } from 'jose';
import { decrypt, encrypt } from '@/lib/crypto';

function getKey(secret: any): Uint8Array {
  return new TextEncoder().encode(String(secret));
}

export async function createToken(payload: any, secret: any, options?: any): Promise<string> {
  const jwt = new SignJWT(payload);
  jwt.setProtectedHeader({ alg: 'HS256' });

  if (options?.expiresIn) {
    jwt.setExpirationTime(options.expiresIn);
  }

  return jwt.sign(getKey(secret));
}

export async function parseToken(token: string, secret: any): Promise<any> {
  try {
    const { payload } = await jwtVerify(token, getKey(secret));
    return payload;
  } catch {
    return null;
  }
}

export async function createSecureToken(payload: any, secret: any, options?: any): Promise<string> {
  return encrypt(await createToken(payload, secret, options), secret);
}

export async function parseSecureToken(token: string, secret: any): Promise<any> {
  try {
    return await parseToken(await decrypt(token, secret), secret);
  } catch {
    return null;
  }
}

export async function parseAuthToken(req: Request, secret: string): Promise<any> {
  try {
    const token = req.headers.get('authorization')?.split(' ')?.[1];

    return parseSecureToken(token as string, secret);
  } catch {
    return null;
  }
}
