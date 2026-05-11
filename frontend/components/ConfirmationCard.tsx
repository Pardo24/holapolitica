/**
 * Visual card shown after a /confirm/{kind}/{token} round-trip.
 *
 * The card has two modes — `success` and `error` — and lays out the same
 * editorial composition used by /about and /notifications:
 *
 *   eyebrow → headline → body paragraph → primary + secondary CTA
 *
 * The CTAs are passed in as raw href + label tuples so the parent page
 * can localize them through next-intl. The success/error variant only
 * changes the icon and the accent color; the structural markup stays
 * identical so screen readers and Reader Mode read the page consistently.
 */
import type { Route } from 'next';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, XCircle } from 'lucide-react';

type Variant = 'success' | 'error';

interface ConfirmationCardProps {
  variant: Variant;
  eyebrow: string;
  title: string;
  body: string;
  primaryCta: { href: Route; label: string };
  /**
   * Optional secondary CTA shown next to the primary one. When the
   * success state only needs a single button (e.g. "Back to home") we
   * omit this so the card doesn't show a redundant pair of links.
   */
  secondaryCta?: { href: Route; label: string };
}

export function ConfirmationCard({
  variant,
  eyebrow,
  title,
  body,
  primaryCta,
  secondaryCta,
}: ConfirmationCardProps) {
  const Icon = variant === 'success' ? CheckCircle2 : XCircle;
  // Accent color picks: success uses the muted civic "aye" green, error
  // uses the muted civic "no" red. Both are the same palette as the
  // result pills elsewhere on the site so the visual idiom is consistent.
  const iconColor =
    variant === 'success' ? 'var(--aye)' : 'var(--no)';
  const iconBg =
    variant === 'success' ? 'var(--aye-soft)' : 'var(--no-soft)';

  return (
    <article
      style={{
        maxWidth: 560,
        margin: '0 auto',
        paddingTop: 48,
        paddingBottom: 48,
        paddingLeft: 16,
        paddingRight: 16,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
      }}
    >
      {/* Icon disc — large, mailroom-style affirmation of state. */}
      <div
        aria-hidden="true"
        style={{
          width: 64,
          height: 64,
          borderRadius: '999px',
          background: iconBg,
          color: iconColor,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 22,
        }}
      >
        <Icon size={32} strokeWidth={2} />
      </div>

      <div className="eyebrow">{eyebrow}</div>
      <h1 className="h-headline" style={{ margin: '6px 0 14px' }}>
        {title}
      </h1>
      <p
        style={{
          fontSize: 16,
          lineHeight: 1.6,
          color: 'var(--ink-2)',
          margin: '0 0 28px',
        }}
      >
        {body}
      </p>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          alignItems: 'center',
        }}
      >
        <Link href={primaryCta.href} className="btn-ink">
          {primaryCta.label}
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
        {secondaryCta ? (
          <Link href={secondaryCta.href} className="btn-outline">
            {secondaryCta.label}
          </Link>
        ) : null}
      </div>
    </article>
  );
}
