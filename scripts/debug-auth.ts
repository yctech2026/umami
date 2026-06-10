import * as dotenv from 'dotenv'
import { parseSecureToken, createSecureToken } from '../src/lib/jwt'
import { secret } from '../src/lib/crypto'

// Load .env manually (same as what dotenv CLI does)
dotenv.config({ path: '.env' })

async function main() {
  const rawToken = process.argv[2]
  
  console.log('APP_SECRET from env:', process.env.APP_SECRET ? 'SET (' + process.env.APP_SECRET.substring(0, 10) + '...)' : 'NOT SET')
  console.log('DATABASE_URL from env:', process.env.DATABASE_URL ? 'SET' : 'NOT SET')
  
  const sec = await secret()
  console.log('Computed secret (hash):', sec.substring(0, 30) + '...')
  console.log('Secret length:', sec.length)
  
  if (rawToken) {
    console.log('\n--- Testing with provided token ---')
    console.log('Token (first 50 chars):', rawToken.substring(0, 50) + '...')
    console.log('Token length:', rawToken.length)
    
    const parsed = await parseSecureToken(rawToken, sec)
    console.log('Parsed result:', JSON.stringify(parsed))
    
    if (parsed) {
      console.log('Has userId:', !!parsed.userId)
      console.log('Has authKey:', !!parsed.authKey)
    }
  } else {
    console.log('\n--- Creating + parsing test token ---')
    const token = await createSecureToken({ userId: 'test-user-id', role: 'admin' }, sec)
    console.log('Created token:', token.substring(0, 50) + '...')
    
    const parsed = await parseSecureToken(token, sec)
    console.log('Parsed payload:', JSON.stringify(parsed))
  }
}

main().catch(e => console.error('Error:', e.message, e.stack))
