import Link from 'next/link';
import type { Route } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { Landmark } from 'lucide-react';

import { PageHeader } from '@/components/PageHeader';
import { api, type LegislatureStat } from '@/lib/api';

// Aggregate data refreshes event-driven via the backend cache; a 5-min ISR
// window is plenty for this comparison surface.
export const revalidate = 300;

/**
 * Cross-legislature comparison — the "memory / accountability" surface
 * unlocked by the X-XV historical backfill. Reads /stats/legislatures and
 * lays every legislature side by side: volume, approval rate, assent.
 *
 * Neutral by construction: it reports every legislature's full aggregates in
 * a fixed order (most recent first), never a partisan slice.
 */
export default async function LegislaturesPage() {
  const t = await getTranslations('legislatures');
  const locale = await getLocale();

  let rows: LegislatureStat[] = [];
  try {
    rows = await api.stats.legislatures();
  } catch {
    rows = [];
  }

  const maxVotes = Math.max(1, ...rows.map((r) => r.votes_total));
  const statusLabel = (s: string): string =>
    s === 'active' ? t('status_active') : s === 'dissolved' ? t('status_dissolved') : t('status_concluded');

  return (
    <div>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        icon={<Landmark size={20} strokeWidth={1.8} aria-hidden="true" />}
        bordered
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 20 }}>
        {rows.map((r) => {
          const period = `${new Date(r.start_date).getFullYear()}–${
            r.end_date ? new Date(r.end_date).getFullYear() : ''
          }`;
          const approvalPct = Math.round(r.approval_rate * 100);
          return (
            <Link
              key={r.number}
              href={(r.status === 'active' ? '/votes' : `/votes?legislature=${r.id}`) as Route}
              className="leg-card"
              style={{
                display: 'block',
                padding: '16px 18px',
                border: '1px solid var(--rule)',
                borderLeft: `3px solid ${r.status === 'active' ? 'var(--accent)' : 'var(--rule-strong)'}`,
                background: 'var(--paper-2)',
                borderRadius: 10,
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <span className="serif" style={{ fontSize: 20, fontWeight: 600, color: 'var(--ink)' }}>
                    {t('legislature_n', { number: r.number })}
                  </span>
                  <span className="tabular" style={{ fontSize: 13, color: 'var(--ink-3)' }}>
                    {period}
                  </span>
                  <span
                    className="eyebrow"
                    style={{
                      fontSize: 10,
                      padding: '2px 8px',
                      borderRadius: 999,
                      border: '1px solid var(--rule-strong)',
                      color: r.status === 'active' ? 'var(--accent)' : 'var(--ink-3)',
                    }}
                  >
                    {statusLabel(r.status)}
                  </span>
                </div>
              </div>

              {/* Vote-volume bar — scaled to the busiest legislature, so the
                  relative legislative throughput is visible at a glance. */}
              <div style={{ marginTop: 12 }}>
                <div
                  style={{
                    height: 8,
                    borderRadius: 999,
                    background: 'var(--paper-3)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${(r.votes_total / maxVotes) * 100}%`,
                      height: '100%',
                      background: 'var(--ink-2)',
                    }}
                  />
                </div>
              </div>

              <div
                className="leg-kpis"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: 14,
                  marginTop: 14,
                }}
              >
                <Kpi label={t('th_sessions')} value={r.sessions.toLocaleString(locale)} />
                <Kpi label={t('th_votes')} value={r.votes_total.toLocaleString(locale)} />
                <Kpi
                  label={t('th_approval')}
                  value={r.votes_total > 0 ? `${approvalPct}%` : '—'}
                />
                <Kpi label={t('th_assent')} value={r.assent.toLocaleString(locale)} />
              </div>
            </Link>
          );
        })}
      </div>

      <p style={{ marginTop: 18, fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.5, maxWidth: 720 }}>
        {t('footnote')}
      </p>

      <style>{`
        .leg-card:hover, .leg-card:focus-visible { border-color: var(--rule-strong); outline: none; }
        @media (max-width: 520px) {
          .leg-kpis { grid-template-columns: repeat(2, 1fr) !important; row-gap: 14px !important; }
        }
      `}</style>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div
        className="eyebrow"
        style={{ fontSize: 10, color: 'var(--ink-3)', marginBottom: 2 }}
      >
        {label}
      </div>
      <div
        className="tabular"
        style={{ fontSize: 22, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.01em' }}
      >
        {value}
      </div>
    </div>
  );
}
