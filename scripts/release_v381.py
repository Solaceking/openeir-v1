#!/usr/bin/env python3
"""Create GitHub release v3.8.1 for Solaceking/openeir (urllib, no deps)."""
import json
import os
import urllib.request

TOKEN = os.environ["GITHUB_TOKEN"]
REPO = "Solaceking/openeir"
TAG = "v3.8.1"

BODY = """## v3.8.1 — CI activation

### Changed — CI
- **Android build workflow activated**: `.github/workflows/android.yml` is now live in the repo (previously shipped as `docs/ci/android.yml`, awaiting a deploy token with the GitHub `workflow` scope). Every `v*` tag push now builds `OpenEir.apk` on GitHub-hosted runners and attaches it to the matching release — signed when the four keystore secrets are set, unsigned otherwise. **This release carries the first (unsigned, test) APK — see assets below.**
- Housekeeping: removed a 1-byte broken `.github/workflows/deploy.yml` stub (never valid, never fired); the landing-site copy directory is gitignored so tooling cannot re-add it as a stray submodule pointer; `docs/MOBILE.md` release section updated — activation is done.

### Notes for the APK asset
- `OpenEir.apk` here is **unsigned** — fine for install-testing on a device ("install anyway" prompt), not for distribution. Signed builds begin as soon as the four `OPENEIR_KEY*` repository secrets are configured (see `docs/MOBILE.md` → Releases).
- The app connects to **your own** OpenEir server; onboarding asks for the server URL (HTTPS enforced).

**Full changelog**: https://github.com/Solaceking/openeir/compare/v3.8...v3.8.1
"""

data = json.dumps({
    "tag_name": TAG,
    "name": "v3.8.1 — Android CI activated (first APK)",
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
        print("created:", d["html_url"])
except urllib.error.HTTPError as e:
    print("HTTP", e.code, e.read().decode()[:500])
