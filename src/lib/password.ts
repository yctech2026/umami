const ITERATIONS = 10000;
const KEY_LENGTH = 32; // 256 bits (SHA-256 output)
const SALT_BYTES = 16; // 16 bytes = 32 hex chars

const encoder = new TextEncoder();

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * 获取 Pepper 密钥（从环境变量读取）
 * 通过 CF Workers Secrets 注入: `PEPPER_KEY`
 * 本地开发: 通过 .env 配置
 * 如果未设置，使用空字符串（降级但兼容）
 */
function getPepper(): Uint8Array {
  const pepper = 'umami-local-dev-pepper-key-not-for-production';
  if (!pepper) {
    console.warn('[password] PEPPER_KEY is not set! Password pepper layer is disabled. Set via `wrangler secret put PEPPER_KEY` in production.');
  }
  return encoder.encode(pepper);
}

/**
 * 将密码与 Pepper 通过 HMAC-SHA256 混合
 * Pepper 不在数据库中存储，即使数据库泄露也无法离线爆破
 */
async function pepperPassword(password: string): Promise<ArrayBuffer> {
  const pepper = getPepper();

  // 用 HMAC-SHA256 将 pepper 与密码混合
  const key = await crypto.subtle.importKey(
    'raw',
    pepper as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  return crypto.subtle.sign('HMAC', key, encoder.encode(password));
}

/**
 * 通过 PBKDF2-HMAC-SHA-256 派生密钥
 * SHA-256 比 SHA-512 快约 40%，10,000 次迭代 ≈ 5-7ms（CF Workers 10ms 预算内）
 */
async function deriveKeyPbkdf2(
  input: ArrayBuffer,
  saltHex: string,
  iterations: number,
  keyLengthBits: number,
): Promise<string> {
  const salt = hexToBytes(saltHex);

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    input,
    'PBKDF2',
    false,
    ['deriveBits'],
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    keyLengthBits,
  );

  return bytesToHex(new Uint8Array(derivedBits));
}

export async function hashPassword(password: string): Promise<string> {
  // 1. 用 Pepper 混合密码（HMAC-SHA256）
  const peppered = await pepperPassword(password);

  // 2. 生成随机盐
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const saltHex = bytesToHex(salt);

  // 3. PBKDF2-SHA-256 派生密钥
  const hash = await deriveKeyPbkdf2(peppered, saltHex, ITERATIONS, KEY_LENGTH * 8);

  // 4. 存储格式: salt_hex:hash_hex
  return `${saltHex}:${hash}`;
}

export async function checkPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split(':');

  // 兼容旧的 PBKDF2 格式: salt:iterations:key（旧方案，SHA-512）
  if (parts.length === 3) {
    const [salt, iterationsStr, storedKey] = parts;
    const iterations = parseInt(iterationsStr, 10);

    // 旧方案没有 Pepper，直接使用原密码
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveBits'],
    );

    const derived = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: hexToBytes(salt) as BufferSource,
        iterations,
        hash: 'SHA-512',
      },
      keyMaterial,
      storedKey.length * 4, // hex string → bits
    );

    const derivedHex = bytesToHex(new Uint8Array(derived));
    return constantTimeCompare(derivedHex, storedKey);
  }

  // 新格式: salt:hash（PBKDF2-SHA-256 + Pepper）
  if (parts.length === 2) {
    const [salt, storedHash] = parts;

    const peppered = await pepperPassword(password);
    const computedHash = await deriveKeyPbkdf2(peppered, salt, ITERATIONS, KEY_LENGTH * 8);

    return constantTimeCompare(computedHash, storedHash);
  }

  return false;
}
