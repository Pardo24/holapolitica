import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { ConfirmationCard } from '@/components/ConfirmationCard';
import { api } from '@/lib/api';

/**
 * /confirm/newsletter/[token]
 *
 * Landing page for the double-opt-in confirmation link emailed by the
 * backend. The page is a Server Component, so we perform the API call
 * (GET /confirm/newsletter/{token}) at request time and render either a
 * success or an error state without any client-side roundtrip.
 *
 * The backend endpoint is idempotent against repeated successful clicks
 * (after the first hit it returns 404 because the token has been
 * cleared); we treat that as the error state and tell the user the
 * link expired — they can re-subscribe to get a fresh token. This is
 * the same UX whether the token never existed or was already consumed.
 */
interface Params {
  token: string;
}

export const metadata: Metadata = {
  // Confirmation pages are intentionally not indexed — they're per-token
  // and only meaningful to the recipient of the email.
  robots: { index: false, follow: false },
};

export default async function ConfirmNewsletterPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { token } = await params;
  const t = await getTranslations('confirm');

  // The backend endpoint is idempotent: a fresh token returns 200; once
  // a token has been consumed (or never existed) it returns 404. We
  // collapse every failure mode into the same "link expired" error
  // state because exposing the difference doesn't help the user.
  let success = false;
  try {
    await api.subscriptions.confirmNewsletter(token);
    success = true;
  } catch {
    success = false;
  }

  if (success) {
    return (
      <ConfirmationCard
        variant="success"
        eyebrow={t('newsletter_success_eyebrow')}
        title={t('newsletter_success_title')}
        body={t('newsletter_success_body')}
        primaryCta={{ href: '/', label: t('back_to_home') }}
      />
    );
  }

  return (
    <ConfirmationCard
      variant="error"
      eyebrow={t('newsletter_error_eyebrow')}
      title={t('newsletter_error_title')}
      body={t('newsletter_error_body')}
      primaryCta={{ href: '/about', label: t('newsletter_resubscribe') }}
      secondaryCta={{ href: '/', label: t('back_to_home') }}
    />
  );
}
