'use client'

import { useEffect } from 'react'
import { useProfile } from '@/lib/api-client'
import { AppShell } from '@/components/app-shell'
import { SetupWizard } from '@/components/setup-wizard'
import { DashboardView } from '@/components/views/dashboard'
import { TalkView } from '@/components/views/talk'
import { RecordView } from '@/components/views/record'
import { VoiceView } from '@/components/views/voice'
import { ReadingsView } from '@/components/views/readings'
import { MedicationsView } from '@/components/views/medications'
import { SafetyView } from '@/components/views/safety'
import { TrendsView } from '@/components/views/trends'
import { StoryView } from '@/components/views/story'
import { WhatIfView } from '@/components/views/whatif'
import { ReportsView } from '@/components/views/reports'
import { SettingsView } from '@/components/views/settings'
import { useUI } from '@/lib/store'
import { OpenEirLogo } from '@/components/logo'

function ViewRouter() {
  const view = useUI((s) => s.view)
  switch (view) {
    case 'dashboard': return <DashboardView />
    case 'talk': return <TalkView />
    case 'record': return <RecordView />
    case 'voice': return <VoiceView />
    case 'readings': return <ReadingsView />
    case 'medications': return <MedicationsView />
    case 'safety': return <SafetyView />
    case 'trends': return <TrendsView />
    case 'story': return <StoryView />
    case 'whatif': return <WhatIfView />
    case 'reports': return <ReportsView />
    case 'settings': return <SettingsView />
    default: return <DashboardView />
  }
}

export default function OpenEirApp() {
  const profile = useProfile()

  useEffect(() => {
    // PWA service worker registration
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => { /* offline support is progressive */ })
    }
  }, [])

  if (profile.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 animate-pulse items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-black/5 dark:ring-white/10">
            <OpenEirLogo className="h-11 w-11" />
          </div>
          <span className="text-sm text-muted-foreground">Waking Eir…</span>
        </div>
      </div>
    )
  }

  if (profile.data && !profile.data.profile.onboarded) {
    return <SetupWizard onDone={() => void profile.refetch()} />
  }

  return (
    <AppShell>
      {profile.data && <ViewRouter />}
    </AppShell>
  )
}
