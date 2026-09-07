// OpenEir — three-tier long-term memory for Eir.
//
// Tiers:
//   core      — pinned essentials (name, allergies, life context). Never decays.
//   semantic  — durable facts worth keeping (health, preferences, doctor advice).
//   episodic  — day-to-day notes; decay after 30 days unless recalled often.
//
// Writing paths: deterministic regex extraction (always, instant, free) plus an
// optional AI extractor that runs fire-and-forget after chat replies. Reads
// always merge pinned + high-importance + query-relevant entries. SQLite LIKE
// matching only — no embeddings needed at household scale.

import { db } from '@/lib/db'

export type MemoryTier = 'core' | 'semantic' | 'episodic'
export type MemoryKind = 'fact' | 'preference' | 'person' | 'plan' | 'health' | 'reflection'

export interface CandidateMemory {
  content: string
  kind: MemoryKind
  importance: number
  pinned?: boolean
}

const EPISODIC_TTL_DAYS = 30
const PROMOTION_ACCESS_COUNT = 5

export function normalizeKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/^(the|a|an|user|they|he|she)\s+/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
}

function cleanCapture(s: string): string {
  return s.trim().replace(/[.,!?;:]+$/, '').replace(/\s+/g, ' ').slice(0, 120)
}

// --- Deterministic extraction ------------------------------------------------

