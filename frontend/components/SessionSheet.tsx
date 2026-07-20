import type { Route } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ChevronLeft, ChevronRight, Layers } from 'lucide-react';

import { GroupBadge } from '@/components/GroupBadge';
import { LawOriginalToggle } from '@/components/LawOriginalToggle';
import {
  PartyStanceMini,
  buildStanceByVote,
  type PartyStance,
  type StanceLabels,
} from '@/components/PartyStanceRow';
import { ResultPill } from '@/components/ResultPill';
import { ScrollCarousel } from '@/components/ScrollCarousel';
import { SessionVoteFilter } from '@/components/SessionVoteFilter';
import { StackedBar } from '@/components/StackedBar';
import { Tooltip } from '@/components/Tooltip';
import { TopicChip } from '@/components/TopicChip';
import { api, type InitiativeTopicSlug, type ParliamentaryGroupSummary, type Vote } from '@/lib/api';
import { pickPlainSummary } from '@/lib/glossary';
import { pickTopicName } from '@/lib/topics';
import { topicIcon } from '@/lib/topic_icons';

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

  // Resolve the per-group ``logo_url`` so each VoteRow can render a
  // proper branded badge instead of a generic colored dot. Today
  // every entry is null in production (logos aren't seeded yet) so
  // the badge falls back to the abbreviation disc; the API call is
  // still cheap (one Redis-cached call per render). Failure is
  // best-effort — the row just renders without a logo.
  const groups = await api.groups
    .list()
    .catch(() => [] as ParliamentaryGroupSummary[]);
  const groupBySlug = new Map<string, ParliamentaryGroupSummary>(
    groups.map((g) => [g.slug, g]),
  );

  // Order chronologically (oldest first within the session) so the
  // sheet reads top-to-bottom in vote sequence. We re-sort defensively
  // in case the caller hands us newest-first (the /votes API does).
  const ordered = [...votes].sort((a, b) =>
    a.voted_at.localeCompare(b.voted_at) || (a.sequence_in_session ?? 0) - (b.sequence_in_session ?? 0),
  );

  // Per-group stance on every vote of the session (one cached call), so each
  // law can show ambient "who voted for / against" party discs. Best-effort:
  // on failure the rows just render without the discs.
  const voteIds = ordered.map((v) => v.id);
  const groupChoices =
    voteIds.length > 0
      ? await api.votes.groupChoices(voteIds).catch(() => null)
      : null;
  const stanceByVote: Map<number, PartyStance[]> = groupChoices
    ? buildStanceByVote(groupChoices.groups)
    : new Map();
  const stanceLabels: StanceLabels = {
    aye: t('choice_aye'),
    no: t('choice_no'),
    abstention: t('choice_abstention'),
    absent: t('choice_absent'),
  };

  // Aggregated counts. Result is one of approved / rejected / tie.
  const counts = { approved: 0, rejected: 0, tie: 0 };
  for (const v of ordered) {
    counts[v.result] += 1;
  }

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

      {/* Lede — ONE summary block: the outcome bar (the day's shape at a
          glance) followed by the newspaper-style prose sentence that
          spells it out. The counts used to appear three times on this
          opening (nav counter, a numbers row under the bar, and the
          lede prose) — the numbers row is gone; the bar carries the
          shape, the serif sentence carries the words, and every figure
          stays one click from its source. No editorial framing
          ("histórico", "polémico"); the sentence only states facts in
          the order a journalist would. */}
      <section
        style={{
          marginBottom: 32,
          paddingBottom: 0,
          maxWidth: 720,
        }}
      >
        <div
          className="eyebrow"
          style={{ marginBottom: 10 }}
        >
          {t('lede_eyebrow')}
        </div>
        {ordered.length > 0 && (
          <div
            role="img"
            aria-label={`${counts.approved} ${t('result_approved')} · ${counts.rejected} ${t('result_rejected')}${counts.tie > 0 ? ` · ${counts.tie} ${t('result_tie')}` : ''}`}
            style={{
              display: 'flex',
              height: 10,
              borderRadius: 999,
              overflow: 'hidden',
              background: 'var(--rule)',
              marginBottom: 14,
            }}
          >
            {counts.approved > 0 && (
              <div style={{ width: `${(counts.approved / ordered.length) * 100}%`, background: 'var(--aye)' }} />
            )}
            {counts.rejected > 0 && (
              <div style={{ width: `${(counts.rejected / ordered.length) * 100}%`, background: 'var(--no)' }} />
            )}
            {counts.tie > 0 && (
              <div style={{ width: `${(counts.tie / ordered.length) * 100}%`, background: 'var(--abst)' }} />
            )}
          </div>
        )}
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
          {/* The "tightest margin" sentence used to sit here. Removed:
              a margin is only meaningful between Sí and No, but ours
              counted abstentions too, so it surfaced votes that weren't
              actually contested — and readers couldn't tell what the
              figure meant. The per-topic band below answers the real
              question ("what was voted and how did it end") instead. */}
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
                    {/* In-page anchor to the topic's collapsible section
                        below; a small client effect opens that <details>
                        and scrolls to it. The underline takes the topic's
                        own colour so the lede visually ties to the coloured
                        sections. */}
                    <a
                      href={`#session-topic-${g.topic!.slug}`}
                      style={{
                        color: 'var(--ink)',
                        fontWeight: 500,
                        textDecoration: 'underline',
                        textDecorationColor: g.topic!.color_hex ?? 'var(--accent)',
                        textDecorationThickness: 2,
                        textUnderlineOffset: 3,
                      }}
                    >
                      {pickTopicName(g.topic!, locale)}
                    </a>
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

      {/* Topic summary band — replaces the old "featured dossier" iframe
          (which spotlighted one law picked by the tightest margin, an
          arbitrary and unexplained choice). This answers the question a
          reader actually arrives with: WHAT was voted today and HOW did
          each area end. One card per topic, in the topic's own colour,
          with its approved/rejected split; tapping jumps to that topic's
          section below. */}
      {ordered.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <div className="eyebrow" style={{ marginBottom: 4 }}>
            {t('topicband_eyebrow')}
          </div>
          <p
            style={{
              margin: '0 0 4px',
              fontSize: 12,
              color: 'var(--ink-3)',
              lineHeight: 1.5,
              maxWidth: 640,
            }}
          >
            {t('topicband_caption')}
          </p>
          <ScrollCarousel
            gap={12}
            prevLabel={t('topicband_eyebrow')}
            nextLabel={t('topicband_eyebrow')}
          >
            {groupVotesByTopic(ordered, locale).map(({ topic, votes: tVotes, key }) => {
              const approved = tVotes.filter((v) => v.result === 'approved').length;
              const rejected = tVotes.filter((v) => v.result === 'rejected').length;
              const color = topic?.color_hex ?? 'var(--ink-3)';
              const Icon = topicIcon(topic?.icon);
              const name = topic ? pickTopicName(topic, locale) : t('section_unclassified');
              return (
                <li key={key} style={{ flex: '0 0 210px', scrollSnapAlign: 'start' }}>
                  <a
                    href={`#session-topic-${topic?.slug ?? 'unclassified'}`}
                    className="topic-card-link"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      height: '100%',
                      padding: '13px 15px',
                      borderRadius: 12,
                      border: '1px solid var(--rule)',
                      borderTop: `3px solid ${color}`,
                      background: `color-mix(in oklch, ${color} 6%, var(--paper))`,
                      textDecoration: 'none',
                      color: 'inherit',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <span
                        aria-hidden="true"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 26,
                          height: 26,
                          borderRadius: 8,
                          flex: 'none',
                          color,
                          background: `color-mix(in oklch, ${color} 18%, var(--paper))`,
                        }}
                      >
                        <Icon size={14} strokeWidth={2} aria-hidden="true" />
                      </span>
                      <span
                        className="line-clamp-2"
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: 'var(--ink)',
                          lineHeight: 1.25,
                          minWidth: 0,
                        }}
                      >
                        {name}
                      </span>
                    </span>
                    <span
                      className="tabular"
                      style={{ fontSize: 11.5, color: 'var(--ink-3)' }}
                    >
                      {t('topicband_votes', { n: tVotes.length })}
                    </span>
                    {/* Outcome split — the answer, in the shared vote colours. */}
                    <span
                      role="img"
                      aria-label={`${t('topicband_approved', { n: approved })}, ${t('topicband_rejected', { n: rejected })}`}
                      style={{
                        display: 'flex',
                        height: 6,
                        borderRadius: 999,
                        overflow: 'hidden',
                        background: 'var(--rule)',
                      }}
                    >
                      {approved > 0 && (
                        <span
                          style={{
                            width: `${(approved / tVotes.length) * 100}%`,
                            background: 'var(--aye)',
                          }}
                        />
                      )}
                      {rejected > 0 && (
                        <span
                          style={{
                            width: `${(rejected / tVotes.length) * 100}%`,
                            background: 'var(--no)',
                          }}
                        />
                      )}
                    </span>
                    <span
                      style={{
                        display: 'flex',
                        gap: 10,
                        fontSize: 11.5,
                        flexWrap: 'wrap',
                        marginTop: 'auto',
                      }}
                    >
                      <span className="tabular" style={{ color: 'var(--aye)', fontWeight: 700 }}>
                        {t('topicband_approved', { n: approved })}
                      </span>
                      <span className="tabular" style={{ color: 'var(--no)', fontWeight: 700 }}>
                        {t('topicband_rejected', { n: rejected })}
                      </span>
                    </span>
                  </a>
                </li>
              );
            })}
          </ScrollCarousel>
        </section>
      )}


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
        <SessionVoteFilter
          labels={{
            eyebrow: t('filter_eyebrow'),
            all: t('filter_all'),
            approved: t('filter_approved'),
            rejected: t('filter_rejected'),
          }}
        >
          {groupVotesByTopic(ordered, locale).map(({ topic, votes: groupVotes, key }) => {
            const sectionCounts = {
              approved: groupVotes.filter((v) => v.result === 'approved').length,
              rejected: groupVotes.filter((v) => v.result === 'rejected').length,
              tie: groupVotes.filter((v) => v.result === 'tie').length,
            };
            const decided = groupVotes.length || 1;
            return (
              <details
                key={key}
                id={`session-topic-${topic?.slug ?? 'unclassified'}`}
                className="session-topic-group"
                style={{
                  marginBottom: 0,
                  borderBottom: '1px solid var(--rule)',
                  // A rail in the topic's own colour ties each section to
                  // its card in the band above and gives the long list a
                  // chromatic spine instead of a grey ledger.
                  borderLeft: `3px solid ${topic?.color_hex ?? 'var(--rule-strong)'}`,
                  paddingLeft: 12,
                  // Clear the sticky mobile back bar when an anchor from the
                  // lede scrolls this group into view.
                  scrollMarginTop: 64,
                }}
              >
                <summary
                  className="session-topic-summary"
                  aria-label={
                    topic
                      ? t('section_aria', { topic: pickTopicName(topic, locale) })
                      : t('section_aria_unclassified')
                  }
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    flexWrap: 'wrap',
                    padding: '12px 2px',
                    cursor: 'pointer',
                  }}
                >
                  <ChevronRight
                    className="session-topic-chevron"
                    size={14}
                    strokeWidth={2}
                    aria-hidden="true"
                    style={{ flex: 'none', color: 'var(--ink-3)' }}
                  />
                  {topic?.color_hex && (
                    <span
                      aria-hidden="true"
                      style={{
                        width: 9,
                        height: 9,
                        borderRadius: 2,
                        background: topic.color_hex,
                        display: 'inline-block',
                        flex: 'none',
                      }}
                    />
                  )}
                  <h2
                    className="serif"
                    style={{
                      margin: 0,
                      fontSize: 'clamp(13px, 1.3vw, 15px)',
                      fontWeight: 600,
                      letterSpacing: '0.02em',
                      color: 'var(--ink)',
                      minWidth: 0,
                    }}
                  >
                    {topic
                      ? pickTopicName(topic, locale)
                      : t('section_unclassified')}
                  </h2>
                  {/* Mini result bar — keeps the outcome legible while the
                      group is collapsed, so the tree is scannable without
                      expanding every topic. */}
                  <span
                    aria-hidden="true"
                    style={{
                      display: 'flex',
                      width: 64,
                      height: 5,
                      borderRadius: 999,
                      overflow: 'hidden',
                      background: 'var(--paper-3)',
                      flex: 'none',
                    }}
                  >
                    {sectionCounts.approved > 0 && (
                      <span
                        style={{
                          width: `${(sectionCounts.approved / decided) * 100}%`,
                          background: 'var(--aye, #16A34A)',
                        }}
                      />
                    )}
                    {sectionCounts.rejected > 0 && (
                      <span
                        style={{
                          width: `${(sectionCounts.rejected / decided) * 100}%`,
                          background: 'var(--no, #DC2626)',
                        }}
                      />
                    )}
                    {sectionCounts.tie > 0 && (
                      <span
                        style={{
                          width: `${(sectionCounts.tie / decided) * 100}%`,
                          background: 'var(--abst, #CA8A04)',
                        }}
                      />
                    )}
                  </span>
                  <div
                    className="tabular"
                    style={{
                      marginLeft: 'auto',
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
                </summary>
                <ul style={{ listStyle: 'none', margin: '0 0 8px', padding: 0 }}>
                  {buildSessionEntries(groupVotes).map((entry) => {
                    // A law that was voted several times in this session
                    // (amendments, articles, the whole text) collapses into a
                    // single entry — the law once, its votes nested below.
                    if (entry.kind === 'law') {
                      const lead = entry.votes[0]!;
                      const proposerGroup = lead.proposing_group_slug
                        ? groupBySlug.get(lead.proposing_group_slug) ?? null
                        : null;
                      return (
                        <LawVoteGroup
                          key={`law-${entry.initiativeId}`}
                          votes={entry.votes}
                          locale={locale}
                          proposerLogoUrl={proposerGroup?.logo_url ?? null}
                          ayesLabel={t('ayes_short')}
                          noesLabel={t('noes_short')}
                          proposedByGovernmentLabel={t('proposed_by_government')}
                          votesCountLabel={(n) => t('law_votes_count', { count: n })}
                          votesToggleLabel={(n) => t('law_votes_toggle', { count: n })}
                          finalResultLabel={t('law_final_result')}
                          whyMultiple={t('law_why_multiple')}
                          finalTagLabel={t('law_vote_final_tag')}
                          finalStance={stanceByVote.get(
                            [...entry.votes].sort(
                              (a, b) =>
                                (a.sequence_in_session ?? 0) - (b.sequence_in_session ?? 0),
                            )[entry.votes.length - 1]!.id,
                          )}
                          stanceLabels={stanceLabels}
                          resultLabelFor={(r) => t(`result_${r}`)}
                          marginLabel={(margin) =>
                            margin === 0 ? t('margin_tie') : t('margin_short', { margin })
                          }
                        />
                      );
                    }
                    const v = entry.vote;
                    const proposerGroup = v.proposing_group_slug
                      ? groupBySlug.get(v.proposing_group_slug) ?? null
                      : null;
                    return (
                      <VoteRow
                        key={v.id}
                        vote={v}
                        locale={locale}
                        proposerLogoUrl={proposerGroup?.logo_url ?? null}
                        resultLabel={t(`result_${v.result}`)}
                        ayesLabel={t('ayes_short')}
                        noesLabel={t('noes_short')}
                        abstLabel={t('abst_short')}
                        proposedByGovernmentLabel={t('proposed_by_government')}
                        marginLabel={(margin) =>
                          margin === 0 ? t('margin_tie') : t('margin_short', { margin })
                        }
                        stance={stanceByVote.get(v.id)}
                        stanceLabels={stanceLabels}
                      />
                    );
                  })}
                </ul>
              </details>
            );
          })}
        </SessionVoteFilter>
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
        /* Collapsible topic groups — native <details> so the tree works
           without client JS. Strip the default disclosure marker (we draw
           our own chevron) and rotate the chevron when the group is open. */
        .session-topic-summary { list-style: none; }
        .session-topic-summary::-webkit-details-marker { display: none; }
        .session-topic-summary::marker { content: ''; }
        .session-topic-chevron {
          transition: transform 0.15s ease;
        }
        details[open] > .session-topic-summary .session-topic-chevron {
          transform: rotate(90deg);
        }
        .session-topic-summary:hover h2 { color: var(--accent); }
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

