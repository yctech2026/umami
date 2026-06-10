import { PrismaClient } from './src/generated/prisma/client.js'
import bcrypt from 'bcryptjs'
const prisma = new PrismaClient()
try {
  const users = await prisma.user.findMany()
  console.log('当前用户:', JSON.stringify(users))
  if (users.length === 0) {
    const hash = await bcrypt.hash('umami', 10)
    const user = await prisma.user.create({
      data: { username: 'admin', password: hash, role: 'admin', is_admin: true }
    })
    console.log('创建用户:', user.id, user.username)
  }
} catch(e) { console.error('Error:', e.message) }
finally { await prisma.$disconnect() }
