const PEPPER_KEY = 'umami-local-dev-pepper-key-not-for-production';
const encoder = new TextEncoder();
function bytesToHex(bytes) { let hex = ''; for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0'); return hex; }
function hexToBytes(hex) { const bytes = new Uint8Array(hex.length / 2); for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16); return bytes; }

async function pepperPassword(password) {
  const pepper = encoder.encode(PEPPER_KEY);
  const key = await crypto.subtle.importKey('raw', pepper, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', key, encoder.encode(password));
}

async function hashPassword(password) {
  const peppered = await pepperPassword(password);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltHex = bytesToHex(salt);
  const keyMaterial = await crypto.subtle.importKey('raw', peppered, 'PBKDF2', false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 10000, hash: 'SHA-256' }, keyMaterial, 256);
  return saltHex + ':' + bytesToHex(new Uint8Array(derived));
}

async function checkPassword(password, stored) {
  const [salt, storedHash] = stored.split(':');
  const peppered = await pepperPassword(password);
  const keyMaterial = await crypto.subtle.importKey('raw', peppered, 'PBKDF2', false, ['deriveBits']);
  const computed = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: hexToBytes(salt), iterations: 10000, hash: 'SHA-256' }, keyMaterial, 256);
  const computedHex = bytesToHex(new Uint8Array(computed));
  return computedHex === storedHash;
}

// Check the remote admin hash
const remoteHash = 'e2b63e2dc5dd76627544b9d544f2b047:4bf609950973284a4f0829275f767394a8a669e3d12e5044510b68035ad7f9f7';
console.log('Checking remote admin hash against common passwords...');
for (const pw of ['umami', 'admin', 'admin123', 'test123456', 'password', 'hello2026']) {
  const ok = await checkPassword(pw, remoteHash);
  console.log(`Password '${pw}' matches: ${ok}`);
}

// Generate a new hash for test123456
console.log('\nGenerating new hash for test123456...');
const newHash = await hashPassword('test123456');
console.log('New hash:', newHash);
const verified = await checkPassword('test123456', newHash);
console.log('Verified:', verified);
