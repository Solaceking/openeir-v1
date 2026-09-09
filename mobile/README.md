# OpenEir Mobile (Android)

The Android companion app — a native shell that connects your phone to **your
own** OpenEir instance. See **[docs/MOBILE.md](../docs/MOBILE.md)** for
features, installation, building and release signing.

Quick build:

```bash
npm install
npx cap sync android
./android/gradlew -p android assembleDebug
```

- App ID: `app.openeir.client`
- Shell (onboarding) UI: `shell/www/`
- Native code: `android/app/src/main/java/app/openeir/client/`
- CI: `../.github/workflows/android.yml` builds the release APK on `v*` tags
