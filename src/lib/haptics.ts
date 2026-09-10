// OpenEir — haptics. Inside the Capacitor Android shell the native bridge is
// injected into the app origin (allowNavigation covers the user's server), so
// the real Haptics plugin is available; on the plain web we fall back to the
// vibration API, and everywhere else this is a silent no-op. UX must never
// break over haptics — every call is guarded.
//
// Restraint matters for this audience: haptics mark *confirmations* and the
// hero action, not every tap.

type ImpactStyle = 'light' | 'medium' | 'heavy'
type NotificationStyle = 'success' | 'error' | 'warning'

interface NativeHaptics {
  impact?: (o: { style: ImpactStyle }) => Promise<void>
  notification?: (o: { type: NotificationStyle }) => Promise<void>
}

function bridge(): NativeHaptics | null {
  if (typeof window === 'undefined') return null
  try {
    const cap = (window as unknown as { Capacitor?: { Plugins?: { Haptics?: NativeHaptics } } }).Capacitor
    if (cap?.Plugins?.Haptics) return cap.Plugins.Haptics
  } catch { /* bridge not injected — web path */ }
  return null
}

function webVibrate(pattern: number | number[]) {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(pattern)
    }
  } catch { /* ignore */ }
}

/** Light tick — nav switches, hero press, sheet open. */
export function hapticLight() {
  const h = bridge()
  if (h?.impact) void h.impact({ style: 'light' }).catch(() => {})
  else webVibrate(8)
}

/** Medium — the hero action starting a conversation with Eir. */
export function hapticMedium() {
  const h = bridge()
  if (h?.impact) void h.impact({ style: 'medium' }).catch(() => {})
  else webVibrate(16)
}

/** Success — a write landed (reading, dose, report). Double tick. */
export function hapticSuccess() {
  const h = bridge()
  if (h?.notification) void h.notification({ type: 'success' }).catch(() => {})
  else webVibrate([10, 40, 14])
}

/** Error — a write failed and needs attention. */
export function hapticError() {
  const h = bridge()
  if (h?.notification) void h.notification({ type: 'error' }).catch(() => {})
  else webVibrate([30, 60, 30])
}
