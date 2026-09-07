'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BookOpen, RefreshCw, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useT } from '@/lib/i18n'
import { PageHeader } from '@/components/page-header'

interface StoryResponse {
  story: string
  weekStart: string
  cached: boolean
  createdAt: string
  provider?: string
}

export function StoryView() {
  const { t } = useT()
  const qc = useQueryClient()

  const story = useQuery<StoryResponse>({
    queryKey: ['story'],
    queryFn: async () => {
      const res = await fetch('/api/ai/story')
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? `HTTP ${res.status}`)
      }
      return res.json() as Promise<StoryResponse>
    },
    staleTime: Infinity,
    retry: false,
  })

  const regenerate = async () => {
    await fetch('/api/ai/story?force=1')
    await qc.invalidateQueries({ queryKey: ['story'] })
  }

  const monday = (() => {
    const d = new Date()
    const diff = d.getDay() === 0 ? 6 : d.getDay() - 1
    d.setDate(d.getDate() - diff)
    return d
  })()

  return (
    <div className="space-y-4">
      <PageHeader
        view="story"
        subtitle={`Week of ${monday.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })} · ${t('story.subtitle')}`}
        actions={
          <>
            {!story.data && (
              <Button onClick={() => story.refetch()} disabled={story.isFetching} className="gap-2">
                {story.isFetching ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <BookOpen className="h-4 w-4" aria-hidden />}
                {story.isFetching ? t('story.generating') : t('story.generate')}
              </Button>
            )}
            {story.data && (
              <Button variant="outline" onClick={regenerate} className="gap-2">
                <RefreshCw className="h-4 w-4" aria-hidden /> Regenerate
              </Button>
            )}
          </>
        }
      />

      {story.isFetching && (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-14">
            <Loader2 className="h-8 w-8 animate-spin text-teal-600" aria-hidden />
            <div className="text-center">
              <p className="font-medium">{t('story.generating')}</p>
              <p className="mt-1 text-sm text-muted-foreground">Eir is reading your last 7 days of readings, meds and lifestyle context…</p>
            </div>
          </CardContent>
        </Card>
      )}

      {story.error && !story.isFetching && (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm font-medium">Could not write the story</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{(story.error as Error).message}</p>
            <Button onClick={() => story.refetch()} variant="outline" className="mt-4">Try again</Button>
          </CardContent>
        </Card>
      )}

      {story.data && !story.isFetching && (
        <Card className="border-teal-200/60 bg-gradient-to-b from-teal-50/40 to-transparent dark:border-teal-900">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2"><BookOpen className="h-4 w-4 text-teal-600" aria-hidden />{t('story.title')} — {t('common.week')} {story.data.weekStart}</span>
              <Badge variant="outline" className="text-[10px]">
                {story.data.cached ? 'cached' : 'fresh'}{story.data.provider ? ` · ${story.data.provider}` : ''}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-w-2xl whitespace-pre-wrap font-serif text-[15px] leading-relaxed text-foreground/90">
              {story.data.story}
            </div>
          </CardContent>
        </Card>
      )}

      {!story.data && !story.isFetching && !story.error && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">{t('story.empty')}</CardContent>
        </Card>
      )}
    </div>
  )
}
