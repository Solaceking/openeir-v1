// ============================================================
// OpenEir — Places & location intelligence
// Unified place search: Google Places API (New) when a key is
// configured, OpenStreetMap Nominatim otherwise (no key needed).
// Also: reverse geocoding + the static emergency-number table.
// ============================================================
import { db } from '@/lib/db'

export interface PlaceResult {
  id: string
  name: string
  address: string
  phone: string | null
  website: string | null
  lat: number | null
  lng: number | null
  plusCode: string | null
  source: 'google' | 'osm'
}

export interface GeoPoint {
  lat: number
  lng: number
}

const UA = 'OpenEir/1.0 (self-hosted personal health assistant)'

async function getGoogleKey(): Promise<string | null> {
  if (process.env.GOOGLE_PLACES_API_KEY) return process.env.GOOGLE_PLACES_API_KEY
  try {
    const row = await db.appSetting.findUnique({ where: { key: 'google_places_api_key' } })
    return row?.value || null
  } catch {
    return null
  }
}

/** Search for a place (GP practice, pharmacy, hospital…). Best-effort across providers. */
export async function searchPlaces(query: string, near?: GeoPoint): Promise<PlaceResult[]> {
  const key = await getGoogleKey()
  if (key) {
    try {
      return await googleTextSearch(query, near, key)
    } catch {
      // fall through to OSM — a health lookup must never hard-fail
    }
  }
  return nominatimSearch(query, near)
}

async function googleTextSearch(query: string, near: GeoPoint | undefined, key: string): Promise<PlaceResult[]> {
  const body: Record<string, unknown> = { textQuery: query, maxResultCount: 8, languageCode: 'en' }
  if (near) {
    body.locationBias = { circle: { center: { latitude: near.lat, longitude: near.lng }, radius: 25000 } }
  }
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.internationalPhoneNumber,places.websiteUri,places.location,places.plusCode',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`places ${res.status}`)
  const json = (await res.json()) as {
    places?: Array<{
      id: string
      displayName?: { text?: string }
      formattedAddress?: string
      internationalPhoneNumber?: string
      websiteUri?: string
      location?: { latitude: number; longitude: number }
      plusCode?: { globalCode?: string }
    }>
  }
  return (json.places ?? []).map((p) => ({
    id: p.id,
    name: p.displayName?.text ?? 'Unknown',
    address: p.formattedAddress ?? '',
    phone: p.internationalPhoneNumber ?? null,
    website: p.websiteUri ?? null,
    lat: p.location?.latitude ?? null,
    lng: p.location?.longitude ?? null,
    plusCode: p.plusCode?.globalCode ?? null,
    source: 'google' as const,
  }))
}

async function nominatimSearch(query: string, near: GeoPoint | undefined): Promise<PlaceResult[]> {
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('q', query)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('limit', '8')
  url.searchParams.set('addressdetails', '1')
  url.searchParams.set('extratags', '1')
  if (near) {
    const d = 0.3
    url.searchParams.set('viewbox', `${near.lng - d},${near.lat + d},${near.lng + d},${near.lat - d}`)
  }
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Error(`nominatim ${res.status}`)
  const json = (await res.json()) as Array<{
    osm_id: number
    osm_type: string
    name: string
    display_name: string
    lat: string
    lon: string
    extratags?: Record<string, string>
  }>
  return json.map((p) => ({
    id: `${p.osm_type}/${p.osm_id}`,
    name: p.name || p.display_name.split(',')[0],
    address: p.display_name,
    phone: p.extratags?.phone ?? p.extratags?.['contact:phone'] ?? null,
    website: p.extratags?.website ?? p.extratags?.['contact:website'] ?? null,
    lat: Number(p.lat),
    lng: Number(p.lon),
    plusCode: null,
    source: 'osm' as const,
  }))
}

