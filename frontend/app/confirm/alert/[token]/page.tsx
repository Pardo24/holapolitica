import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { ConfirmationCard } from '@/components/ConfirmationCard';
import { api } from '@/lib/api';

/**
 * /confirm/alert/[token]
 *
 * Landing page for the alert (topic/person/group) double-opt-in
 * confirmation link emailed by the backend. Mirrors the newsletter
 * confirm page in structure; only the copy differs because alerts are
 * event-driven ("we'll email you when something happens") rather than
 * the weekly digest cadence.
 */
interface Params {
  token: string;
}

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function ConfirmAlertPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { token } = await params;
  const t = await getTranslations('confirm');

  let success = false;
  try {
    await api.subscriptions.confirmAlert(token);
    success = true;
  } catch {
    success = false;
  }

  if (success) {
    return (
      <ConfirmationCard
        variant="success"
        eyebrow={t('alert_success_eyebrow')}
        title={t('alert_success_title')}
        body={t('alert_success_body')}
        primaryCta={{ href: '/', label: t('back_to_home') }}
      />
    );
  }

  return (
    <ConfirmationCard
      variant="error"
      eyebrow={t('alert_error_eyebrow')}
      title={t('alert_error_title')}
      body={t('alert_error_body')}
      primaryCta={{ href: '/notifications', label: t('alert_resubscribe') }}
      secondaryCta={{ href: '/', label: t('back_to_home') }}
    />
  );
}
