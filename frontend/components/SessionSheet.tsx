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
import {
  NoBreakdownInline,
  noBreakdownReason,
  type NoBreakdownReason,
} from '@/components/NoBreakdownNotice';
import { ResultPill } from '@/components/ResultPill';
import { SessionVoteFilter, type TopicOption } from '@/components/SessionVoteFilter';
import { StackedBar } from '@/components/StackedBar';
import { Tooltip } from '@/components/Tooltip';
import { TopicChip } from '@/components/TopicChip';
import { api, type InitiativeTopicSlug, type ParliamentaryGroupSummary, type Vote } from '@/lib/api';
import { pickPlainSummary, proceduralExplainerKey } from '@/lib/glossary';
import {
  fateResult,
  fateVote,
  initiativeKey,
  stageOutcome,
  summariseLaws,
  voteKind,
  voteStage,
  type VoteKind,
} from '@/lib/sessionSummary';
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
 *   2. Lede — the day's outcome counted per INITIATIVE (its final
 *      vote), not per raw vote row, plus the most active topics.
 *      Purely factual, no editorial framing.
 *   3. Vote list — grouped by what a vote can do (laws, motions and
 *      PNL, procedures folded), with topics as a filter. Each item once,
 *      its outcome worded for its procedural stage, who voted what, then
 *      its metadata; its other votes (or points) nested and collapsed.
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
  const tCommon = await getTranslations('common');

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
  // Shown in place of the party logos when a vote genuinely has no
  // per-deputy record. Threaded down so every row states its reason
  // instead of silently rendering nothing.
  const noBreakLabels: Record<NoBreakdownReason, string> = {
    assent: t('nobreak_inline_assent'),
    secret: t('nobreak_inline_secret'),
    unavailable: t('nobreak_inline_unavailable'),
  };

  // The day's outcome counted by INITIATIVE (its final vote), not by raw
  // vote rows: amendment and item-by-item votes are procedure, and counting
  // them made a sitting with 5 laws read "rechazado 45".
  const counts = summariseLaws(ordered);

  // Session number — every vote in the bucket shares the same
  // ``session_id``; we display the smallest sequence's session as the
  // canonical session number (they're identical in practice).
  const sessionId = ordered[0]?.session_id ?? null;

  const anchorDate = new Date(`${date}T12:00:00Z`);
  const dateLong = anchorDate.toLocaleDateString(locale, { dateStyle: 'full' });

  // Result wording depends on the vote's procedural stage: approving a
  // toma en consideración only lets a bill start its passage, and in a
  // debate de totalidad the vote is on the amendments (see voteStage).
  const outcomeLabelFor = (v: Vote): string => {
    const stage = voteStage(v);
    const outcome = stageOutcome(v);
    return stage === 'other' || outcome === 'tie'
      ? t(`result_${outcome}`)
      : t(`outcome_${stage}_${outcome}`);
  };
  const stageHintFor = (v: Vote): string | null => {
    const stage = voteStage(v);
    return stage === 'other' ? null : t(`stage_hint_${stage}`);
  };
  const marginLabel = (margin: number): string =>
    margin === 0 ? t('margin_tie') : t('margin_short', { margin });
  const groupLabels: GroupLabels = {
    ayes: t('ayes_short'),
    noes: t('noes_short'),
    finalResult: t('law_final_result'),
    votesToggle: (n) => t('law_votes_toggle', { count: n }),
    pointsToggle: (n) => t('points_toggle', { count: n }),
    pointLabel: (n) => t('point_label', { n }),
    pointsSummary: (approved, total) => t('points_summary', { approved, total }),
    whyMultiple: t('law_why_multiple'),
    whyPoints: t('points_why'),
    finalTag: t('law_vote_final_tag'),
  };
  const topicSlugsOf = (v: Vote): string => (v.topics ?? []).map((tp) => tp.slug).join(' ');
  // Procedural votes carry no initiative and so never get a summary; their
  // description only restates the title. Say what the procedure does instead
  // of leaving the row as bare legalese. The key is a fixed slug, hence the
  // cast for the typed t().
  const proceduralNoteFor = (v: Vote): string | null => {
    if (pickPlainSummary(v, locale)) return null;
    const key = proceduralExplainerKey(v.title, v.description);
    return key ? (tCommon as unknown as (k: string) => string)(`procedural_${key}`) : null;
  };
  const renderEntry = (entry: SessionEntry, kind: VoteKind) => {
    if (entry.kind === 'law') {
      const lead = entry.votes[0]!;
      const proposerGroup = lead.proposing_group_slug
        ? groupBySlug.get(lead.proposing_group_slug) ?? null
        : null;
      return (
        <LawVoteGroup
          key={`law-${entry.key}`}
          votes={entry.votes}
          kind={kind}
          locale={locale}
          proposerLogoUrl={proposerGroup?.logo_url ?? null}
          proposedByGovernmentLabel={t('proposed_by_government')}
          labels={groupLabels}
          stanceByVote={stanceByVote}
          stanceLabels={stanceLabels}
          noBreakLabels={noBreakLabels}
          outcomeLabelFor={outcomeLabelFor}
          stageHintFor={stageHintFor}
          marginLabel={marginLabel}
          topicSlugs={topicSlugsOf(lead)}
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
        resultLabel={outcomeLabelFor(v)}
        ayesLabel={t('ayes_short')}
        noesLabel={t('noes_short')}
        abstLabel={t('abst_short')}
        proposedByGovernmentLabel={t('proposed_by_government')}
        marginLabel={marginLabel}
        stance={stanceByVote.get(v.id)}
        stanceLabels={stanceLabels}
        noBreakLabels={noBreakLabels}
        stageHint={stageHintFor(v)}
        proceduralNote={proceduralNoteFor(v)}
        topicSlugs={topicSlugsOf(v)}
      />
    );
  };

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
              <div style={{ width: `${(counts.approved / counts.laws) * 100}%`, background: 'var(--aye)' }} />
            )}
            {counts.rejected > 0 && (
              <div style={{ width: `${(counts.rejected / counts.laws) * 100}%`, background: 'var(--no)' }} />
            )}
            {counts.tie > 0 && (
              <div style={{ width: `${(counts.tie / counts.laws) * 100}%`, background: 'var(--abst)' }} />
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
              total: counts.laws,
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
          {/* The raw vote count, stated once and explained, so the
              per-initiative figures above never read as a mistake next
              to the "N votaciones" in the header. */}
          {ordered.length > counts.laws && (
            <>
              {' '}
              {t.rich('lede_votes_note', {
                votes: ordered.length,
                n: (chunks) => (
                  <strong className="tabular" style={{ color: 'var(--ink)', fontWeight: 600 }}>
                    {chunks}
                  </strong>
                ),
              })}
            </>
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
                    {/* Applies the list's topic filter and scrolls to it
                        (#tema-<slug>, see SessionVoteFilter). The underline takes the topic's
                        own colour so the lede visually ties to the coloured
                        sections. */}
                    <a
                      href={`#tema-${g.topic!.slug}`}
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
                      ({summariseLaws(g.votes).laws})
                    </span>
                  </span>
                ))}
                .
              </>
            );
          })()}
        </p>
      </section>

      {/* Vote list — grouped by what a vote can DO: laws first (they
          create or change law), then motions and PNL (positions, no law
          changes), then procedures (treaties, reports) folded. Topics are
          a filter over the whole list (chips above it, and the lede's
          topic links), not a second list. Every item appears once, with
          its outcome and who voted what before its metadata. */}
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
            topicEyebrow: t('topic_filter_eyebrow'),
            topicAll: t('topic_filter_all'),
            empty: t('filter_empty'),
          }}
          topics={sessionTopicOptions(ordered, locale)}
        >
          {groupVotesByKind(ordered).map(({ kind, votes: kindVotes }) => {
            const s = summariseLaws(kindVotes);
            const heading = (
              <KindHeading
                title={t(`kind_${kind}_title`)}
                description={t(`kind_${kind}_desc`)}
                counts={[
                  t('section_total_laws', { count: s.laws }),
                  s.approved > 0 ? t('section_approved', { count: s.approved }) : null,
                  s.rejected > 0 ? t('section_rejected', { count: s.rejected }) : null,
                  s.tie > 0 ? t('section_tie', { count: s.tie }) : null,
                ]}
              />
            );
            const list = (
              <ul style={{ listStyle: 'none', margin: '0 0 8px', padding: 0 }}>
                {buildSessionEntries(kindVotes).map((entry) => renderEntry(entry, kind))}
              </ul>
            );
            return kind === 'procedures' ? (
              <details
                key={kind}
                id="session-kind-procedures"
                className="session-kind-group"
                style={{ borderTop: '1px solid var(--rule)', marginTop: 8, marginBottom: 20 }}
              >
                <summary
                  className="session-topic-summary"
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    padding: '14px 0 6px',
                    cursor: 'pointer',
                  }}
                >
                  <ChevronRight
                    className="session-topic-chevron"
                    size={15}
                    strokeWidth={2}
                    aria-hidden="true"
                    style={{ flex: 'none', color: 'var(--ink-3)', marginTop: 5 }}
                  />
                  {heading}
                </summary>
                {list}
              </details>
            ) : (
              <section
                key={kind}
                id={`session-kind-${kind}`}
                className="session-kind-group"
                style={{ marginBottom: 20 }}
              >
                {heading}
                {list}
              </section>
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

// One entry per ITEM: an item voted several times in the sitting (a bill's
// amendments and whole text, a decree-law's convalidation and follow-up, a
// motion voted point by point) appears ONCE with its votes nested. The
// Congreso labels every sub-vote with the item's title, so without this they
// read as duplicate rows.
type SessionEntry =
  | { kind: 'single'; vote: Vote }
  | { kind: 'law'; key: string; votes: Vote[] };

function buildSessionEntries(votes: Vote[]): SessionEntry[] {
  const counts = new Map<string, number>();
  for (const v of votes) {
    const key = initiativeKey(v);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const entries: SessionEntry[] = [];
  const itemIndex = new Map<string, number>();
  for (const v of votes) {
    const key = initiativeKey(v);
    if ((counts.get(key) ?? 0) >= 2) {
      let idx = itemIndex.get(key);
      if (idx == null) {
        idx = entries.length;
        entries.push({ kind: 'law', key, votes: [] });
        itemIndex.set(key, idx);
      }
      (entries[idx] as Extract<SessionEntry, { kind: 'law' }>).votes.push(v);
    } else {
      entries.push({ kind: 'single', vote: v });
    }
  }
  return entries;
}

const KIND_ORDER: readonly VoteKind[] = ['laws', 'motions', 'procedures'];

/** Split the sitting into laws / motions / procedures. Classified per ITEM
 *  (its first vote) so one item's votes never split across sections. */
function groupVotesByKind(votes: Vote[]): { kind: VoteKind; votes: Vote[] }[] {
  const kindByItem = new Map<string, VoteKind>();
  for (const v of votes) {
    const key = initiativeKey(v);
    if (!kindByItem.has(key)) kindByItem.set(key, voteKind(v));
  }
  const buckets = new Map<VoteKind, Vote[]>();
  for (const v of votes) {
    const kind = kindByItem.get(initiativeKey(v))!;
    const list = buckets.get(kind);
    if (list) list.push(v);
    else buckets.set(kind, [v]);
  }
  return KIND_ORDER.filter((k) => buckets.has(k)).map((kind) => ({
    kind,
    votes: buckets.get(kind)!,
  }));
}

/** Topics present in the sitting, most frequent first, for the filter. */
function sessionTopicOptions(votes: Vote[], locale: string): TopicOption[] {
  const bySlug = new Map<string, { option: TopicOption; n: number }>();
  for (const v of votes) {
    // Editorial themes only: SDG tags ride along on votes, and showing both
    // taxonomies as chips would offer overlapping, confusing filters.
    for (const tp of (v.topics ?? []).filter((x) => x.kind === 'theme')) {
      const seen = bySlug.get(tp.slug);
      if (seen) seen.n += 1;
      else {
        bySlug.set(tp.slug, {
          option: { slug: tp.slug, name: pickTopicName(tp, locale), color: tp.color_hex },
          n: 1,
        });
      }
    }
  }
  return [...bySlug.values()].sort((a, b) => b.n - a.n).map((e) => e.option);
}

function KindHeading({
  title,
  description,
  counts,
}: {
  title: string;
  description: string;
  counts: (string | null)[];
}) {
  return (
    <div style={{ minWidth: 0, flex: 1, marginBottom: 4 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h2
          className="serif"
          style={{
            margin: 0,
            fontSize: 'clamp(17px, 1.8vw, 20px)',
            fontWeight: 700,
            letterSpacing: '-0.01em',
            color: 'var(--ink)',
          }}
        >
          {title}
        </h2>
        <span className="tabular" style={{ fontSize: 12, color: 'var(--ink-3)' }}>
          {counts.filter(Boolean).join(' · ')}
        </span>
      </div>
      <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.45 }}>
        {description}
      </p>
    </div>
  );
}

const STAGE_HINT_STYLE: React.CSSProperties = {
  margin: '6px 0 0',
  fontSize: 11.5,
  color: 'var(--ink-3)',
  lineHeight: 1.4,
};

/** Why a vote has no party breakdown, stated instead of rendering nothing. */
function NoBreakdownFor({
  vote,
  labels,
}: {
  vote: Vote;
  labels: Record<NoBreakdownReason, string>;
}) {
  const reason = noBreakdownReason({
    approvedByAssent: vote.approved_by_assent,
    hasBreakdown: false,
    subject: vote.description ?? vote.title,
  });
  return reason ? <NoBreakdownInline reason={reason} label={labels[reason]} /> : null;
}

type Proposer =
  | { kind: 'group'; short: string; slug: string | null; color: string; logoUrl: string | null }
  | { kind: 'government'; short: string; color: string }
  | null;

function proposerOf(vote: Vote, logoUrl: string | null, governmentLabel: string): Proposer {
  if (vote.proposing_group_short) {
    return {
      kind: 'group',
      short: vote.proposing_group_short,
      slug: vote.proposing_group_slug,
      color: vote.proposing_group_color ?? 'var(--ink-3)',
      logoUrl,
    };
  }
  return vote.proposed_by_government
    ? { kind: 'government', short: governmentLabel, color: 'var(--ink)' }
    : null;
}

/** Proposer, first topic (+N) and the "Texto original" toggle: context,
 *  shown under the outcome and the parties rather than before them. */
function MetaStrip({
  proposer,
  topics,
  locale,
  plainSummary,
  subject,
  provider,
}: {
  proposer: Proposer;
  topics: InitiativeTopicSlug[];
  locale: string;
  plainSummary: string | null;
  subject: string;
  provider: string | null;
}) {
  if (!proposer && topics.length === 0 && !plainSummary) return null;
  return (
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
      {/* One topic chip only — the extra topics collapse into a quiet
          "+N" so the line doesn't turn into a badge wall. */}
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
      {plainSummary && <LawOriginalToggle original={subject} provider={provider} />}
    </div>
  );
}

interface GroupLabels {
  ayes: string;
  noes: string;
  finalResult: string;
  votesToggle: (n: number) => string;
  pointsToggle: (n: number) => string;
  pointLabel: (n: number) => string;
  pointsSummary: (approved: number, total: number) => string;
  whyMultiple: string;
  whyPoints: string;
  finalTag: string;
}

/**
 * An item voted several times in one sitting, rendered once. Two shapes:
 *
 * - A bill (amendments, articles, then the whole text) or a decree-law
 *   (convalidation, then "tramitar como proyecto"): the outcome is the
 *   DECIDING vote (``fateVote``), with who voted what on it.
 * - A motion / PNL voted point by point: each point stands on its own, so
 *   the header says "X de N puntos aprobados" and every point carries its
 *   own party strip; one strip can't speak for all the points. The open
 *   data doesn't publish the text of each point.
 */
function LawVoteGroup({
  votes,
  kind,
  locale,
  proposerLogoUrl,
  proposedByGovernmentLabel,
  labels,
  stanceByVote,
  stanceLabels,
  noBreakLabels,
  outcomeLabelFor,
  stageHintFor,
  marginLabel,
  topicSlugs,
}: {
  votes: Vote[];
  kind: VoteKind;
  locale: string;
  proposerLogoUrl: string | null;
  proposedByGovernmentLabel: string;
  labels: GroupLabels;
  stanceByVote: Map<number, PartyStance[]>;
  stanceLabels: StanceLabels;
  noBreakLabels: Record<NoBreakdownReason, string>;
  outcomeLabelFor: (v: Vote) => string;
  stageHintFor: (v: Vote) => string | null;
  marginLabel: (margin: number) => string;
  /** Space-separated topic slugs, read by the session topic filter. */
  topicSlugs: string;
}) {
  const lead = votes[0]!;
  const subject = lead.description?.trim() || lead.title;
  const plainSummary = pickPlainSummary(lead, locale);
  const headline = plainSummary ?? subject;
  const topics: InitiativeTopicSlug[] = lead.topics ?? [];
  const ordered = [...votes].sort(
    (a, b) => (a.sequence_in_session ?? 0) - (b.sequence_in_session ?? 0),
  );
  const byPoints = kind === 'motions';
  const decider = fateVote(ordered);
  const outcome = fateResult(ordered);
  const approvedPoints = ordered.filter((v) => v.result === 'approved').length;
  const hint = byPoints ? null : stageHintFor(decider);
  const deciderStance = stanceByVote.get(decider.id);
  const proposer = proposerOf(lead, proposerLogoUrl, proposedByGovernmentLabel);
  const headlineStyle: React.CSSProperties = {
    margin: 0,
    fontSize: 'clamp(14px, 1.4vw, 15px)',
    fontWeight: 400,
    color: 'var(--ink)',
    lineHeight: 1.35,
    letterSpacing: '-0.005em',
    flex: '1 1 280px',
    minWidth: 0,
    textDecoration: 'none',
  };

  return (
    // Filtered by the ITEM's outcome (fateResult), not by its inner votes:
    // a bill that passed after its amendments were voted down is approved.
    <li
      data-result={outcome}
      data-topics={topicSlugs}
      style={{ padding: '14px 0', borderBottom: '1px solid var(--rule)' }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '28px minmax(0, 1fr)',
          columnGap: 16,
          rowGap: 6,
          alignItems: 'start',
        }}
      >
        {/* Gutter glyph signals "one item, several votes". */}
        <span aria-hidden="true" style={{ paddingTop: 3, color: 'var(--ink-3)' }}>
          <Layers size={14} strokeWidth={1.9} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            {lead.initiative_id != null ? (
              <Link
                href={`/initiatives/${lead.initiative_id}` as Route}
                className="serif"
                style={headlineStyle}
              >
                {headline}
              </Link>
            ) : (
              <span className="serif" style={headlineStyle}>
                {headline}
              </span>
            )}
            <span
              style={{
                flex: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
              }}
            >
              {byPoints ? (
                <ResultPill
                  result={outcome}
                  label={labels.pointsSummary(approvedPoints, ordered.length)}
                />
              ) : (
                <>
                  <ResultPill result={outcome} label={outcomeLabelFor(decider)} />
                  <span
                    className="tabular"
                    style={{ fontSize: 11, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}
                  >
                    {marginLabel(Math.abs(decider.ayes - decider.noes))}
                  </span>
                </>
              )}
            </span>
          </div>
          {hint && <p style={STAGE_HINT_STYLE}>{hint}</p>}
          {/* Who voted what comes before the metadata: it is the answer the
              reader came for. Point-by-point motions show it per point. */}
          {!byPoints &&
            (deciderStance && deciderStance.length > 0 ? (
              <PartyStanceMini parties={deciderStance} labels={stanceLabels} />
            ) : (
              <NoBreakdownFor vote={decider} labels={noBreakLabels} />
            ))}
          <MetaStrip
            proposer={proposer}
            topics={topics}
            locale={locale}
            plainSummary={plainSummary}
            subject={subject}
            provider={lead.plain_summary_provider}
          />
          <div style={{ marginTop: 10 }}>
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
                {byPoints
                  ? labels.pointsToggle(ordered.length)
                  : labels.votesToggle(ordered.length)}
                {/* Educational note: why one item is voted several times. */}
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
                  explanation={byPoints ? labels.whyPoints : labels.whyMultiple}
                />
              </summary>
              <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
                {ordered.map((v, i) => (
                  <SubVote
                    key={v.id}
                    vote={v}
                    label={byPoints ? labels.pointLabel(i + 1) : null}
                    ayesLabel={labels.ayes}
                    noesLabel={labels.noes}
                    resultLabel={outcomeLabelFor(v)}
                    marginLabel={marginLabel}
                    tag={!byPoints && v.id === decider.id ? labels.finalTag : null}
                    stance={byPoints ? stanceByVote.get(v.id) : undefined}
                    stanceLabels={stanceLabels}
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

/** One vote inside a {@link LawVoteGroup}: its label (sequence, or "Punto
 *  N" for a point-by-point motion), result and tally, linking to the full
 *  vote. Point rows also carry their own party strip. Deliberately NO
 *  data-result: the filter selects items, and once an item matches, all
 *  its votes show, including the ones that went the other way. */
function SubVote({
  vote,
  label,
  ayesLabel,
  noesLabel,
  resultLabel,
  marginLabel,
  tag,
  stance,
  stanceLabels,
}: {
  vote: Vote;
  label: string | null;
  ayesLabel: string;
  noesLabel: string;
  resultLabel: string;
  marginLabel: (margin: number) => string;
  tag: string | null;
  stance?: PartyStance[];
  stanceLabels: StanceLabels;
}) {
  const margin = Math.abs(vote.ayes - vote.noes);
  return (
    <li style={{ borderTop: '1px solid var(--rule)' }}>
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
          style={{
            fontSize: 11,
            color: 'var(--ink-3)',
            fontWeight: 600,
            letterSpacing: label ? '0.02em' : '0.08em',
            minWidth: 22,
          }}
        >
          {label ??
            (vote.sequence_in_session != null
              ? String(vote.sequence_in_session).padStart(2, '0')
              : '—')}
        </span>
        <ResultPill result={stageOutcome(vote)} label={resultLabel} />
        {tag && (
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
            {tag}
          </span>
        )}
        <span className="tabular" style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>
          <strong style={{ color: 'var(--aye, #16A34A)' }}>{vote.ayes}</strong> {ayesLabel}
          <span style={{ color: 'var(--ink-3)', margin: '0 6px' }}>·</span>
          <strong style={{ color: 'var(--no, #DC2626)' }}>{vote.noes}</strong> {noesLabel}
        </span>
        <span className="tabular" style={{ fontSize: 11, color: 'var(--ink-3)', marginLeft: 'auto' }}>
          {marginLabel(margin)}
        </span>
      </Link>
      {stance && stance.length > 0 && (
        <div style={{ padding: '0 0 10px 34px' }}>
          <PartyStanceMini parties={stance} labels={stanceLabels} />
        </div>
      )}
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
  noBreakLabels,
  stageHint,
  proceduralNote,
  topicSlugs,
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
  noBreakLabels: Record<NoBreakdownReason, string>;
  stageHint?: string | null;
  /** What this kind of procedural vote does, when no summary exists. */
  proceduralNote?: string | null;
  /** Space-separated topic slugs, read by the session topic filter. */
  topicSlugs: string;
}) {
  const subject = vote.description?.trim() || vote.title;
  // AI plain-language summary leads as the row headline; the raw official
  // title moves behind the inline "Text original" toggle. Falls back to the
  // title when no summary has been generated yet, so the row is never blank.
  const plainSummary = pickPlainSummary(vote, locale);
  const headline = plainSummary ?? subject;
  const margin = Math.abs(vote.ayes - vote.noes);
  // The item outcome: inverted for a debate de totalidad (see stageOutcome).
  const outcome = stageOutcome(vote);
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
      data-result={outcome}
      data-topics={topicSlugs}
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
              <ResultPill result={outcome} label={resultLabel} />
            </span>
          </div>
          {stageHint && <p style={STAGE_HINT_STYLE}>{stageHint}</p>}
          {proceduralNote && (
            <p
              style={{
                margin: '6px 0 0',
                fontSize: 12.5,
                lineHeight: 1.5,
                color: 'var(--ink-2)',
              }}
            >
              {proceduralNote}
            </p>
          )}
          {/* Who voted what comes before the metadata: it is the answer
              the reader came for. */}
          {stance && stance.length > 0 ? (
            <PartyStanceMini parties={stance} labels={stanceLabels} />
          ) : (
            <NoBreakdownFor vote={vote} labels={noBreakLabels} />
          )}
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
 * Topic order: sections are sorted by number of initiatives decided
 * (ties broken by raw vote count), so the busiest topic reads first and
 * the order matches the "(N)" counts in the lede. The unclassified bucket
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
    return (
      summariseLaws(b.votes).laws - summariseLaws(a.votes).laws ||
      b.votes.length - a.votes.length
    );
  });
  return ordered;
}
