# Push notifications setup

The mobile wrapper uses `@capacitor/push-notifications`, which sits on top
of **APNs** (iOS) and **FCM** (Android). This document captures the manual
steps that cannot be automated by the agent — most involve clicking
through the Apple Developer and Firebase consoles.

> **Blocker:** APNs requires an active **Apple Developer Program**
> membership at **USD 99/year**. The agent cannot purchase this. Until
> Daniel has signed up at <https://developer.apple.com/programs/> and the
> account shows "Active", iOS push cannot be configured.

## 1. APNs key (iOS) — one key per Apple Developer account

1. Sign in at <https://developer.apple.com/account/resources/authkeys/list>.
2. Click **+** to create a new key.
3. Name: `Monitor Parlamentari APNs`. Tick **Apple Push Notifications
   service (APNs)**. Continue → Register.
4. **Download the `.p8` file**. Apple only lets you download it once;
   store it in a password manager.
5. Note the **Key ID** (visible on the same page) and the **Team ID**
   (top right of the developer portal).
6. In Xcode, open the iOS project (`npx cap open ios`):
   - Target → Signing & Capabilities → add **Push Notifications**.
   - Same screen → add **Background Modes** → tick **Remote
     notifications**. (`App.entitlements` and `Info.plist` in this repo
     already declare both; Xcode just needs to acknowledge them.)
   - Confirm the bundle ID is `cat.monitorparlamentari.app`.

The `.p8` file, Key ID and Team ID are what Firebase (or any APNs sender)
needs — see the FCM step below.

## 2. FCM project (Android, and optionally as the unified sender)

We use Firebase Cloud Messaging both for Android and as the upstream
sender for iOS. That lets the backend send to a single endpoint instead
of integrating two SDKs.

1. Go to <https://console.firebase.google.com> → **Add project**.
2. Project name: `monitor-parlamentari`. Disable Google Analytics (we do
   not run trackers).
3. **Add Android app**:
   - Package name: `cat.monitorparlamentari.app`.
   - Nickname: "Monitor Parlamentari Android".
   - SHA-1: leave blank for now; required only for Dynamic Links / Google
     Sign-In.
   - Download `google-services.json` → save to
     `mobile/android/app/google-services.json` (already gitignored).
4. **Add iOS app**:
   - Bundle ID: `cat.monitorparlamentari.app`.
   - Nickname: "Monitor Parlamentari iOS".
   - Download `GoogleService-Info.plist` → drag into Xcode under the
     `App` target. Path: `mobile/ios/App/App/GoogleService-Info.plist`
     (gitignored).
5. In Firebase Console → ⚙️ Project settings → **Cloud Messaging** tab →
   **Apple app configuration** → upload the `.p8` key from step 1, paste
   the Key ID and Team ID. This is what wires APNs to FCM.

## 3. Server-side credentials for the backend

The backend will eventually send notifications via the Firebase Admin
SDK. To unblock that:

1. Firebase Console → ⚙️ Project settings → **Service accounts** tab →
   **Generate new private key** → downloads a JSON file.
2. Store the JSON contents in the backend's `.env` (or a mounted secret
   in production). Suggested env var: `FCM_SERVICE_ACCOUNT_JSON` — read
   into the backend exactly as Firebase Admin SDK expects.

The legacy "FCM server key" (a single string) was deprecated by Google
in June 2024 — use the service-account JSON via the v1 HTTP API instead.

## 4. Wiring inside the app

The Capacitor plugin gives us tokens in JavaScript:

```ts
import { PushNotifications } from '@capacitor/push-notifications';

await PushNotifications.requestPermissions();
await PushNotifications.register();

PushNotifications.addListener('registration', (token) => {
  // token.value is the APNs token on iOS or the FCM token on Android.
  // Post to the backend so it can target this device.
  fetch('/api/push/register', { method: 'POST', body: JSON.stringify(token) });
});
```

Because the WebView **runs the deployed Next.js app**, this snippet lives
in `frontend/` (probably in a `lib/native/push.ts` module guarded by
`Capacitor.isNativePlatform()`). The wrapper does not run this code itself.

> **Out of scope for the wrapper:** the actual backend endpoint that
> stores tokens, the topic / segmentation strategy, and the editorial
> review of every push payload (notifications must remain factual — see
> CLAUDE.md "mirall, no megàfon" principle).

## 5. Testing

- iOS simulator **cannot** receive push. Use a real device with a
  development provisioning profile that includes the Push entitlement.
- Android emulators with Google Play Services **can** receive FCM messages.
- Firebase Console → Messaging → "Send test message" is the quickest way
  to validate the full chain before wiring the backend.
