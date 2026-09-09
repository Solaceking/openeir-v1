#!/usr/bin/env python3
"""Create GitHub release v3.8.2 for Solaceking/openeir (urllib, no deps)."""
import json
import os
import urllib.request

TOKEN = os.environ["GITHUB_TOKEN"]
REPO = "Solaceking/openeir"
TAG = "v3.8.2"

BODY = """## v3.8.2 — Signed app + QR pairing

### Fixed — the APK actually installs now 📱
- **v3.8.1's APK was unsigned and Android refused to install it** ("App not installed"). This release ships a **properly signed** APK (RSA 4096, 10-year validity) — `OpenEir.apk` in the assets below. Installing over an older copy may ask you to uninstall first (different signature); that is expected and one-time.
- First real compile also surfaced and fixed 16 Java errors in the mobile code (BridgeActivity API misuse, missing helpers, a nonexistent `NotificationCompat.Builder.setTag`).

### Added — QR pairing 🔗
- **Web**: Settings → Profile & accounts → **Pair the mobile app** shows this server's address as a QR code. The code carries the origin only — sign-in still happens on your own server.
- **Android**: onboarding gained a **Scan QR code** button — point the camera at the QR, the address fills in and the app connects immediately. A `http://` LAN address from a QR auto-enables the plain-HTTP opt-in.
- Scanning uses an offline ML Kit model bundled in the APK (+~22 MB) — no Google Play services required, so it works on GrapheneOS/CalyxOS.
- App versioning is tag-derived (`vMAJOR.MINOR.PATCH` → versionCode `M*10000+m*100+p`; this build: 30802) — future updates install cleanly over this one.

### Notes
- **Keep the signing keystore safe** (`openeir-release.keystore` + password were delivered out-of-band). Losing it means future updates cannot carry the same signature. When GitHub Actions billing is cleared, add the four `OPENEIR_KEY*` secrets (see `docs/MOBILE.md`) and every `v*` tag ships a signed APK automatically.
- CI note: GitHub Actions remains billing-blocked on this account; this APK was built from the exact tagged commit (`4323705`) with the same toolchain the workflow uses (JDK 21, SDK 35, Gradle 8.11.1).

**Full changelog**: https://github.com/Solaceking/openeir/compare/v3.8.1...v3.8.2
"""

data = json.dumps({
    "tag_name": TAG,
    "name": "v3.8.2 — Signed APK + QR pairing",
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
