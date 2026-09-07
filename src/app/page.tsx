'use client'

import { useEffect } from 'react'
import { useProfile, useAuth } from '@/lib/api-client'
import { AppShell } from '@/components/app-shell'
import { SetupWizard } from '@/components/setup-wizard'
import { Splash } from '@/components/splash'
import { DashboardView } from '@/components/views/dashboard'
import { TalkView } from '@/components/views/talk'
import { RecordView } from '@/components/views/record'
import { ReadingsView } from '@/components/views/readings'
import { MedicationsView } from '@/components/views/medications'
import { SafetyView } from '@/components/views/safety'
import { TrendsView } from '@/components/views/trends'
import { StoryView } from '@/components/views/story'
import { WhatIfView } from '@/components/views/whatif'
import { ReportsView } from '@/components/views/reports'
import { SettingsView } from '@/components/views/settings'
import { useUI } from '@/lib/store'

function ViewRouter() {
  const view = useUI((s) => s.view)
  switch (view) {
    case 'dashboard': return <DashboardView />
    case 'talk': return <TalkView />
    case 'record': return <RecordView />
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
  const auth = useAuth()

  useEffect(() => {
    // PWA service worker registration
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => { /* offline support is progressive */ })
    }
  }, [])

  if (profile.isLoading || auth.isLoading) {
    return <Splash />
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
