import { PrismaClient } from '../src/generated/prisma/client.js'
import { PrismaLibSql } from '@prisma/adapter-libsql'
import bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'

const adapter = new PrismaLibSql({ url: 'file:./prisma/dev.db' })
const prisma = new PrismaClient({ adapter })

try {
  const passwordHash = await bcrypt.hash('umami', 10)

  // Upsert 用户（避免重复创建）
  const user = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      id: uuidv4(),
      username: 'admin',
      password: passwordHash,
      role: 'admin',
    },
  })

  console.log('✅ 用户创建成功:', JSON.stringify({ id: user.id, username: user.username, role: user.role }))

  // 验证
  const users = await prisma.user.findMany()
  console.log(`📊 数据库中共 ${users.length} 个用户:`, users.map(u => u.username))

} catch (e) {
  console.error('❌ 创建失败:', e instanceof Error ? e.message : e)
  if (e instanceof Error) console.error(e.stack)
} finally {
  await prisma.$disconnect()
}
