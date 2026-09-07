// OpenEir — shared API utilities: validation, rate limiting, errors
import { NextResponse } from 'next/server'
import { ZodType } from 'zod'

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

export function fail(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status })
}

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<{ data: T } | { response: NextResponse }> {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return { response: fail('Invalid JSON body', 400) }
  }
  const result = schema.safeParse(raw)
  if (!result.success) {
    const issues = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
    return { response: fail('Validation failed', 422, { issues }) }
  }
  return { data: result.data }
}

// naive in-memory sliding-window limiter — fine for a single-household instance
const buckets = new Map<string, number[]>()
export function rateLimit(key: string, limit = 30, windowMs = 60_000): boolean {
  const now = Date.now()
  const arr = (buckets.get(key) ?? []).filter((t) => now - t < windowMs)
  if (arr.length >= limit) {
    buckets.set(key, arr)
    return false
  }
  arr.push(now)
  buckets.set(key, arr)
  if (buckets.size > 500) {
    // opportunistic cleanup
    for (const [k, v] of buckets) if (v.every((t) => now - t > windowMs)) buckets.delete(k)
  }
  return true
}

export function clientKey(req: Request, scope: string): string {
  const fwd = req.headers.get('x-forwarded-for') ?? 'local'
  return `${scope}:${fwd}`
}
