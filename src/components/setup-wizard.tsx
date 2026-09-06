'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, Check } from 'lucide-react'
import { OpenEirLogo } from '@/components/logo'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { useSaveProfile } from '@/lib/api-client'

const STEPS = ['Welcome', 'About you', 'Your targets', 'Ready']

export function SetupWizard({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [birthYear, setBirthYear] = useState('')
  const [conditions, setConditions] = useState<string[]>([])
  const [sysT, setSysT] = useState(130)
  const [diaT, setDiaT] = useState(80)
  const save = useSaveProfile()

  const finish = () => {
    save.mutate(
      {
        fullName: name || 'Friend',
        birthYear: birthYear ? Number(birthYear) : null,
        conditions,
        bpSystolicTarget: sysT,
        bpDiastolicTarget: diaT,
        onboarded: true,
      },
      { onSuccess: onDone },
    )
  }

  const toggleCondition = (c: string) =>
    setConditions((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]))

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-teal-50/60 to-background p-4 dark:from-teal-950/20">
      <Card className="w-full max-w-lg">
        <CardContent className="p-6">
          {/* progress */}
          <div className="mb-6 flex items-center gap-2" aria-hidden>
            {STEPS.map((s, i) => (
              <div key={s} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-primary' : 'bg-muted'}`} />
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }}>
              {step === 0 && (
                <div className="py-4 text-center">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-lg ring-1 ring-black/5 dark:ring-white/10">
                    <OpenEirLogo className="h-12 w-12" aria-hidden />
                  </div>
                  <h1 className="mt-4 text-2xl font-bold">Welcome to OpenEir</h1>
                  <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                    A private, self-hosted companion for your blood pressure, glucose and medications — with an ambient
                    intelligence called <b className="text-foreground">Eir</b> that watches your numbers and speaks up
                    only when it matters. Your data never leaves your server.
                  </p>
                </div>
              )}

              {step === 1 && (
                <div className="space-y-4 py-2">
                  <h2 className="text-xl font-bold">About you</h2>
                  <div>
                    <Label htmlFor="w-name">What should Eir call you?</Label>
                    <Input id="w-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex" className="mt-1.5" autoFocus />
                  </div>
                  <div>
                    <Label htmlFor="w-year">Birth year <span className="text-muted-foreground">(optional)</span></Label>
                    <Input id="w-year" type="number" value={birthYear} onChange={(e) => setBirthYear(e.target.value)} placeholder="1968" className="mt-1.5" />
                  </div>
                  <div>
                    <Label>Do any of these apply?</Label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {['Hypertension', 'Type 2 Diabetes', 'High cholesterol', 'Kidney concerns', 'Heart arrhythmia'].map((c) => (
                        <button
                          key={c} type="button" onClick={() => toggleCondition(c)} aria-pressed={conditions.includes(c)}
                          className={`min-h-[40px] rounded-full border px-4 text-sm font-medium transition-colors ${conditions.includes(c) ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent'}`}
                        >
                          {conditions.includes(c) && <Check className="mr-1 inline h-3.5 w-3.5" aria-hidden />}{c}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-6 py-2">
                  <h2 className="text-xl font-bold">Your targets</h2>
                  <p className="text-sm text-muted-foreground">Standard adult targets are 130/80 — your doctor may set different ones. You can change these anytime.</p>
                  <div>
                    <Label>Systolic target: <b>{sysT}</b> mmHg</Label>
                    <Slider value={[sysT]} min={110} max={150} step={1} onValueChange={(v) => setSysT(v[0])} className="mt-2.5" aria-label="Systolic target" />
                  </div>
                  <div>
                    <Label>Diastolic target: <b>{diaT}</b> mmHg</Label>
                    <Slider value={[diaT]} min={65} max={100} step={1} onValueChange={(v) => setDiaT(v[0])} className="mt-2.5" aria-label="Diastolic target" />
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-4 py-4 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                    <Check className="h-7 w-7" aria-hidden />
                  </div>
                  <h2 className="text-xl font-bold">You are set{name ? `, ${name.split(' ')[0]}` : ''}!</h2>
                  <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted-foreground">
                    Start with a first reading so Eir can learn your baseline. Within a week you will see patterns,
                    correlations and — when something needs attention — gentle early warnings, not alarms.
                  </p>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          <div className="mt-6 flex justify-between">
            <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
              Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button onClick={() => setStep((s) => s + 1)} className="gap-2">
                {step === 0 ? 'Get started' : 'Continue'} <ArrowRight className="h-4 w-4" aria-hidden />
              </Button>
            ) : (
              <Button onClick={finish} disabled={save.isPending} className="gap-2">
                {save.isPending ? 'Setting up…' : 'Open OpenEir'} <ArrowRight className="h-4 w-4" aria-hidden />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
