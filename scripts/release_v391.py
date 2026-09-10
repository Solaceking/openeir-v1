#!/usr/bin/env python3
"""Create GitHub release v3.9.1 for Solaceking/openeir and upload the APK."""
import json
import os
import sys
import urllib.request

TOKEN = os.environ["GITHUB_TOKEN"]
REPO = "Solaceking/openeir"
TAG = "v3.9.1"
APK = "/home/z/my-project/download/OpenEir-v3.9.1-signed.apk"

BODY = """## v3.9.1 — Permissions, done right

### Fixed — the microphone (root cause found) 🎙
- **The mic never worked because the app never asked for it.** The app's manifest declared no `CAMERA` / `RECORD_AUDIO` / location permissions, so Android showed nothing to grant — and inside the WebView every microphone request was denied **silently, without a dialog**. The app now declares microphone, camera and location permissions, so Android's own "Allow OpenEir to use the microphone?" dialog appears the first time a voice feature needs it. Android Settings → Apps → OpenEir → **Permissions** now lists everything, too.

### Added — one honest place for every permission 🔐
- **Onboarding**: after your server checks out, the app shows a **"Permissions, plainly"** step — microphone, camera, location, notifications, each with a one-line reason (mic only listens while a voice feature is open; camera is for QR pairing and photographing documents; location is only used with SOS; notifications are med reminders). One tap to allow, a clear skip button, and **everything still works if you skip** — the matching feature simply steps aside.
- **In the web app**: Settings → Profile & accounts → **App permissions** (visible only inside the Android app) shows the live state of each permission with an **Allow** button, and an **Open Android settings** shortcut for anything permanently blocked. Updated strings ship via your own server (pull this release).
- If the mic is blocked, the Talk view now **says so and names the fix** instead of silently ignoring the button.

### Install note — one-time uninstall 🔑
- The signing key changed **again** (build sandbox wiped between releases; the v3.8.3 key did not survive it). **Uninstall the previous OpenEir app before installing this one** — Android refuses a different signature over an existing install ("App not installed"). Your data is on your server; you'll re-pair by scanning the QR from Settings → Pair the mobile app, and sign in as usual.
- The new keystore (`openeir-release.keystore` + password file) is delivered out-of-band — **please store it somewhere permanent this time**; every future update chains from it.

### Verified
- APK: `versionCode 30901`, signed (RSA 4096, 10-year), `apksigner verify` clean. SHA-256: `c444ba9abe7e4f3dd765d165b95680ccddf4aabd0071cbe14ee1d8a8d4f9813f`
- Merged manifest inspected: RECORD_AUDIO + MODIFY_AUDIO_SETTINGS, CAMERA, ACCESS_FINE/COARSE_LOCATION present; camera/mic/location hardware flags marked non-required so old devices still install.

**Full changelog**: https://github.com/Solaceking/openeir/compare/v3.8.3...v3.9.1
"""

data = json.dumps({
    "tag_name": TAG,
    "name": "v3.9.1 — Permissions done right (mic fixed) + in-app permission manager",
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
        rid = d["id"]
        print("created:", d["html_url"], "| id:", rid)
except urllib.error.HTTPError as e:
    print("HTTP", e.code, e.read().decode()[:400])
    sys.exit(1)

# upload the APK asset
with open(APK, "rb") as f:
    payload = f.read()
up = urllib.request.Request(
    f"https://uploads.github.com/repos/{REPO}/releases/{rid}/assets?name=OpenEir.apk",
    data=payload,
    headers={
        "Authorization": f"Bearer {TOKEN}",
        "Content-Type": "application/vnd.android.package-archive",
    },
    method="POST",
)
try:
    with urllib.request.urlopen(up) as r:
        d = json.load(r)
        print("uploaded:", d["name"], d["size"], "bytes |", d["browser_download_url"])
except urllib.error.HTTPError as e:
    print("UPLOAD HTTP", e.code, e.read().decode()[:400])
    sys.exit(1)
