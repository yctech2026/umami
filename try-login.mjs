// 尝试不同 pepper 值生成哈希 → 写入 D1 → 验证登录
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

const PEPPERS = [
  '',                                    // 无 PEPPER_KEY
  'umami-local-dev-pepper-key-not-for-production',  // wrangler.jsonc.bak 中的值
  'd7322ec425514f998f934c928d4bc599',    // verify-hash.mjs 中的值
];

const password = 'umami';
const username = 'admin';
const LOGIN_URL = 'https://umami.agate.workers.dev/api/auth/login';

function genHash(pepper, pwd) {
  const salt = crypto.randomBytes(16);
  const hmac = crypto.createHmac('sha256', pepper);
  hmac.update(pwd, 'utf-8');
  const key = crypto.pbkdf2Sync(hmac.digest(), salt, 10000, 32, 'sha256');
  return salt.toString('hex') + ':' + key.toString('hex');
}

function updateD1(hash) {
  const escaped = hash.replace(/'/g, "''");
  const cmd = `npx wrangler d1 execute umami-db --remote --command="UPDATE user SET password='${escaped}' WHERE username='${username}'" 2>&1`;
  const out = execSync(cmd, { cwd: '/Users/alex/Desktop/umami', encoding: 'utf-8', timeout: 30000 });
  return out.includes('changes: 1') || out.includes('rows_written: 1');
}

function testLogin(pwd) {
  const curl = `curl -s -X POST "${LOGIN_URL}" -H "Content-Type: application/json" -d '{"username":"${username}","password":"${pwd}"}' -w "\\nHTTP_CODE:%{http_code}"`;
  const out = execSync(curl, { encoding: 'utf-8', timeout: 15000 });
  const httpCode = out.match(/HTTP_CODE:(\d+)/)?.[1] || '???';
  const hasToken = out.includes('"token"');
  return { code: httpCode, hasToken, body: out };
}

console.log('=== 尝试不同 PEPPER_KEY 值 ===\n');

for (const pepper of PEPPERS) {
  const display = pepper === '' ? '(空字符串)' : pepper.substring(0, 30) + '...';
  console.log(`尝试 pepper: ${display}`);
  
  const hash = genHash(pepper, password);
  console.log(`  哈希: ${hash}`);
  
  const ok = updateD1(hash);
  console.log(`  写入 D1: ${ok ? 'OK' : 'FAIL'}`);
  
  if (ok) {
    // 短暂等待
    await new Promise(r => setTimeout(r, 1000));
    const result = testLogin(password);
    console.log(`  登录: HTTP ${result.code} ${result.hasToken ? '✅ SUCCESS' : '❌ FAIL'}`);
    if (result.hasToken) {
      console.log(`\n*** 成功！PEPPER_KEY = ${pepper === '' ? "''" : pepper} ***`);
      console.log(`最终哈希: ${hash}`);
      break;
    }
  }
  console.log('');
}