// Group a topic's votes so a law that was voted several times in the same
// session (amendments / articles / the whole text) appears ONCE. The
// Congreso open-data labels every sub-vote with the law's title, so without
// this they read as duplicate rows. Votes with no initiative, or an
// initiative voted only once, stay as individual rows.
type SessionEntry =
  | { kind: 'single'; vote: Vote }
  | { kind: 'law'; initiativeId: number; votes: Vote[] };

function buildSessionEntries(votes: Vote[]): SessionEntry[] {
  const counts = new Map<number, number>();
  for (const v of votes) {
    if (v.initiative_id != null) {
      counts.set(v.initiative_id, (counts.get(v.initiative_id) ?? 0) + 1);
    }
  }
  const entries: SessionEntry[] = [];
  const lawIndex = new Map<number, number>();
  for (const v of votes) {
    const id = v.initiative_id;
    if (id != null && (counts.get(id) ?? 0) >= 2) {
      let idx = lawIndex.get(id);
      if (idx == null) {
        idx = entries.length;
        entries.push({ kind: 'law', initiativeId: id, votes: [] });
        lawIndex.set(id, idx);
      }
      (entries[idx] as Extract<SessionEntry, { kind: 'law' }>).votes.push(v);
    } else {
      entries.push({ kind: 'single', vote: v });
    }
  }
  return entries;
}

