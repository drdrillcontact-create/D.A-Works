# DA Works

Personal creative workspace for **Windows desktop** and **Android**, with two-way Google Drive sync.

- One React UI, two shells: an Electron installer for Windows and a Capacitor app for Android (phone-first layout with a bottom tab bar).
- Write offline on the phone, tap **Sync**, and the desktop picks the changes up as soon as it is online.
- Per-device sync switches, automatic pickup on resume/wake/file change, a device roster and a sync activity log.
- Conflicts keep both versions; deletions never come back.

📖 **راهنمای کامل فارسی: [README.fa.md](README.fa.md)**

```bash
npm ci
npm test
npm run dist:win      # Windows x64 installer  -> release/
npm run android:apk   # Android debug APK      -> android/app/build/outputs/apk/debug/
```

Both artifacts are also built by the GitHub Actions workflows in `.github/workflows`.
