#!/usr/bin/env python3
"""Create GitHub release v3.8.3 for Solaceking/openeir (urllib, no deps)."""
import json
import os
import urllib.request

TOKEN = os.environ["GITHUB_TOKEN"]
REPO = "Solaceking/openeir"
TAG = "v3.8.3"

BODY = """## v3.8.3 — Pairing finally works

### Fixed 📶
- **The app could never connect, on any server.** The onboarding shell read plugin results through a `{value: …}` wrapper that Capacitor does not send — so even a successful server check (HTTP 200 on `/api/auth/status`) was treated as a failure and pairing bounced with "Could not reach an OpenEir server". Result paths now read the real shape (and still tolerate the wrapped one): validate, connect, get-server prefill.
- **The plain-HTTP toggle did not respond to taps** — it was a `<span>` wrapping the checkbox. It is a `<label>` now.
- **The pairing QR could encode the wrong origin** (preview/localhost addresses) — the server now lists its real addresses (public HTTPS first, tailnet via `OPENEIR_PAIR_ORIGINS`) and an admin picks which one the QR encodes.

### Verified
- Headless-browser pass on the exact onboarding shell: slider tap toggles the switch; connect succeeds against the raw Capacitor result shape; the wrapped shape still works; failures surface their real HTTP error; the QR flow fills the address and connects in one tap.
- Real-server check: `GET /api/auth/status` → `200 {"mode":"accounts"}` — the exact request `validate` makes.

### Changed — signing key rotation 🔑
- **Install note:** uninstall the previous app copy before installing this one (new signing key after a sandbox wipe + precautionary rotation) — one time. Future updates chain from this signature.
- Keystore + password delivered out-of-band; mirrored gitignored inside the project; `*-PASSWORD.txt` is now gitignored everywhere.

### Also in this release (parallel work)
- Talk: attachments (images/PDFs, vision + text extraction) and conversation sessions; voice STT provider presets; proxy fix for mascot/logo.

**Full changelog**: https://github.com/Solaceking/openeir/compare/v3.8.2...v3.8.3
"""

data = json.dumps({
    "tag_name": TAG,
    "name": "v3.8.3 — Pairing fixed (result shape + toggle + QR origin)",
    "body": BODY,
    "draft": False,
    "prerelease": False,
}).encode()

req = urllib.request.Request(
    f"https://api.github.com/repos/{REPO}/releases",
    data=data,
    headers={
        "Authorization": f"Bearer {TOKEN}",
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json",
    },
    method="POST",
)

try:
    with urllib.request.urlopen(req) as r:
        d = json.load(r)
        print("created:", d["html_url"], "| id:", d["id"])
except urllib.error.HTTPError as e:
    print("HTTP", e.code, e.read().decode()[:500])
