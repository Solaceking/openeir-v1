// OpenEir — local OCR fallback (tesseract.js) running in an ISOLATED child
// process. The WASM engine costs several hundred MB; loading it inside the
// Next.js server OOM-kills small hosts. The child self-terminates after each
// scan, keeping server memory flat and containing native crashes.
// First run fetches the English traineddata (~11 MB) unless pre-cached;
// fully offline installs skip gracefully (caller returns "enter manually").

import { execFile } from 'node:child_process'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { ScanFields } from './types'

const CHILD_TIMEOUT_MS = 60_000

interface WorkerOutcome { ok: boolean; text?: string; error?: string }

function runWorker(imagePath: string): Promise<WorkerOutcome> {
  return new Promise((resolve) => {
    const script = path.join(process.cwd(), 'scripts', 'ocr-worker.cjs')
    execFile(
      process.execPath,
      [script, imagePath],
      { timeout: CHILD_TIMEOUT_MS, maxBuffer: 2 * 1024 * 1024, windowsHide: true },
      (err, stdout) => {
        const line = stdout.trim().split('\n').filter(Boolean).pop() ?? ''
        try {
          const parsed = JSON.parse(line) as WorkerOutcome
          if (parsed.ok) return resolve(parsed)
          return resolve({ ok: false, error: parsed.error ?? 'local OCR failed' })
        } catch {
          return resolve({ ok: false, error: err ? err.message.slice(0, 140) : 'unreadable worker output' })
        }
      },
    )
  })
}

/** Run tesseract over an image buffer in a child process; returns plain text. */
export async function ocrImageToText(image: Buffer): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'openeir-ocr-'))
  const imagePath = path.join(dir, 'scan')
  try {
    await writeFile(imagePath, image)
    const outcome = await runWorker(imagePath)
    if (!outcome.ok) throw new Error(outcome.error ?? 'local OCR failed')
    return outcome.text ?? ''
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

/** Convenience: image buffer → parsed scan fields (or 'unknown'). */
export async function localScan(image: Buffer): Promise<{ text: string; fields: ScanFields }> {
  const text = await ocrImageToText(image)
  const { parseDeviceText } = await import('./regex-parser')
  return { text, fields: parseDeviceText(text) }
}