/** Nearest medical facility for the dispatcher card (SOS path). */
export async function nearestMedicalFacility(near: GeoPoint): Promise<PlaceResult | null> {
  const key = await getGoogleKey()
  if (key) {
    try {
      const body = {
        textQuery: 'emergency department hospital A&E',
        maxResultCount: 3,
        locationRestriction: { circle: { center: { latitude: near.lat, longitude: near.lng }, radius: 20000 } },
      }
      const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.internationalPhoneNumber,places.location',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      })
      if (res.ok) {
        const json = (await res.json()) as {
          places?: Array<{ id: string; displayName?: { text?: string }; formattedAddress?: string; internationalPhoneNumber?: string; location?: { latitude: number; longitude: number } }>
        }
        const p = json.places?.[0]
        if (p) {
          return {
            id: p.id,
            name: p.displayName?.text ?? 'Hospital',
            address: p.formattedAddress ?? '',
            phone: p.internationalPhoneNumber ?? null,
            website: null,
            lat: p.location?.latitude ?? null,
            lng: p.location?.longitude ?? null,
            plusCode: null,
            source: 'google',
          }
        }
      }
    } catch {
      // fall through
    }
  }
  try {
    const url = new URL('https://nominatim.openstreetmap.org/search')
    url.searchParams.set('q', 'hospital emergency')
    url.searchParams.set('format', 'jsonv2')
    url.searchParams.set('limit', '3')
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) })
    if (res.ok) {
      const json = (await res.json()) as Array<{ osm_id: number; osm_type: string; name: string; display_name: string; lat: string; lon: string }>
      const p = json[0]
      if (p) {
        return {
          id: `${p.osm_type}/${p.osm_id}`,
          name: p.name || 'Hospital',
          address: p.display_name,
          phone: null,
          website: null,
          lat: Number(p.lat),
          lng: Number(p.lon),
          plusCode: null,
          source: 'osm',
        }
      }
    }
  } catch {
    // no facility data — the package still goes out
  }
  return null
}

export interface ReverseGeo {
  displayName: string
  country: string
  countryCode: string
}

/** Reverse geocode coordinates → human place + country (Nominatim, free). */
export async function reverseGeocode(lat: number, lng: number): Promise<ReverseGeo | null> {
  try {
    const url = new URL('https://nominatim.openstreetmap.org/reverse')
    url.searchParams.set('lat', String(lat))
    url.searchParams.set('lon', String(lng))
    url.searchParams.set('format', 'jsonv2')
    url.searchParams.set('zoom', '16')
    url.searchParams.set('addressdetails', '1')
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const json = (await res.json()) as {
      display_name?: string
      address?: { country?: string; country_code?: string }
    }
    return {
      displayName: json.display_name ?? '',
      country: json.address?.country ?? '',
      countryCode: (json.address?.country_code ?? '').toUpperCase(),
    }
  } catch {
    return null
  }
}

/**
 * Emergency numbers by ISO-3166 alpha-2. The GSM default 112 covers most of
 * the world; regional overrides listed where they differ. Static data —
 * emergency numbers are among the most stable facts on earth.
 */
export const EMERGENCY_NUMBERS: Record<string, string> = {
  // Europe (112 standard; national overrides noted)
  AT: '112', BE: '112', BG: '112', HR: '112', CY: '112', CZ: '112', DK: '112',
  EE: '112', FI: '112', FR: '112', DE: '112', GR: '112', HU: '112', IS: '112',
  IE: '112', IT: '112', LV: '112', LT: '112', LU: '112', MT: '112', NL: '112',
  'NO': '112', PL: '112', PT: '112', RO: '112', SK: '112', SI: '112', ES: '112', SE: '112',
  CH: '144', GB: '999',
  // Americas
  US: '911', CA: '911', MX: '911', BR: '192', AR: '107', CL: '131', CO: '123',
  PE: '106', VE: '911',
  // Asia-Pacific
  AU: '000', NZ: '111', JP: '119', KR: '119', CN: '120', TW: '119', HK: '999',
  SG: '995', MY: '999', TH: '1669', VN: '115', PH: '911', ID: '118', IN: '108',
  PK: '1122', BD: '999', LK: '1990', NP: '102',
  // Middle East & Africa
  AE: '998', SA: '997', QA: '999', KW: '112', OM: '9999', BH: '999', JO: '911',
  IL: '101', TR: '112', EG: '123', ZA: '10177', NG: '199', KE: '999', GH: '193',
  MA: '15', DZ: '14', TN: '190',
  // Eastern Europe & Central Asia
  RU: '103', UA: '103', KZ: '103', UZ: '103',
}

export function emergencyNumberForCountry(cc: string): string {
  return EMERGENCY_NUMBERS[cc.toUpperCase()] ?? '112'
}

/**
 * Open Location Code (plus code) encoder — compact, dispatcher-friendly
 * global address (~14 m at 10 chars). Dependency-free OLC implementation.
 */
export function plusCode(lat: number, lng: number): string {
  const ALPHA = '23456789CFGHJMPQRVWX'
  const latClamp = Math.min(Math.max(lat, -90), 90)
  const lngNorm = ((lng + 180) % 360 + 360) % 360 - 180
  let latV = latClamp + 90 // [0, 180]
  let lngV = lngNorm + 180 // [0, 360)
  let code = ''
  let res = 20
  for (let i = 0; i < 5; i++) {
    const latD = Math.min(Math.floor(latV / res), 19)
    const lngD = Math.min(Math.floor(lngV / res), 19)
    latV -= latD * res
    lngV -= lngD * res
    code += ALPHA[latD] + ALPHA[lngD]
    res /= 20
    if (i === 3) code += '+'
  }
  return code
}
