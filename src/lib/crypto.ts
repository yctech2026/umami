import { startOfDay, startOfMonth, startOfWeek } from 'date-fns';
import { getEnvString } from '@/lib/env';

const ALGORITHM = 'AES-GCM';
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const TAG_POSITION = SALT_LENGTH + IV_LENGTH;

const PBKDF2_ITERATIONS = 10000;
const KEY_LENGTH = 32;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey'],
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-512',
    },
    keyMaterial,
    { name: ALGORITHM, length: KEY_LENGTH * 8 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encrypt(value: any, secret: any): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const key = await deriveKey(secret, salt);

  const encrypted = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv: iv as BufferSource, tagLength: TAG_LENGTH * 8 },
    key,
    encoder.encode(String(value)),
  );

  return bytesToBase64(concatBytes(salt, iv, new Uint8Array(encrypted)));
}

export async function decrypt(value: any, secret: any): Promise<string> {
  const str = base64ToBytes(String(value));
  const salt = str.subarray(0, SALT_LENGTH);
  const iv = str.subarray(SALT_LENGTH, TAG_POSITION);
  const encrypted = str.subarray(TAG_POSITION);

  const key = await deriveKey(secret, salt);

  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv: iv as BufferSource, tagLength: TAG_LENGTH * 8 },
    key,
    encrypted as BufferSource,
  );

  return decoder.decode(decrypted);
}

export async function hash(...args: string[]): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-512', encoder.encode(args.join('')));
  return bytesToHex(new Uint8Array(digest));
}

export function md5(...args: string[]): string {
  // Pure JS MD5 implementation (Web Crypto API does not support MD5)
  const str = args.join('');

  // Convert string to UTF-8 bytes
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let code = str.charCodeAt(i);
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6));
      bytes.push(0x80 | (code & 0x3f));
    } else if (code < 0xd800 || code >= 0xe000) {
      bytes.push(0xe0 | (code >> 12));
      bytes.push(0x80 | ((code >> 6) & 0x3f));
      bytes.push(0x80 | (code & 0x3f));
    } else {
      i++;
      code = 0x10000 + (((code & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
      bytes.push(0xf0 | (code >> 18));
      bytes.push(0x80 | ((code >> 12) & 0x3f));
      bytes.push(0x80 | ((code >> 6) & 0x3f));
      bytes.push(0x80 | (code & 0x3f));
    }
  }

  // Append padding
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) {
    bytes.push(0);
  }

  // Append original length in bits (little-endian)
  for (let i = 0; i < 8; i++) {
    bytes.push((bitLen >>> (i * 8)) & 0xff);
  }

  // MD5 constants
  const T: number[] = [];
  for (let i = 1; i <= 64; i++) {
    T.push(Math.floor(Math.abs(Math.sin(i)) * 0x100000000) >>> 0);
  }

  const S = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];

  function F(x: number, y: number, z: number) {
    return (x & y) | (~x & z);
  }
  function G(x: number, y: number, z: number) {
    return (x & z) | (y & ~z);
  }
  function H(x: number, y: number, z: number) {
    return x ^ y ^ z;
  }
  function I(x: number, y: number, z: number) {
    return y ^ (x | ~z);
  }

  function rotateLeft(x: number, n: number) {
    return ((x << n) | (x >>> (32 - n))) >>> 0;
  }

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  for (let i = 0; i < bytes.length; i += 64) {
    const X: number[] = [];
    for (let j = 0; j < 16; j++) {
      const off = i + j * 4;
      X[j] =
        (bytes[off] |
          (bytes[off + 1] << 8) |
          (bytes[off + 2] << 16) |
          (bytes[off + 3] << 24)) >>> 0;
    }

    let A = a0;
    let B = b0;
    let C = c0;
    let D = d0;

    for (let j = 0; j < 64; j++) {
      let g: number, f: number;
      if (j < 16) {
        f = F(B, C, D);
        g = j;
      } else if (j < 32) {
        f = G(B, C, D);
        g = (5 * j + 1) % 16;
      } else if (j < 48) {
        f = H(B, C, D);
        g = (3 * j + 5) % 16;
      } else {
        f = I(B, C, D);
        g = (7 * j) % 16;
      }

      const temp = D;
      D = C;
      C = B;
      B = (B + rotateLeft((A + f + X[g] + T[j]) >>> 0, S[j])) >>> 0;
      A = temp;
    }

    a0 = (a0 + A) >>> 0;
    b0 = (b0 + B) >>> 0;
    c0 = (c0 + C) >>> 0;
    d0 = (d0 + D) >>> 0;
  }

  // Write result as hex (little-endian)
  const result = new Uint8Array(16);
  const view = new DataView(result.buffer);
  view.setUint32(0, a0, true);
  view.setUint32(4, b0, true);
  view.setUint32(8, c0, true);
  view.setUint32(12, d0, true);

  return bytesToHex(result);
}

export async function secret(): Promise<string> {
  return hash(getEnvString('APP_SECRET') || getEnvString('DATABASE_URL'));
}

export function uuid(...args: any): string {
  return crypto.randomUUID();
}

export function createAuthKey(): string {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
}

export async function getSalt(saltRotation: string, createdAt: Date): Promise<string> {
  return hash(
    (saltRotation === 'day' ? startOfDay : saltRotation === 'week' ? startOfWeek : startOfMonth)(
      createdAt,
    ).toUTCString(),
  );
}
