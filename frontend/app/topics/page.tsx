import Link from 'next/link';
import { ArrowRight, Bell, Globe2, Layers } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@/components/PageHeader';
import { TopicListPanel } from '@/components/TopicListPanel';

/*
 * The editorial themes are how this site navigates: one taxonomy, on the
 * page a reader lands on. The UN's Sustainable Development Goals are a
 * second lens over the same initiatives, and they have their own page at
 * /agenda-2030 rather than a tab here, because most of what that page owes
 * a reader is an explanation of what the Agenda is, not another grid.
 */

export default async function TopicsPage() {
  const t = await getTranslations('topics');

  return (
    <div>
      <PageHeader
        hue="var(--hue-lleis)"
        title={t('title')}
        subtitle={t('eyebrow')}
        icon={<Layers size={20} strokeWidth={1.8} aria-hidden="true" />}
        bordered
      >
        <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: 0, maxWidth: 760 }}>
          {t('subtitle')}
        </p>
      </PageHeader>

      <TopicListPanel />

      {/* The second lens, one click away. The goals used to leak into the
          chips on every list with nowhere to send the reader; now they have
          a page, and this is the only place that points at it. */}
      <Link
        href="/agenda-2030"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          marginTop: 26,
          padding: '14px 16px',
          borderRadius: 14,
          border: '1px solid var(--rule)',
          background: 'var(--paper)',
          textDecoration: 'none',
          color: 'inherit',
        }}
      >
        <Globe2
          size={20}
          strokeWidth={1.8}
          aria-hidden="true"
          style={{ color: 'var(--accent)', flex: 'none' }}
        />
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>
            {t('sdg_banner_title')}
          </span>
          <span
            style={{ display: 'block', fontSize: 12.5, lineHeight: 1.5, color: 'var(--ink-3)' }}
          >
            {t('sdg_banner_body')}
          </span>
        </span>
        <ArrowRight size={16} strokeWidth={2} aria-hidden="true" style={{ flex: 'none' }} />
      </Link>


      {/* Follow-topics banner. It offers to email a reader when a topic
          moves, which only makes sense once they have seen the topics, so
          it sits AFTER the list: at the top it spent half a phone screen
          asking for a subscription from someone who had not been shown
          anything yet. The CTA leads to /notifications, where the reader
          picks the topics themselves. */}
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
