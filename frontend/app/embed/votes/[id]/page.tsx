import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';

import { api } from '@/lib/api';
import { pickPlainSummary } from '@/lib/glossary';
import { groupLogoUrl } from '@/lib/groupLogos';
import { groupAbbreviation, readableTextOn } from '@/lib/groups';

/**
 * Embed widget for a single Congress vote.
 *
 * Usage from a newsroom CMS:
 *   <iframe src="https://www.holapolitica.org/embed/votes/123"
 *           width="100%" height="360" frameborder="0"
 *           loading="lazy"></iframe>
 *
 * Embed contract (see CLAUDE.md "Embed widgets — guidelines"):
 *   - sub-1s render budget. Styles are inline; no fonts, no JS, no
 *     third-party assets.
 *   - factual data only. The result pill, the ayes/noes/abst/absent
 *     figures and the top-three per-group cohesion bars are all
 *     direct from the Congreso opendata feed via our API.
 *   - clear attribution + link back to the canonical vote page.
 *
 * The widget no longer wraps its content in its own ``<html><body>``
 * — the root layout (``frontend/app/layout.tsx``) detects /embed/*
 * paths and renders a chrome-less shell, so the iframe gets the
 * project's CSS variables (``var(--ink)`` etc) for free and the
 * accidental navbar inside the iframe is fixed.
 */
export const metadata: Metadata = {
  // Iframed widgets must never compete with the host page in search
  // results — every embed sets robots: noindex.
  robots: { index: false, follow: false },
};

