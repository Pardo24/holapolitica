/**
 * Bridge to the Capacitor native shell.
 *
 * The site is a normal web app that ALSO runs inside a Capacitor WebView
 * (the iOS/Android wrapper in ../mobile). When it runs inside the shell,
 * Capacitor injects a `window.Capacitor` bridge with the native plugins;
 * in a plain browser that global is absent. Every function here is a
 * no-op in a browser, so importing and calling them is always safe — the
 * native code paths only light up inside the app.
 *
 * We talk to the bridge through `window.Capacitor` directly rather than
 * depending on the `@capacitor/*` npm packages, so the web build stays
 * free of native dependencies. The plugin API surface we use is tiny and
 * stable: PushNotifications (permissions / register / listeners), App
 * (appUrlOpen / getLaunchUrl, for Universal Links and App Links) and Share
 * (the OS share sheet, which the Android WebView lacks as navigator.share).
 */

interface CapacitorPluginResult {
  receive?: string;
}
interface PushPermissionStatus {
  receive: 'prompt' | 'granted' | 'denied' | string;
}
interface PushPlugin {
  requestPermissions(): Promise<PushPermissionStatus>;
  checkPermissions(): Promise<PushPermissionStatus>;
  register(): Promise<void>;
  addListener(
    event: 'registration' | 'registrationError' | 'pushNotificationReceived' | 'pushNotificationActionPerformed',
    cb: (data: unknown) => void,
  ): Promise<{ remove: () => void }> | { remove: () => void };
}
interface AppPlugin {
  addListener(
    event: 'appUrlOpen',
    cb: (data: { url?: string }) => void,
  ): Promise<{ remove: () => void }> | { remove: () => void };
  getLaunchUrl(): Promise<{ url?: string } | undefined>;
}
interface ShareOptions {
  title?: string;
  text?: string;
  url?: string;
}
interface SharePlugin {
  share(options: ShareOptions & { dialogTitle?: string }): Promise<unknown>;
}
interface CapacitorBridge {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: {
    PushNotifications?: PushPlugin;
    App?: AppPlugin;
    Share?: SharePlugin;
  } & Record<string, unknown>;
}

declare global {
  interface Window {
    Capacitor?: CapacitorBridge;
  }
}

function bridge(): CapacitorBridge | null {
  if (typeof window === 'undefined') return null;
  return window.Capacitor ?? null;
}

/** True only inside the Capacitor app. False in every browser (and SSR). */
export function isNativeApp(): boolean {
  return bridge()?.isNativePlatform?.() === true;
}

/** 'ios' | 'android' inside the app; 'web' otherwise. */
export function nativePlatform(): 'ios' | 'android' | 'web' {
  const p = bridge()?.getPlatform?.() ?? 'web';
  return p === 'ios' || p === 'android' ? p : 'web';
}

function pushPlugin(): PushPlugin | null {
  return bridge()?.Plugins?.PushNotifications ?? null;
}

// The device token, once the shell hands it to us. Cached so both the
// bridge component and the notifications page can read the same value.
let cachedToken: string | null = null;
let registering: Promise<string | null> | null = null;

export function nativeDeviceToken(): string | null {
  return cachedToken;
}

/**
 * Ask the OS for notification permission and register with APNs/FCM,
 * resolving with the device token (or null if unavailable / declined).
 * Idempotent: concurrent calls share one in-flight registration, and a
 * token already in hand resolves immediately.
 */
export function registerForPush(): Promise<string | null> {
  if (!isNativeApp()) return Promise.resolve(null);
  if (cachedToken) return Promise.resolve(cachedToken);
  if (registering) return registering;

  const plugin = pushPlugin();
  if (!plugin) return Promise.resolve(null);

  registering = new Promise<string | null>((resolve) => {
    let settled = false;
    const done = (token: string | null) => {
      if (settled) return;
      settled = true;
      registering = null;
      resolve(token);
    };
    // The token arrives asynchronously on the 'registration' event.
    void plugin.addListener('registration', (data) => {
      const token = (data as { value?: string })?.value ?? null;
      if (token) cachedToken = token;
      done(token);
    });
    void plugin.addListener('registrationError', () => done(null));

    void (async () => {
      try {
        const perm = await plugin.requestPermissions();
        if (perm.receive !== 'granted') return done(null);
        await plugin.register();
        // Safety timeout: if 'registration' never fires, don't hang.
        setTimeout(() => done(cachedToken), 8000);
      } catch {
        done(null);
      }
    })();
  });
  return registering;
}

