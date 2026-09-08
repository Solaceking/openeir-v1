// OpenEir — agent CLI harness.
//
// Subscription auth, done legally: ChatGPT Plus, Claude Pro/Max and Google
// accounts can only be used through the vendor's own CLI (Codex, Claude Code,
// Gemini CLI) — their OAuth tokens are scoped to the CLI, not usable as API
// keys. The correct pattern is to treat the CLI as a HARNESS: OpenEir detects
// installed CLIs on the server, the user logs in once through the vendor's
// own flow, and OpenEir then routes one-shot AI calls through the CLI's
// non-interactive print mode. The subscription is used exactly as intended.
//
//   claude   -p "<prompt>"        Claude Code (Anthropic Pro/Max)
//   codex    exec "<prompt>"      Codex CLI (ChatGPT Plus/Pro)
//   gemini   -p "<prompt>"        Gemini CLI (Google account)
//   opencode run  "<prompt>"      OpenCode (multi-provider, incl. OAuth)
//
// This is also the seam where the future full agent harness (ACP adapters,
// YAML routines) plugs in — same discovery, richer protocol.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { accessSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const exec = promisify(execFile)

export interface CliAgentSpec {
  id: string
  cmd: string
  label: string
  vendor: string
  /** how the user logs in once, in their own terminal */
  login: string
  /** existence check for the CLI's stored credentials (best effort) */
  authPath?: string
  /** non-interactive print invocation */
  args: (prompt: string) => string[]
  installHint: string
}

export const CLI_AGENTS: CliAgentSpec[] = [
  {
    id: 'claude',
    cmd: 'claude',
    label: 'Claude Code',
    vendor: 'Anthropic Claude Pro / Max subscription',
    login: 'claude  →  /login  (browser OAuth)',
    authPath: '.claude.json',
    args: (p) => ['-p', p],
    installHint: 'npm install -g @anthropic-ai/claude-code',
  },
  {
    id: 'codex',
    cmd: 'codex',
    label: 'Codex CLI',
    vendor: 'ChatGPT Plus / Pro subscription',
    login: 'codex login  (browser OAuth)',
    authPath: '.codex/auth.json',
    args: (p) => ['exec', p],
    installHint: 'npm install -g @openai/codex',
  },
  {
    id: 'gemini',
    cmd: 'gemini',
    label: 'Gemini CLI',
    vendor: 'Google account login — generous free tier',
    login: 'gemini  (follows Google OAuth on first run)',
    args: (p) => ['-p', p],
    installHint: 'npm install -g @google/gemini-cli',
  },
  {
    id: 'opencode',
    cmd: 'opencode',
    label: 'OpenCode',
    vendor: 'Multi-provider — OpenAI, Anthropic, Google OAuth and more',
    login: 'opencode auth login',
    args: (p) => ['run', p],
    installHint: 'npm install -g opencode-ai  (or: curl -fsSL https://opencode.ai/install | bash)',
  },
  {
    id: 'hermes',
    cmd: 'hermes',
    label: 'Hermes Agent',
    vendor: 'Nous Research — any provider, OAuth pools',
    login: 'hermes setup  (wizard: provider + keys)',
    authPath: '.hermes/config.yaml',
    args: (p) => ['chat', '-q', p],
    installHint: 'curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash',
  },
  {
    id: 'openclaw',
    cmd: 'openclaw',
    label: 'OpenClaw',
    vendor: 'OpenClaw — self-hosted agent gateway',
    login: 'openclaw setup  (gateway + channel wizard)',
    args: (p) => ['run', '-p', p],
    installHint: 'see github.com/openclaw — install script per distro',
  },
  {
    id: 'dsh',
    cmd: 'dsh',
    label: 'DeepSeek Harness',
    vendor: 'DeepSeek — self-hosted harness (dsh)',
    login: 'dsh login  (stores DeepSeek key locally)',
    args: (p) => ['-p', p],
    installHint: 'pip install deepseek-harness  (or the dsh repo install script)',
  },
  {
    id: 'cline',
    cmd: 'cline',
    label: 'CLine',
    vendor: 'CLine — VS Code + CLI, BYOK multi-provider',
    login: 'cline auth login  (or configure via VS Code extension)',
    args: (p) => ['run', p],
    installHint: 'npm install -g cline-cli  (verify latest: cline docs)',
  },
  {
    id: 'cursor',
    cmd: 'cursor-agent',
    label: 'Cursor Agent CLI',
    vendor: 'Cursor — subscription or API key',
    login: 'cursor-agent login',
    args: (p) => ['-p', p],
    installHint: 'curl https://cursor.com/install | bash',
  },
  {
    id: 'grok',
    cmd: 'grok',
    label: 'Grok CLI',
    vendor: 'xAI — Grok API key',
    login: 'grok auth  (stores XAI_API_KEY)',
    args: (p) => ['-p', p],
    installHint: 'npm install -g @vibe-kit/grok-cli  (or xAI official CLI when released)',
  },
]

export interface DiscoveredCli {
  id: string
  cmd: string
  label: string
  vendor: string
  login: string
  installHint: string
  found: boolean
  version: string | null
  /** best-effort: does a stored credential file exist? (null = unknown) */
  authLikely: boolean | null
  error?: string
}

