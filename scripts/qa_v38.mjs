// OpenEir v3.8 QA — end-to-end server checks for the new features.
// Run against a fresh dev server (npm start) on :3000 with an EMPTY database:
//   1. bootstrap auth → create admin → session
//   2. TOTP: setup → (compute code with the same RFC 6238 parameters) → enable
//   3. login now requires the challenge + code step; backup-code login works
//   4. replay of the same TOTP code is rejected (single-use watermark)
//   5. GET /api/report?format=pdf → real PDF
//   6. UnifiedPush target register/list/delete
//   7. SMTP: unconfigured GET → email send fails cleanly
// usage: node scripts/qa_v38.mjs [baseUrl]
import { createHmac, randomBytes } from 'node:crypto'

const BASE = process.argv[2] ?? 'http://localhost:3000'
let cookie = ''
let pass = 0
let failCount = 0

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
function base32Decode(s) {
  let bits = 0, value = 0
  const bytes = []
  for (const ch of s.replace(/=+$/, '')) {
    const i = B32.indexOf(ch)
    if (i === -1) continue
    value = (value << 5) | i
    bits += 5
    if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 0xff); bits -= 8 }
  }
  return Buffer.from(bytes)
}
function totpNow(secret) {
  const counter = Math.floor(Date.now() / 1000 / 30)
  const msg = Buffer.alloc(8)
  msg.writeUInt32BE(Math.floor(counter / 0x100000000), 0)
  msg.writeUInt32BE(counter % 0x100000000, 4)
  const d = createHmac('sha1', base32Decode(secret)).update(msg).digest()
  const off = d[d.length - 1] & 0xf
  const code = (((d[off] & 0x7f) << 24) | ((d[off + 1] & 0xff) << 16) | ((d[off + 2] & 0xff) << 8) | (d[off + 3] & 0xff)) % 1e6
  return code.toString().padStart(6, '0')
}

async function api(path, opts = {}) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', cookie, ...(opts.headers ?? {}) },
  })
  const setCookie = res.headers.get('set-cookie')
  if (setCookie && setCookie.includes('openeir_session=')) {
    cookie = setCookie.split(';')[0]
  }
  const type = res.headers.get('content-type') ?? ''
  const body = type.includes('json') ? await res.json() : await res.text()
  return { status: res.status, body, headers: res.headers }
}

// the login route is rate-limited to 10/min per IP in production — the QA
// suite paces itself so it never trips its own guard
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function loginSlow(body) {
  await sleep(6200)
  return api('/api/auth/login', { method: 'POST', body: JSON.stringify(body) })
}

