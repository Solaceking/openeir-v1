'use client'

// OpenEir — attachment sheet (Talk composer "+"). Two clean options:
//   · Image — take a photo or pick one; runs the device-scan pipeline (vision
//     + local OCR, always human-confirmed) or sends as a chat vision input.
//   · File — PDF / text / markdown / CSV; text is extracted and handed to
//     Eir with the next message.
// Voice logging is NOT here — the mic next to the input already does that.

import { useRef, useState } from 'react'
import { Camera, FileText, Loader2, X, Paperclip, ScanLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useT } from '@/lib/i18n'

export interface PendingImage { mediaType: string; dataBase64: string; name: string; previewUrl: string }
export interface PendingFile { name: string; excerpt: string; chars: number }

const MAX_IMAGE = 8 * 1024 * 1024
const MAX_FILE = 8 * 1024 * 1024
const EXCERPT_CAP = 12_000
const TEXT_EXT = /\.(txt|md|markdown|csv|json|log)$/i

async function fileToBase64(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer())
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < buf.length; i += CHUNK) {
    bin += String.fromCharCode(...buf.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

/** Extract text from a pdf/text file entirely client-side. */
async function extractText(file: File): Promise<string> {
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    const { extractText: pdfExtract, getDocumentProxy } = await import('unpdf')
    const buf = new Uint8Array(await file.arrayBuffer())
    const pdf = await getDocumentProxy(buf)
    const { text } = await pdfExtract(pdf, { mergePages: true })
    return (text || '').trim()
  }
  return (await file.text()).trim()
}

export function AttachSheet({
  open, onOpenChange,
  onImage, onFile,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onImage: (img: PendingImage) => void
  onFile: (f: PendingFile) => void
}) {
  const { t } = useT()
  const camRef = useRef<HTMLInputElement>(null)
  const imgRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const pickImage = async (file: File | undefined) => {
    if (!file) return
    setErr(null)
    if (!file.type.startsWith('image/')) { setErr(t('talk.attachBadImage')); return }
    if (file.size > MAX_IMAGE) { setErr(t('talk.attachTooLarge')); return }
    setBusy('image')
    try {
      const dataBase64 = await fileToBase64(file)
      onImage({ mediaType: file.type === 'image/heic' ? 'image/jpeg' : file.type, dataBase64, name: file.name || 'photo', previewUrl: URL.createObjectURL(file) })
      onOpenChange(false)
    } catch { setErr(t('talk.attachReadFailed')) } finally { setBusy(null) }
  }

  const pickFile = async (file: File | undefined) => {
    if (!file) return
    setErr(null)
    const ok = file.type === 'application/pdf' || file.type.startsWith('text/')
      || file.name.toLowerCase().endsWith('.pdf') || TEXT_EXT.test(file.name)
    if (!ok) { setErr(t('talk.attachBadFile')); return }
    if (file.size > MAX_FILE) { setErr(t('talk.attachTooLarge')); return }
    setBusy('file')
    try {
      const text = await extractText(file)
      if (!text) { setErr(t('talk.attachEmptyFile')); return }
      onFile({ name: file.name, excerpt: text.slice(0, EXCERPT_CAP), chars: text.length })
      onOpenChange(false)
    } catch { setErr(t('talk.attachReadFailed')) } finally { setBusy(null) }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-label={t('talk.attach')}>
      <button className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" aria-label={t('common.close')} onClick={() => onOpenChange(false)} />
      <div className="relative w-full rounded-t-3xl border bg-card p-4 pb-safe shadow-xl sm:max-w-sm sm:rounded-3xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><Paperclip className="h-4 w-4 text-primary" /> {t('talk.attachTitle')}</h2>
          <button onClick={() => onOpenChange(false)} className="flex h-8 w-8 items-center justify-center rounded-full border bg-card text-muted-foreground hover:bg-accent" aria-label={t('common.close')}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <button
            onClick={() => camRef.current?.click()}
            disabled={busy !== null}
            className="flex min-h-[104px] flex-col items-center justify-center gap-2 rounded-2xl border border-border/70 bg-background p-3 text-center transition-colors hover:border-primary/40 disabled:opacity-50"
          >
            {busy === 'image' ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : <Camera className="h-6 w-6 text-primary" />}
            <span className="text-xs font-medium">{t('talk.attachPhoto')}</span>
            <span className="text-[10px] leading-3 text-muted-foreground">{t('talk.attachPhotoHint')}</span>
          </button>
          <button
            onClick={() => imgRef.current?.click()}
            disabled={busy !== null}
            className="flex min-h-[104px] flex-col items-center justify-center gap-2 rounded-2xl border border-border/70 bg-background p-3 text-center transition-colors hover:border-primary/40 disabled:opacity-50"
          >
            <ScanLine className="h-6 w-6 text-primary" />
            <span className="text-xs font-medium">{t('talk.attachScan')}</span>
            <span className="text-[10px] leading-3 text-muted-foreground">{t('talk.attachScanHint')}</span>
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy !== null}
            className="col-span-2 flex min-h-[64px] items-center gap-3 rounded-2xl border border-border/70 bg-background px-4 text-left transition-colors hover:border-primary/40 disabled:opacity-50"
          >
            {busy === 'file' ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : <FileText className="h-5 w-5 text-primary" />}
            <span>
              <span className="block text-xs font-medium">{t('talk.attachFile')}</span>
              <span className="block text-[10px] text-muted-foreground">{t('talk.attachFileHint')}</span>
            </span>
          </button>
        </div>
        {err && <p className="mt-3 text-xs text-destructive">{err}</p>}
        <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { void pickImage(e.target.files?.[0]); e.currentTarget.value = '' }} />
        <input ref={imgRef} type="file" accept="image/*" className="hidden" onChange={(e) => { void pickImage(e.target.files?.[0]); e.currentTarget.value = '' }} />
        <input ref={fileRef} type="file" accept=".pdf,.txt,.md,.markdown,.csv,.json,.log,application/pdf,text/*" className="hidden" onChange={(e) => { void pickFile(e.target.files?.[0]); e.currentTarget.value = '' }} />
        {busy && <p className="mt-2 text-center text-[11px] text-muted-foreground">{busy === 'file' ? t('talk.attachExtracting') : t('common.loading')}</p>}
      </div>
    </div>
  )
}

