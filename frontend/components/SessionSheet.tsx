import type { Route } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { ResultPill } from '@/components/ResultPill';
import { StackedBar } from '@/components/StackedBar';
import type { InitiativeTopicSlug, Vote } from '@/lib/api';
import { pickPlainSummary } from '@/lib/glossary';
import { pickTopicName } from '@/lib/topics';

/**
 * Plenary-session summary sheet — the canonical render for one day's
 * worth of votes in the Spanish Congress. Used both by ``/avui``
 * (always the latest session) and ``/avui/[date]`` (any archived
 * session) so the two routes share a single visual language.
 *
 * Section order, from masthead down:
 *
 *   1. Masthead — session number + long date + vote count + prev/next
 *      navigation between adjacent sessions in the loaded window.
 *   2. Stats strip — counts of approved / rejected / tied votes plus
 *      the session's tightest margin. Purely numerical, no editorial
 *      framing.
 *   3. Vote list — every vote of the session in chronological order
 *      (oldest first, since that's how a plenary actually runs). Each
 *      row carries the title, the result pill, the stacked-bar
 *      visual and a per-vote margin caption. The first vote
 *      additionally shows the LLM plain-language summary when one
 *      exists so the page has a "lede" without us picking an
 *      editorial highlight.
 *
 * The caller passes the session date, the votes, optional prev/next
 * dates for navigation, and whether to show the archive banner. The
 * sheet has no opinion about whether it's living on /avui or
 * /avui/<date> — that framing is decided by the parent route.
 */
