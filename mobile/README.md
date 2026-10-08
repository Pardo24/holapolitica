# Hola Política — Mobile (Capacitor wrapper)

This directory is a thin Capacitor 6 wrapper around the production
Next.js web app in `../frontend`. The native shell loads the canonical
web URL inside a WebView — there is **no duplicated UI** and no React
Native. Same code, packaged for iOS and Android.

## Why a wrapper at all (Apple guideline 4.2)

Apple has historically rejected "web in a frame" apps. We mitigate this by
shipping native features the web cannot deliver:

- **Push notifications** — `@capacitor/push-notifications` over APNs/FCM
  (see `docs/push-setup.md`).
- **Universal Links / App Links** — `https://holapolitica.org/votes/123`
  opens the right screen in the app (see `docs/deeplinks.md`).
- **Native share sheet** — `@capacitor/share` extends the Web Share API
  with iOS/Android share extensions.
- **Offline screen** — `www/offline.html` ships inside the binary and is
  shown (via `server.errorPath`) when the site can't be reached.

## Required dev environment

| Tool             | Version              | Notes                              |
| ---------------- | -------------------- | ---------------------------------- |
| Node.js          | >= 20 LTS            | Same as `../frontend`              |
| npm              | >= 10                | Bundled with Node 20               |
| Xcode            | 15.4 or 16.x         | macOS only. App Store needs 15.0+. |
| Xcode CLI tools  | matching Xcode       | `xcode-select --install`           |
| CocoaPods        | >= 1.15              | `sudo gem install cocoapods`       |
| Android Studio   | Iguana (2023.2.1)+   | Bundles JDK 17                     |
| Android SDK      | API 34, build-tools 34 | Installed via Android Studio SDK Manager |
| Java JDK         | 17                   | Android Studio's bundled JDK is fine |

Windows users can build the **Android** side directly. The **iOS** side
requires macOS (Apple's signing toolchain only runs there). Cross-platform
options: a CI runner like GitHub Actions `macos-14`, or a remote Mac
(MacStadium / MacInCloud) for the rare native rebuilds.

## First run

```bash
cd mobile
npm install
npx cap sync
```

Both native projects (`ios/`, `android/`) are committed, so there is no
`cap add` step. iOS builds run on GitHub Actions (`.github/workflows/mobile.yml`,
macOS runner with Xcode 26), so no Mac is needed; Android builds there too.
Store submission, secrets and listing texts: `docs/store-submission.md`.

Icons and splash come from `resources/icon.svg` + `resources/splash.svg`:

```bash
npx capacitor-assets generate   --iconBackgroundColor '#fbf9f4'   --splashBackgroundColor '#fbf9f4'
```

`@capacitor/cli` gets tar 6 through a scoped npm override: the repo-wide
tar 7 override broke `cap add` / `cap sync` (`tar.extract` is gone in 7).
The CLI only unpacks its own bundled templates.

## Day-to-day commands

```bash
# After changing capacitor.config.ts or plugins:
npx cap sync

# Open Xcode (macOS only). Build / run targeting a simulator or device:
npx cap open ios

# Open Android Studio. Sync Gradle, then run on emulator / device:
npx cap open android

# Run on a simulator/emulator directly (skips opening the IDE):
npx cap run ios
npx cap run android

# Production native build (still requires Xcode / Android Studio toolchain):
npx cap build ios
npx cap build android
```

## Pointing the WebView at a different URL

By default `capacitor.config.ts` reads `MOBILE_TARGET_URL` and falls back
to `https://www.holapolitica.org`. To point at a local frontend over
a tunnel:

```bash
# Terminal 1 — frontend dev server (in ../frontend):
npm run dev          # listens on :3000 inside Docker, host :3002

# Terminal 2 — expose it via HTTPS:
cloudflared tunnel --url http://localhost:3002

# Terminal 3 — build with that URL baked in:
MOBILE_TARGET_URL='https://random-words.trycloudflare.com' npx cap sync
npx cap run ios   # or android
```

iOS Simulator cannot reach `http://localhost` directly; Android emulator
needs `http://10.0.2.2:3002` plus cleartext — which we deliberately keep
off. Tunneling is the cleaner path.

## Reference docs in this folder

- `docs/push-setup.md` — APNs key, FCM project, certificates.
- `docs/deeplinks.md` — Universal Links and App Links wiring.
- `docs/store-submission.md` — store submission checklist and answers (ca).
- `capacitor.config.ts` — single source of truth for the runtime config.
