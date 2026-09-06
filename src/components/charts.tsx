'use client'

// OpenEir — chart primitives (recharts wrappers with clinical target zones)
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceArea, ReferenceLine, Legend,
  BarChart, Bar, Cell, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ScatterChart, Scatter, ZAxis,
} from 'recharts'
import { BP_CATEGORIES, type BpCategory } from '@/lib/health/bp'

const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

export interface BpPoint { at: string; sys: number; dia: number; pulse?: number | null; label?: string }

export function BpTrendChart({ data, sysTarget = 130, diaTarget = 80, height = 260 }: {
  data: BpPoint[]; sysTarget?: number; diaTarget?: number; height?: number
}) {
  const rows = data.map((d) => ({ ...d, when: fmtDay(d.at), h: new Date(d.at).getHours() }))
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={rows} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.08} />
        <ReferenceArea y1={sysTarget} y2={Math.min(200, sysTarget + 45)} fill={BP_CATEGORIES.stage1.color} opacity={0.07} />
        <ReferenceArea y1={diaTarget} y2={Math.min(130, diaTarget + 30)} fill={BP_CATEGORIES.stage1.color} opacity={0.05} />
        <ReferenceLine y={sysTarget} stroke={BP_CATEGORIES.stage1.color} strokeDasharray="6 4" label={{ value: `Systolic target ${sysTarget}`, position: 'insideTopRight', fontSize: 10 }} />
        <ReferenceLine y={diaTarget} stroke={BP_CATEGORIES.elevated.color} strokeDasharray="6 4" label={{ value: `Diastolic target ${diaTarget}`, position: 'insideBottomRight', fontSize: 10 }} />
        <XAxis dataKey="when" tick={{ fontSize: 11 }} minTickGap={28} />
        <YAxis domain={[55, 175]} tick={{ fontSize: 11 }} />
        <Tooltip
          formatter={(v: number, name: string) => [`${v}${name === 'Pulse' ? ' bpm' : ' mmHg'}`, name]}
          labelFormatter={(_, p) => {
            const row = p?.[0]?.payload as BpPoint | undefined
            return row ? `${new Date(row.at).toLocaleString()}` : ''
          }}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Line type="monotone" dataKey="sys" name="Systolic" stroke={BP_CATEGORIES.stage2.color} strokeWidth={2} dot={{ r: 2.2 }} activeDot={{ r: 4 }} />
        <Line type="monotone" dataKey="dia" name="Diastolic" stroke={BP_CATEGORIES.normal.color} strokeWidth={2} dot={{ r: 2.2 }} activeDot={{ r: 4 }} />
        <Line type="monotone" dataKey="pulse" name="Pulse" stroke={BP_CATEGORIES.low.color} strokeWidth={1.4} strokeDasharray="4 3" dot={false} yAxisId={0} hide={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}

export function GlucoseCurveChart({ data, min, max, unit, height = 240 }: {
  data: { at: string; value: number; context: string }[]
  min: number; max: number; unit: 'mmol' | 'mgdl'; height?: number
}) {
  const conv = (v: number) => (unit === 'mgdl' ? Math.round(v * 18.016) : v)
  const rows = data.map((d) => ({
    ...d, when: fmtDay(d.at), v: conv(d.value),
    min: conv(min), max: conv(max),
  }))
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={rows} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.08} />
        <ReferenceArea y1={conv(min)} y2={conv(max)} fill={BP_CATEGORIES.normal.color} opacity={0.1} label={{ value: 'In range', position: 'insideTop', fontSize: 10, fill: '#059669' }} />
        <XAxis dataKey="when" tick={{ fontSize: 11 }} minTickGap={28} />
        <YAxis domain={[Math.max(2, conv(3.2)), conv(11)]} tick={{ fontSize: 11 }} />
        <Tooltip
          formatter={(v: number) => [`${v} ${unit === 'mgdl' ? 'mg/dL' : 'mmol/L'}`, 'Glucose']}
          labelFormatter={(_, p) => {
            const row = p?.[0]?.payload as { at: string; context: string } | undefined
            return row ? `${new Date(row.at).toLocaleString()} · ${row.context.replace('_', ' ')}` : ''
          }}
        />
        <Line type="monotone" dataKey="v" name="Glucose" stroke="#0d9488" strokeWidth={2} dot={{ r: 2 }} />
      </LineChart>
    </ResponsiveContainer>
  )
}

