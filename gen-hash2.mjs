// 精确复刻 Umami 的 hashPassword：远程无 PEPPER_KEY → 空字符串
// Node.js WebCrypto 不允许空 HMAC key，改用 crypto.createHmac 处理空 pepper
import crypto from 'node:crypto';

const PEPPER_KEY = '';  // 远程 CF Workers 无 PEPPER_KEY
const ITERATIONS = 10000;
const KEY_LENGTH = 32;
const SALT_BYTES = 16;

function bytesToHex(bytes) {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return hex;
}

// 精确复制 Umami 的 pepperPassword: HMAC-SHA256(pepper, password)
function pepperPasswordNode(password) {
  const hmac = crypto.createHmac('sha256', PEPPER_KEY);
  hmac.update(password, 'utf-8');
  return hmac.digest();  // Buffer
}

function hashPassword(password) {
  const peppered = pepperPasswordNode(password);
  const salt = crypto.randomBytes(SALT_BYTES);
  const saltHex = salt.toString('hex');
  const key = crypto.pbkdf2Sync(peppered, salt, ITERATIONS, KEY_LENGTH, 'sha256');
  return `${saltHex}:${key.toString('hex')}`;
}

function checkPassword(password, stored) {
  const parts = stored.split(':');
  if (parts.length !== 2) return false;
  const [salt, storedHash] = parts;
  const peppered = pepperPasswordNode(password);
  const computed = crypto.pbkdf2Sync(peppered, Buffer.from(salt, 'hex'), ITERATIONS, KEY_LENGTH, 'sha256');
  const computedHex = computed.toString('hex');
  // 恒定时间比较
  if (computedHex.length !== storedHash.length) return false;
  let result = 0;
  for (let i = 0; i < computedHex.length; i++) {
    result |= computedHex.charCodeAt(i) ^ storedHash.charCodeAt(i);
  }
  return result === 0;
}

// === 生成新哈希 ===
const password = 'umami';
const newHash = hashPassword(password);
console.log('Generated hash:', newHash);

// 验证自洽
const verified = checkPassword(password, newHash);
console.log('Self-verify:', verified ? 'PASS' : 'FAIL');

// 测试远程旧哈希
const oldHash = 'c3f5f85466ddb9735fd3e56b877a582f:49ecb30996d7d1ec960068aef0cdae3eb26ef471a19512a7a455bc69bb79e391';
const oldMatch = checkPassword('umami', oldHash);
console.log('Old hash matches umami:', oldMatch ? 'YES' : 'NO');

// 也测试其他常见密码
for (const pw of ['admin', 'admin123', 'test123456', 'password']) {
  console.log(`Old hash matches '${pw}':`, checkPassword(pw, oldHash) ? 'YES' : 'NO');
}

console.log('\n=== NEW HASH ===');
console.log(newHash);