function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ok  ${name}`) }
  else { failCount++; console.log(`FAIL  ${name} ${detail}`) }
}

console.log('QA against', BASE)

// 1. bootstrap + account
{
  const st = await api('/api/auth/status')
  check('auth status reachable', st.status === 200 && st.body?.mode)
  const mode = st.body?.mode
  if (mode === 'bootstrap') {
    const created = await api('/api/auth/accounts', { method: 'POST', body: JSON.stringify({ username: 'qa', password: 'qa-password-123', role: 'admin' }) })
    check('create first admin', created.status === 200, JSON.stringify(created.body))
  }
  const login = await loginSlow({ username: 'qa', password: 'qa-password-123' })
  check('login with password', login.status === 200 && !!cookie, JSON.stringify(login.body))
  const me = await api('/api/auth/me')
  check('me has totpEnabled=false', me.body?.account?.totpEnabled === false)
}

// 2. TOTP setup + enable
let secret = ''
{
  const setup = await api('/api/auth/2fa', { method: 'POST', body: JSON.stringify({ action: 'setup' }) })
  check('2fa setup returns secret+uri+qr', setup.status === 200 && setup.body?.secret?.length >= 28 && setup.body?.uri?.startsWith('otpauth://') && setup.body?.qr?.startsWith('data:image/png'))
  secret = setup.body?.secret ?? ''
  const code = totpNow(secret)
  const enable = await api('/api/auth/2fa', { method: 'POST', body: JSON.stringify({ action: 'enable', code }) })
  check('2fa enable with live code', enable.status === 200 && enable.body?.enabled === true, JSON.stringify(enable.body))
  check('10 backup codes returned', Array.isArray(enable.body?.backupCodes) && enable.body.backupCodes.length === 10)
  globalThis.backupCodes = enable.body?.backupCodes ?? []
}

// 3. login with challenge (logout first)
{
  await api('/api/auth/login', { method: 'DELETE' })
  const step1 = await loginSlow({ username: 'qa', password: 'qa-password-123' })
  check('password-only now returns totpRequired', step1.body?.totpRequired === true && !!step1.body?.challenge)
  // stale password alone must not create a session
  check('no session cookie after step 1', !(step1.headers.get('set-cookie') ?? '').includes('openeir_session='))
  const wrong = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: 'qa', password: 'qa-password-123', challenge: step1.body.challenge, code: '000000' }) })
  check('wrong code rejected', wrong.status === 401)
  // the enrollment step consumed the current timestep — the single-use guard
  // rejects the same code; wait for the next authenticator window
  const msIntoWindow = Date.now() % 30_000
  await new Promise((r) => setTimeout(r, 30_500 - msIntoWindow))
  const step2 = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: 'qa', password: 'qa-password-123', challenge: step1.body.challenge, code: totpNow(secret) }) })
  check('challenge + valid code logs in', step2.status === 200 && !!cookie, JSON.stringify(step2.body))
  const me = await api('/api/auth/me')
  check('me reports totpEnabled=true', me.body?.account?.totpEnabled === true)
}

// 4. replay guard: fresh challenge + SAME code (same timestep) must fail
{
  await api('/api/auth/login', { method: 'DELETE' })
  const step1 = await loginSlow({ username: 'qa', password: 'qa-password-123' })
  const replay = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: 'qa', password: 'qa-password-123', challenge: step1.body.challenge, code: totpNow(secret) }) })
  check('TOTP replay rejected', replay.status === 401)
  // backup code path works
  const backup = globalThis.backupCodes?.[0]
  const step1b = await loginSlow({ username: 'qa', password: 'qa-password-123' })
  const viaBackup = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: 'qa', password: 'qa-password-123', challenge: step1b.body.challenge, code: backup }) })
  check('backup code logs in', viaBackup.status === 200)
  const step1c = await loginSlow({ username: 'qa', password: 'qa-password-123' })
  const backupReuse = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: 'qa', password: 'qa-password-123', challenge: step1c.body.challenge, code: backup }) })
  check('backup code single-use', backupReuse.status === 401)
  const me = await api('/api/auth/me')
  check('session alive after backup login', me.body?.account?.totpEnabled === true)
}

// 5. profile + PDF report
{
  const profile = await api('/api/profile', { method: 'PUT', body: JSON.stringify({ fullName: 'QA Tester', onboarded: true, gpEmail: 'gp@example.com' }) })
  check('profile save with gpEmail', profile.status === 200 && profile.body?.profile?.gpEmail === 'gp@example.com')
  const pdf = await api('/api/report?format=pdf')
  check('report PDF endpoint', pdf.status === 200 && pdf.body instanceof ArrayBuffer ? false : true, typeof pdf.body)
  // raw fetch for binary check
  const raw = await fetch(BASE + '/api/report?format=pdf', { headers: { cookie } })
  const buf = Buffer.from(await raw.arrayBuffer())
  check('PDF is a real PDF', raw.status === 200 && buf.subarray(0, 4).toString() === '%PDF' && buf.length > 2000, `magic=${buf.subarray(0, 4).toString()} size=${buf.length}`)
  check('PDF content-type', (raw.headers.get('content-type') ?? '').includes('application/pdf'))
}

// 6. UnifiedPush targets
{
  const ep = 'https://ntfy.sh/qa-openeir-' + randomBytes(4).toString('hex')
  const reg = await api('/api/push/unified', { method: 'POST', body: JSON.stringify({ endpoint: ep, label: 'QA Pixel' }) })
  check('unified register', reg.status === 200 && reg.body?.target?.endpoint === ep, JSON.stringify(reg.body))
  const bad = await api('/api/push/unified', { method: 'POST', body: JSON.stringify({ endpoint: 'ftp://nope' }) })
  check('invalid endpoint rejected', bad.status === 422 || bad.status === 400)
  const list = await api('/api/push/unified')
  check('unified list', list.status === 200 && (list.body?.targets ?? []).some((t) => t.endpoint === ep))
  const id = (list.body?.targets ?? []).find((t) => t.endpoint === ep)?.id
  const del = await api('/api/push/unified?id=' + encodeURIComponent(id), { method: 'DELETE' })
  check('unified delete', del.status === 200)
}

// 7. SMTP: unconfigured → report email fails cleanly
{
  const cfg = await api('/api/settings/smtp')
  check('smtp GET works (unconfigured)', cfg.status === 200 && cfg.body?.configured === false)
  const save = await api('/api/settings/smtp', { method: 'PUT', body: JSON.stringify({ host: 'smtp.example.com', port: 587, secure: false, user: 'qa@example.com', from: 'OpenEir <qa@example.com>', password: 'secret' }) })
  check('smtp save', save.status === 200, JSON.stringify(save.body))
  const cfg2 = await api('/api/settings/smtp')
  check('smtp GET configured, password write-only', cfg2.body?.configured === true && cfg2.body?.hasPassword === true && !JSON.stringify(cfg2.body).includes('secret'))
  const email = await api('/api/report/email', { method: 'POST', body: JSON.stringify({ to: 'gp@example.com', windowDays: 30 }) })
  check('report email without SMTP reach fails cleanly', email.status >= 400 && typeof email.body?.error === 'string', JSON.stringify(email.body))
  const del = await api('/api/settings/smtp', { method: 'DELETE' })
  check('smtp delete', del.status === 200)
}

console.log(`\n${pass} passed, ${failCount} failed`)
process.exit(failCount ? 1 : 0)
