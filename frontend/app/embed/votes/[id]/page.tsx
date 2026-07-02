import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';

import { api } from '@/lib/api';
import { pickPlainSummary } from '@/lib/glossary';

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

  // Cohesion strip: best-effort. If the cohesion endpoint errors (it
  // returns 404 on votes that haven't been processed yet) we just
  // skip the strip — the rest of the widget still renders. We also
  // pull the per-group legislature-average cohesion so each row
  // gets a reference marker — "this group voted 96% united today;
  // their typical legislature cohesion is 92%". The Vote payload
  // doesn't carry a legislature_id, but Hola Política is currently
  // scoped to a single active legislature (XV = id 1); when phase 2
  // ships we'll thread the linked initiative's legislature_id here.
  const ACTIVE_LEGISLATURE_ID = 1;
  const [cohesion, groupAverages] = await Promise.all([
    api.metrics.cohesion(Number(id)).catch(() => []),
    api.metrics
      .groupSummary(ACTIVE_LEGISLATURE_ID)
      .catch(() => [] as Awaited<ReturnType<typeof api.metrics.groupSummary>>),
  ]);
  const avgCohesionBySlug = new Map(
    groupAverages
      .filter((g) => g.avg_cohesion != null)
      .map((g) => [g.group_slug, g.avg_cohesion as number] as const),
  );
  const topGroups = [...cohesion]
    .filter((c) => c.cohesion != null && c.members_voting > 0)
    .sort((a, b) => (b.members_voting ?? 0) - (a.members_voting ?? 0))
    .slice(0, 4);

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

      {topGroups.length > 0 && (
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
            {t('cohesion_eyebrow')}
          </p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 }}>
            {topGroups.map((g) => (
              <CohesionRow
                key={g.group_slug}
                label={g.group_name_short}
                color={g.group_color_hex ?? 'var(--ink)'}
                ayes={g.ayes}
                noes={g.noes}
                abstentions={g.abstentions}
                noVote={g.no_vote}
                voteCohesion={g.cohesion}
                avgCohesion={avgCohesionBySlug.get(g.group_slug) ?? null}
              />
            ))}
          </ul>
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
 * One row of the per-group cohesion strip. Previous design rendered a
 * 6 px stacked bar per group — at 4 groups stacked the slivers were
 * too thin to identify and the colour mix read as visual noise. The
 * new layout shows the GROUP'S MAJORITY VOTE as a single coloured
 * pill ("Sí 120" / "No 88" / "Abst. 11" / "Absent 3"), which a
 * journalist can parse at a glance, plus the cohesion percentage to
 * the right. When the group split (no clear majority) we render a
 * subtle "Dividit" pill to flag the case without inventing a winner.
 */
function CohesionRow({
  label,
  color,
  ayes,
  noes,
  abstentions,
  noVote,
  voteCohesion,
  avgCohesion,
}: {
  label: string;
  color: string;
  ayes: number;
  noes: number;
  abstentions: number;
  noVote: number;
  voteCohesion: number | null;
  avgCohesion: number | null;
}) {
  const total = ayes + noes + abstentions + noVote;
  if (total === 0) return null;
  const votePct =
    voteCohesion != null ? Math.round(voteCohesion * 100) : null;
  const avgPct = avgCohesion != null ? Math.round(avgCohesion * 100) : null;

  // Find the majority choice. Ties between buckets are extremely rare
  // (a group of 12 voting 6-6 ayes/noes happens once in a legislature
  // at most) so we just pick the highest and surface the second-place
  // count as a footnote only when the gap is small.
  const buckets = [
    { key: 'aye', n: ayes, color: 'var(--aye)', label: 'Sí' },
    { key: 'no', n: noes, color: 'var(--no)', label: 'No' },
    { key: 'abst', n: abstentions, color: 'var(--abst)', label: 'Abst.' },
    { key: 'absent', n: noVote, color: 'var(--ink-3)', label: 'Absent' },
  ];
  const sorted = [...buckets].sort((a, b) => b.n - a.n);
  const winner = sorted[0]!;
  const runnerUp = sorted[1]!;
  // A group reads as "Dividit" when the top two buckets are within
  // 30% of each other AND neither carried > 60% of the group. Tuned
  // so a tight PSOE+ERC alignment vs a defecting handful (e.g. 96-3)
  // still reads as "Sí", but a genuine internal split (8-6-2) flips
  // to "Dividit". The boundary is arbitrary but applied consistently.
  const isSplit =
    runnerUp.n > 0 &&
    winner.n / total < 0.6 &&
    runnerUp.n / winner.n > 0.7;

  return (
    <li
      style={{
        display: 'grid',
        gridTemplateColumns: '110px minmax(0, 1fr) 86px',
        alignItems: 'center',
        gap: 12,
        fontSize: 12,
        color: 'var(--ink)',
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          minWidth: 0,
          overflow: 'hidden',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 9,
            height: 9,
            borderRadius: 999,
            background: color,
            flex: 'none',
            display: 'inline-block',
          }}
        />
        <span
          style={{
            fontWeight: 700,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {label}
        </span>
      </span>
      {isSplit ? (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 10px',
            borderRadius: 999,
            background: 'var(--paper-3)',
            border: '1px dashed var(--rule-strong)',
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--ink-2)',
            whiteSpace: 'nowrap',
            justifySelf: 'start',
          }}
        >
          Dividit · {winner.label} {winner.n} / {runnerUp.label} {runnerUp.n}
        </span>
      ) : (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            padding: '4px 12px',
            borderRadius: 999,
            background: `color-mix(in oklch, ${winner.color} 18%, var(--paper))`,
            border: `1px solid color-mix(in oklch, ${winner.color} 38%, var(--paper))`,
            fontSize: 12,
            fontWeight: 700,
            color: winner.color,
            whiteSpace: 'nowrap',
            justifySelf: 'start',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 7,
              height: 7,
              borderRadius: 999,
              background: winner.color,
            }}
          />
          {winner.label} · {winner.n}
        </span>
      )}
      {votePct != null ? (
        <span
          className="tabular"
          title={
            avgPct != null
              ? `Cohesió en aquesta votació: ${votePct}% · mitjana de la legislatura: ${avgPct}%`
              : undefined
          }
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--ink-2)',
            textAlign: 'right',
            whiteSpace: 'nowrap',
          }}
        >
          {votePct}%
          {avgPct != null && (
            <span
              style={{
                color: 'var(--ink-3)',
                fontWeight: 400,
                marginLeft: 4,
              }}
            >
              · {avgPct}%
            </span>
          )}
        </span>
      ) : (
        <span />
      )}
    </li>
  );
}