export async function SessionSheet({
  date,
  votes,
  prevDate,
  nextDate,
  isArchive,
  locale,
}: {
  date: string; // YYYY-MM-DD
  votes: Vote[]; // already filtered to this date, oldest-first preferred
  prevDate: string | null;
  nextDate: string | null;
  isArchive: boolean;
  locale: string;
}) {
  const t = await getTranslations('session_sheet');

  // Order chronologically (oldest first within the session) so the
  // sheet reads top-to-bottom in vote sequence. We re-sort defensively
  // in case the caller hands us newest-first (the /votes API does).
  const ordered = [...votes].sort((a, b) =>
    a.voted_at.localeCompare(b.voted_at) || (a.sequence_in_session ?? 0) - (b.sequence_in_session ?? 0),
  );

  // Aggregated counts. Result is one of approved / rejected / tie.
  const counts = { approved: 0, rejected: 0, tie: 0 };
  let tightestMargin = Number.POSITIVE_INFINITY;
  let tightestVoteId: number | null = null;
  for (const v of ordered) {
    counts[v.result] += 1;
    const margin = Math.abs(v.ayes - v.noes);
    if (v.ayes + v.noes >= 30 && margin < tightestMargin) {
      tightestMargin = margin;
      tightestVoteId = v.id;
    }
  }
  const tightestVote = tightestVoteId
    ? ordered.find((v) => v.id === tightestVoteId) ?? null
    : null;

  // Session number — every vote in the bucket shares the same
  // ``session_id``; we display the smallest sequence's session as the
  // canonical session number (they're identical in practice).
  const sessionId = ordered[0]?.session_id ?? null;

  const anchorDate = new Date(`${date}T12:00:00Z`);
  const dateLong = anchorDate.toLocaleDateString(locale, { dateStyle: 'full' });

  return (
    <article style={{ paddingTop: 18, paddingBottom: 48 }}>
      {/* Optional archive banner — only on /avui/[date]. */}
      {isArchive && (
        <div
          style={{
            padding: '8px 12px',
            background: 'var(--paper-3)',
            border: '1px solid var(--rule-strong)',
            borderRadius: 8,
            fontSize: 12,
            color: 'var(--ink-2)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 14,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              display: 'inline-block',
              width: 6,
              height: 6,
              borderRadius: 999,
              background: 'var(--ink-3)',
            }}
          />
          <span>
            <strong style={{ color: 'var(--ink)', fontWeight: 700 }}>
              {t('archive_ribbon')}
            </strong>
            {' · '}
            <Link
              href={'/avui' as Route}
              style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}
            >
              {t('archive_back_to_latest')}
            </Link>
          </span>
        </div>
      )}

      <header
        style={{
          borderTop: '3px solid var(--ink)',
          borderBottom: '1px solid var(--ink)',
          padding: '14px 0 12px',
          marginBottom: 22,
        }}
      >
        <div
          className="eyebrow"
          style={{
            fontSize: 10,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--ink-3)',
            fontWeight: 600,
          }}
        >
          {t('eyebrow', { sessionNumber: sessionId ?? '—' })}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
            marginTop: 4,
          }}
        >
          <h1
            className="h-display"
            style={{
              margin: 0,
              fontSize: 'clamp(28px, 5vw, 44px)',
              lineHeight: 1.05,
              letterSpacing: '-0.02em',
            }}
          >
            {dateLong}
          </h1>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 13,
              color: 'var(--ink-2)',
              fontFamily: 'var(--font-serif)',
            }}
          >
            <NavButton href={prevDate} dir="prev" label={t('nav_prev')} />
            <span className="tabular" style={{ fontStyle: 'italic' }}>
              {t('vote_count', { count: ordered.length })}
            </span>
            <NavButton href={nextDate} dir="next" label={t('nav_next')} />
          </div>
        </div>
      </header>

      {/* Lede — newspaper-style prose summary. The day's counts live
          inside a single serif paragraph so the page reads as
          editorial copy, not a dashboard. The "tightest margin"
          phrase wraps a Link to that specific vote so the lede
          remains scannable but every figure stays one click from its
          source. No editorial framing ("histórico", "polémico"); the
          sentence only states facts in the order a journalist would. */}
      <section
        style={{
          marginBottom: 32,
          paddingBottom: 0,
          maxWidth: 720,
        }}
      >
        <div
          className="eyebrow"
          style={{ marginBottom: 8 }}
        >
          {t('lede_eyebrow')}
        </div>
        <p
          className="serif"
          style={{
            margin: 0,
            fontSize: 'clamp(17px, 1.7vw, 19px)',
            lineHeight: 1.55,
            color: 'var(--ink-2)',
            fontWeight: 400,
          }}
        >
          {t.rich(
            counts.tie > 0 ? 'lede_paragraph_with_tie' : 'lede_paragraph',
            {
              total: ordered.length,
              approved: counts.approved,
              rejected: counts.rejected,
              tie: counts.tie,
              n: (chunks) => (
                <strong
                  className="tabular"
                  style={{
                    color: 'var(--ink)',
                    fontWeight: 600,
                    letterSpacing: '-0.005em',
                  }}
                >
                  {chunks}
                </strong>
              ),
            },
          )}
          {tightestVote ? (
            <>
              {' '}
              {t.rich('lede_tightest_phrase', {
                margin: tightestMargin,
                a: (chunks) => (
                  <Link
                    href={`/votes/${tightestVote.id}` as Route}
                    style={{
                      color: 'var(--ink)',
                      textDecoration: 'underline',
                      textUnderlineOffset: 3,
                    }}
                  >
                    {chunks}
                  </Link>
                ),
                n: (chunks) => (
                  <strong
                    className="tabular"
                    style={{
                      color: 'var(--ink)',
                      fontWeight: 600,
                      letterSpacing: '-0.005em',
                    }}
                  >
                    {chunks}
                  </strong>
                ),
              })}
            </>
          ) : null}
          {/* Dominant-topics phrase — third sentence of the lede.
              Lists up to 3 of the most-voted topics this session, each
              linked to /votes?topic=<slug> so a reader can keep
              browsing votes in the same area. Excluded when the only
              bucket would be the unclassified one. Daniel:
              'informe resumido de los resultados a traves de lenguaje
              natural ... MUY importante que esten clasificadas por
              tema.' */}
          {(() => {
            const topTopics = groupVotesByTopic(ordered, locale)
              .filter((g) => g.key !== '__unclassified' && g.topic != null)
              .slice(0, 3);
            if (topTopics.length === 0) return null;
            return (
              <>
                {' '}
                {t('lede_topics_prefix')}{' '}
                {topTopics.map((g, i) => (
                  <span key={g.key}>
                    {i > 0 ? ', ' : ''}
                    <Link
                      href={`/votes?topic_slug=${g.topic!.slug}` as Route}
                      style={{
                        color: 'var(--ink)',
                        textDecoration: 'underline',
                        textUnderlineOffset: 3,
                      }}
                    >
                      {pickTopicName(g.topic!, locale)}
                    </Link>
                    <span
                      className="tabular"
                      style={{ color: 'var(--ink-3)', marginLeft: 4 }}
                    >
                      ({g.votes.length})
                    </span>
                  </span>
                ))}
                .
              </>
            );
          })()}
        </p>
      </section>

      {/* Featured-law dossier embed — when the day's tightest vote
          links to an initiative, render the /embed/initiatives
          widget inline as a same-origin iframe. This is the literal
          fulfilment of the /journalists claim that "/avui is a
          composition of these widgets" — Daniel's ask: '/avui ha
          d'usar els widgets'. The iframe is bounded to a clear
          dossier height, lazy-loaded, and gets a clear caption so a
          reader knows this is the day's contentious law in dossier
          form. */}
      {tightestVote?.initiative_id != null && (
        <section
          style={{
            marginBottom: 28,
            padding: '14px 16px',
            background: 'var(--paper-2)',
            border: '1px solid var(--rule)',
          }}
        >
          <div
            className="eyebrow"
            style={{ marginBottom: 4, fontSize: 10, color: 'var(--ink-3)' }}
          >
            {t('featured_dossier_eyebrow')}
          </div>
          <p
            style={{
              margin: '0 0 10px',
              fontSize: 12,
              color: 'var(--ink-3)',
              lineHeight: 1.5,
            }}
          >
            {t('featured_dossier_caption')}
          </p>
          <iframe
            src={`/embed/initiatives/${tightestVote.initiative_id}`}
            title={t('featured_dossier_iframe_title')}
            width="100%"
            height={480}
            loading="lazy"
            style={{
              border: '1px solid var(--rule)',
              background: 'var(--paper)',
              display: 'block',
            }}
          />
        </section>
      )}

      {/* Topic-distribution chart — the visual lede. One row per
          topic in this session: topic colour swatch + name on the
          left, a stacked horizontal bar showing how many of those
          votes ended approved / rejected / in tie, and the total
          count on the right. Sorted by vote count (the existing
          groupVotesByTopic order) so the dominant topic of the day
          reads first. Bars scale to the busiest topic of the session
          so the chart is self-comparative without needing a
          legislature-wide reference. Hidden when there's only one
          topic or none — a chart of one bar is noise. */}
      {ordered.length > 0 && (() => {
        const chartGroups = groupVotesByTopic(ordered, locale).filter(
          (g) => g.key !== '__unclassified',
        );
        if (chartGroups.length < 2) return null;
        const maxCount = Math.max(...chartGroups.map((g) => g.votes.length));
        return (
          <section style={{ marginBottom: 32 }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>
              {t('topic_chart_eyebrow')}
            </div>
            <ul
              style={{
                listStyle: 'none',
                margin: 0,
                padding: 0,
                display: 'grid',
                gap: 7,
              }}
            >
              {chartGroups.map(({ topic, votes: gv, key }) => {
                const approved = gv.filter((v) => v.result === 'approved').length;
                const rejected = gv.filter((v) => v.result === 'rejected').length;
                const tie = gv.filter((v) => v.result === 'tie').length;
                const total = gv.length;
                // Bar width relative to the busiest topic of the
                // session, so the heaviest section fills 100%. This
                // makes the chart act as a "what dominated today"
                // visual without claiming anything about volumes.
                const widthPct = (total / maxCount) * 100;
                return (
                  <li
                    key={key}
                    style={{
                      display: 'grid',
                      gridTemplateColumns:
                        'minmax(140px, 200px) minmax(0, 1fr) 38px',
                      alignItems: 'center',
                      gap: 12,
                      fontSize: 12.5,
                    }}
                  >
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        minWidth: 0,
                        overflow: 'hidden',
                        fontWeight: 500,
                        color: 'var(--ink)',
                      }}
                    >
                      <span
                        aria-hidden="true"
                        style={{
                          width: 9,
                          height: 9,
                          borderRadius: 2,
                          background: topic?.color_hex ?? 'var(--ink-3)',
                          flex: 'none',
                        }}
                      />
                      <span
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {topic
                          ? pickTopicName(topic, locale)
                          : t('section_unclassified')}
                      </span>
                    </span>
                    <div
                      style={{
                        position: 'relative',
                        height: 12,
                        background: 'var(--rule)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          height: '100%',
                          width: `${widthPct}%`,
                        }}
                      >
                        {approved > 0 && (
                          <span
                            title={`Aprovades: ${approved}`}
                            style={{
                              width: `${(approved / total) * 100}%`,
                              background: 'var(--aye)',
                            }}
                          />
                        )}
                        {rejected > 0 && (
                          <span
                            title={`Rebutjades: ${rejected}`}
                            style={{
                              width: `${(rejected / total) * 100}%`,
                              background: 'var(--no)',
                            }}
                          />
                        )}
                        {tie > 0 && (
                          <span
                            title={`Empats: ${tie}`}
                            style={{
                              width: `${(tie / total) * 100}%`,
                              background: 'var(--abst)',
                            }}
                          />
                        )}
                      </div>
                    </div>
                    <span
                      className="tabular"
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: 'var(--ink)',
                        textAlign: 'right',
                      }}
                    >
                      {total}
                    </span>
                  </li>
                );
              })}
            </ul>
            <div
              style={{
                marginTop: 10,
                display: 'flex',
                gap: 16,
                fontSize: 10.5,
                color: 'var(--ink-3)',
                flexWrap: 'wrap',
              }}
            >
              <LegendDot color="var(--aye)" label={t('topic_chart_legend_approved')} />
              <LegendDot color="var(--no)" label={t('topic_chart_legend_rejected')} />
              <LegendDot color="var(--abst)" label={t('topic_chart_legend_tie')} />
            </div>
          </section>
        );
      })()}

      {/* Vote list — grouped by topic so the page reads as a topic-
          structured agenda rather than a flat dump. Each section
          carries a small summary line (N votes, M approved, K
          rejected) so readers can skim before diving into the
          individual rows. Votes without a classified topic fall into
          a "Sense classificar" bucket pinned to the bottom. */}
      {ordered.length === 0 ? (
        <section style={{ marginBottom: 28 }}>
          <div
            className="eyebrow"
            style={{ marginBottom: 12, color: 'var(--ink-3)' }}
          >
            {t('list_eyebrow')}
          </div>
          <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>{t('list_empty')}</p>
        </section>
      ) : (
        <>
          {groupVotesByTopic(ordered, locale).map(({ topic, votes: groupVotes, key }) => {
            const sectionCounts = {
              approved: groupVotes.filter((v) => v.result === 'approved').length,
              rejected: groupVotes.filter((v) => v.result === 'rejected').length,
              tie: groupVotes.filter((v) => v.result === 'tie').length,
            };
            return (
              <section
                key={key}
                style={{ marginBottom: 36 }}
                aria-label={
                  topic
                    ? t('section_aria', { topic: pickTopicName(topic, locale) })
                    : t('section_aria_unclassified')
                }
              >
                <header
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    gap: 12,
                    flexWrap: 'wrap',
                    paddingBottom: 6,
                    marginBottom: 12,
                    borderBottom: `1px solid ${
                      topic?.color_hex ?? 'var(--ink)'
                    }`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    {topic?.color_hex && (
                      <span
                        aria-hidden="true"
                        style={{
                          width: 9,
                          height: 9,
                          borderRadius: 2,
                          background: topic.color_hex,
                          display: 'inline-block',
                        }}
                      />
                    )}
                    <h2
                      className="serif"
                      style={{
                        margin: 0,
                        fontSize: 'clamp(15px, 1.5vw, 17px)',
                        fontWeight: 600,
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        color: 'var(--ink)',
                      }}
                    >
                      {topic
                        ? pickTopicName(topic, locale)
                        : t('section_unclassified')}
                    </h2>
                  </div>
                  <div
                    className="tabular"
                    style={{
                      fontSize: 12,
                      color: 'var(--ink-3)',
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: 10,
                      flexWrap: 'wrap',
                    }}
                  >
                    <span style={{ color: 'var(--ink-2)', fontWeight: 600 }}>
                      {t('section_total', { count: groupVotes.length })}
                    </span>
                    {sectionCounts.approved > 0 && (
                      <span style={{ color: 'var(--aye, #16A34A)' }}>
                        {t('section_approved', { count: sectionCounts.approved })}
                      </span>
                    )}
                    {sectionCounts.rejected > 0 && (
                      <span style={{ color: 'var(--no, #DC2626)' }}>
                        {t('section_rejected', { count: sectionCounts.rejected })}
                      </span>
                    )}
                    {sectionCounts.tie > 0 && (
                      <span style={{ color: 'var(--abst, #CA8A04)' }}>
                        {t('section_tie', { count: sectionCounts.tie })}
                      </span>
                    )}
                  </div>
                </header>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {groupVotes.map((v, i) => (
                    <VoteRow
                      key={v.id}
                      vote={v}
                      locale={locale}
                      showSummary={i === 0 && groupVotes.length <= 3}
                      resultLabel={t(`result_${v.result}`)}
                      ayesLabel={t('ayes_short')}
                      noesLabel={t('noes_short')}
                      abstLabel={t('abst_short')}
                      proposedByGovernmentLabel={t('proposed_by_government')}
                      marginLabel={(margin) =>
                        margin === 0 ? t('margin_tie') : t('margin_short', { margin })
                      }
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </>
      )}

      {/* Citation footer — appears for both archive and live pages so
          the URL is always handy. */}
      <section
        style={{
          padding: '14px 16px',
          background: 'var(--paper-2)',
          border: '1px solid var(--rule)',
          borderRadius: 12,
          fontSize: 13,
          color: 'var(--ink-2)',
          lineHeight: 1.5,
        }}
      >
        <div className="eyebrow" style={{ fontSize: 10, marginBottom: 4 }}>
          {t('cite_eyebrow')}
        </div>
        <code
          className="mono"
          style={{
            display: 'block',
            padding: 8,
            background: 'var(--paper)',
            border: '1px solid var(--rule)',
            borderRadius: 6,
            fontSize: 12,
            wordBreak: 'break-all',
          }}
        >
          https://www.holapolitica.org/avui/{date}
        </code>
      </section>
      <style>{`
        @media (max-width: 600px) {
          /* On narrow viewports the 28px sequence gutter + auto-width
             count panel were squeezing the title into 4-word lines.
             Stack: gutter collapses (sequence + counts go inline above
             the title), title takes full width, count panel drops
             below the title block. Padding tightened so each row
             stays scannable when the screen is short. */
          .session-vote-row {
            grid-template-columns: 1fr !important;
            row-gap: 8px !important;
            column-gap: 0 !important;
          }
          .session-vote-row > *:first-child {
            display: none !important;
          }
          .session-vote-row > div:nth-child(3) {
            align-items: flex-start !important;
            min-width: 0 !important;
            flex-direction: row !important;
            flex-wrap: wrap !important;
            justify-content: flex-start !important;
            gap: 14px !important;
          }
        }
      `}</style>
    </article>
  );
}


/** Small legend swatch + label, used below the topic-distribution
 *  chart at the top of /avui. Inline-only — kept here rather than
 *  in components/ because it's bound to this widget's vocabulary
 *  and we don't want it picked up by unrelated pages. */
function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span
        aria-hidden="true"
        style={{
          width: 8,
          height: 8,
          borderRadius: 2,
          background: color,
          display: 'inline-block',
        }}
      />
      {label}
    </span>
  );
}

function NavButton({
  href,
  dir,
  label,
}: {
  href: string | null;
  dir: 'prev' | 'next';
  label: string;
}) {
  const icon = dir === 'prev' ? <ChevronLeft size={14} /> : <ChevronRight size={14} />;
  const sharedStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    borderRadius: 999,
    border: '1px solid var(--rule)',
  };
  if (!href) {
    return (
      <span
        aria-hidden="true"
        style={{ ...sharedStyle, color: 'var(--ink-3)', opacity: 0.4 }}
      >
        {icon}
      </span>
    );
  }
  return (
    <Link
      href={`/avui/${href}` as Route}
      aria-label={label}
      title={label}
      style={{
        ...sharedStyle,
        color: 'var(--ink)',
        background: 'var(--paper)',
        textDecoration: 'none',
      }}
    >
      {icon}
    </Link>
  );
}

function VoteRow({
  vote,
  locale,
  showSummary,
  resultLabel,
  ayesLabel,
  noesLabel,
  abstLabel,
  proposedByGovernmentLabel,
  marginLabel,
}: {
  vote: Vote;
  locale: string;
  showSummary: boolean;
  resultLabel: string;
  ayesLabel: string;
  noesLabel: string;
  abstLabel: string;
  proposedByGovernmentLabel: string;
  marginLabel: (margin: number) => string;
}) {
  const subject = vote.description?.trim() || vote.title;
  const summary = showSummary ? pickPlainSummary(vote, locale) : null;
  const margin = Math.abs(vote.ayes - vote.noes);
  const proposer = vote.proposing_group_short
    ? {
        short: vote.proposing_group_short,
        color: vote.proposing_group_color ?? 'var(--ink-3)',
      }
    : vote.proposed_by_government
      ? { short: proposedByGovernmentLabel, color: 'var(--ink)' }
      : null;
  return (
    <li
      style={{
        padding: '22px 0',
        borderBottom: '1px solid var(--rule)',
      }}
    >
      <Link
        href={`/votes/${vote.id}` as Route}
        className="session-vote-row"
        style={{
          display: 'grid',
          // Three columns: a narrow sequence-number gutter, a wide
          // title+meta column that flexes, and a fixed-width count
          // panel pinned to the right. Counts visually anchor the
          // row's right edge so the eye scans down them without
          // hopping inside the metadata line.
          gridTemplateColumns: '28px minmax(0, 1fr) auto',
          columnGap: 16,
          rowGap: 6,
          color: 'inherit',
          textDecoration: 'none',
          alignItems: 'start',
        }}
      >
        {/* Sequence number — quiet anchor in the left gutter. */}
        <span
          className="tabular"
          aria-hidden="true"
          style={{
            fontSize: 11,
            color: 'var(--ink-3)',
            fontWeight: 600,
            letterSpacing: '0.08em',
            paddingTop: 4,
          }}
        >
          {vote.sequence_in_session != null
            ? String(vote.sequence_in_session).padStart(2, '0')
            : '—'}
        </span>

        {/* Title + result pill + proposing-group chip stack. The
            result pill sits on the top-right of the title block (not
            in its own grid column) so it visually associates with
            the headline; the proposer chip sits BELOW the title so
            attribution reads "the law, who tabled it" without
            interrupting the headline. */}
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <h3
              className="serif"
              style={{
                margin: 0,
                fontSize: 'clamp(16px, 1.6vw, 18px)',
                fontWeight: 400,
                color: 'var(--ink)',
                lineHeight: 1.4,
                letterSpacing: '-0.005em',
                flex: '1 1 280px',
                minWidth: 0,
              }}
            >
              {subject}
            </h3>
            <span style={{ flex: 'none' }}>
              <ResultPill result={vote.result} label={resultLabel} />
            </span>
          </div>
          {proposer && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                marginTop: 8,
                padding: '3px 10px',
                borderRadius: 999,
                background: `color-mix(in oklch, ${proposer.color} 12%, var(--paper))`,
                border: `1px solid color-mix(in oklch, ${proposer.color} 30%, var(--paper))`,
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--ink)',
                whiteSpace: 'nowrap',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 999,
                  background: proposer.color,
                }}
              />
              {proposer.short}
            </span>
          )}
          {summary && (
            <p
              className="serif"
              style={{
                margin: '10px 0 0',
                fontSize: 14,
                color: 'var(--ink-2)',
                lineHeight: 1.55,
              }}
            >
              {summary}
            </p>
          )}
        </div>

        {/* Count panel — right-aligned column. The three figures stack
            vertically so the digits sit on a tight tabular grid
            (185 / 152 / 11 etc.) and the labels match in width. */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: 2,
            minWidth: 110,
            paddingTop: 2,
          }}
        >
          <CountRow
            label={ayesLabel}
            value={vote.ayes}
            color="var(--aye, #16A34A)"
          />
          <CountRow
            label={noesLabel}
            value={vote.noes}
            color="var(--no, #DC2626)"
          />
          <CountRow
            label={abstLabel}
            value={vote.abstentions}
            color="var(--abst, #CA8A04)"
          />
          {/* Micro stacked bar — visual companion to the count column.
              Lets the eye perceive the proportion (a 200-50 vote and a
              140-130 vote both show 3 lines of numbers; the bar
              distinguishes them at a glance). */}
          <div style={{ width: 110, marginTop: 6 }}>
            <StackedBar
              d={{
                aye: vote.ayes,
                no: vote.noes,
                abst: vote.abstentions,
                nv: vote.absent,
              }}
              height={5}
            />
          </div>
          <span
            className="tabular"
            style={{
              fontSize: 10,
              color: 'var(--ink-3)',
              marginTop: 4,
              whiteSpace: 'nowrap',
            }}
          >
            {marginLabel(margin)}
          </span>
        </div>
      </Link>
    </li>
  );
}

