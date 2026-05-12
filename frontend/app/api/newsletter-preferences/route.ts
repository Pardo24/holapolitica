import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Frontend mock for the newsletter topic-preferences endpoint.
 *
 * TODO(backend): replace this stub with a fetch to the real
 *   ``POST /newsletter/preferences`` endpoint once it exists. The
 *   backend should:
 *     - validate the email belongs to a confirmed newsletter subscriber
 *     - upsert a row in a ``newsletter_subscriber_topics`` table that
 *       joins subscribers ↔ topic slugs
 *     - return ``204 No Content`` on success
 *
 * For now this route just acknowledges receipt and echoes the payload
 * back so the client UX can be wired end-to-end. The cookie set here
 * keeps the user on the "already subscribed" branch of the page so the
 * topic picker stays visible after a reload.
 */

const COOKIE_NAME = 'hp_newsletter_subscribed';
// 90 days — enough to bridge the gap until the user re-confirms via
// email link, short enough that an abandoned device clears state.
const COOKIE_MAX_AGE = 60 * 60 * 24 * 90;

interface PreferencesPayload {
  email?: string;
  topic_slugs?: string[];
  /**
   * Optional category-level subscriptions. The backend will probably
   * expand these to their member slugs server-side; we still pass
   * both so the API can choose.
   */
  category_slugs?: string[];
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((s) => typeof s === 'string');
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: PreferencesPayload = {};
  try {
    body = (await request.json()) as PreferencesPayload;
  } catch {
    return NextResponse.json(
      { detail: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const topicSlugs = isStringArray(body.topic_slugs) ? body.topic_slugs : [];
  const categorySlugs = isStringArray(body.category_slugs) ? body.category_slugs : [];

  if (!email || !email.includes('@')) {
    return NextResponse.json(
      { detail: 'A valid email is required' },
      { status: 400 },
    );
  }

  // Echo the saved payload back so the client can render a confirmation
  // line without re-asserting state. Real backend will likely just
  // return 204.
  const response = NextResponse.json(
    {
      ok: true,
      email,
      topic_slugs: topicSlugs,
      category_slugs: categorySlugs,
      // Tag so we don't accidentally treat a future real response as
      // mock data in client telemetry.
      _mock: true,
    },
    { status: 200 },
  );

  response.cookies.set(COOKIE_NAME, '1', {
    path: '/',
    maxAge: COOKIE_MAX_AGE,
    sameSite: 'lax',
    httpOnly: false,
  });

  return response;
}