const PATTERNS: { re: RegExp; build: (m: RegExpMatchArray) => CandidateMemory | null }[] = [
  {
    // "my name is Alex", "call me Alex", "I'm called Alex"
    re: /\b(?:my name is|call me|i'?m called)\s+([A-Za-z][\w'-]{1,30})/i,
    build: (m) => ({ content: `User's name is ${cleanCapture(m[1])}.`, kind: 'person', importance: 0.95, pinned: true }),
  },
  {
    // "I'm allergic to penicillin", "I am allergic to peanuts"
    re: /\bi\s*(?:'m| am)\s+allergic to\s+([^.!?;]{2,60})/i,
    build: (m) => ({ content: `User is allergic to ${cleanCapture(m[1])}.`, kind: 'health', importance: 0.97, pinned: true }),
  },
  {
    // "I've been diagnosed with hypertension", "I was diagnosed with type 2 diabetes"
    re: /\bi\s*(?:'ve| have| was|'m)\s*(?:been)? diagnosed with\s+([^.!?;]{3,60})/i,
    build: (m) => ({ content: `User has been diagnosed with ${cleanCapture(m[1])}.`, kind: 'health', importance: 0.85 }),
  },
  {
    // "my doctor said/told me/recommended/advised/prescribed ..."
    re: /\b(?:my|the)\s+(?:doctor|gp|consultant|nurse|pharmacist)\s+(?:said|told me|recommended|advised|prescribed|suggested)\s+([^.!?;]{3,90})/i,
    build: (m) => ({ content: `User's doctor ${/prescrib/i.test(m[0]) ? 'prescribed' : 'said'} ${cleanCapture(m[1])}.`, kind: 'health', importance: 0.8 }),
  },
  {
    // "I prefer walking in the evening", "I hate needles", "I love walking"
    re: /\bi\s+(?:really\s+)?(?:prefer|like|love|enjoy|hate|dislike|can'?t stand|cannot stand)\s+([^.!?;]{3,70})/i,
    build: (m) => {
      const verb = m[0].match(/(?:prefer|like|love|enjoy|hate|dislike|can'?t stand|cannot stand)/i)?.[0].toLowerCase() ?? 'likes'
      const subject = /hate|dislike|stand/.test(verb) ? 'User dislikes' : /prefer/.test(verb) ? 'User prefers' : 'User likes'
      return { content: `${subject} ${cleanCapture(m[1])}.`, kind: 'preference', importance: 0.65 }
    },
  },
  {
    // "my wife/husband/partner/... name is..." or "my daughter takes ..."
    re: /\bmy\s+(wife|husband|partner|daughter|son|mother|father|mum|mom|dad|sister|brother|grandson|granddaughter|carer)\s+([\w' ]{2,50})/i,
    build: (m) => ({ content: `User's ${cleanCapture(m[1])} — ${cleanCapture(m[2])}.`, kind: 'person', importance: 0.6 }),
  },
  {
    // "I will start walking daily", "I plan to cut salt", "I'm going to see the cardiologist"
    re: /\bi\s+(?:will|am going to|plan to|plan on|started|start(?:ed)?)\s+([^.!?;]{3,70})/i,
    build: (m) => ({ content: `User plans to ${cleanCapture(m[1])}.`, kind: 'plan', importance: 0.55 }),
  },
  {
    // "I work as a nurse", "I live in Galway", "I retired last year"
    re: /\bi\s+(?:work as|work in|live in|live near|retired from)\s+([^.!?;]{3,60})/i,
    build: (m) => ({ content: `User ${/live/.test(m[0]) ? 'lives' : /retired/.test(m[0]) ? 'retired' : 'works'} ${cleanCapture(m[1].replace(/^(as|in|near)\s+/i, ''))}.`, kind: 'fact', importance: 0.6 }),
  },
]

/** Pull durable-fact candidates out of a user turn. Deterministic, instant. */
export function extractDeterministic(userText: string): CandidateMemory[] {
  const out: CandidateMemory[] = []
  for (const { re, build } of PATTERNS) {
    const m = userText.match(re)
    if (m) {
      const c = build(m)
      if (c && c.content.length > 8) out.push(c)
    }
  }
  return out.slice(0, 3)
}

// --- Store (with dedupe + tiering) -------------------------------------------

export async function storeMemory(candidate: CandidateMemory, sourceMsgId?: string): Promise<{ created: boolean }> {
  const key = normalizeKey(candidate.content)
  if (!key) return { created: false }

  const tier: MemoryTier =
    candidate.pinned ? 'core' : candidate.importance >= 0.8 ? 'semantic' : 'episodic'
  const expiresAt = tier === 'episodic' ? new Date(Date.now() + EPISODIC_TTL_DAYS * 86400000) : null

  const existing = await db.memoryEntry.findFirst({ where: { dedupeKey: key } })
  if (existing) {
    await db.memoryEntry.update({
      where: { id: existing.id },
      data: {
        accessCount: { increment: 1 },
        importance: Math.min(1, Math.max(existing.importance, candidate.importance)),
        // a repeated memory stays alive: refresh decay + promote on volume
        expiresAt: existing.tier === 'episodic' ? expiresAt : null,
        ...(existing.tier === 'episodic' && existing.accessCount + 1 >= PROMOTION_ACCESS_COUNT
          ? { tier: 'semantic' as const, expiresAt: null }
          : {}),
      },
    })
    return { created: false }
  }

  await db.memoryEntry.create({
    data: {
      content: candidate.content,
      kind: candidate.kind,
      tier,
      pinned: candidate.pinned ?? false,
      importance: candidate.importance,
      dedupeKey: key,
      sourceMsgId: sourceMsgId ?? null,
      expiresAt,
    },
  })
  return { created: true }
}

/** Store every candidate; never throws. */
export async function storeMemories(candidates: CandidateMemory[], sourceMsgId?: string): Promise<number> {
  let stored = 0
  for (const c of candidates) {
    try {
      const r = await storeMemory(c, sourceMsgId)
      if (r.created) stored++
    } catch {
      /* one bad candidate never blocks the rest */
    }
  }
  return stored
}

// --- Retrieve -----------------------------------------------------------------

const STOPWORDS = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'have', 'has', 'was', 'were', 'you', 'your', 'what', 'how', 'are', 'is', 'it', 'to', 'of', 'in', 'on', 'my', 'me', 'i', 'a', 'an', 'do', 'does', 'did', 'can', 'should', 'about'])

function queryTokens(q: string): string[] {
  return [...new Set(q.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w)))]
}

export interface RetrievedMemory {
  id: string
  tier: string
  kind: string
  content: string
  importance: number
}

export async function retrieveMemories(query: string, limit = 18): Promise<RetrievedMemory[]> {
  try {
    // opportunistic decay sweep
    await db.memoryEntry.deleteMany({ where: { expiresAt: { lt: new Date() } } })

    const [pinned, semantic, tokens] = await Promise.all([
      db.memoryEntry.findMany({ where: { pinned: true }, orderBy: { importance: 'desc' }, take: 12 }),
      db.memoryEntry.findMany({ where: { tier: 'semantic', pinned: false }, orderBy: { importance: 'desc' }, take: 14 }),
      Promise.resolve(queryTokens(query).slice(0, 6)),
    ])

    let hits: typeof pinned = []
    if (tokens.length) {
      hits = await db.memoryEntry.findMany({
        where: {
          OR: tokens.map((t) => ({ content: { contains: t } })),
        },
        orderBy: { importance: 'desc' },
        take: 8,
      })
    }

    const seen = new Set<string>()
    const merged: RetrievedMemory[] = []
    for (const m of [...pinned, ...hits, ...semantic]) {
      if (seen.has(m.id)) continue
      seen.add(m.id)
      merged.push({ id: m.id, tier: m.tier, kind: m.kind, content: m.content, importance: m.importance })
      if (merged.length >= limit) break
    }

    // recall bookkeeping + streak-based promotion (fire-and-forget)
    if (merged.length) {
      void Promise.all(merged.map((m) =>
        db.memoryEntry.update({
          where: { id: m.id },
          data: { lastAccessedAt: new Date(), accessCount: { increment: 1 } },
        }).then((row) => {
          if (row.tier === 'episodic' && row.accessCount >= PROMOTION_ACCESS_COUNT) {
            return db.memoryEntry.update({ where: { id: row.id }, data: { tier: 'semantic', expiresAt: null } })
          }
          return null
        }).catch(() => {}),
      )).catch(() => {})
    }

    return merged
  } catch {
    return [] // memory failures must never break a chat reply
  }
}

export function memoriesForPrompt(list: RetrievedMemory[]): string {
  if (!list.length) return ''
  return list.map((m) => `- ${m.content}`).join('\n')
}

// --- AI-assisted extraction (optional, fire-and-forget) ------------------------

/** Run the LLM extractor over one exchange; store whatever survives parsing. */
export async function aiExtract(userText: string, assistantText: string, sourceMsgId: string): Promise<number> {
  try {
    const { completeChat } = await import('@/lib/ai/providers')
    const result = await completeChat('insight', [
      {
        role: 'system',
        content: [
          'You extract durable, reusable facts about a person from one exchange with their health assistant.',
          'Return ONLY a JSON array (no prose, no markdown). Each item: {"content": string, "kind": "fact"|"preference"|"person"|"plan"|"health", "importance": number 0..1}.',
          'Rules: write content in third person starting with "User". Only durable facts (identity, family, preferences, diagnoses, doctor advice, plans).',
          'Skip: small talk, numbers already logged as readings, anything ephemeral. Empty array if nothing qualifies.',
        ].join('\n'),
      },
      { role: 'user', content: `User said: ${userText}\nAssistant replied: ${assistantText}` },
    ])
    if (!result.ok) return 0
    const match = result.text.match(/\[[\s\S]*\]/)
    if (!match) return 0
    const parsed = JSON.parse(match[0]) as { content?: unknown; kind?: unknown; importance?: unknown }[]
    if (!Array.isArray(parsed)) return 0
    const candidates: CandidateMemory[] = parsed
      .filter((p) => typeof p.content === 'string' && p.content.length > 8 && p.content.length < 200)
      .slice(0, 3)
      .map((p) => ({
        content: p.content as string,
        kind: (['fact', 'preference', 'person', 'plan', 'health'].includes(p.kind as string) ? p.kind : 'fact') as MemoryKind,
        importance: Math.min(0.9, Math.max(0.3, typeof p.importance === 'number' ? p.importance : 0.5)),
      }))
    return await storeMemories(candidates, sourceMsgId)
  } catch {
    return 0
  }
}
