import { NextResponse } from 'next/server';

/**
 * Android App Links / Digital Asset Links verification file.
 *
 * Served at `/.well-known/assetlinks.json` (via a rewrite in
 * next.config.mjs) so that tapping `https://holapolitica.org/<path>` opens
 * the Capacitor app instead of the browser once Android verifies this
 * association at install time.
 *
 * The signing certificate SHA-256 is only known after the app exists in
 * Play Console (Play App Signing → App integrity → SHA-256). So the
 * fingerprint(s) come from the `ANDROID_CERT_SHA256` env var — set it in
 * Vercel and redeploy; no code change needed. It accepts a comma-separated
 * list (you typically have both the app-signing key and the upload key).
 *
 * Until the env var is set this returns an empty array `[]`, which is a
 * valid, harmless response: Android simply doesn't verify any app, and
 * links keep opening in the browser (graceful degradation).
 */

export const dynamic = 'force-dynamic';

const PACKAGE_NAME = 'org.holapolitica.app';

export function GET(): NextResponse {
  const raw = process.env.ANDROID_CERT_SHA256 ?? '';
  const fingerprints = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const body = fingerprints.length
    ? [
        {
          relation: ['delegate_permission/common.handle_all_urls'],
          target: {
            namespace: 'android_app',
            package_name: PACKAGE_NAME,
            sha256_cert_fingerprints: fingerprints,
          },
        },
      ]
    : [];

  return NextResponse.json(body, {
    headers: {
      'Content-Type': 'application/json',
      // Android re-checks periodically; a short cache is fine and lets a
      // freshly-set fingerprint propagate quickly.
      'Cache-Control': 'public, max-age=300',
    },
  });
}