/**
 * Register silently at launch, but only if the user already granted
 * notifications earlier. Never shows the OS prompt: that is asked in context,
 * from the notifications page, when the user turns alerts on.
 */
export async function registerForPushIfGranted(): Promise<string | null> {
  const plugin = pushPlugin();
  if (!isNativeApp() || !plugin) return null;
  try {
    const perm = await plugin.checkPermissions();
    if (perm.receive !== 'granted') return null;
  } catch {
    return null;
  }
  return registerForPush();
}

/**
 * Subscribe to notification taps. The callback receives the deep-link
 * URL carried in the notification's ``data.url`` (set by the backend
 * FCM sender), so a tap can route straight to the vote/topic. Returns a
 * disposer; no-op off-native.
 */
export function onPushTap(cb: (url: string) => void): () => void {
  const plugin = pushPlugin();
  if (!isNativeApp() || !plugin) return () => {};
  const handle = plugin.addListener('pushNotificationActionPerformed', (data) => {
    const url =
      (data as { notification?: { data?: { url?: string } } })?.notification?.data?.url;
    if (typeof url === 'string' && url) cb(url);
  });
  return () => {
    void Promise.resolve(handle).then((h) => h?.remove?.());
  };
}

// Universal Links / App Links. The OS opens the app with a site URL, but
// the WebView always boots at the home page: the shell only reports the URL
// (App plugin), so the page has to route to it.
const SITE_HOSTS = new Set(['www.holapolitica.org', 'holapolitica.org']);
const LAUNCH_URL_KEY = 'hp:launch-url-handled';

function sitePath(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' || !SITE_HOSTS.has(u.hostname)) return null;
    return u.pathname + u.search + u.hash;
  } catch {
    return null;
  }
}

/**
 * Call ``cb`` with the in-site path of every link that opens the app: the
 * one it was cold-started with (once per app session) and any opened while
 * it runs. Returns a disposer; no-op off-native.
 */
export function onDeepLink(cb: (path: string) => void): () => void {
  const plugin = bridge()?.Plugins?.App;
  if (!isNativeApp() || !plugin) return () => {};

  const go = (url: string | undefined) => {
    const path = sitePath(url);
    if (!path) return;
    const here = window.location.pathname + window.location.search + window.location.hash;
    if (path !== here) cb(path);
  };

  // The launch URL stays the same for the whole process, so only act on it
  // the first time; a later full reload must not jump back to it.
  let handled = false;
  try {
    handled = sessionStorage.getItem(LAUNCH_URL_KEY) === '1';
    sessionStorage.setItem(LAUNCH_URL_KEY, '1');
  } catch {
    /* storage blocked: route it anyway */
  }
  if (!handled) {
    void plugin
      .getLaunchUrl()
      .then((r) => go(r?.url))
      .catch(() => {});
  }

  const handle = plugin.addListener('appUrlOpen', (data) => go(data?.url));
  return () => {
    void Promise.resolve(handle).then((h) => h?.remove?.());
  };
}

/**
 * Open the OS share sheet: the native one inside the app (Android's WebView
 * has no navigator.share), the Web Share API in browsers that have it.
 * Resolves false when neither exists so the caller can copy instead; rejects
 * when the user dismisses the sheet, like navigator.share does.
 */
export async function openShareSheet(data: ShareOptions): Promise<boolean> {
  const plugin = bridge()?.Plugins?.Share;
  if (isNativeApp() && plugin) {
    await plugin.share(data);
    return true;
  }
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    await navigator.share(data);
    return true;
  }
  return false;
}

export type { CapacitorPluginResult };
