// OpenEir — Agent Harness: MCP-style tool manifest.
// External agents (Hermes, OpenClaw, Claude Code, custom) can discover
// OpenEir's capabilities here and drive the app autonomously.
import { ok } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

export async function GET() {
  return ok({
    protocol: 'openeir-agent-v1',
    mcpCompatible: true,
    name: 'OpenEir',
    description: 'Self-hosted AI medical assistant platform. Agent API for polling health state, pushing insights, and running analyses — your agents join the medical team.',
    tools: [
      {
        name: 'health.get_context',
        description: 'Full health context: profile, targets, 30d BP/glucose stats, adherence, Eir Score, warnings, correlations.',
        method: 'GET', path: '/api/stats', auth: 'network-local',
      },
      {
        name: 'health.get_readings',
        description: 'Raw readings. Query params: type=bp|glucose, days, limit.',
        method: 'GET', path: '/api/readings/{bp|glucose}?days=30', auth: 'network-local',
      },
      {
        name: 'health.push_insight',
        description: 'Push an agent-generated insight into the user\'s ambient feed.',
        method: 'POST', path: '/api/agent/insights',
        body: { title: 'string', body: 'string', severity: 'info|low|medium|high|critical', kind: 'string', dataJson: 'object?' },
        auth: 'network-local',
      },
      {
        name: 'health.ask',
        description: 'Ask Eir a question about the user\'s data (uses configured AI provider chain).',
        method: 'POST', path: '/api/ai/ask', body: { question: 'string' }, auth: 'network-local',
      },
      {
        name: 'health.story',
        description: 'Generate or fetch this week\'s Blood Pressure Story.',
        method: 'GET', path: '/api/ai/story?force=1', auth: 'network-local',
      },
      {
        name: 'health.whatif',
        description: 'Run a What-If simulation projection.',
        method: 'POST', path: '/api/ai/whatif', body: { params: 'WhatIfParams' }, auth: 'network-local',
      },
      {
        name: 'health.poll_events',
        description: 'Poll unprocessed events (event-driven agent loops).',
        method: 'GET', path: '/api/agent/poll', auth: 'network-local',
      },
      {
        name: 'health.export',
        description: 'Export data: format=json|csv, type=bp|glucose|medications.',
        method: 'GET', path: '/api/export?format=json', auth: 'network-local',
      },
    ],
    events: [
      'READING_LOGGED', 'MEDICATION_MISSED', 'MEDICATION_TAKEN', 'PATTERN_CHECK',
      'MILESTONE_REACHED', 'ENGAGEMENT_DROP', 'BLUETOOTH_SYNCED', 'DEEP_ANALYSIS',
    ],
  })
}