/**
 * One row of the right-aligned count panel — "Sí 187" / "No 152" /
 * "Abst. 11". The numeric value is bold + tinted (green / red /
 * amber) and the label sits to its right in a muted weight so the
 * digits anchor the eye, the label disambiguates.
 */
function CountRow({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'baseline',
        gap: 6,
      }}
    >
      <strong
        className="tabular"
        style={{
          fontSize: 16,
          fontWeight: 700,
          color,
          letterSpacing: '-0.01em',
          minWidth: 36,
          textAlign: 'right',
          display: 'inline-block',
        }}
      >
        {value}
      </strong>
      <span
        style={{
          fontSize: 11,
          color: 'var(--ink-3)',
          minWidth: 32,
          textAlign: 'left',
          display: 'inline-block',
        }}
      >
        {label}
      </span>
    </span>
  );
}

interface TopicGroup {
  /** Stable key used by React; the slug, or "__unclassified". */
  key: string;
  /** The full topic record for naming + colouring, or null when none. */
  topic: InitiativeTopicSlug | null;
  votes: Vote[];
}

/**
 * Bucket the session's votes by their primary topic.
 *
 * Each Vote may carry zero, one or several topics through its linked
 * Initiative. We pick the FIRST topic listed as the canonical bucket
 * (the backend returns them in JOIN order; the order is stable across
 * runs because InitiativeTopic rows are created in classification
 * order). Votes without an initiative or without a classified topic
 * fall into a single "Sense classificar" bucket pinned to the end.
 *
 * Topic order: sections are sorted by number of votes descending so
 * the heaviest topic of the day reads first. The unclassified bucket
 * is forced last regardless of size; that's a presentational rule,
 * not a curation one — it still surfaces every uncategorised vote.
 */
function groupVotesByTopic(
  votes: Vote[],
  _locale: string,
): TopicGroup[] {
  const buckets = new Map<string, TopicGroup>();
  for (const v of votes) {
    const primary = v.topics && v.topics.length > 0 ? v.topics[0] : null;
    const key = primary ? primary.slug : '__unclassified';
    const existing = buckets.get(key);
    if (existing) {
      existing.votes.push(v);
    } else {
      buckets.set(key, { key, topic: primary ?? null, votes: [v] });
    }
  }
  const ordered = [...buckets.values()].sort((a, b) => {
    if (a.key === '__unclassified') return 1;
    if (b.key === '__unclassified') return -1;
    return b.votes.length - a.votes.length;
  });
  return ordered;
}