// The service may run under systemd's minimal PATH (no ~/.npm-global/bin),
// which would make every installed CLI invisible. Probe with an expanded PATH.
const PROBE_PATH = [
  join(homedir(), '.npm-global/bin'),
  join(homedir(), '.local/bin'),
  '/usr/local/bin',
  '/usr/local/sbin',
  process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
  '/opt/homebrew/bin',
].join(':')

/** Resolve a CLI to an absolute path via PROBE_PATH. null = not installed. */
function resolveCli(cmd: string): string | null {
  if (cmd.includes('/')) {
    try { accessSync(cmd); return cmd } catch { return null }
  }
  for (const dir of PROBE_PATH.split(':')) {
    if (!dir) continue
    const p = join(dir, cmd)
    try { accessSync(p); return p } catch { /* next dir */ }
  }
  return null
}

async function probe(spec: CliAgentSpec): Promise<DiscoveredCli> {
  const base: Omit<DiscoveredCli, 'found' | 'version' | 'authLikely'> = {
    id: spec.id, cmd: spec.cmd, label: spec.label, vendor: spec.vendor,
    login: spec.login, installHint: spec.installHint,
  }
  // found = the executable exists (instant, no cold-start flakiness).
  // version = best effort only — some CLIs hang or update-check on --version.
  const abs = resolveCli(spec.cmd)
  if (!abs) return { ...base, found: false, version: null, authLikely: null, error: 'not installed' }
  let version: string | null = null
  try {
    const { stdout } = await exec(abs, ['--version'], {
      timeout: 8_000,
      env: { ...process.env, PATH: PROBE_PATH },
    })
    version = stdout.trim().split('\n')[0]?.slice(0, 40) || null
  } catch (e) {
    const err = e as { stdout?: string }
    const printed = (err.stdout ?? '').trim().split('\n')[0]?.slice(0, 40)
    if (printed) version = printed
    // else: installed but quiet — still found
  }
  return {
    ...base,
    found: true,
    version,
    authLikely: spec.authPath ? authFileExists(spec.authPath) : null,
  }
}

function authFileExists(rel: string): boolean {
  try {
    accessSync(join(homedir(), rel))
    return true
  } catch {
    return false
  }
}

/** Probe every known agent CLI. Runs `--version` per CLI (fast, no auth calls). */
export async function discoverClis(): Promise<DiscoveredCli[]> {
  return Promise.all(CLI_AGENTS.map(probe))
}

// ---- scan registry (Buzz-style) -------------------------------------------
// Discovery is a registry scan: cheap, idempotent, timestamped, and never
// disruptive to attached providers. GET reuses a fresh scan; the explicit
// rescan (POST) forces a re-probe so a just-installed or just-logged-in CLI
// shows up without restarting the server or reloading the page.

interface ScanResult {
  agents: DiscoveredCli[]
  /** ISO timestamp of when this scan actually probed the machine */
  scannedAt: string
  /** true when served from the TTL cache instead of a fresh probe */
  cached: boolean
}

const SCAN_TTL_MS = 60_000
let scanCache: { at: number; agents: DiscoveredCli[] } | null = null

export async function scanClis(force = false): Promise<ScanResult> {
  const now = Date.now()
  if (!force && scanCache && now - scanCache.at < SCAN_TTL_MS) {
    return { agents: scanCache.agents, scannedAt: new Date(scanCache.at).toISOString(), cached: true }
  }
  const agents = await Promise.all(CLI_AGENTS.map(probe))
  scanCache = { at: now, agents }
  return { agents, scannedAt: new Date(now).toISOString(), cached: false }
}

const CLI_TIMEOUT_MS = 120_000
const CLI_MAX_BUFFER = 2 * 1024 * 1024

/**
 * One-shot AI call through a CLI harness. System+user are flattened into a
 * single prompt (print mode has no message roles). Vision is not routable
 * through harnesses — callers should fall back to an API adapter for images.
 */
export async function callCliAgent(cliId: string, systemText: string, userText: string): Promise<string> {
  const spec = CLI_AGENTS.find((c) => c.id === cliId)
  if (!spec) throw new Error(`unknown agent CLI: ${cliId}`)
  const abs = resolveCli(spec.cmd)
  if (!abs) throw new Error(`${spec.label} is not installed on the server (${spec.installHint})`)
  const prompt = systemText.trim() ? `Instructions:\n${systemText.trim()}\n\nRequest:\n${userText}` : userText
  try {
    const { stdout } = await exec(abs, spec.args(prompt), {
      timeout: CLI_TIMEOUT_MS,
      maxBuffer: CLI_MAX_BUFFER,
      env: { ...process.env, PATH: PROBE_PATH },
    })
    const text = stdout.trim()
    if (!text) throw new Error(`${spec.label} returned empty output`)
    return text
  } catch (e) {
    const err = e as { code?: string | number; killed?: boolean; message?: string }
    if (err.killed) throw new Error(`${spec.label} timed out after ${CLI_TIMEOUT_MS / 1000}s`)
    if (err.code === 'ENOENT') throw new Error(`${spec.label} is not installed on the server (${spec.installHint})`)
    throw new Error(`${spec.label} failed: ${(err.message ?? 'unknown error').slice(0, 200)}`)
  }
}
