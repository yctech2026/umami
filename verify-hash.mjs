// Verify that the hash generation matches umami's algorithm
import { webcrypto } from 'node:crypto';

const PEPPER_KEY = 'd7322ec425514f998f934c928d4bc599';
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
  const key = await webcrypto.subtle.importKey('raw', pepper, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return webcrypto.subtle.sign('HMAC', key, encoder.encode(password));
}

async function deriveKeyPbkdf2(input, saltHex, iterations, keyLengthBits) {
  const salt = hexToBytes(saltHex);
  const keyMaterial = await webcrypto.subtle.importKey('raw', input, 'PBKDF2', false, ['deriveBits']);
  const derived = await webcrypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, keyMaterial, keyLengthBits);
  return bytesToHex(new Uint8Array(derived));
}

async function hashPassword(password) {
  const peppered = await pepperPassword(password);
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const saltHex = bytesToHex(salt);
  const hash = await deriveKeyPbkdf2(peppered, saltHex, 10000, 256);
  return `${saltHex}:${hash}`;
}

async function checkPassword(password, stored) {
  const [salt, storedHash] = stored.split(':');
  const peppered = await pepperPassword(password);
  const computed = await deriveKeyPbkdf2(peppered, salt, 10000, 256);
  const match = computed === storedHash;
  console.log(`Password '${password}' matches: ${match}`);
  return match;
}

// Test with the hash I already set in D1
const existingHash = 'd1cba8acbcf8d684430e3ff3b7f7e4cd:7d1023f232fb21d5d8350e75904692707ac04dd77b727ae4c339b4a8c0dfd07b';
console.log('Testing existing hash with WebCrypto API...');
const result = await checkPassword('test123456', existingHash);

// Also generate a new hash and test it
console.log('\nGenerating new hash and testing...');
const newHash = await hashPassword('test123456');
console.log('New hash:', newHash);
await checkPassword('test123456', newHash);
