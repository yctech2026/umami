const PEPPER_KEY = 'umami-local-dev-pepper-key-not-for-production';
const encoder = new TextEncoder();

function bytesToHex(bytes) {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return hex;
}
function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  return bytes;
}

async function pepperPassword(password) {
  const pepper = encoder.encode(PEPPER_KEY);
  const key = await crypto.subtle.importKey('raw', pepper, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', key, encoder.encode(password));
}

async function deriveKeyPbkdf2(input, saltHex, iterations, keyLengthBits) {
  const salt = hexToBytes(saltHex);
  const keyMaterial = await crypto.subtle.importKey('raw', input, 'PBKDF2', false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, keyMaterial, keyLengthBits);
  return bytesToHex(new Uint8Array(derived));
}

async function checkPassword(password, stored) {
  const [salt, storedHash] = stored.split(':');
  const peppered = await pepperPassword(password);
  const computed = await deriveKeyPbkdf2(peppered, salt, 10000, 256);
  return computed === storedHash;
}

const hash = 'ae827ff929f65c51eefa43f9ab0f8d27:2337c922d28196b364e402701adb9bfdfd62e4781c875a56dd7489c4a59714ae';

for (const pw of ['umami', 'admin', 'admin123', 'test123456', 'password', 'hello2026']) {
  const ok = await checkPassword(pw, hash);
  console.log(`Password '${pw}' matches: ${ok}`);
}
