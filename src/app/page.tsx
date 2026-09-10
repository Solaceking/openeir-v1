'use client'

import { useEffect } from 'react'
import { motion } from 'framer-motion'
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
import type { ViewKey } from '@/lib/nav'
import { springScreen } from '@/lib/motion'

function ViewRouter() {
  const view = useUI((s) => s.view)
  const viewFor = (v: ViewKey) => {
    switch (v) {
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
  // Spring entrance on every screen change. Talk is exempt from the
  // wrapper: animating a transform ancestor would briefly re-contain its
  // fixed-positioned composer.
  if (view === 'talk') return viewFor(view)
  return (
    <motion.div
      key={view}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springScreen}
    >
      {viewFor(view)}
    </motion.div>
  )
}

const VALID_VIEWS: ViewKey[] = ['dashboard', 'talk', 'record', 'readings', 'medications', 'safety', 'trends', 'story', 'whatif', 'reports', 'settings']

export default function OpenEirApp() {
  const profile = useProfile()
  const auth = useAuth()

  useEffect(() => {
    // PWA service worker registration
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => { /* offline support is progressive */ })
    }
  }, [])

  useEffect(() => {
    // deep link: /?view=record or /#record — used by Android app shortcuts,
    // notifications and anything that needs to land on a specific screen
    try {
      const url = new URL(window.location.href)
      const raw = url.searchParams.get('view') ?? url.hash.replace(/^#\/?/, '')
      if (raw && VALID_VIEWS.includes(raw as ViewKey)) {
        useUI.getState().setView(raw as ViewKey)
      }
    } catch { /* malformed URL — ignore */ }
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
