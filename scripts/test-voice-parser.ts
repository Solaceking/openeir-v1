// OpenEir — quick sanity pass over the voice parser (run: bun scripts/test-voice-parser.ts)
import { parseVoiceCommand, normalizeNumberWords } from '../src/lib/voice/parser'
import { readbackFor } from '../src/lib/voice/types'

const CASES: [string, string, Record<string, unknown>][] = [
  ['bp keyword + pulse', 'Blood pressure 120 over 80, pulse 72', { kind: 'bp', systolic: 120, diastolic: 80, pulse: 72 }],
  ['bp spoken words', 'BP one twenty-two over eighty', { kind: 'bp', systolic: 122, diastolic: 80 }],
  ['bp bare pattern', 'my readings were 118 over 76 this morning', { kind: 'bp', systolic: 118, diastolic: 76, label: 'morning' }],
  ['bp colloquial concat', 'one twenty over eighty', { kind: 'bp', systolic: 120, diastolic: 80 }],
  ['bp pre-med label', 'blood pressure 132 over 84 after my meds', { kind: 'bp', systolic: 132, diastolic: 84, label: 'post_med' }],
  ['glucose mmol', 'glucose 6.4 fasting', { kind: 'glucose', value: 6.4, context: 'fasting', heardUnit: 'mmol/L' }],
  ['glucose mgdl convert', 'blood sugar 105 after breakfast', { kind: 'glucose', value: 5.8, context: 'post_meal', heardUnit: 'mg/dL' }],
  ['glucose explicit mg', 'sugar 90 milligrams', { kind: 'glucose', value: 5, heardUnit: 'mg/dL' }],
  ['med taken + time', 'I took my metformin at 8', { kind: 'med_taken', nameHeard: 'metformin', time: '08:00' }],
  ['med taken + dose', 'took 10 milligrams of lisinopril', { kind: 'med_taken', nameHeard: 'lisinopril', doseHeard: { value: 10, unit: 'mg' } }],
  ['med skipped', 'I skipped my lisinopril this morning', { kind: 'med_skipped', nameHeard: 'lisinopril', time: '08:00' }],
  ['note fallback', 'felt dizzy after my walk today', { kind: 'note' }],
  ['unknown single word', 'hello', { kind: 'unknown' }],
]

let pass = 0, fail = 0
for (const [label, input, expect] of CASES) {
  const intent = parseVoiceCommand(input)
  let ok = true
  for (const [k, want] of Object.entries(expect)) {
    const got = (intent.fields as Record<string, unknown>)[k] ?? (intent as unknown as Record<string, unknown>)[k]
    if (JSON.stringify(got) !== JSON.stringify(want)) { ok = false; console.log(`  ✗ ${label}: ${k} = ${JSON.stringify(got)} (want ${JSON.stringify(want)})`) }
  }
  if (ok) { pass++; console.log(`✓ ${label}  [conf ${intent.confidence.toFixed(2)}]`) } else { fail++; console.log(`  raw: "${intent.rawText}"`) }
}

console.log('\nnumber-words:', JSON.stringify([
  normalizeNumberWords('one hundred twenty'),
  normalizeNumberWords('one twenty'),
  normalizeNumberWords('twenty two'),
  normalizeNumberWords('eighty'),
  normalizeNumberWords('a hundred and five'),
]))

console.log('\nreadbacks:')
for (const [label, input] of CASES.slice(0, 12).map(c => [c[0], c[1]] as const)) {
  console.log(`  ${label}: "${readbackFor(parseVoiceCommand(input))}"`)
}
console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
