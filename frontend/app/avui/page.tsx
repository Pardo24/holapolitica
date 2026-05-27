import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { CalendarDays } from 'lucide-react';

import { NewsletterSignup } from '@/components/NewsletterSignup';
import { SessionSheet } from '@/components/SessionSheet';
import { api, type Vote } from '@/lib/api';

/**
 * `/avui` — the rolling "latest plenary session" sheet.
 *
 * A plenary session in the Spanish Congress typically runs in a
 * single day; this page therefore groups votes by their `voted_at`
 * date and renders the most recent bucket as one cohesive
 * "hoja de resumen del pleno". The shared
 * :file:`components/SessionSheet.tsx` handles the actual rendering;
 * the route only owns:
 *
 *   * fetching the latest ~200 votes (enough to cover several months
 *     of plenary days),
 *   * bucketing them by date,
 *   * picking the newest date as the live session,
 *   * surfacing the surrounding sessions in a compact list under the
 *     sheet (the navigation between adjacent sessions is handled by
 *     SessionSheet itself via the prev/next arrows in its header).
 *
 * Cache: 30 min ISR — plenary publishes votes 24-48 h delayed and
 * our ingest runs every 4 h, so anything tighter is wasted work.
 */
export const revalidate = 1800;

const RECENT_SESSIONS_LIMIT = 12;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('avui');
  return {
    title: t('meta_title'),
    description: t('meta_description'),
    alternates: { canonical: '/avui' },
  };
}

export default async function AvuiPage() {
  const t = await getTranslations('avui');
  const locale = await getLocale();

  // One paginated call covers many sessions. 100 votes (the backend's
  // hard cap) covers roughly 5-7 plenary days (≈15-20 votes per day)
  // which is plenty for the "sessions anteriors" sidebar — going
  // wider would need a second page fetch and isn't worth the round
  // trip yet.
  const votesPage = await api.votes
    .list({ page: 1, page_size: 100 })
    .catch(() => null);
  const items: Vote[] = votesPage?.items ?? [];

  // Bucket votes by ISO date. Order of dates: newest first (the API
  // already returns newest-first, but we sort explicitly so the
  // bucket order is deterministic regardless of pagination quirks).
  const buckets = bucketByDate(items);
  const dates = [...buckets.keys()].sort((a, b) => b.localeCompare(a));

  if (dates.length === 0) {
    return (
      <article style={{ padding: '32px 0' }}>
        <h1
          className="h-headline"
          style={{ margin: '0 0 12px', display: 'inline-flex', alignItems: 'baseline', gap: 12 }}
        >
          <span aria-hidden="true" className="page-header-icon-tile">
            <CalendarDays size={20} strokeWidth={1.8} aria-hidden="true" />
          </span>
          <span>{t('title')}</span>
        </h1>
        <p style={{ fontSize: 14, color: 'var(--ink-3)' }}>{t('lead_empty')}</p>
      </article>
    );
  }

  const latestDate = dates[0]!;
  const prevDate = dates[1] ?? null;
  const latestVotes = buckets.get(latestDate) ?? [];

  // Previous sessions list — every date BEFORE the latest, capped so
  // the list doesn't grow unbounded.
  const previousDates = dates.slice(1, 1 + RECENT_SESSIONS_LIMIT);

  return (
    <>
      <SessionSheet
        date={latestDate}
        votes={latestVotes}
        prevDate={prevDate}
        nextDate={null}
        isArchive={false}
        locale={locale}
      />

      {previousDates.length > 0 && (
        <section
          style={{
            marginTop: 36,
            paddingTop: 24,
            borderTop: '1px solid var(--rule)',
          }}
        >
          <div
            style={{
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: '0.14em',
              color: 'var(--ink-3)',
              fontWeight: 700,
              marginBottom: 12,
            }}
          >
            {t('previous_sessions_eyebrow', { count: previousDates.length })}
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {previousDates.map((d) => {
              const bucket = buckets.get(d) ?? [];
              const nice = new Date(`${d}T12:00:00Z`).toLocaleDateString(locale, {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              });
              return (
                <li
                  key={d}
                  style={{
                    padding: '10px 0',
                    borderBottom: '1px solid var(--rule)',
                  }}
                >
                  <Link
                    href={`/avui/${d}` as Route}
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: 12,
                      justifyContent: 'space-between',
                      color: 'inherit',
                      textDecoration: 'none',
                    }}
                  >
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: 'var(--ink)',
                      }}
                    >
                      {nice}
                    </span>
                    <span
                      className="tabular"
                      style={{ fontSize: 12, color: 'var(--ink-3)' }}
                    >
                      {t('session_count_short', { count: bucket.length })}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Closing block — centered newsletter call with a quiet
          journalists link below. Symmetric single-column layout so
          the bottom of /avui reads as a calm "subscribe" footer
          rather than a two-up call-to-action splitting attention. */}
      <section
        style={{
          marginTop: 48,
          paddingTop: 32,
          borderTop: '1px solid var(--ink)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
        }}
      >
        <div style={{ width: '100%', maxWidth: 560 }}>
          <h2
            style={{
              margin: 0,
              fontSize: 24,
              fontWeight: 700,
              fontFamily: 'var(--font-serif)',
              letterSpacing: '-0.01em',
            }}
          >
            {t('newsletter_title')}
          </h2>
          <p
            style={{
              margin: '8px auto 16px',
              fontSize: 14,
              color: 'var(--ink-2)',
              lineHeight: 1.6,
              maxWidth: 480,
            }}
          >
            {t('newsletter_caption')}
          </p>
          <NewsletterSignup />
          <div
            style={{
              marginTop: 26,
              paddingTop: 18,
              borderTop: '1px solid var(--rule)',
              fontSize: 13,
              color: 'var(--ink-3)',
              lineHeight: 1.5,
            }}
          >
            {t('journalists_caption')}{' '}
            <Link
              href={'/journalists' as Route}
              style={{
                color: 'var(--ink)',
                textDecoration: 'underline',
                textUnderlineOffset: 3,
                fontWeight: 600,
                marginLeft: 4,
              }}
            >
              {t('journalists_cta')}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

function bucketByDate(items: Vote[]): Map<string, Vote[]> {
  const m = new Map<string, Vote[]>();
  for (const v of items) {
    const date = v.voted_at.slice(0, 10);
    const bucket = m.get(date);
    if (bucket) bucket.push(v);
    else m.set(date, [v]);
  }
  return m;
}
