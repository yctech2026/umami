// 用正确的 pepper 生成密码哈希，匹配 CF Workers 运行时
// pepper 来源: wrangler.jsonc → env.PEPPER_KEY
const PEPPER_KEY = 'umami-local-dev-pepper-key-not-for-production';
const encoder = new TextEncoder();
function bytesToHex(bytes) { let h=''; for(let i=0;i<bytes.length;i++) h+=bytes[i].toString(16).padStart(2,'0'); return h; }
function hexToBytes(hex) { const b=new Uint8Array(hex.length/2); for(let i=0;i<hex.length;i+=2) b[i/2]=parseInt(hex.slice(i,i+2),16); return b; }
async function pepperPassword(pw) {
  const pepper = encoder.encode(PEPPER_KEY);
  const key = await crypto.subtle.importKey('raw', pepper, {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
  return crypto.subtle.sign('HMAC', key, encoder.encode(pw));
}
async function derive(pw, saltHex) {
  const peppered = await pepperPassword(pw);
  const salt = hexToBytes(saltHex);
  const km = await crypto.subtle.importKey('raw', peppered, 'PBKDF2', false, ['deriveBits']);
  const d = await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:10000,hash:'SHA-256'}, km, 256);
  return bytesToHex(new Uint8Array(d));
}
async function hashPassword(pw) {
  const peppered = await pepperPassword(pw);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltHex = bytesToHex(salt);
  const h = await derive(pw, saltHex);
  return saltHex + ':' + h;
}
async function checkPassword(pw, stored) {
  const [salt, storedHash] = stored.split(':');
  const computed = await derive(pw, salt);
  return computed === storedHash;
}

// 生成 admin/umami 的正确哈希
const hash = await hashPassword('umami');
console.log('=== admin 用户哈希（pepper=' + PEPPER_KEY + '）===');
console.log(hash);

// 验证
const ok = await checkPassword('umami', hash);
console.log('Self-verify:', ok ? 'PASS ✓' : 'FAIL ✗');
