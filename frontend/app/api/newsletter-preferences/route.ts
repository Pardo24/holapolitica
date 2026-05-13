import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Proxy from the browser to the backend ``POST /newsletter/preferences``.
 *
 * Why proxy at all (vs. fetching the backend directly from the
 * client):
 *   - The browser cookie ``hp_newsletter_subscribed`` is set by THIS
 *     route too, so the manager flips into "already subscribed" mode
 *     after a successful save without an extra round-trip.
 *   - Keeps ``NEXT_PUBLIC_API_URL`` out of the client bundle when the
 *     backend is on a private network in some deployments.
 *
 * The backend authenticates the request by ``token`` — the long-lived
 * ``confirmation_token`` from the subscriber's welcome email. There is
 * no session here; the token is the credential.
 */

const COOKIE_NAME = 'hp_newsletter_subscribed';
// Match the lifetime the backend implicitly grants by keeping the
// confirmation_token alive after confirmation: roughly the duration we
// expect a subscriber to stay engaged before re-confirming via a fresh
// signup.
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

interface PreferencesPayload {
  token?: string;
  topic_slugs?: string[];
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((s) => typeof s === 'string');
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: PreferencesPayload = {};
  try {
    body = (await request.json()) as PreferencesPayload;
  } catch {
    return NextResponse.json({ detail: 'Invalid JSON body' }, { status: 400 });
  }

  const token = typeof body.token === 'string' ? body.token.trim() : '';
  const topicSlugs = isStringArray(body.topic_slugs) ? body.topic_slugs : [];

  if (!token) {
    return NextResponse.json(
      { detail: 'A management token is required' },
      { status: 400 },
    );
  }

  const backend = process.env.BACKEND_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL;
  if (!backend) {
    return NextResponse.json(
      { detail: 'Backend not configured' },
      { status: 503 },
    );
  }

  const upstream = await fetch(`${backend.replace(/\/$/, '')}/newsletter/preferences`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, topic_slugs: topicSlugs }),
    // Manager UX should fail fast — no caching, no retries on the
    // browser-facing proxy; the backend handles its own retry policy.
    cache: 'no-store',
  });

  let upstreamBody: unknown = null;
  try {
    upstreamBody = await upstream.json();
  } catch {
    /* upstream sent non-JSON or an empty body */
  }

  if (!upstream.ok) {
    return NextResponse.json(
      upstreamBody ?? { detail: 'Upstream rejected the preferences update' },
      { status: upstream.status },
    );
  }

  const response = NextResponse.json(upstreamBody ?? { status: 'saved' }, {
    status: 200,
  });
  response.cookies.set(COOKIE_NAME, '1', {
    path: '/',
    maxAge: COOKIE_MAX_AGE,
    sameSite: 'lax',
    httpOnly: false,
  });
  return response;
}