export function CategoryDistribution({ distribution, height = 200 }: {
  distribution: Record<string, number>; height?: number
}) {
  const order: BpCategory[] = ['low', 'normal', 'elevated', 'stage1', 'stage2', 'crisis']
  const total = Object.values(distribution).reduce((a, b) => a + b, 0) || 1
  const rows = order.map((k) => ({
    key: k, name: BP_CATEGORIES[k].label,
    pct: Math.round(((distribution[k] ?? 0) / total) * 100),
    color: BP_CATEGORIES[k].color,
  }))
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 24, left: 30, bottom: 0 }}>
        <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} />
        <Tooltip formatter={(v: number) => [`${v}%`, 'Share']} />
        <Bar dataKey="pct" radius={[0, 6, 6, 0]} barSize={16}>
          {rows.map((r) => <Cell key={r.key} fill={r.color} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export function ScoreRadar({ components, height = 240 }: {
  components: { label: string; value: number }[]; height?: number
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={components} outerRadius="72%">
        <PolarGrid stroke="currentColor" opacity={0.12} />
        <PolarAngleAxis dataKey="label" tick={{ fontSize: 11 }} />
        <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
        <Radar dataKey="value" stroke="#0d9488" fill="#0d9488" fillOpacity={0.28} strokeWidth={2} />
        <Tooltip formatter={(v: number) => [`${v}/100`, 'Score']} />
      </RadarChart>
    </ResponsiveContainer>
  )
}

export function CorrelationScatter({ sleep, bp, height = 220 }: {
  sleep: { date: string; sleepQuality: number | null }[]
  bp: { at: string; sys: number; label?: string }[]
  height?: number
}) {
  // pair each night's sleep with next morning's avg systolic
  const morningByDay = new Map<string, number[]>()
  for (const r of bp) {
    const d = new Date(r.at)
    if (d.getHours() < 11) {
      const key = d.toISOString().slice(0, 10)
      morningByDay.set(key, [...(morningByDay.get(key) ?? []), r.sys])
    }
  }
  const rows: { sleep: number; sys: number }[] = []
  for (const l of sleep) {
    if (!l.sleepQuality) continue
    const next = new Date(l.date + 'T00:00:00'); next.setDate(next.getDate() + 1)
    const key = next.toISOString().slice(0, 10)
    const vals = morningByDay.get(key)
    if (vals?.length) rows.push({ sleep: l.sleepQuality, sys: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) })
  }
  const jitter = rows.map((r, i) => ({ ...r, x: r.sleep + ((i % 5) - 2) * 0.06 }))
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ScatterChart margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.08} />
        <XAxis dataKey="sleep" name="Sleep" domain={[0.5, 5.5]} ticks={[1, 2, 3, 4, 5]} tick={{ fontSize: 11 }} label={{ value: 'sleep quality (1–5)', fontSize: 10, position: 'insideBottom', offset: -2 }} />
        <YAxis dataKey="sys" name="Systolic" domain={['dataMin - 5', 'dataMax + 5']} tick={{ fontSize: 11 }} />
        <ZAxis range={[55, 55]} />
        <Tooltip formatter={(v: number, n: string) => [n === 'sleep' ? `${v}/5` : `${v} mmHg`, n === 'sleep' ? 'Sleep' : 'Morning systolic']} />
        <Scatter data={jitter} fill="#0d9488" fillOpacity={0.65} />
      </ScatterChart>
    </ResponsiveContainer>
  )
}
