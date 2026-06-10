import * as dotenv from 'dotenv'
dotenv.config({ path: '.env' })

async function main() {
  console.log('Node version:', process.version)
  console.log('Has crypto.subtle:', typeof crypto.subtle !== 'undefined')
  
  // Test simple encrypt/decrypt cycle
  const { encrypt, decrypt, secret, hash } = await import('../src/lib/crypto')
  
  const sec = await secret()
  console.log('Secret hash:', sec.substring(0, 20) + '...')
  
  const testValue = 'hello-world-test-' + Date.now()
  console.log('Test value:', testValue)
  
  const encrypted = await encrypt(testValue, sec)
  console.log('Encrypted:', encrypted)
  console.log('Encrypted length:', encrypted.length)
  
  const decrypted = await decrypt(encrypted, sec)
  console.log('Decrypted:', decrypted)
  console.log('Match:', testValue === decrypted)
  
  // Now test with jwt
  const { createToken, createSecureToken, parseToken, parseSecureToken } = await import('../src/lib/jwt')
  
  const jwtPayload = { userId: 'test-123', role: 'admin' }
  
  // Test plain JWT first
  const jwt = await createToken(jwtPayload, sec)
  console.log('\n--- JWT ---')
  console.log('JWT:', jwt.substring(0, 50) + '...')
  
  const parsedJwt = await parseToken(jwt, sec)
  console.log('Parsed JWT:', JSON.stringify(parsedJwt))
  
  // Test secure token
  const secureToken = await createSecureToken(jwtPayload, sec)
  console.log('\n--- Secure Token ---')
  console.log('Secure token:', secureToken.substring(0, 50) + '...')
  
  const parsedSecure = await parseSecureToken(secureToken, sec)
  console.log('Parsed secure:', JSON.stringify(parsedSecure))
}

main().catch(e => console.error('Error:', e.message, e.stack))