/** A law voted several times in one session: rendered once (its AI summary
 *  headline + proposer + Text-original toggle) with each of its votes nested
 *  below as a compact, individually-clickable row. */
function LawVoteGroup({
  votes,
  locale,
  proposerLogoUrl,
  ayesLabel,
  noesLabel,
  proposedByGovernmentLabel,
  votesCountLabel,
  votesToggleLabel,
  finalResultLabel,
  whyMultiple,
  finalTagLabel,
  finalStance,
  stanceLabels,
  resultLabelFor,
  marginLabel,
}: {
  votes: Vote[];
  locale: string;
  proposerLogoUrl: string | null;
  ayesLabel: string;
  noesLabel: string;
  proposedByGovernmentLabel: string;
  votesCountLabel: (n: number) => string;
  votesToggleLabel: (n: number) => string;
  finalResultLabel: string;
  whyMultiple: string;
  finalTagLabel: string;
  finalStance?: PartyStance[];
  stanceLabels: StanceLabels;
  resultLabelFor: (r: Vote['result']) => string;
  marginLabel: (margin: number) => string;
}) {
  const lead = votes[0]!;
  const subject = lead.description?.trim() || lead.title;
  const plainSummary = pickPlainSummary(lead, locale);
  const headline = plainSummary ?? subject;
  const topics: InitiativeTopicSlug[] = lead.topics ?? [];
  const ordered = [...votes].sort(
    (a, b) => (a.sequence_in_session ?? 0) - (b.sequence_in_session ?? 0),
  );
  // The law's fate is the result of its final (highest-sequence) vote —
  // the whole-text / dictamen vote that comes after the amendments.
  const finalVote = ordered[ordered.length - 1]!;
  const proposer = lead.proposing_group_short
    ? {
        kind: 'group' as const,
        short: lead.proposing_group_short,
        slug: lead.proposing_group_slug,
        color: lead.proposing_group_color ?? 'var(--ink-3)',
        logoUrl: proposerLogoUrl,
      }
    : lead.proposed_by_government
      ? {
          kind: 'government' as const,
          short: proposedByGovernmentLabel,
          slug: null,
          color: 'var(--ink)',
          logoUrl: null,
        }
      : null;

  return (
    <li style={{ padding: '14px 0', borderBottom: '1px solid var(--rule)' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '28px minmax(0, 1fr)',
          columnGap: 16,
          rowGap: 6,
          alignItems: 'start',
        }}
      >
        {/* Gutter glyph signals "one law, several votes". */}
        <span aria-hidden="true" style={{ paddingTop: 3, color: 'var(--ink-3)' }}>
          <Layers size={14} strokeWidth={1.9} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            {/* The law — links to its dossier. Sub-votes below are their own
                links, so this is not a wrapping anchor (no nested <a>). */}
            <Link
              href={`/initiatives/${lead.initiative_id}` as Route}
              className="serif"
              style={{
                margin: 0,
                fontSize: 'clamp(14px, 1.4vw, 15px)',
                fontWeight: 400,
                color: 'var(--ink)',
                lineHeight: 1.35,
                letterSpacing: '-0.005em',
                flex: '1 1 280px',
                minWidth: 0,
                textDecoration: 'none',
              }}
            >
              {headline}
            </Link>
            {/* The law's outcome — its final vote's result. The
                "Resultado final" label is now VISIBLE (it used to hide in
                a title tooltip): with several votes on one law, a reader
                needs to be told that this pill is the law's fate, not one
                of the N sub-votes. */}
            <span
              style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--ink-3)',
                  whiteSpace: 'nowrap',
                }}
              >
                {finalResultLabel}
              </span>
              <ResultPill result={finalVote.result} label={resultLabelFor(finalVote.result)} />
            </span>
            <span
              className="tabular"
              style={{
                flex: 'none',
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--ink-2)',
                background: 'var(--paper-3)',
                borderRadius: 999,
                padding: '2px 9px',
                whiteSpace: 'nowrap',
              }}
            >
              {votesCountLabel(votes.length)}
            </span>
          </div>
          {(proposer || topics.length > 0 || plainSummary) && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginTop: 8,
                flexWrap: 'wrap',
                minWidth: 0,
              }}
            >
              {proposer && proposer.kind === 'group' && proposer.slug && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '2px 10px 2px 2px',
                    borderRadius: 999,
                    background: `color-mix(in oklch, ${proposer.color} 12%, var(--paper))`,
                    border: `1px solid color-mix(in oklch, ${proposer.color} 30%, var(--paper))`,
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'var(--ink)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <GroupBadge
                    slug={proposer.slug}
                    color={proposer.color}
                    size="xs"
                    link={false}
                    logoUrl={proposer.logoUrl}
                  />
                  {proposer.short}
                </span>
              )}
              {proposer && proposer.kind === 'government' && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '3px 10px',
                    borderRadius: 999,
                    background: 'var(--paper-2)',
                    border: '1px solid var(--rule-strong)',
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'var(--ink)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{ width: 8, height: 8, borderRadius: 999, background: proposer.color }}
                  />
                  {proposer.short}
                </span>
              )}
              {/* One topic chip only — the extra topics collapse into a
                  quiet "+N" so the meta line doesn't turn into a badge
                  wall (the dossier page lists them all). */}
              {topics.slice(0, 1).map((tp) => (
                <TopicChip key={tp.slug} name={pickTopicName(tp, locale)} color={tp.color_hex} />
              ))}
              {topics.length > 1 && (
                <span
                  className="tabular"
                  title={topics
                    .slice(1)
                    .map((tp) => pickTopicName(tp, locale))
                    .join(' · ')}
                  style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--ink-3)' }}
                >
                  +{topics.length - 1}
                </span>
              )}
              {plainSummary && (
                <LawOriginalToggle original={subject} provider={lead.plain_summary_provider} />
              )}
            </div>
          )}
          {/* Who backed / opposed the law — the stance on its final vote.
              Mini variant (glyph + plain discs) so the row doesn't drown
              in badges; names stay on hover, the full breakdown lives on
              the detail pages. */}
          {finalStance && finalStance.length > 0 && (
            <PartyStanceMini parties={finalStance} labels={stanceLabels} />
          )}
          {/* The law's individual votes. */}
          <div style={{ marginTop: 10 }}>
            {/* The individual votes are collapsed: the header already leads
                with the final result + who voted, so the amendment / article
                votes are here only if you want them. */}
            <details>
              <summary
                style={{
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--ink-2)',
                }}
              >
                {votesToggleLabel(votes.length)}
                {/* Educational note: why a law is voted several times. */}
                <Tooltip
                  term={
                    <span
                      aria-hidden="true"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 13,
                        height: 13,
                        borderRadius: 999,
                        border: '1px solid var(--rule-strong)',
                        fontSize: 8,
                        color: 'var(--ink-3)',
                        fontStyle: 'italic',
                        fontWeight: 700,
                      }}
                    >
                      i
                    </span>
                  }
                  explanation={whyMultiple}
                />
              </summary>
              <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
                {ordered.map((v) => (
                  <SubVote
                    key={v.id}
                    vote={v}
                    ayesLabel={ayesLabel}
                    noesLabel={noesLabel}
                    resultLabel={resultLabelFor(v.result)}
                    marginLabel={marginLabel}
                    isFinal={v.id === finalVote.id}
                    finalTagLabel={finalTagLabel}
                  />
                ))}
              </ul>
            </details>
          </div>
        </div>
      </div>
    </li>
  );
}

