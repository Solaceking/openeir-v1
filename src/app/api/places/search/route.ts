import { NextResponse } from 'next/server'
import { z } from 'zod'
import { searchPlaces } from '@/lib/places'
import { fail, rateLimit, clientKey } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

const querySchema = z.object({
  q: z.string().min(3).max(120),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
})

export async function GET(req: Request) {
  if (!rateLimit(clientKey(req, 'places'), 30, 60_000)) return fail('Too many requests', 429)
  const url = new URL(req.url)
  const parsed = querySchema.safeParse({
    q: url.searchParams.get('q') ?? undefined,
    lat: url.searchParams.get('lat') ?? undefined,
    lng: url.searchParams.get('lng') ?? undefined,
  })
  if (!parsed.success) return fail('Provide q (min 3 chars) and optional lat/lng', 400)
  const { q, lat, lng } = parsed.data
  try {
    const places = await searchPlaces(q, lat !== undefined && lng !== undefined ? { lat, lng } : undefined)
    return NextResponse.json({ places })
  } catch {
    return fail('Place search unavailable — check network or configure a Google Places key', 502)
  }
}