export default async function EmbedVotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations('embed_vote');
  const locale = await getLocale();

  let vote;
  try {
    vote = await api.votes.get(Number(id));
  } catch {
    return <NotFound message={t('not_found')} />;
  }

  // Per-group breakdown: best-effort. If the cohesion endpoint errors
  // (404 on votes not yet processed) we just skip the strip — the rest
  // of the widget still renders.
  const cohesion = await api.metrics.cohesion(Number(id)).catch(() => []);

  const resultPalette: Record<string, { bg: string; fg: string; label: string }> = {
    approved: { bg: 'var(--aye-soft)', fg: 'oklch(0.32 0.10 152)', label: t('result_approved') },
    rejected: { bg: 'var(--no-soft)', fg: 'oklch(0.32 0.13 26)', label: t('result_rejected') },
    tie: { bg: 'var(--abst-soft)', fg: 'oklch(0.32 0.11 82)', label: t('result_tie') },
  };
  const result = resultPalette[vote.result] ?? resultPalette.approved!;
  const totalCast = vote.ayes + vote.noes + vote.abstentions + vote.absent;

  return (
    <article className="embed-card" lang={locale}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12,
          marginBottom: 14,
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <p
            className="eyebrow"
            style={{
              margin: 0,
              fontSize: 10,
              color: 'var(--ink-3)',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              fontWeight: 700,
            }}
          >
            {new Date(vote.voted_at).toLocaleDateString(locale, { dateStyle: 'long' })}
            {vote.expediente_raw ? ` · ${vote.expediente_raw}` : ''}
          </p>
          {/* AI plain-language summary leads when available (what a
              reader actually parses in an iframe); the official text
              drops to a small muted line beneath. Falls back to the
              original subject as the headline. */}
          {(() => {
            const plain = pickPlainSummary(vote, locale);
            const subject = vote.description?.trim() || vote.title;
            return plain ? (
              <>
                <h1
                  className="serif"
                  style={{
                    margin: '4px 0 0',
                    fontSize: 16,
                    lineHeight: 1.4,
                    fontWeight: 600,
                    color: 'var(--ink)',
                    letterSpacing: '-0.005em',
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {plain}
                </h1>
                <p
                  style={{
                    margin: '5px 0 0',
                    fontSize: 10.5,
                    lineHeight: 1.4,
                    color: 'var(--ink-3)',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {subject}
                </p>
              </>
            ) : (
              <h1
                className="serif"
                style={{
                  margin: '4px 0 0',
                  fontSize: 17,
                  lineHeight: 1.35,
                  fontWeight: 600,
                  color: 'var(--ink)',
                  letterSpacing: '-0.005em',
                  display: '-webkit-box',
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {subject}
              </h1>
            );
          })()}
          {(vote.proposed_by_government || vote.proposing_group_short) && (
            <p
              style={{
                margin: '6px 0 0',
                fontSize: 11,
                color: 'var(--ink-3)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span>{t('proposed_by_label')}</span>
              {vote.proposed_by_government && !vote.proposing_group_short ? (
                <strong style={{ color: 'var(--ink)', fontWeight: 600 }}>
                  {t('proposed_government')}
                </strong>
              ) : vote.proposing_group_short ? (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    color: 'var(--ink)',
                    fontWeight: 600,
                  }}
                >
                  {vote.proposing_group_color && (
                    <span
                      aria-hidden="true"
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: 999,
                        background: vote.proposing_group_color,
                        display: 'inline-block',
                      }}
                    />
                  )}
                  {vote.proposing_group_short}
                </span>
              ) : null}
            </p>
          )}
        </div>
        <span
          style={{
            background: result.bg,
            color: result.fg,
            fontWeight: 700,
            fontSize: 11,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            padding: '5px 9px',
            borderRadius: 4,
            whiteSpace: 'nowrap',
            flex: 'none',
          }}
        >
          {result.label}
        </span>
      </header>

      <StackedBar
        ayes={vote.ayes}
        noes={vote.noes}
        abstentions={vote.abstentions}
        absent={vote.absent}
      />

      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 12,
          margin: 0,
          padding: '10px 0',
        }}
      >
        <Stat label={t('label_aye')} value={vote.ayes} color="var(--aye)" />
        <Stat label={t('label_no')} value={vote.noes} color="var(--no)" />
        <Stat label={t('label_abst')} value={vote.abstentions} color="var(--abst)" />
        <Stat label={t('label_absent')} value={vote.absent} color="var(--ink-3)" />
      </dl>

      {cohesion.length > 0 && (
        <section
          style={{
            borderTop: '1px solid var(--rule)',
            paddingTop: 10,
            marginTop: 4,
          }}
        >
          <p
            className="eyebrow"
            style={{
              margin: '0 0 8px',
              fontSize: 10,
              color: 'var(--ink-3)',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              fontWeight: 700,
            }}
          >
            {t('stance_eyebrow')}
          </p>
          {/* Party stance clusters — the widget's money shot: each
              group's LOGO under the position it took, with its deputy
              count. Replaces the old cohesion rows (a % a journalist
              had to decode); "who voted what" is what a reader pastes
              this iframe for. Plain <img> logos = zero JS, iframe-safe. */}
          <StanceClusters
            cohesion={cohesion}
            labels={{
              aye: t('label_aye'),
              no: t('label_no'),
              abstention: t('label_abst'),
            }}
          />
        </section>
      )}

      <footer
        style={{
          marginTop: 12,
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
          href={`/votes/${vote.id}`}
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
          </a>{' '}
          · <span className="tabular">{totalCast}/350</span>
        </span>
      </footer>
    </article>
  );
}

function NotFound({ message }: { message: string }) {
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
      {message}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <dt
        style={{
          fontSize: 10,
          color: 'var(--ink-3)',
          margin: 0,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          fontWeight: 600,
        }}
      >
        {label}
      </dt>
      <dd
        className="tabular"
        style={{
          fontSize: 22,
          fontWeight: 600,
          margin: 0,
          color,
          letterSpacing: '-0.01em',
          lineHeight: 1,
        }}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * Inline stacked bar — see comment in app/embed/votes/[id]/page.tsx
 * for why we don't import the shared component. Now that /embed/*
 * inherits the root layout's globals.css, ``var(--aye)`` etc. work,
 * so the colors stay in sync with the rest of the site.
 */
function StackedBar({
  ayes,
  noes,
  abstentions,
  absent,
}: {
  ayes: number;
  noes: number;
  abstentions: number;
  absent: number;
}) {
  const total = ayes + noes + abstentions + absent;
  if (total === 0) return null;
  const segs: { n: number; color: string; label: string }[] = [
    { n: ayes, color: 'var(--aye)', label: 'Sí' },
    { n: noes, color: 'var(--no)', label: 'No' },
    { n: abstentions, color: 'var(--abst)', label: 'Abst.' },
    { n: absent, color: 'var(--nv, #CBD5E1)', label: 'Abs' },
  ];
  return (
    <div
      role="img"
      aria-label={segs.filter((s) => s.n > 0).map((s) => `${s.label}: ${s.n}`).join(', ')}
      style={{
        display: 'flex',
        height: 6,
        overflow: 'hidden',
        background: 'var(--rule)',
        marginBottom: 2,
      }}
    >
      {segs.map((s) =>
        s.n > 0 ? (
          <span
            key={s.label}
            title={`${s.label}: ${s.n}`}
            style={{
              width: `${(s.n / total) * 100}%`,
              background: s.color,
              height: '100%',
              display: 'block',
            }}
          />
        ) : null,
      )}
    </div>
  );
}

/**
 * Party stance clusters for the embed: one block per position (Sí /
 * No / Abstención) with each group's logo (local SVG, white plate) and
 * its deputy count. A group lands in the bucket where most of its
 * deputies voted. No JS, no external assets — iframe-safe.
 */
function StanceClusters({
  cohesion,
  labels,
}: {
  cohesion: {
    group_slug: string;
    group_name_short: string;
    group_color_hex: string | null;
    ayes: number;
    noes: number;
    abstentions: number;
    no_vote: number;
  }[];
  labels: { aye: string; no: string; abstention: string };
}) {
  const COLOR: Record<string, string> = {
    aye: 'var(--aye)',
    no: 'var(--no)',
    abstention: 'var(--abst)',
  };
  const majority = (g: (typeof cohesion)[number]): { key: string; n: number } => {
    const buckets = [
      { key: 'aye', n: g.ayes },
      { key: 'no', n: g.noes },
      { key: 'abstention', n: g.abstentions },
      { key: 'absent', n: g.no_vote },
    ];
    return buckets.sort((a, b) => b.n - a.n)[0]!;
  };
  const clusters = (['aye', 'no', 'abstention'] as const)
    .map((key) => ({
      key,
      label: key === 'aye' ? labels.aye : key === 'no' ? labels.no : labels.abstention,
      members: cohesion
        .map((g) => ({ g, m: majority(g) }))
        .filter((x) => x.m.key === key && x.m.n > 0)
        .sort((a, b) => b.m.n - a.m.n),
    }))
    .filter((c) => c.members.length > 0);

  return (
    <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
      {clusters.map((c) => (
        <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.07em',
              color: COLOR[c.key],
              flex: 'none',
            }}
          >
            {c.label}
          </span>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, flexWrap: 'wrap' }}>
            {c.members.map(({ g, m }) => {
              const logo = groupLogoUrl(g.group_slug);
              const abbrev = groupAbbreviation(g.group_slug);
              const title = g.group_name_short + ' · ' + String(m.n);
              return (
                <span
                  key={g.group_slug}
                  title={title}
                  style={{
                    display: 'inline-flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 2,
                  }}
                >
                  {logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={logo}
                      alt={abbrev}
                      width={26}
                      height={26}
                      style={{
                        width: 26,
                        height: 26,
                        objectFit: 'contain',
                        padding: 2,
                        boxSizing: 'border-box',
                        background: '#fff',
                        borderRadius: 6,
                        border: '1px solid rgba(0,0,0,.08)',
                      }}
                    />
                  ) : (
                    <span
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 6,
                        background: g.group_color_hex ?? '#9ca3af',
                        color: readableTextOn(g.group_color_hex),
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: abbrev.length > 3 ? 7 : 9,
                        fontWeight: 700,
                      }}
                    >
                      {abbrev}
                    </span>
                  )}
                  <span
                    className="tabular"
                    style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--ink-2)', lineHeight: 1 }}
                  >
                    {m.n}
                  </span>
                </span>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
