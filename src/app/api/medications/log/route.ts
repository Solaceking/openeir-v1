// Thin wrapper over the shared write path (src/lib/health/record.ts).

import { ok, fail, parseBody, rateLimit, clientKey } from '@/lib/api-utils'
import { logMedicationStatus, medLogInputSchema } from '@/lib/health/record'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  if (!rateLimit(clientKey(req, 'medlog'), 120, 60_000)) return fail('Too many requests', 429)
  const parsed = await parseBody(req, medLogInputSchema)
  if ('response' in parsed) return parsed.response

  try {
    const result = await logMedicationStatus(parsed.data)
    return ok({ log: result.row })
  } catch (err) {
    if (err instanceof Error && err.message === 'Medication not found') return fail('Medication not found', 404)
    throw err
  }
}
