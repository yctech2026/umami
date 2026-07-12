import { scryptSync, randomBytes, timingSafeEqual, pbkdf2Sync, createHmac } from 'node:crypto';

const SALT_BYTES = 16;
const KEY_LENGTH = 64; // 512 bits for scrypt

/**
 * 将密码哈希为 salt:hash 格式。
 * 使用 scrypt（内存硬算法，抗 GPU/ASIC 攻击）。
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES).toString('hex');
  const hash = scryptSync(password, salt, KEY_LENGTH).toString('hex');
  return `${salt}:${hash}`;
}

/**
 * 验证密码是否匹配存储的哈希。
 * 兼容三种格式：
 *  - 新 scrypt 格式: salt:hash（hash 128 hex chars，64 字节 scrypt 输出）
 *  - 旧 PBKDF2 格式: salt:hash（hash 64 hex chars，32 字节 PBKDF2 输出）
 *  - 旧 3 段格式: salt:iterations:key（迁移期兼容）
 */
export async function checkPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(':');

  // 旧 3 段格式: salt:iterations:key (PBKDF2-SHA-512, 无 pepper)
  if (parts.length === 3) {
    const [salt, iterations, key] = parts as [string, string, string];
    const derived = pbkdf2Sync(password, salt, parseInt(iterations), 64, 'sha512');
    return constantTimeCompare(derived.toString('hex'), key);
  }

  // 2 段格式: salt:hash
  if (parts.length === 2) {
    const [salt, hash] = parts as [string, string];

    // 根据 hash 长度判断算法
    // scrypt 输出 64 字节 = 128 hex 字符
    // PBKDF2 输出 32 字节 = 64 hex 字符
    if (hash.length === 128) {
      // scrypt 格式
      const derived = scryptSync(password, salt, KEY_LENGTH);
      return constantTimeCompare(derived.toString('hex'), hash);
    } else {
      // PBKDF2-SHA-256 格式（旧，无 pepper）
      const pepper = '';
      const hmac = createHmac('sha256', pepper);
      hmac.update(password, 'utf-8');
      const pepperedPassword = hmac.digest();
      const derived = pbkdf2Sync(pepperedPassword, Buffer.from(salt, 'hex'), 10000, 32, 'sha256');
      return constantTimeCompare(derived.toString('hex'), hash);
    }
  }

  return false;
}

function constantTimeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf-8');
  const bufB = Buffer.from(b, 'utf-8');
  if (bufA.length !== bufB.length) return false;
  try {
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}
