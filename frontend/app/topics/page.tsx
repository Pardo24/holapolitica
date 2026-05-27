import Link from 'next/link';
import { ArrowRight, Bell } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@/components/PageHeader';
import { TopicListPanel } from '@/components/TopicListPanel';

/*
 * The SDG (Agenda 2030) taxonomy is disabled for the public launch
 * because no initiative has been classified against it yet by the
 * auto-classifier. Stripped the ``?kind=sdg`` branch + searchParams
 * handling; the editorial-theme taxonomy is the only one rendered.
 * To re-enable, restore the kind switching from git history once the
 * SDG classifier ships.
 */

export default async function TopicsPage() {
  const t = await getTranslations('topics');

  return (
    <div>
      <PageHeader
        title={t('title')}
        subtitle="Taxonomia · classificació automàtica"
        bordered
      >
        <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: 0, maxWidth: 760 }}>
          {t('subtitle')}
        </p>
      </PageHeader>

      {/* Follow-topics banner — the previous /topics page was a bare list
          of taxonomy chips, which left users wondering what they could
          actually DO with topics. Surfacing the "subscribe per topic"
          affordance up top reframes the page as "pick what you care
          about, get email when it moves" instead of "static taxonomy
          reference". The CTA leads to /notifications (the existing
          preferences hub); no preselection in v1 — the user picks there. */}
      <section
        aria-labelledby="topics-follow-title"
        style={{
          marginTop: 18,
          marginBottom: 6,
          padding: '18px 20px',
          borderRadius: 14,
          background: 'var(--paper-2)',
          border: '1px solid var(--rule-strong)',
          display: 'grid',
          gridTemplateColumns: 'auto minmax(0, 1fr) auto',
          gap: 18,
          alignItems: 'center',
        }}
        className="topics-follow-banner"
      >
        <span
          aria-hidden="true"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 44,
            height: 44,
            borderRadius: 12,
            background: 'color-mix(in oklch, var(--accent) 18%, var(--paper))',
            color: 'var(--accent)',
            flex: 'none',
          }}
        >
          <Bell size={22} strokeWidth={1.8} aria-hidden="true" />
        </span>
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow" style={{ marginBottom: 4 }}>
            {t('follow_banner_eyebrow')}
          </div>
          <h2
            id="topics-follow-title"
            className="serif"
            style={{
              margin: 0,
              fontSize: 'clamp(17px, 2vw, 20px)',
              fontWeight: 700,
              letterSpacing: '-0.01em',
              color: 'var(--ink)',
              lineHeight: 1.2,
            }}
          >
            {t('follow_banner_title')}
          </h2>
          <p
            style={{
              margin: '4px 0 0',
              fontSize: 13,
              color: 'var(--ink-2)',
              lineHeight: 1.5,
              maxWidth: 620,
            }}
          >
            {t('follow_banner_body')}
          </p>
        </div>
        <Link
          href="/notifications"
          className="btn-ink"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            flex: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {t('follow_banner_cta')} <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </section>

      <TopicListPanel />

      {/* Mobile: stack the banner contents instead of side-by-side. The
          three-column grid collapses to a single column and the CTA
          moves below the copy so the touch target is full-width. */}
      <style>{`
        @media (max-width: 640px) {
          .topics-follow-banner {
            grid-template-columns: minmax(0, 1fr) !important;
            gap: 12px !important;
            padding: 16px !important;
          }
          .topics-follow-banner > a {
            justify-content: center;
          }
        }
      `}</style>
    </div>
  );
}
