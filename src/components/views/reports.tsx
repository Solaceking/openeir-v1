'use client'

import { useState } from 'react'
import { FileText, Printer, Download, Loader2, ExternalLink, Mail } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { useStats, useProfile, useSendReportEmail } from '@/lib/api-client'
import { useT } from '@/lib/i18n'
import { PageHeader } from '@/components/page-header'
import { toast } from 'sonner'

const SECTIONS = [
  { key: 'summary', label: 'Overview & stats' },
  { key: 'narrative', label: 'AI narrative summary' },
  { key: 'bp', label: 'Blood pressure detail table' },
  { key: 'meds', label: 'Medications & adherence' },
  { key: 'glucose', label: 'Glucose section' },
  { key: 'questions', label: 'Suggested doctor questions' },
]

export function ReportsView() {
  const { t } = useT()
  const stats = useStats()
  const profile = useProfile()
  const [days, setDays] = useState('30')
  const [sections, setSections] = useState<string[]>(SECTIONS.map((s) => s.key))
  const [busy, setBusy] = useState(false)
  // "Send to GP" dialog state
  const [emailOpen, setEmailOpen] = useState(false)
  const [emailForm, setEmailForm] = useState({ to: '', message: '' })
  const sendEmail = useSendReportEmail()

  const toggleSection = (key: string) => {
    setSections((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  }

  const generate = async () => {
    setBusy(true)
    try {
      const qs = new URLSearchParams({ format: 'html', sections: sections.join(','), ...(days !== '365' ? { from: new Date(Date.now() - Number(days) * 86400000).toISOString() } : {}) })
      window.open(`/api/report?${qs.toString()}`, '_blank', 'noopener')
    } finally {
      setBusy(false)
    }
  }

  const openEmailDialog = () => {
    setEmailForm({ to: profile.data?.profile?.gpEmail ?? '', message: '' })
    setEmailOpen(true)
  }

  const sendToGp = async () => {
    try {
      const res = await sendEmail.mutateAsync({
        to: emailForm.to.trim() || undefined,
        windowDays: Number(days),
        message: emailForm.message.trim() || undefined,
      })
      toast.success(`Report emailed to ${res.to}`)
      setEmailOpen(false)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader view="reports" />

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{t('reports.sections')}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2.5 sm:grid-cols-2">
              {SECTIONS.map((s) => (
                <label key={s.key} className="flex min-h-[40px] cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm hover:bg-accent has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5">
                  <Checkbox checked={sections.includes(s.key)} onCheckedChange={() => toggleSection(s.key)} aria-label={s.label} />
                  {s.label}
                </label>
              ))}
            </div>
            <div className="flex flex-wrap items-end gap-3 border-t pt-4">
              <div>
                <Label>{t('reports.period')}</Label>
                <Select value={days} onValueChange={setDays}>
                  <SelectTrigger className="mt-1.5 w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">Last 7 days</SelectItem>
                    <SelectItem value="14">Last 14 days</SelectItem>
                    <SelectItem value="30">Last 30 days</SelectItem>
                    <SelectItem value="90">Last 90 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-1 flex-wrap gap-2">
                <Button onClick={generate} disabled={busy} className="gap-2">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Printer className="h-4 w-4" aria-hidden />}
                  {t('reports.generate')}
                </Button>
                <a href={`/api/report?format=html&sections=${sections.join(',')}&autoprint=1&from=${new Date(Date.now() - Number(days) * 86400000).toISOString()}`} target="_blank" rel="noopener">
                  <Button variant="outline" className="gap-2"><ExternalLink className="h-4 w-4" aria-hidden />{t('reports.print')}</Button>
                </a>
                <a href={`/api/report?format=pdf&sections=${sections.join(',')}&from=${new Date(Date.now() - Number(days) * 86400000).toISOString()}`} download>
                  <Button variant="outline" className="gap-2"><Download className="h-4 w-4" aria-hidden />PDF</Button>
                </a>
                <Button variant="outline" className="gap-2" onClick={openEmailDialog}>
                  <Mail className="h-4 w-4" aria-hidden />
                  Send to GP
                </Button>
              </div>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              The report opens as a print-ready A4 document — use your browser&apos;s “Save as PDF” for a clean file to email or share.
              “PDF” downloads a server-rendered copy, and “Send to GP” emails it through your own mail server.
              Everything is generated locally from your database; nothing leaves your server except the optional AI summary text and the email you choose to send.
            </p>
          </CardContent>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">What your doctor will see</CardTitle></CardHeader>
            <CardContent>
              {stats.data ? (
                <ul className="space-y-2 text-sm">
                  <li className="flex justify-between"><span className="text-muted-foreground">Readings included</span><b>{stats.data.bp30.count}</b></li>
                  <li className="flex justify-between"><span className="text-muted-foreground">Average</span><b>{stats.data.bp30.avgSys}/{stats.data.bp30.avgDia} mmHg</b></li>
                  <li className="flex justify-between"><span className="text-muted-foreground">In target</span><b>{stats.data.bp30.inTargetPct}%</b></li>
                  <li className="flex justify-between"><span className="text-muted-foreground">Adherence</span><b>{stats.data.adherence.pct}%</b></li>
                  {stats.data.gl30.count > 0 && (
                    <li className="flex justify-between"><span className="text-muted-foreground">Est. HbA1c</span><b>{stats.data.gl30.estimatedHbA1c}%</b></li>
                  )}
                  <li className="flex justify-between"><span className="text-muted-foreground">Eir Score</span><b>{stats.data.score.total}/100</b></li>
                </ul>
              ) : (
                <Skeleton className="h-40" />
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Raw exports</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <a href="/api/export?type=bp&format=csv" download><Button variant="outline" size="sm" className="gap-1.5"><Download className="h-3.5 w-3.5" aria-hidden />BP CSV</Button></a>
              <a href="/api/export?type=glucose&format=csv" download><Button variant="outline" size="sm" className="gap-1.5"><Download className="h-3.5 w-3.5" aria-hidden />Glucose CSV</Button></a>
              <a href="/api/export?type=medications&format=csv" download><Button variant="outline" size="sm" className="gap-1.5"><Download className="h-3.5 w-3.5" aria-hidden />Meds CSV</Button></a>
              <a href="/api/export?format=json" download><Button variant="outline" size="sm" className="gap-1.5"><Download className="h-3.5 w-3.5" aria-hidden />Full JSON</Button></a>
              <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground"><FileText className="h-3 w-3" aria-hidden />Yours to keep — standards-friendly formats</span>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* send-to-GP dialog */}
      <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send report to your GP</DialogTitle>
            <DialogDescription>
              A PDF report ({days}-day window, same sections as selected) is attached and sent from your own mail server.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3.5">
            <div>
              <Label htmlFor="gp-to">Recipient</Label>
              <Input
                id="gp-to" type="email" value={emailForm.to}
                onChange={(e) => setEmailForm({ ...emailForm, to: e.target.value })}
                placeholder="surgery@practice.nhs.uk" className="mt-1.5"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                {profile.data?.profile?.gpEmail ? 'Pre-filled from the GP details on your profile.' : 'Set a default in Settings → Safety → Email.'}
              </p>
            </div>
            <div>
              <Label htmlFor="gp-note">Personal note (optional)</Label>
              <Textarea
                id="gp-note" value={emailForm.message}
                onChange={(e) => setEmailForm({ ...emailForm, message: e.target.value })}
                placeholder="Dear Dr Smith, I'd like to discuss my readings at next month's appointment…"
                rows={4} className="mt-1.5"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailOpen(false)}>Cancel</Button>
            <Button onClick={() => void sendToGp()} disabled={sendEmail.isPending || !emailForm.to.trim()} className="gap-1.5">
              {sendEmail.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Mail className="h-4 w-4" aria-hidden />}
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
