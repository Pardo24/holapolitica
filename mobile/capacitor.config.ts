import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor config for the Hola Política mobile wrapper.
 *
 * The wrapper is a thin native shell around the production Next.js web app.
 * No UI is duplicated. The WebView loads the remote URL configured below.
 *
 * Decision constraints (see CLAUDE.md):
 *  - Apple guideline 4.2 mitigations: push notifications, deep links, share
 *    integration, offline cache. Each is enabled via Capacitor plugins.
 *  - No third-party trackers. No analytics SDKs.
 *  - Status bar background matches the project's paper background (#fbf9f4)
 *    to keep the native chrome visually continuous with the web app.
 *
 * The remote URL is read from MOBILE_TARGET_URL so dev builds can point at
 * a local tunnel (ngrok / cloudflared) while production builds target the
 * canonical domain.
 */
// The canonical host is www: the apex 307-redirects to it at the edge, and
// the site's own metadataBase and sitemap already point there. Loading the
// apex made every cold start pay a redirect before the first byte of HTML.
const PRODUCTION_URL = 'https://www.holapolitica.org';
const TARGET_URL = process.env.MOBILE_TARGET_URL ?? PRODUCTION_URL;

const config: CapacitorConfig = {
  appId: 'org.holapolitica.app',
  appName: 'Hola Política',
  // Capacitor still requires a webDir even when using a remote server.url.
  // It ships inside the binary, so www/offline.html is what the app shows
  // when the site can't be reached (no network, DNS, TLS, 5xx at launch)
  // instead of a blank WebView. See server.errorPath below.
  webDir: 'www',

  server: {
    url: TARGET_URL,
    cleartext: false,
    // Lock navigation to the canonical domain (plus subdomains used for
    // assets / embeds). Anything outside this list opens in the system
    // browser via Capacitor's default external-link handling.
    allowNavigation: [
      'holapolitica.org',
      '*.holapolitica.org',
    ],
    // Local file (relative to webDir) loaded when the main frame fails to
    // load. Both platforms serve it from the bundled www/, never the network.
    errorPath: 'offline.html',
  },

  ios: {
    // Keep the navigation bar / status bar background aligned with the
    // paper colour from frontend/public/icon.svg.
    backgroundColor: '#fbf9f4',
    contentInset: 'always',
    scrollEnabled: true,
    // limitsNavigationsToAppBoundDomains is deliberately left off: with it
    // on, WebKit refuses every domain not listed under WKAppBoundDomains and
    // skips Capacitor's injected bridge there, which is a blank app at best.
    // allowNavigation above already keeps navigation on our domain.
  },

  android: {
    backgroundColor: '#fbf9f4',
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#fbf9f4',
      androidScaleType: 'CENTER_CROP',
      splashFullScreen: false,
      splashImmersive: false,
      showSpinner: false,
    },
    StatusBar: {
      // 'DARK' = dark icons on the light paper background.
      style: 'DARK',
      backgroundColor: '#fbf9f4',
      overlaysWebView: false,
    },
    PushNotifications: {
      // 'badge' + 'sound' + 'alert' is the standard iOS triplet; Android
      // ignores values it does not understand.
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    App: {
      // Capacitor App plugin handles deep links via the appUrlOpen event.
      // Universal links / app links are wired in native Info.plist and
      // AndroidManifest.xml — see mobile/docs/deeplinks.md.
    },
  },
};

export default config;
