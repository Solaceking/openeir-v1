import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const rows = await db.aiProviderConfig.findMany({ orderBy: { priority: 'asc' } })
console.log(rows.length, 'providers')
for (const r of rows) console.log(r.label, '|', r.adapter, '| enabled:', r.enabled, '| default:', r.isDefault, '| prio:', r.priority, '| model:', r.model)
await db.$disconnect()
