import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';

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

  // One paginated call covers many sessions. 200 votes covers roughly
  // 12 plenary days (≈15-20 votes per day) which is plenty for the
  // "sessions anteriors" sidebar without paying for a deeper window.
  const votesPage = await api.votes
    .list({ page: 1, page_size: 200 })
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
        <h1 className="h-headline" style={{ margin: '0 0 12px' }}>
          {t('title')}
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

      <section
        style={{
          marginTop: 32,
          paddingTop: 24,
          borderTop: '1px solid var(--ink)',
          display: 'grid',
          gridTemplateColumns: '1.2fr 0.8fr',
          gap: 28,
        }}
        className="avui-closing"
      >
        <div>
          <h2
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 700,
              fontFamily: 'var(--font-serif)',
              letterSpacing: '-0.01em',
            }}
          >
            {t('newsletter_title')}
          </h2>
          <p
            style={{
              margin: '6px 0 14px',
              fontSize: 14,
              color: 'var(--ink-2)',
              lineHeight: 1.6,
            }}
          >
            {t('newsletter_caption')}
          </p>
          <NewsletterSignup />
        </div>
        <div
          style={{
            padding: '14px 16px',
            background: 'var(--paper-2)',
            border: '1px solid var(--rule-strong)',
            borderRadius: 12,
          }}
        >
          <div className="eyebrow" style={{ fontSize: 10 }}>
            {t('journalists_eyebrow')}
          </div>
          <p
            style={{
              margin: '4px 0 10px',
              fontSize: 13,
              color: 'var(--ink-2)',
              lineHeight: 1.5,
            }}
          >
            {t('journalists_caption')}
          </p>
          <Link
            href={'/journalists' as Route}
            style={{
              display: 'inline-block',
              padding: '8px 14px',
              border: '1px solid var(--ink)',
              borderRadius: 999,
              background: 'var(--paper)',
              color: 'var(--ink)',
              fontSize: 13,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            {t('journalists_cta')}
          </Link>
        </div>
      </section>

      <style>{`
        @media (max-width: 720px) {
          .avui-closing { grid-template-columns: 1fr !important; gap: 22px !important; }
        }
      `}</style>
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
