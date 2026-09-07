# Safety & companion — the emergency layer

OpenEir's safety layer is built on one principle: **call humans, carry facts, audit everything.** It never attempts to contact emergency services programmatically — it prepares everything a human dispatcher or a family member needs, in seconds, and notifies *your* people through every channel you gave it.

---

## 1. The SOS engine

### Triggering

The Safety tab holds the SOS ring: **press and hold for one second**. The delay is deliberate — no pocket triggers, no false positives — and the ring animation makes the countdown visible. On trigger, OpenEir:

1. **Captures location** (browser geolocation, with accuracy) at trigger time — not resolved later.
2. **Resolves emergency context** — see §2.
3. **Builds the dispatcher package** — a complete clinical snapshot (§3).
4. **Notifies your people** — every active emergency contact, every channel, plus **web push to every subscribed device** (audited in `notifiedVia`).
5. **Creates the public dispatcher card** — a read-only, tokenized page (§4).
6. **Audits the whole event** — `EmergencyEvent` row with status, location, context, package, share token, notification channels, timestamps.

### Lifecycle

| State | Meaning |
|---|---|
| `active` | Live emergency — banner on the dashboard, card live, contacts notified |
| `cancelled` | You cancelled (false alarm / handled) — card shows cancelled state |
| `resolved` | Marked handled — kept for the audit trail |

Cancelling stops the *app's* notifications; it cannot unring a phone you already answered. Emergency history is kept permanently and viewable in the Safety tab.

---

## 2. Emergency context — country-correct and place-aware

At trigger time OpenEir resolves, from the captured coordinates:

- **The correct emergency number** from a built-in ~60-country table (112/999/911/…). No lookup service, no network dependency beyond the geolocation itself.
- **The nearest emergency department** — Google Places API (New) (`type=doctor`, hospital/ED bias) with an **OpenStreetMap/Nominatim fallback** when no Google key is configured; distance is computed from your position.
- **An Open Location Code (plus-code)** — a precise, human-readable location dispatchers understand, plus a Google Maps URL.
- **Reverse-geocoded address** — street-level description where available.

Every resolved artifact is stored in the event's `context` — the card and package show exactly what was known at trigger time, not a re-interpretation later.

---

## 3. The dispatcher package

The package (`packageJson` on the event) is the complete picture a human needs:

- **Who**: name, age/sex, conditions, allergies
- **Where**: coordinates, accuracy, plus-code, maps URL, nearest ED with phone and distance
- **Who to call**: every emergency contact with every channel, primary first
- **Clinical snapshot**: GP (name, practice, address, phone from the wizard's map search), current medications with doses, latest BP/glucose readings with timestamps and categories, adherence context
- **When**: trigger timestamp, event id

---

## 4. The dispatcher card — `/sos/[token]`

A **public, noindex, tokenized page** that renders the package read-only. The share token is unique per event, `@unique` in the schema, and the page is designed for a phone screen at 2 a.m.: big number to call, big location block, meds list, contacts. Revoke-by-resolve: once an event is cancelled/resolved the card reflects it. No authentication is required *by design* — a dispatcher will not log in — which is exactly why the token is unguessable and per-event.

---

## 5. Emergency contacts

- Multiple contacts, each with a **relationship** (family / friend / carer / neighbour / other) and one **primary**.
- Each contact carries **every viable channel** — `phone`, `whatsapp`, `email`, `signal`, `other` — as a structured list. SOS blasts all of them; `tel:` and `mailto:` links open the card page ready to send.
- Contacts are editable and deactivatable (soft, `active: false`) — deactivation is audited but preserves history.
- **Companions who accept pairing are auto-added** as emergency contacts (unless pairing was created with `alsoEmergency: false`).

Honest limits: OpenEir sends what channels it can — `tel:`/`mailto:`/`sms:` deep-links and push. Automated voice-call/SMS blasting requires a telephony provider (BYO-Twilio is on the roadmap) and is *deliberately* not faked.

---

## 6. The companion loop

A **companion** is a trusted person — adult child, carer, neighbour — paired to your instance with consent, scope and a kill switch.

### Pairing flow

```
You: Safety tab → Invite companion → name + contact + scopes
     ──► one-time invite link generated (sha256-hashed token, single use, expires)
     ──► shown ONCE — copy it now, send it (SMS/email/Signal/…) yourself
Them: opens /companion/[token] → sees scopes → accepts
     ──► token exchange: invite burned, long-lived viewer token issued (hashed at rest)
     ──► viewer token stored on their device (localStorage)
     ──► if alsoEmergency: they appear in your emergency contact list
```

### What the companion sees — `/companion/view`

A scoped dashboard, polled every 60 seconds, showing exactly what the scopes grant:

| Scope | Shows |
|---|---|
| `status` | Check-in freshness (your last **I'm OK**), app heartbeat (last open), overall state |
| `meds` | Today's dose schedule with taken/pending/missed states |
| `vitals` | Latest BP and glucose with categories and timestamps |
| `location` *(opt-in, off by default)* | Last shared location context |
| `live_audio` *(reserved)* | Future live-listening — never enabled without explicit consent |

Plus: a persistent **SOS banner** when an emergency is active, and a **Nudge** button — "thinking of you, check in" — that arrives as a realtime toast if your app is open, or a **web push** if it isn't.

### Consent, revocation, audit

- Pairing is **opt-in by the elder and accepted by the companion** — both sides consent.
- Scopes are granted at invite time and visible to the companion *before* accepting.
- **Revoke** in the Safety tab kills the viewer token instantly — the next poll returns `403 revoked` and their dashboard shows the unpaired state.
- The link can't be replayed: invite tokens are single-use and burned on acceptance; both tokens are stored **hashed** (sha256).
- `lastSeenAt` on the link gives you a record of when they last looked.

### Check-ins

The Safety tab gives you an **I'm OK** button; the check-in timestamp drives the companion's freshness view. Missed-check-in escalation (auto-SOS after a configurable silence) is designed and on the roadmap — see [ROADMAP.md](ROADMAP.md).

---

## 7. Web push — how notifications actually arrive

VAPID keys are **generated into your database on first use** (`GET /api/push`) — zero configuration, fully self-hosted, no vendor account. Subscriptions (`PushSubscription`) are endpoint-unique with error tracking: deliveries that return `404/410` prune the dead endpoint; other errors are recorded and surfaced in Settings → Alerts, where you can label devices, test-push, and remove stale ones. The service worker (`sw.js`) handles `push` and `notificationclick` — SOS notifications are `requireInteraction` with vibration and deep-link to the card.

Browsers require **HTTPS** (or localhost) for push and mic — see [DEPLOYMENT.md](DEPLOYMENT.md). iOS Safari requires the app installed to the home screen (PWA) before it will ask for notification permission.

---

## 8. What the safety layer is *not*

- **Not a certified alarm system.** It prepares and notifies humans; it does not guarantee a response. For monitored professional care, use a certified telecare service *alongside* OpenEir.
- **Not automatic machine dispatch.** Dialing 999/112 programmatically is regulated territory; OpenEir's authority ends at "hand a human everything they need."
- **Not a fall detector.** Fall/failure-to-respond event *kinds* exist in the schema for integrations, but detection is not claimed.

Related: [GETTING_STARTED.md → SOS drill](GETTING_STARTED.md) · [MEMORY_AND_BRIEFING.md](MEMORY_AND_BRIEFING.md) (push delivery of briefings) · [SECURITY.md](SECURITY.md) (token handling).
