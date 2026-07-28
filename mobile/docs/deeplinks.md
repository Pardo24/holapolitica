# Deep linking setup

We use **Universal Links** on iOS and **App Links** on Android — both
backed by the same web URLs. A user who taps
`https://holapolitica.org/votes/123` in Mail / WhatsApp / Twitter
sees the app open straight at vote 123, with no URL scheme dialog and no
intermediate browser hop.

## URL → screen mapping

The web app already routes these paths; the wrapper inherits them since
the WebView loads them directly:

| URL pattern                              | Destination               |
| ---------------------------------------- | ------------------------- |
| `/`                                      | Home                      |
| `/votes/:id`                             | Single vote detail        |
| `/initiatives/:id`                       | Initiative detail         |
| `/deputies/:slug`                        | Deputy profile            |
| `/groups/:slug`                          | Parliamentary group page  |
| `/topics/:slug`                          | Topic feed                |
| Anything else under the domain           | Renders inside the WebView|

## iOS — Universal Links

### 1. Entitlement (already shipped)

`mobile/ios/App/App/App.entitlements` already declares:

```xml
<key>com.apple.developer.associated-domains</key>
<array>
  <string>applinks:holapolitica.org</string>
  <string>applinks:www.holapolitica.org</string>
</array>
```

In Xcode → target → Signing & Capabilities → **+ Capability →
Associated Domains** — this just surfaces the entitlement in the UI; the
file already has it.

### 2. apple-app-site-association (AASA)

Host the following JSON at:

```
https://holapolitica.org/.well-known/apple-app-site-association
```

Served as `application/json`, **no redirect**, **no extension**, HTTPS only.

```json
{
  "applinks": {
    "details": [
      {
        "appIDs": ["TEAMID.org.holapolitica.app"],
        "components": [
          { "/": "/votes/*" },
          { "/": "/initiatives/*" },
          { "/": "/deputies/*" },
          { "/": "/groups/*" },
          { "/": "/topics/*" },
          { "/": "/" }
        ]
      }
    ]
  }
}
```

Replace `TEAMID` with the Apple Developer Team ID
(visible at <https://developer.apple.com/account>, top-right).

### 3. Serving the AASA file

In `frontend/`, expose it through a Next.js route handler so it lives
alongside the rest of the site. Example sketch (do not implement here):

```ts
// frontend/app/.well-known/apple-app-site-association/route.ts
export function GET() {
  return Response.json({ applinks: { /* … */ } });
}
```

Apple caches AASA aggressively; force a refresh on a device by toggling
"App-Specific Updates" in Settings → Developer, or reinstalling the app.

## Android — App Links

### 1. Manifest intent filter (already shipped)

`mobile/android/app/src/main/AndroidManifest.xml` declares the
`autoVerify="true"` intent-filter for both `holapolitica.org`
and `www.holapolitica.org`. No further code change needed.

### 2. assetlinks.json

Host the following JSON at:

```
https://holapolitica.org/.well-known/assetlinks.json
```

Served as `application/json`, HTTPS only, no redirect.

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "org.holapolitica.app",
      "sha256_cert_fingerprints": [
        "AA:BB:CC:…"
      ]
    }
  }
]
```

### 3. Getting the SHA-256 fingerprint

Two fingerprints exist — one for the local debug keystore and one for the
upload key Google Play uses. Both must appear in `assetlinks.json` while
testing; production-only setups can drop the debug one.

```bash
# Debug keystore (Android Studio generates this automatically):
keytool -list -v \
  -keystore ~/.android/debug.keystore \
  -alias androiddebugkey -storepass android -keypass android

# Production upload key (after creating the keystore for Play Console):
keytool -list -v \
  -keystore mobile/android/keystore/upload.jks \
  -alias upload
```

Copy the line that starts with `SHA256:` and paste into the
`sha256_cert_fingerprints` array.

> **Play App Signing**: when the app is uploaded to the Play Console,
> Google manages the **app signing key** separately. The SHA-256 you
> must include is the one shown under Play Console → Setup → App
> integrity → "App signing key certificate". Add it to `assetlinks.json`
> before publishing.

### 4. Verification

After deploying both `.well-known` files:

```bash
# iOS — Apple's CDN check
curl https://app-site-association.cdn-apple.com/a/v1/holapolitica.org

# Android — Google's Digital Asset Links verifier
curl 'https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://holapolitica.org&relation=delegate_permission/common.handle_all_urls'
```

Both should return JSON listing the app. If they do not, double-check
content-type, HTTPS, and that no redirect is in the way.

## Handling deep links in the WebView

Capacitor's `@capacitor/app` plugin fires an `appUrlOpen` event when the
OS hands us a URL. The wrapper just forwards it to the WebView:

```ts
import { App } from '@capacitor/app';

App.addListener('appUrlOpen', ({ url }) => {
  // Strip the origin, push the path into the SPA router.
  const u = new URL(url);
  window.location.assign(u.pathname + u.search + u.hash);
});
```

This snippet, like the push registration, lives in the **frontend** code
behind a `Capacitor.isNativePlatform()` guard.
