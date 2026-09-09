# OpenEir Mobile — the Android companion app

OpenEir for Android is a **companion shell**: it connects the app on your phone
to *your own* OpenEir instance. Your health data never lives with us — it lives
on your box, exactly like the web app. The shell stores nothing but the server
address (and your choice to use plain HTTP on a trusted LAN).

## What the app adds over the browser

| Feature | Why it matters |
| --- | --- |
| **Biometric app lock** | Fingerprint/face gate whenever the app returns from background after the idle timeout — real protection for health data on a phone |
| **Background notifications** | Briefings, medication nudges and SOS alerts arrive while the app is closed, via **UnifiedPush** (typically the ntfy app) — no Google services required, works on GrapheneOS/CalyxOS |
| **Share Target (in)** | Share a photo (lab report, CGM screen, prescription label) from any app → straight into OpenEir's OCR pipeline |
| **Native share (out)** | Share the GP report PDF or text to Gmail/WhatsApp/print in two taps |
| **Print-to-PDF** | Android print framework renders the report exactly as your browser would |
| **Home-screen shortcuts** | Long-press the icon: *Log BP*, *Meds*, *Safety* |
| **No browser chrome** | Full-screen, themed, haptic — an app, not a tab |

## Install

Two ways to get the APK:

1. **GitHub Releases** (recommended) — download `OpenEir.apk` from the latest
   release, open it, allow "install unknown apps" when prompted.
2. **Build it yourself** — see below. The whole project is Apache-2.0; you can
   rebuild and re-sign it with your own key.

### First run

1. Enter your instance address (`https://openeir.example.com` — or check
   *"Allow plain HTTP"* only for a trusted home LAN such as `http://192.168.1.20:3000`).
2. Sign in as usual (accounts + optional two-factor codes all work inside the app).
3. Optional but recommended:
   - Enable the **app lock** (device biometrics; the gate is enforced natively).
   - Install a **UnifiedPush distributor** (we recommend
     [ntfy](https://ntfy.f-droid.bufferfox.dev/)); then Settings → Safety →
     Native push shows your device once it registers itself.

### Two-factor login in the app

If your account has 2FA enabled, the sign-in inside the app asks for your
authenticator code (or a backup code) exactly like the web login. Manage 2FA in
Settings → Profile & accounts → Two-factor authentication.

## Email reports to your GP (all platforms)

1. Admin: Settings → Safety → **Email** — enter your own SMTP server (host,
   port 587 + STARTTLS or 465 + TLS), press *Save*, then send yourself a *Test*.
2. Add the practice's address as the **default report recipient** (same panel)
   or on the profile.
3. Reports → choose window/sections → **Send to GP** — the clinical PDF is
   generated server-side and mailed through *your* server. Rate-limited to
   5 sends/hour, password stored AES-256-GCM encrypted.

The PDF is also downloadable directly: `GET /api/report?format=pdf`.

## Building from source

Requirements: Node 20+, JDK 21, Android SDK (any current Android Studio
install provides both).

```bash
cd mobile
npm install
npx cap sync android
./android/gradlew -p android assembleDebug      # → android/app/build/outputs/apk/debug/
./android/gradlew -p android assembleRelease    # signed only with a keystore (below)
```

The WebView shell lives in `mobile/shell/www` — plain HTML/JS, no framework,
nothing bundled from the internet. Native code is plain Java under
`mobile/android/app/src/main/java/app/openeir/client/`:

| File | Role |
| --- | --- |
| `MainActivity` | server hand-off, biometric lock gate, Share Target upload, shortcut deep links |
| `OpenEirBridge` | the Capacitor plugin the shell talks to (validate/connect/share/print/haptics/app-lock/push) |
| `OpenEirPushService` | UnifiedPush receiver → notification channels (briefing/meds/SOS) + endpoint registration |

## Releases (signing)

Release APKs are built by `.github/workflows/android.yml` on every `v*` tag.
Add four repository **secrets** to publish signed builds:

1. Generate a keystore once (keep the file + passwords safe — losing them means
   you can never update-sideload the same signature again):

   ```bash
   keytool -genkeypair -v -keystore openeir-release.keystore \
     -alias openeir -keyalg RSA -keysize 4096 -validity 10000
   ```

2. Add to the GitHub repo → Settings → Secrets → Actions:
   - `OPENEIR_KEYSTORE_B64` — `base64 -w0 openeir-release.keystore`
   - `OPENEIR_KEYSTORE_PASSWORD`
   - `OPENEIR_KEY_ALIAS` (e.g. `openeir`)
   - `OPENEIR_KEY_PASSWORD`

Without secrets the workflow still uploads an **unsigned** APK — good for
testing, not for release.

## Privacy notes

- The shell talks only to the server you paired. No analytics, no crash
  reporting, no telemetry.
- Push messages pass through your chosen UnifiedPush distributor (e.g. ntfy.sh
  or your own ntfy) as an opaque encrypted-in-transit payload — the same JSON
  the server sends to browser subscriptions.
- Session cookies live in the app's WebView, protected by the biometric gate;
  sign out from the web UI to clear them.
- `allowBackup` is disabled — Android cannot copy the app (and its cookies)
  into unencrypted cloud backups.
