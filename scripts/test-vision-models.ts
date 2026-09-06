// Test: does the builtin gateway accept vision (image) content, and which model?
import ZAI from 'z-ai-web-dev-sdk'
import fs from 'node:fs'

const MODELS = ['glm-4.5v', 'glm-4.6v', 'glm-4v-flash', 'glm-5.3-flash']

async function tryModel(model: string, b64: string): Promise<boolean> {
  try {
    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({
      model,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'What numbers do you see? Reply with only the numbers in format X/Y and Z bpm.' },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } },
        ],
      }],
      thinking: { type: 'disabled' },
    } as unknown as Parameters<typeof zai.chat.completions.create>[0])
    const text = completion.choices[0]?.message?.content ?? ''
    console.log(`[${model}] OK -> ${text.slice(0, 120).replace(/\n/g, ' ')}`)
    return true
  } catch (e) {
    console.log(`[${model}] FAIL -> ${e instanceof Error ? e.message.slice(0, 140) : e}`)
    return false
  }
}

const b64 = fs.readFileSync('/home/z/my-project/scripts/test-bp-monitor.png').toString('base64')
for (const m of MODELS) {
  const ok = await tryModel(m, b64)
  if (ok) break
}