/** One vote inside a {@link LawVoteGroup}: sequence, result, tally — a
 *  compact row linking to the full vote. Carries ``data-result`` so the
 *  session result filter hides it like any other vote row. */
function SubVote({
  vote,
  ayesLabel,
  noesLabel,
  resultLabel,
  marginLabel,
  isFinal = false,
  finalTagLabel,
}: {
  vote: Vote;
  ayesLabel: string;
  noesLabel: string;
  resultLabel: string;
  marginLabel: (margin: number) => string;
  isFinal?: boolean;
  finalTagLabel?: string;
}) {
  const margin = Math.abs(vote.ayes - vote.noes);
  return (
    <li data-result={vote.result} style={{ borderTop: '1px solid var(--rule)' }}>
      <Link
        href={`/votes/${vote.id}` as Route}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '8px 0',
          textDecoration: 'none',
          color: 'inherit',
          flexWrap: 'wrap',
        }}
      >
        <span
          className="tabular"
          aria-hidden="true"
          style={{
            fontSize: 11,
            color: 'var(--ink-3)',
            fontWeight: 600,
            letterSpacing: '0.08em',
            minWidth: 22,
          }}
        >
          {vote.sequence_in_session != null
            ? String(vote.sequence_in_session).padStart(2, '0')
            : '—'}
        </span>
        <ResultPill result={vote.result} label={resultLabel} />
        {isFinal && finalTagLabel && (
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--ink-2)',
              background: 'var(--paper-3)',
              border: '1px solid var(--rule-strong)',
              borderRadius: 999,
              padding: '1px 7px',
              whiteSpace: 'nowrap',
            }}
          >
            {finalTagLabel}
          </span>
        )}
        <span className="tabular" style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>
          <strong style={{ color: 'var(--aye, #16A34A)' }}>{vote.ayes}</strong> {ayesLabel}
          <span style={{ color: 'var(--ink-3)', margin: '0 6px' }}>·</span>
          <strong style={{ color: 'var(--no, #DC2626)' }}>{vote.noes}</strong> {noesLabel}
        </span>
        <span
          className="tabular"
          style={{ fontSize: 11, color: 'var(--ink-3)', marginLeft: 'auto' }}
        >
          {marginLabel(margin)}
        </span>
      </Link>
    </li>
  );
}

