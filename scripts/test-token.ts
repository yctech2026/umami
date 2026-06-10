import { parseSecureToken, createSecureToken } from '../src/lib/jwt'
import { secret } from '../src/lib/crypto'

async function main() {
  const sec = await secret()
  console.log('Secret:', sec.substring(0, 20) + '...')
  
  // Create a test token
  const token = await createSecureToken({ userId: 'test-user-id', role: 'admin' }, sec)
  console.log('Created token:', token.substring(0, 50) + '...')
  
  // Parse it back
  const parsed = await parseSecureToken(token, sec)
  console.log('Parsed payload:', JSON.stringify(parsed))
  
  // Now try with the actual login token from argv
  const actualToken = process.argv[2]
  if (actualToken) {
    const parsed2 = await parseSecureToken(actualToken, sec)
    console.log('Actual token parsed:', JSON.stringify(parsed2))
  } else {
    console.log('No actual token provided as argument')
  }
}

main().catch(e => console.error('Error:', e.message, e.stack))
