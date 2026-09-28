import { NextResponse } from 'next/server';

/**
 * Apple Universal Links association file.
 *
 * Served at `/.well-known/apple-app-site-association` (via a rewrite in
 * next.config.mjs) so that tapping `https://www.holapolitica.org/<path>`
 * opens the iOS app instead of Safari. The iOS entitlements already claim
 * the domain, but iOS only honours the claim if this file answers from it —
 * without it Universal Links silently never fire.
 *
 * Host caveat: the apex (holapolitica.org) 307-redirects to www at the
 * Vercel edge, and Apple does NOT follow redirects for this file, so only
 * the www host can verify. That is fine because www is the canonical host
 * (see metadataBase and the sitemap); mobile/docs/deeplinks.md, "Which host
 * verifies", records the alternative if apex links should open the app too.
 *
 * The Apple Team ID is only known from the developer account, so the app ID
 * comes from the `APPLE_TEAM_ID` env var — set it in Vercel and redeploy; no
 * code change needed. Until it is set this returns an empty `details` array,
 * which is valid and harmless: iOS associates no app and links keep opening
 * in Safari (same graceful degradation as the Android assetlinks route).
 *
 * Apple requires `application/json` and NO `.json` extension on the path.
 */

export const dynamic = 'force-dynamic';

const BUNDLE_ID = 'org.holapolitica.app';

export function GET(): NextResponse {
  const teamId = (process.env.APPLE_TEAM_ID ?? '').trim();

  const body = {
    applinks: {
      details: teamId
        ? [
            {
              appIDs: [`${teamId}.${BUNDLE_ID}`],
              // Every path opens in the app; the wrapper renders the same
              // site, so there is no route that belongs to the browser only.
              components: [{ '/': '*' }],
            },
          ]
        : [],
    },
  };

  return NextResponse.json(body, {
    headers: {
      'Content-Type': 'application/json',
      // iOS refetches periodically; a short cache lets a freshly-set Team ID
      // propagate without waiting out a long TTL.
      'Cache-Control': 'public, max-age=300',
    },
  });
}
