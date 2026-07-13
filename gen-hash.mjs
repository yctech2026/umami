// 精确复刻 Umami 的 hashPassword 逻辑
// 远程 CF Workers 没有 PEPPER_KEY → 空字符串
import { webcrypto } from 'node:crypto';

const PEPPER_KEY = '';  // 远程无 PEPPER_KEY，回退为空
const encoder = new TextEncoder();
const ITERATIONS = 10000;
const KEY_LENGTH = 32;
const SALT_BYTES = 16;

function bytesToHex(bytes) {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

async function pepperPassword(password) {
  const pepper = encoder.encode(PEPPER_KEY);
  const key = await webcrypto.subtle.importKey(
    'raw', pepper, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  return webcrypto.subtle.sign('HMAC', key, encoder.encode(password));
}

async function hashPassword(password) {
  const peppered = await pepperPassword(password);
  const salt = webcrypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const saltHex = bytesToHex(salt);
  const keyMaterial = await webcrypto.subtle.importKey(
    'raw', peppered, 'PBKDF2', false, ['deriveBits']
  );
  const derived = await webcrypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    keyMaterial, KEY_LENGTH * 8
  );
  const hash = bytesToHex(new Uint8Array(derived));
  return `${saltHex}:${hash}`;
}

async function checkPassword(password, stored) {
  const parts = stored.split(':');
  if (parts.length !== 2) {
    console.log('Unsupported format');
    return false;
  }
  const [salt, storedHash] = parts;
  const peppered = await pepperPassword(password);
  const keyMaterial = await webcrypto.subtle.importKey(
    'raw', peppered, 'PBKDF2', false, ['deriveBits']
  );
  const computed = await webcrypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: hexToBytes(salt), iterations: ITERATIONS, hash: 'SHA-256' },
    keyMaterial, KEY_LENGTH * 8
  );
  const computedHex = bytesToHex(new Uint8Array(computed));
  return computedHex === storedHash;
}

// === 生成新哈希 ===
const password = 'umami';
const newHash = await hashPassword(password);
console.log('Generated hash:', newHash);

// 验证自洽性
const verified = await checkPassword(password, newHash);
console.log('Self-verify:', verified ? 'PASS' : 'FAIL');

// 也测试老哈希（确认 pepper='' 能匹配）
const oldHash = 'c3f5f85466ddb9735fd3e56b877a582f:49ecb30996d7d1ec960068aef0cdae3eb26ef471a19512a7a455bc69bb79e391';
const oldMatch = await checkPassword('umami', oldHash);
console.log('Old hash matches umami:', oldMatch ? 'YES' : 'NO');

// 输出最终结果
console.log('\n=== RESULT ===');
console.log(newHash);