function VoteRow({
  vote,
  locale,
  proposerLogoUrl,
  resultLabel,
  ayesLabel,
  noesLabel,
  abstLabel,
  proposedByGovernmentLabel,
  marginLabel,
  stance,
  stanceLabels,
}: {
  vote: Vote;
  locale: string;
  /**
   * Pre-resolved logo URL for the proposing parliamentary group, when
   * one is on file. Null for government-proposed votes, unknown
   * groups, or groups whose ``logo_url`` hasn't been populated yet
   * (the typical case in production today; ``GroupBadge`` falls back
   * to the abbreviation disc when this is null).
   */
  proposerLogoUrl: string | null;
  resultLabel: string;
  ayesLabel: string;
  noesLabel: string;
  abstLabel: string;
  proposedByGovernmentLabel: string;
  marginLabel: (margin: number) => string;
  stance?: PartyStance[];
  stanceLabels: StanceLabels;
}) {
  const subject = vote.description?.trim() || vote.title;
  // AI plain-language summary leads as the row headline; the raw official
  // title moves behind the inline "Text original" toggle. Falls back to the
  // title when no summary has been generated yet, so the row is never blank.
  const plainSummary = pickPlainSummary(vote, locale);
  const headline = plainSummary ?? subject;
  const margin = Math.abs(vote.ayes - vote.noes);
  // Topic chips — every topic the vote inherits from its linked
  // initiative gets a chip on the row itself. Even though the
  // surrounding section header already names the primary topic, the
  // row-level chips make the classification visible per vote without
  // forcing the reader to remember the section context (and also
  // surface SECONDARY topics — a vote can have several when the
  // initiative was classified across multiple themes).
  const topics: InitiativeTopicSlug[] = vote.topics ?? [];
  const proposer = vote.proposing_group_short
    ? {
        kind: 'group' as const,
        short: vote.proposing_group_short,
        slug: vote.proposing_group_slug,
        color: vote.proposing_group_color ?? 'var(--ink-3)',
        logoUrl: proposerLogoUrl,
      }
    : vote.proposed_by_government
      ? {
          kind: 'government' as const,
          short: proposedByGovernmentLabel,
          slug: null,
          color: 'var(--ink)',
          logoUrl: null,
        }
      : null;
  return (
    <li
      data-result={vote.result}
      style={{
        padding: '14px 0',
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
                fontSize: 'clamp(14px, 1.4vw, 15px)',
                fontWeight: 400,
                color: 'var(--ink)',
                lineHeight: 1.35,
                letterSpacing: '-0.005em',
                flex: '1 1 280px',
                minWidth: 0,
              }}
            >
              {headline}
            </h3>
            <span style={{ flex: 'none' }}>
              <ResultPill result={vote.result} label={resultLabel} />
            </span>
          </div>
          {/* Metadata strip — proposer badge (with logo when available)
              and topic chips. Both sit on the same line so the vote
              row reads "the law, who tabled it, what theme(s) it
              touches" without breaking into multiple stacked rows. On
              narrow viewports the strip flex-wraps. */}
          {(proposer || topics.length > 0 || plainSummary) && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginTop: 8,
                flexWrap: 'wrap',
                minWidth: 0,
              }}
            >
              {proposer && proposer.kind === 'group' && proposer.slug && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '2px 10px 2px 2px',
                    borderRadius: 999,
                    background: `color-mix(in oklch, ${proposer.color} 12%, var(--paper))`,
                    border: `1px solid color-mix(in oklch, ${proposer.color} 30%, var(--paper))`,
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'var(--ink)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <GroupBadge
                    slug={proposer.slug}
                    color={proposer.color}
                    size="xs"
                    link={false}
                    logoUrl={proposer.logoUrl}
                  />
                  {proposer.short}
                </span>
              )}
              {proposer && proposer.kind === 'government' && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '3px 10px',
                    borderRadius: 999,
                    background: 'var(--paper-2)',
                    border: '1px solid var(--rule-strong)',
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'var(--ink)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      background: proposer.color,
                    }}
                  />
                  {proposer.short}
                </span>
              )}
              {/* Same one-chip cap as the law rows above. */}
              {topics.slice(0, 1).map((tp) => (
                <TopicChip key={tp.slug} name={pickTopicName(tp, locale)} color={tp.color_hex} />
              ))}
              {topics.length > 1 && (
                <span
                  className="tabular"
                  title={topics
                    .slice(1)
                    .map((tp) => pickTopicName(tp, locale))
                    .join(' · ')}
                  style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--ink-3)' }}
                >
                  +{topics.length - 1}
                </span>
              )}
              {plainSummary && (
                <LawOriginalToggle
                  original={subject}
                  provider={vote.plain_summary_provider}
                />
              )}
            </div>
          )}
          {stance && stance.length > 0 && (
            <PartyStanceMini parties={stance} labels={stanceLabels} />
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
