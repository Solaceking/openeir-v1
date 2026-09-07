// One-off cleanup: remove RBAC test accounts + sessions, restore household mode.
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  await db.authSession.deleteMany({})
  await db.account.deleteMany({})
  await db.appSetting.upsert({
    where: { key: 'auth_mode' },
    create: { key: 'auth_mode', value: 'open' },
    update: { value: 'open' },
  })
  console.log('accounts:', await db.account.count(), 'sessions:', await db.authSession.count())
}
main().finally(() => db.$disconnect())
