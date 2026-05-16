import { ImageResponse } from 'next/og';
import { getLocale, getTranslations } from 'next-intl/server';

import { api } from '@/lib/api';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Avui al Congrés · Hola Política';

/**
 * Open Graph image for /avui — the daily front page.
 *
 * Composite layout:
 *   - Masthead with site brand + the page's anchor date
 *   - The latest plenary vote's title (clamped to ~2 lines) + result
 *     pill + stacked bar
 *   - Right column with three large counters (votes / initiatives /
 *     classified) sourced from /stats/summary
 *
 * Cached at the Vercel edge via Next.js's default OG behaviour (24 h
 * unless busted). We deliberately bind the displayed date to the
 * latest vote's `voted_at` so the OG stays internally consistent
 * with the live page even if the visitor's clock is ahead.
 */
export default async function AvuiOg() {
  const t = await getTranslations('avui_og');
  const locale = await getLocale();

  const [votes, summary] = await Promise.all([
    api.votes.list({ page: 1, page_size: 1 }).catch(() => null),
    api.stats.summary().catch(() => null),
  ]);
  const lead = votes?.items[0] ?? null;
  const date = lead ? new Date(lead.voted_at) : new Date();
  const dateLong = date.toLocaleDateString(locale, { dateStyle: 'long' });

  // Compose the result colour pair the same way the embed widget does
  // — soft pastel fill, dark text — so social previews and the page
  // share a visual vocabulary.
  const resultColors: Record<string, { bg: string; fg: string }> = {
    approved: { bg: '#DCFCE7', fg: '#14532D' },
    rejected: { bg: '#FEE2E2', fg: '#7F1D1D' },
    tie: { bg: '#FEF3C7', fg: '#78350F' },
  };
  const resultLabels: Record<string, string> = {
    approved: t('result_approved'),
    rejected: t('result_rejected'),
    tie: t('result_tie'),
  };
  const result = lead ? resultColors[lead.result] ?? resultColors.approved! : null;
  const resultLabel = lead ? resultLabels[lead.result] ?? lead.result : null;

  const title = lead
    ? (lead.description?.trim() || lead.title || '').slice(0, 180)
    : t('empty_title');

  const total = lead ? lead.ayes + lead.noes + lead.abstentions + lead.absent : 0;
  const seg = (n: number) =>
    total === 0 ? 0 : Math.round((n / total) * 1080); // 1080 = bar width

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#fbf9f4',
          display: 'flex',
          flexDirection: 'column',
          padding: '52px 64px',
          fontFamily: 'sans-serif',
          color: '#1a2138',
        }}
      >
        {/* Masthead */}
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            paddingBottom: 14,
            borderBottom: '3px solid #1a2138',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
            <span
              style={{
                fontSize: 18,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                fontWeight: 700,
                color: '#5b6275',
              }}
            >
              {t('brand')}
            </span>
            <span
              style={{
                fontSize: 18,
                color: '#8a8f9c',
                fontStyle: 'italic',
              }}
            >
              {t('eyebrow')}
            </span>
          </div>
          <span style={{ fontSize: 18, color: '#5b6275', fontStyle: 'italic' }}>
            {dateLong}
          </span>
        </div>

        {/* Headline + result + bar OR empty fallback */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            paddingTop: 32,
            gap: 22,
          }}
        >
          <div
            style={{
              fontSize: 22,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: '#5b6275',
              fontWeight: 700,
            }}
          >
            {t('lead_eyebrow')}
          </div>

          <div
            style={{
              fontSize: title.length > 100 ? 44 : 56,
              fontWeight: 700,
              lineHeight: 1.08,
              letterSpacing: '-0.02em',
              color: '#0F172A',
              maxWidth: 1080,
            }}
          >
            {title}
          </div>

          {lead && result && resultLabel && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 18,
                marginTop: 'auto',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: result.bg,
                  color: result.fg,
                  padding: '10px 20px',
                  fontSize: 24,
                  fontWeight: 800,
                  letterSpacing: '0.06em',
                  borderRadius: 8,
                }}
              >
                {resultLabel.toUpperCase()}
              </div>
              <div
                style={{
                  fontSize: 22,
                  color: '#1a2138',
                  display: 'flex',
                  gap: 14,
                }}
              >
                <span style={{ fontWeight: 700, color: '#16A34A' }}>
                  {lead.ayes} {t('ayes_short')}
                </span>
                <span style={{ color: '#94A3B8' }}>·</span>
                <span style={{ fontWeight: 700, color: '#DC2626' }}>
                  {lead.noes} {t('noes_short')}
                </span>
                <span style={{ color: '#94A3B8' }}>·</span>
                <span style={{ fontWeight: 600, color: '#CA8A04' }}>
                  {lead.abstentions} {t('abst_short')}
                </span>
              </div>
            </div>
          )}

          {lead && total > 0 && (
            <div
              style={{
                display: 'flex',
                width: 1080,
                height: 16,
                borderRadius: 6,
                overflow: 'hidden',
                background: '#E2E8F0',
              }}
            >
              {lead.ayes > 0 && (
                <div style={{ width: seg(lead.ayes), background: '#16A34A' }} />
              )}
              {lead.noes > 0 && (
                <div style={{ width: seg(lead.noes), background: '#DC2626' }} />
              )}
              {lead.abstentions > 0 && (
                <div style={{ width: seg(lead.abstentions), background: '#CA8A04' }} />
              )}
              {lead.absent > 0 && (
                <div style={{ width: seg(lead.absent), background: '#CBD5E1' }} />
              )}
            </div>
          )}
        </div>

        {/* Counters footer */}
        {summary && (
          <div
            style={{
              display: 'flex',
              gap: 56,
              paddingTop: 22,
              borderTop: '1px solid #cfd3da',
              marginTop: 24,
            }}
          >
            <Counter
              label={t('counter_votes')}
              value={summary.votes_total.toLocaleString(locale)}
            />
            <Counter
              label={t('counter_initiatives')}
              value={summary.initiatives_total.toLocaleString(locale)}
            />
            <Counter
              label={t('counter_classified')}
              value={summary.initiatives_classified.toLocaleString(locale)}
            />
            <div
              style={{
                marginLeft: 'auto',
                fontSize: 16,
                color: '#5b6275',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                fontWeight: 700,
                alignSelf: 'flex-end',
              }}
            >
              holapolitica.org/avui
            </div>
          </div>
        )}
      </div>
    ),
    {
      ...size,
    },
  );
}

function Counter({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          fontSize: 34,
          fontWeight: 800,
          color: '#0F172A',
          letterSpacing: '-0.01em',
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 14,
          color: '#5b6275',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          fontWeight: 600,
          marginTop: 2,
        }}
      >
        {label}
      </div>
    </div>
  );
}