/** Compact composer chips showing what's attached and pending. */
export function AttachmentChips({
  images, file, onRemoveImage, onRemoveFile,
}: {
  images: PendingImage[]
  file: PendingFile | null
  onRemoveImage: (i: number) => void
  onRemoveFile: () => void
}) {
  const { t } = useT()
  if (!images.length && !file) return null
  return (
    <div className="flex flex-wrap gap-1.5 px-1 pb-1.5">
      {images.map((img, i) => (
        <span key={i} className="group relative flex items-center gap-1.5 rounded-full border bg-muted/40 py-0.5 pl-0.5 pr-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img.previewUrl} alt={img.name} className="h-6 w-6 rounded-full object-cover" />
          <span className="max-w-[110px] truncate text-[11px]">{img.name}</span>
          <button onClick={() => onRemoveImage(i)} className="text-muted-foreground hover:text-destructive" aria-label={t('talk.attachRemove')}>
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      {file && (
        <span className="flex items-center gap-1.5 rounded-full border bg-muted/40 py-1 pl-2.5 pr-2">
          <FileText className="h-3.5 w-3.5 text-primary" />
          <span className="max-w-[160px] truncate text-[11px]">{file.name}</span>
          <span className="text-[10px] text-muted-foreground">{(file.chars / 1000).toFixed(file.chars < 10000 ? 1 : 0)}k</span>
          <button onClick={onRemoveFile} className="text-muted-foreground hover:text-destructive" aria-label={t('talk.attachRemove')}>
            <X className="h-3 w-3" />
          </button>
        </span>
      )}
    </div>
  )
}
