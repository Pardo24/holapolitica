// Store screenshots of the live site, rendered at each store's exact pixel
// size through Chrome DevTools device emulation (Chrome's own window can't
// get narrower than ~500 px, which clips a phone layout).
//
// Usage (Node 22+, no dependencies; Chrome must be running headless):
//   chrome --headless=new --remote-debugging-port=9333 --user-data-dir=<tmp>
//   node mobile/store/shoot.mjs
//
// Output: mobile/store/screenshots/<store>/<locale>/<nn>-<name>.png

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ORIGIN = 'https://www.holapolitica.org';
const OUT = join(dirname(fileURLToPath(import.meta.url)), 'screenshots');

const DEVICES = {
  // App Store, iPhone 6.9" display: 1320 x 2868.
  ios: {
    width: 440, height: 956, scale: 3,
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  },
  // Google Play phone: 1080 x 1920 (9:16).
  android: {
    width: 360, height: 640, scale: 3,
    ua: 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36',
  },
};

const LOCALES = (process.env.LOCALES ?? 'ca,es,en').split(',');
const PAGES = JSON.parse(process.env.PAGES ?? 'null') ?? [
  ['01-inici', '/'],
  ['02-lleis', '/lleis'],
  ['03-votacio', '/votes/17139'],
  ['04-diputats', '/el-teu-diputat'],
  ['05-temes', '/topics'],
  ['06-dades', '/stats'],
];
const SETTLE_MS = 3500;

// Pre-dismiss first-run UI so each shot shows the page itself.
const today = new Date().toISOString().slice(0, 10);
const PRELOAD = `
  try {
    localStorage.setItem('holapolitica.onboarded.v1', '1');
    localStorage.setItem('holapolitica.install.dismissed.v1', '${today}');
    localStorage.setItem('holapolitica.visited.v1', '1');
    localStorage.setItem('hp_daily_notif_dismissed_v1', '${today}');
  } catch (e) {}
`;

const version = await (await fetch('http://127.0.0.1:9333/json/version')).json();
const ws = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));

let nextId = 1;
const pending = new Map();
const waiters = [];
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
  } else if (msg.method) {
    for (const w of waiters.splice(0)) w(msg);
  }
});
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
const waitFor = (method, sessionId, timeout = 30000) =>
  new Promise((resolve) => {
    const t = setTimeout(resolve, timeout);
    const check = (msg) => {
      if (msg.method === method && msg.sessionId === sessionId) {
        clearTimeout(t);
        resolve(msg);
      } else waiters.push(check);
    };
    waiters.push(check);
  });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (const [store, d] of Object.entries(DEVICES)) {
  if (process.env.STORES && !process.env.STORES.split(',').includes(store)) continue;
  for (const locale of LOCALES) {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    await send('Page.enable', {}, sessionId);
    await send('Network.enable', {}, sessionId);
    await send('Emulation.setDeviceMetricsOverride', {
      width: d.width, height: d.height, deviceScaleFactor: d.scale, mobile: true,
    }, sessionId);
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }, sessionId);
    await send('Emulation.setUserAgentOverride', { userAgent: d.ua, acceptLanguage: locale }, sessionId);
    await send('Network.setCookie', {
      name: 'NEXT_LOCALE', value: locale, domain: 'www.holapolitica.org', path: '/', secure: true,
    }, sessionId);
    await send('Page.addScriptToEvaluateOnNewDocument', { source: PRELOAD }, sessionId);

    for (const [name, path] of PAGES) {
      const loaded = waitFor('Page.loadEventFired', sessionId);
      await send('Page.navigate', { url: ORIGIN + path }, sessionId);
      await loaded;
      await sleep(SETTLE_MS);
      const { data } = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
      const file = join(OUT, store, locale, `${name}.png`);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, Buffer.from(data, 'base64'));
      console.log(file);
    }
    await send('Target.closeTarget', { targetId });
  }
}
ws.close();
