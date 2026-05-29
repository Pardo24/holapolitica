import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';

import { api } from '@/lib/api';

/**
 * Embed widget for a parliamentary group — composition card.
 *
 * Usage:
 *   <iframe src="https://www.holapolitica.org/embed/groups/sumar"
 *           width="100%" height="280" frameborder="0"
 *           loading="lazy"></iframe>
 *
 * Replaces the earlier two-stat (cohesion + attendance) variant which
 * Daniel flagged as low-value. The new widget surfaces the FACTUAL
 * demographic composition of the group: total seats, gender split as
 * a stacked bar, and age distribution as a small histogram. Cohesion
 * + attendance remain on /groups/[slug] for analysts; the embed
 * focuses on the picture a newsroom is most likely to want next to
 * a story about who decided what.
 *
 * Same embed contract as the rest of /embed/*:
 *   - sub-1s render, inline styles, no JS / external assets
 *   - factual only (zero editorial framing)
 *   - attribution + link back to the canonical page
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function EmbedGroupPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const t = await getTranslations('embed_group');
  const locale = await getLocale();

  let group;
  let composition;
  try {
    group = await api.groups.get(slug);
    composition = await api.groups.composition(slug);
  } catch {
    return (
      <div
        style={{
          padding: 20,
          fontSize: 13,
          color: 'var(--ink-3)',
          textAlign: 'center',
          border: '1px solid var(--rule)',
          background: 'var(--paper)',
        }}
      >
        {t('not_found')}
      </div>
    );
  }
  // Chamber-wide composition for the same legislature — used as a
  // reference line so the reader can see whether the group's gender
  // split / age distribution skews from the chamber as a whole.
  // Best-effort: the embed still renders even if the reference fails.
  const reference = await api.legislatures
    .composition(group.legislature_id)
    .catch(() => null);

  const color = group.color_hex ?? 'var(--ink)';

  // Gender split — F / M / X / unknown. We render the bar only when
  // at least one bucket has a value; otherwise we leave the slot
  // empty rather than draw an empty grey rectangle.
  const gd = composition.gender_distribution;
  const genderTotal = (gd.F ?? 0) + (gd.M ?? 0) + (gd.X ?? 0) + (gd.unknown ?? 0);

  // Age buckets in stable display order. The widget renders every
  // non-zero bucket; an empty bucket disappears entirely (rather
  // than showing "0" — too much noise in a small card).
  const buckets: { key: keyof typeof composition.age_buckets; label: string }[] = [
    { key: '<30', label: t('age_lt30') },
    { key: '30-39', label: t('age_30_39') },
    { key: '40-49', label: t('age_40_49') },
    { key: '50-59', label: t('age_50_59') },
    { key: '60+', label: t('age_60p') },
  ];
  const ageTotal = buckets.reduce(
    (acc, b) => acc + (composition.age_buckets[b.key] ?? 0),
    0,
  );
  // Largest single age bucket — horizontal bars scale to it so the most
  // populous band fills the row.
  const maxAgeCount = Math.max(
    1,
    ...buckets.map((b) => composition.age_buckets[b.key] ?? 0),
  );

  return (
    <article className="embed-card" lang={locale}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 14,
          paddingBottom: 10,
          borderBottom: `1px solid ${color}`,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 14,
            height: 14,
            borderRadius: 3,
            background: color,
            flex: 'none',
            display: 'inline-block',
          }}
        />
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1
            className="serif"
            style={{
              margin: 0,
              fontSize: 16,
              lineHeight: 1.25,
              fontWeight: 700,
              color: 'var(--ink)',
              letterSpacing: '-0.005em',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {group.name_long}
          </h1>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--ink-3)' }}>
            {group.name_short}
          </p>
        </div>
        <span
          className="tabular"
          style={{
            fontSize: 22,
            fontWeight: 600,
            color: 'var(--ink)',
            letterSpacing: '-0.01em',
            lineHeight: 1,
            whiteSpace: 'nowrap',
          }}
        >
          {composition.members_total}
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: 'var(--ink-3)',
              marginLeft: 4,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            {t('label_seats')}
          </span>
        </span>
      </header>

      {genderTotal > 0 && (
        <section style={{ marginBottom: 14 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 10,
              color: 'var(--ink-3)',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              fontWeight: 700,
              marginBottom: 6,
            }}
          >
            <span>{t('parity_label')}</span>
            <span className="tabular" style={{ color: 'var(--ink-2)' }}>
              {gd.F} F · {gd.M} M
              {gd.X > 0 ? ` · ${gd.X} X` : ''}
              {gd.unknown > 0 ? ` · ${gd.unknown} ?` : ''}
            </span>
          </div>
          <div
            style={{
              position: 'relative',
              display: 'flex',
              height: 8,
              background: 'var(--rule)',
            }}
          >
            {gd.F > 0 && (
              <span
                style={{
                  width: `${(gd.F / genderTotal) * 100}%`,
                  background: 'oklch(0.65 0.18 350)',
                }}
              />
            )}
            {gd.M > 0 && (
              <span
                style={{
                  width: `${(gd.M / genderTotal) * 100}%`,
                  background: 'oklch(0.55 0.12 250)',
                }}
              />
            )}
            {gd.X > 0 && (
              <span
                style={{
                  width: `${(gd.X / genderTotal) * 100}%`,
                  background: 'oklch(0.55 0.10 280)',
                }}
              />
            )}
            {gd.unknown > 0 && (
              <span
                style={{
                  width: `${(gd.unknown / genderTotal) * 100}%`,
                  background: 'var(--ink-3)',
                }}
              />
            )}
            {/* Reference marker — the legislature-wide F share as a
                vertical hairline. Lets the reader see at a glance
                whether this group's share is to the left of the
                chamber average (under-represented F) or to the
                right (over-represented). Drawn only when the
                reference is loaded; gracefully absent otherwise. */}
            {reference != null &&
              (() => {
                const refTotal =
                  (reference.gender_distribution.F ?? 0) +
                  (reference.gender_distribution.M ?? 0) +
                  (reference.gender_distribution.X ?? 0) +
                  (reference.gender_distribution.unknown ?? 0);
                if (refTotal === 0) return null;
                const refFShare =
                  (reference.gender_distribution.F ?? 0) / refTotal;
                return (
                  <span
                    aria-hidden="true"
                    title={`${t('parity_reference_tooltip')} ${Math.round(refFShare * 100)}% F`}
                    style={{
                      position: 'absolute',
                      top: -2,
                      bottom: -2,
                      left: `${refFShare * 100}%`,
                      width: 2,
                      background: 'var(--ink)',
                      transform: 'translateX(-50%)',
                    }}
                  />
                );
              })()}
          </div>
          {reference != null && (
            <div
              style={{
                marginTop: 4,
                fontSize: 9,
                color: 'var(--ink-3)',
                letterSpacing: '0.04em',
              }}
            >
              {t('parity_reference_caption', {
                pct: Math.round(
                  ((reference.gender_distribution.F ?? 0) /
                    Math.max(
                      1,
                      (reference.gender_distribution.F ?? 0) +
                        (reference.gender_distribution.M ?? 0) +
                        (reference.gender_distribution.X ?? 0) +
                        (reference.gender_distribution.unknown ?? 0),
                    )) *
                    100,
                ),
              })}
            </div>
          )}
        </section>
      )}

      {ageTotal > 0 && (
        <section style={{ marginBottom: 8 }}>
          <div
            style={{
              fontSize: 10,
              color: 'var(--ink-3)',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              fontWeight: 700,
              marginBottom: 8,
            }}
          >
            {t('age_label')}
          </div>
          {/* Horizontal proportion bars — one row per age band. Cleaner
              and more legible at embed scale than vertical columns, and
              without the chamber-reference hairline that read as a stray
              line across each bar. */}
          <ul
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            {buckets.map((b) => {
              const n = composition.age_buckets[b.key] ?? 0;
              const pct = (n / maxAgeCount) * 100;
              return (
                <li
                  key={b.key}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '44px 1fr 20px',
                    gap: 8,
                    alignItems: 'center',
                  }}
                >
                  <span
                    style={{
                      fontSize: 9,
                      color: 'var(--ink-3)',
                      letterSpacing: '0.04em',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {b.label}
                  </span>
                  <span
                    aria-hidden="true"
                    style={{
                      display: 'block',
                      height: 8,
                      borderRadius: 4,
                      background: 'var(--rule)',
                      overflow: 'hidden',
                    }}
                  >
                    <span
                      style={{
                        display: 'block',
                        width: `${pct}%`,
                        height: '100%',
                        background: color,
                        borderRadius: 4,
                        minWidth: n > 0 ? 3 : 0,
                      }}
                    />
                  </span>
                  <span
                    className="tabular"
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: 'var(--ink)',
                      textAlign: 'right',
                    }}
                  >
                    {n}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <footer
        style={{
          marginTop: 14,
          paddingTop: 10,
          borderTop: '1px solid var(--rule)',
          fontSize: 11,
          color: 'var(--ink-3)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <a
          href={`/groups/${group.slug}`}
          target="_top"
          style={{
            color: 'var(--ink)',
            textDecoration: 'underline',
            textUnderlineOffset: 3,
            fontWeight: 600,
          }}
        >
          {t('see_detail')}
        </a>
        <span>
          {t('source_label')}{' '}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/"
            target="_top"
            style={{ color: 'var(--ink)', textDecoration: 'none', fontWeight: 700 }}
          >
            Hola Política
          </a>
        </span>
      </footer>
    </article>
  );
}
