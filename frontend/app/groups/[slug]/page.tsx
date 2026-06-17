import type { Route } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { ArrowRight, ArrowUpRight } from 'lucide-react';

import { CompactVoteRow } from '@/components/CompactVoteRow';
import { GroupCompositionFilter } from '@/components/GroupCompositionFilter';
import { TopicBars } from '@/components/TopicBars';
import {
  api,
  ApiError,
  type GroupComposition,
  type GroupMemberRow,
  type GroupStanceExample,
  type ParliamentaryGroupSummary,
  type ProposesByTopicStat,
  type Topic,
  type TopicVoteStat,
  type Vote,
} from '@/lib/api';
import { displayGroupFullName, groupAbbreviation, groupInfo } from '@/lib/groups';
import { pickTopicName } from '@/lib/topics';

interface Params {
  slug: string;
}

export default async function GroupDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const t = await getTranslations('group');
  const tVotes = await getTranslations('votes');
  const locale = await getLocale();

  let group: ParliamentaryGroupSummary;
  let members: GroupMemberRow[] = [];
  let topicStats: TopicVoteStat[] = [];
  let composition: GroupComposition | null = null;
  let allTopics: Topic[] = [];
  let proposedVotes: Vote[] = [];
  let proposesByTopic: ProposesByTopicStat[] = [];
  try {
    [group, members, topicStats, composition, allTopics, proposedVotes, proposesByTopic] =
      await Promise.all([
        api.groups.get(slug),
        api.groups.members(slug),
        api.groups.topicStats(slug),
        // Composition is non-essential — if it fails (e.g. older backend
        // without the endpoint), the page still renders the rest.
        api.groups.composition(slug).catch(() => null),
        // Used by TopicBars to localise per-topic names (the underlying
        // TopicVoteStat only ships topic_name_ca to keep the matrix
        // payload small).
        api.topics.list().catch(() => [] as Topic[]),
        // Recent votes where this group is the recorded proposer. Rendered
        // with the same LawRow-backed CompactVoteRow as the votes list, so a
        // "law" reads identically here as everywhere else. Resilient: an
        // empty list just hides the section's rows behind the empty-state.
        api.votes
          .list({ proposing_group_slug: slug, legislature_id: 1, page_size: 24 })
          .then((r) => r.items)
          .catch(() => [] as Vote[]),
        api.groups.proposesByTopic(slug).catch(() => [] as ProposesByTopicStat[]),
      ]);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }

  // One row per initiative: a bill/motion generates many distinct votes
  // (amendments, sub-votes) that share an expediente, so the raw vote list
  // reads as duplicates. Collapse to the first (most recent) per expediente.
  {
    const seenExpedientes = new Set<string>();
    proposedVotes = proposedVotes
      .filter((v) => {
        const key = v.expediente_raw ?? `vote-${v.id}`;
        if (seenExpedientes.has(key)) return false;
        seenExpedientes.add(key);
        return true;
      })
      .slice(0, 6);
  }

  const info = groupInfo(group.slug);
  const fullName = displayGroupFullName(group.slug, group.name_long);

  // ---- Thematic profile (factual + symmetric) ---------------------------
  // Restrict every "top topic" to the editorial 'theme' taxonomy so the
  // three widgets speak one language (topic-stats and proposes-by-topic both
  // mix theme + SDG rows). Require a minimum sample for the vote tops so a
  // single all-aye topic with n=2 doesn't surface as "where it votes Yes
  // most". Same computation for every group — the API ranks no one.
  const themeSlugs = new Set(allTopics.filter((tp) => tp.kind === 'theme').map((tp) => tp.slug));
  const localizedTopicName = (topicSlug: string, fallbackCa: string): string => {
    const tp = allTopics.find((x) => x.slug === topicSlug);
    return tp ? pickTopicName(tp, locale) : fallbackCa;
  };
  const MIN_CAST_FOR_TOP = 10;
  const topPropose = proposesByTopic.find((r) => themeSlugs.has(r.topic_slug)) ?? null;
  const voteThemeStats = topicStats.filter(
    (r) => themeSlugs.has(r.topic_slug) && r.cast >= MIN_CAST_FOR_TOP,
  );
  const topYes =
    [...voteThemeStats].sort((a, b) => b.ayes / b.cast - a.ayes / a.cast)[0] ?? null;
  const topNo =
    [...voteThemeStats].sort((a, b) => b.noes / b.cast - a.noes / a.cast)[0] ?? null;

  // Example votes for each profile widget, fetched in parallel and resilient.
  // "Proposes": votes the group put forward on that topic. "Votes Yes /
  // Rejects": votes where the group's majority sided aye / no on that topic.
  const [proposeRaw, yesRaw, noRaw] = await Promise.all([
    topPropose
      ? api.votes
          .list({
            proposing_group_slug: slug,
            topic_slug: topPropose.topic_slug,
            legislature_id: 1,
            page_size: 3,
          })
          .then((r) => r.items)
          .catch(() => [] as Vote[])
      : Promise.resolve([] as Vote[]),
    topYes
      ? api.groups
          .stanceExamples(group.slug, topYes.topic_slug, 'aye')
          .catch(() => [] as GroupStanceExample[])
      : Promise.resolve([] as GroupStanceExample[]),
    topNo
      ? api.groups
          .stanceExamples(group.slug, topNo.topic_slug, 'no')
          .catch(() => [] as GroupStanceExample[])
      : Promise.resolve([] as GroupStanceExample[]),
  ]);
  const proposeExamples = proposeRaw.map((v) => ({
    id: v.id,
    title: v.description?.trim() || v.title,
  }));
  const yesExamples = yesRaw.map((e) => ({ id: e.vote_id, title: e.title }));
  const noExamples = noRaw.map((e) => ({ id: e.vote_id, title: e.title }));

  const hasProfile = topPropose !== null || topYes !== null || topNo !== null;

  return (
    <article>
      {/* Breadcrumb */}
      <div style={{ fontSize: 12, color: 'var(--ink-3)', paddingTop: 18 }}>
        <Link href="/groups" style={{ color: 'var(--ink-2)' }}>
          {t('breadcrumb_groups')}
        </Link>
        {' / '}
        <span style={{ color: 'var(--ink)' }}>{group.name_short}</span>
      </div>

      {/* Civic infobox header */}
      <header
        className="group-detail-header"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 320px',
          gap: 36,
          paddingTop: 18,
          paddingBottom: 28,
          borderBottom: '1px solid var(--ink)',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <h1
              className="h-display"
              style={{ margin: 0, fontSize: 'clamp(32px, 4.4vw, 48px)' }}
            >
              {fullName}
            </h1>
            <span
              className="eyebrow"
              style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 600 }}
            >
              {t('group_eyebrow')}
            </span>
          </div>
          {/* Long-form name sits BELOW the H1 as a soft descriptive line.
              Matches the demoted-subtitle pattern used across other page
              headers — smaller (13px) and ink-3 so the title remains the
              page's visual anchor. */}
          <div
            style={{
              fontSize: 13,
              color: 'var(--ink-3)',
              lineHeight: 1.4,
              maxWidth: 540,
            }}
          >
            {group.name_long}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              borderTop: '1px solid var(--ink)',
              marginTop: 22,
            }}
          >
            <div className="kpi">
              <span className="label">{t('members_label')}</span>
              <span className="value tabular">{group.members_active}</span>
            </div>
            {info?.founded_year && (
              <div className="kpi">
                <span className="label">{t('founded_label')}</span>
                <span className="value tabular">{info.founded_year}</span>
              </div>
            )}
            {info?.scope && (
              <div className="kpi">
                <span className="label">{t('scope_label')}</span>
                <span className="value" style={{ fontSize: 16, lineHeight: 1.2 }}>
                  {info.scope}
                </span>
              </div>
            )}
          </div>
        </div>

        <aside style={{ borderLeft: '1px solid var(--ink)', paddingLeft: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
            <span
              className="gdisc lg"
              style={{ background: group.color_hex ?? 'var(--ink-3)' }}
            >
              {groupAbbreviation(group.slug)}
            </span>
            <div>
              <div className="eyebrow">{t('civic_mark_eyebrow')}</div>
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--ink-3)',
                  marginTop: 4,
                  lineHeight: 1.4,
                  maxWidth: 200,
                }}
              >
                {t('civic_mark_caption')}
              </div>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--rule)' }}>
            {info?.website && (
              <FactRow label={t('website')}>
                <a
                  href={info.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--ink)', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                >
                  {info.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}{' '}
                  <ArrowUpRight size={14} aria-hidden="true" />
                </a>
              </FactRow>
            )}
            {info?.wikipedia_url && (
              <FactRow label={t('wikipedia')}>
                <a
                  href={info.wikipedia_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--ink)', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                >
                  Wikipedia <ArrowUpRight size={14} aria-hidden="true" />
                </a>
              </FactRow>
            )}
            {group.color_hex && (
              <FactRow label={t('color_identifier_label')}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span
                    className="gdot"
                    style={{ background: group.color_hex, width: 10, height: 10 }}
                  />
                  <span className="mono">{group.color_hex}</span>
                </span>
              </FactRow>
            )}
          </div>
        </aside>
      </header>

      {/* Composition — gender + age + constituent parties.
          Symmetric: every bucket (including "unknown") is shown, never
          hidden. Headline "Composició" (factual), never "Diversitat"
          (value-laden). */}
      {composition && composition.members_total > 0 && (
        <CompositionSection
          composition={composition}
          groupColor={group.color_hex}
          labels={{
            title: t('composition_title'),
            intro: t('composition_intro'),
            gender: t('composition_gender'),
            age: t('composition_age'),
            parties: t('composition_parties'),
            gender_distribution_aria: (summary: string) =>
              t('gender_distribution_aria', { summary }),
            age_bucket_aria: (label: string, value: number) =>
              t('age_bucket_aria', { label, value }),
            gender_F: t('gender_F'),
            gender_M: t('gender_M'),
            gender_X: t('gender_X'),
            gender_unknown: t('gender_unknown'),
            age_under_30: t('age_under_30'),
            age_30_39: t('age_30_39'),
            age_40_49: t('age_40_49'),
            age_50_59: t('age_50_59'),
            age_60_plus: t('age_60_plus'),
            age_unknown: t('age_unknown'),
            no_party_data: (count: number) => t('no_party_data', { count }),
          }}
        />
      )}

      {/* Thematic profile — factual, symmetric: where the group proposes
          most, votes Yes most and rejects most. Same three lenses for every
          group; "rejects most" always sits next to "votes Yes most". */}
      {hasProfile && (
        <section style={{ paddingTop: 28 }}>
          <h2 className="h-title">{t('profile_title')}</h2>
          <p style={{ fontSize: 12, color: 'var(--ink-3)', maxWidth: 760, marginTop: 0 }}>
            {t('profile_intro')}
          </p>
          {(topYes || topPropose) && (
            <p
              style={{
                fontSize: 14,
                color: 'var(--ink-2)',
                lineHeight: 1.5,
                maxWidth: 720,
                margin: '6px 0 0',
              }}
            >
              {topYes &&
                topNo &&
                t('profile_summary_votes', {
                  yes: localizedTopicName(topYes.topic_slug, topYes.topic_name_ca),
                  no: localizedTopicName(topNo.topic_slug, topNo.topic_name_ca),
                })}
              {topPropose && (
                <>
                  {' '}
                  {t('profile_summary_proposes', {
                    topic: localizedTopicName(topPropose.topic_slug, topPropose.topic_name_ca),
                  })}
                </>
              )}
            </p>
          )}

          <div
            className="profile-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: 14,
              marginTop: 16,
            }}
          >
            {topPropose && (
              <ProfileStatCard
                label={t('profile_proposes_label')}
                topicName={localizedTopicName(topPropose.topic_slug, topPropose.topic_name_ca)}
                color={topPropose.topic_color_hex}
                stat={t('profile_proposes_count', { count: topPropose.count })}
                examples={proposeExamples}
                href={
                  `/votes?proposing_group_slug=${group.slug}&topic_slug=${topPropose.topic_slug}` as Route
                }
                linkLabel={t('profile_see_proposals')}
              />
            )}
            {topYes && (
              <ProfileStatCard
                label={t('profile_votes_yes_label')}
                topicName={localizedTopicName(topYes.topic_slug, topYes.topic_name_ca)}
                color={topYes.topic_color_hex}
                stat={t('profile_pct_aye', { pct: Math.round((topYes.ayes / topYes.cast) * 100) })}
                statColor="var(--aye)"
                examples={yesExamples}
                href={`/topics/${topYes.topic_slug}` as Route}
                linkLabel={t('profile_view_topic')}
              />
            )}
            {topNo && (
              <ProfileStatCard
                label={t('profile_votes_no_label')}
                topicName={localizedTopicName(topNo.topic_slug, topNo.topic_name_ca)}
                color={topNo.topic_color_hex}
                stat={t('profile_pct_no', { pct: Math.round((topNo.noes / topNo.cast) * 100) })}
                statColor="var(--no)"
                examples={noExamples}
                href={`/topics/${topNo.topic_slug}` as Route}
                linkLabel={t('profile_view_topic')}
              />
            )}
          </div>
          <style>{`
            @media (max-width: 860px) {
              .profile-grid { grid-template-columns: 1fr !important; }
            }
          `}</style>
        </section>
      )}

      {/* Topic-stats */}
      <section style={{ paddingTop: 28 }}>
        <h2 className="h-title">{t('vote_by_topic_title')}</h2>
        <p style={{ fontSize: 12, color: 'var(--ink-3)', maxWidth: 760, marginTop: 0 }}>
          {t('vote_by_topic_subtitle')}
        </p>
        <TopicBars
          rows={topicStats}
          emptyHint={t('vote_by_topic_empty_hint')}
          groupSlug={group.slug}
          allTopics={allTopics}
        />
      </section>

      {/* Initiatives put forward by this group — the "in every place a law
          appears" surface. Uses the shared CompactVoteRow/LawRow so a law
          reads identically here, on /votes, on the home strip and on a
          topic hub. Factual only: proposer + type + result, no framing. */}
      <section style={{ paddingTop: 28 }}>
        <h2 className="h-title">{t('proposed_section_title')}</h2>
        <p style={{ fontSize: 12, color: 'var(--ink-3)', maxWidth: 760, marginTop: 0 }}>
          {t('proposed_section_subtitle')}
        </p>
        {proposedVotes.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>{t('proposed_empty')}</p>
        ) : (
          <>
            <ul
              className="votes-list"
              style={{ listStyle: 'none', margin: 0, padding: '8px 0 0', display: 'grid', gap: 0 }}
            >
              {proposedVotes.map((vote) => (
                <CompactVoteRow
                  key={vote.id}
                  v={vote}
                  locale={locale}
                  labels={{
                    ayes: tVotes('ayes'),
                    noes: tVotes('noes'),
                    abstentions: tVotes('abstentions'),
                    proposed_by: tVotes('proposed_by'),
                    proposed_by_government: tVotes('proposed_by_government'),
                    result: tVotes(`result.${vote.result}` as 'result.approved'),
                  }}
                />
              ))}
            </ul>
            <Link
              href={`/votes?proposing_group_slug=${slug}` as Route}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                marginTop: 14,
                fontSize: 13,
                color: 'var(--accent)',
                textDecoration: 'none',
              }}
            >
              {t('proposed_view_all')} <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </>
        )}
      </section>

      {members.length === 0 ? (
        <section style={{ paddingTop: 28 }}>
          <h2 className="h-title">{t('members_title')}</h2>
          <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>{t('no_members')}</p>
        </section>
      ) : (
        <GroupCompositionFilter
          members={sortMembersWithRoleFirst(members)}
          groupSlug={group.slug}
          groupColor={group.color_hex}
        />
      )}

      <style>{`
        @media (max-width: 860px) {
          .group-detail-header {
            grid-template-columns: 1fr !important;
            gap: 18px !important;
          }
          .group-detail-header aside {
            border-left: none !important;
            border-top: 1px solid var(--rule) !important;
            padding-left: 0 !important;
            padding-top: 18px !important;
          }
        }
      `}</style>
    </article>
  );
}

function FactRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '110px minmax(0, 1fr)',
        padding: '8px 0',
        borderBottom: '1px solid var(--rule)',
        fontSize: 12,
        gap: 10,
      }}
    >
      <span className="eyebrow" style={{ fontSize: 10 }}>
        {label}
      </span>
      <span style={{ color: 'var(--ink-2)', minWidth: 0, overflowWrap: 'anywhere' }}>{children}</span>
    </div>
  );
}

/**
 * One compact stat card in the thematic profile: an eyebrow label, the
 * topic (colour dot + name), a single factual figure, and a link to the
 * relevant filtered view. Kept visually uniform across the three lenses
 * (proposes / votes Yes / rejects) so none reads as more prominent.
 */
function ProfileStatCard({
  label,
  topicName,
  color,
  stat,
  statColor,
  examples,
  href,
  linkLabel,
}: {
  label: string;
  topicName: string;
  color: string | null;
  stat: string;
  statColor?: string;
  examples?: { id: number; title: string }[];
  href: Route;
  linkLabel: string;
}) {
  // A plain <div> (not a Link) because the card holds its own example
  // links — nesting anchors would be invalid. The topic + stat are static;
  // the examples and the bottom CTA are the links.
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        border: '1px solid var(--rule)',
        background: 'var(--paper)',
        padding: 16,
        minHeight: 132,
      }}
    >
      <div className="eyebrow" style={{ fontSize: 10 }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span
          aria-hidden="true"
          style={{ width: 10, height: 10, borderRadius: 999, background: color ?? 'var(--ink-3)', flex: 'none' }}
        />
        <span
          className="serif"
          style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.15, overflowWrap: 'anywhere' }}
        >
          {topicName}
        </span>
      </div>
      <div
        className="tabular"
        style={{ fontSize: 13, fontWeight: 600, color: statColor ?? 'var(--ink-2)' }}
      >
        {stat}
      </div>
      {examples && examples.length > 0 && (
        <ul style={{ listStyle: 'none', margin: '2px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {examples.slice(0, 2).map((ex) => (
            <li key={ex.id} style={{ minWidth: 0 }}>
              <Link
                href={`/votes/${ex.id}` as Route}
                style={{
                  fontSize: 12,
                  color: 'var(--ink-2)',
                  textDecoration: 'none',
                  lineHeight: 1.35,
                  display: '-webkit-box',
                  WebkitBoxOrient: 'vertical',
                  WebkitLineClamp: 2,
                  overflow: 'hidden',
                }}
              >
                {ex.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link
        href={href}
        style={{
          fontSize: 12,
          color: 'var(--accent)',
          textDecoration: 'none',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          marginTop: 'auto',
        }}
      >
        {linkLabel} <ArrowRight size={13} aria-hidden="true" />
      </Link>
    </div>
  );
}

/**
 * Preserve the original "members with a role first, alphabetical rest
 * after" ordering that the legacy MembersSection produced. The filterable
 * client component receives this pre-sorted list and only ever filters —
 * never re-sorts — so the page reads the same way before and after the
 * user types into the search box.
 */
function sortMembersWithRoleFirst(members: GroupMemberRow[]): GroupMemberRow[] {
  const withRole = members.filter((m) => m.role);
  const withoutRole = members.filter((m) => !m.role);
  return [...withRole, ...withoutRole];
}

// ---------------------------------------------------------------------------
// Composition: gender donut + age bars + member parties list
// ---------------------------------------------------------------------------
//
// Design constraints (from CLAUDE.md "Mètriques agregades — regla de simetria"
// and "neutrality-guidelines.md"):
//
// - Every histogram bucket is rendered even if the count is 0. We do NOT
//   hide unknowns or empty categories — they are facts about the data.
// - Headline says "Composició demogràfica" not "Diversitat". "Diversity"
//   implies a value judgement; "composition" is the neutral civic term.
// - Inline SVG donut and bars: no chart library dependency, predictable
//   render output, sub-1KB GZIP. Same visual idiom as elsewhere on the site.

interface CompositionLabels {
  title: string;
  intro: string;
  gender: string;
  age: string;
  parties: string;
  gender_distribution_aria: (summary: string) => string;
  age_bucket_aria: (label: string, value: number) => string;
  gender_F: string;
  gender_M: string;
  gender_X: string;
  gender_unknown: string;
  age_under_30: string;
  age_30_39: string;
  age_40_49: string;
  age_50_59: string;
  age_60_plus: string;
  age_unknown: string;
  no_party_data: (count: number) => string;
}

// Distinct, accessible colors — chosen to be readable for typical
// red/green colorblind variants. NEVER reuse the AYE/NO/ABST palette;
// gender is not a vote.
const GENDER_COLORS: Record<string, string> = {
  F: '#7c3aed',
  M: '#0ea5e9',
  X: '#f59e0b',
  unknown: '#9ca3af',
};

const AGE_BUCKET_ORDER = ['<30', '30-39', '40-49', '50-59', '60+', 'unknown'] as const;

function CompositionSection({
  composition,
  groupColor,
  labels,
}: {
  composition: GroupComposition;
  groupColor: string | null;
  labels: CompositionLabels;
}) {
  const genderLabels: Record<string, string> = {
    F: labels.gender_F,
    M: labels.gender_M,
    X: labels.gender_X,
    unknown: labels.gender_unknown,
  };
  const ageLabels: Record<string, string> = {
    '<30': labels.age_under_30,
    '30-39': labels.age_30_39,
    '40-49': labels.age_40_49,
    '50-59': labels.age_50_59,
    '60+': labels.age_60_plus,
    unknown: labels.age_unknown,
  };
  // A group made up of a single party (e.g. GP Mixt that's actually one
  // formation) doesn't need a "constituent parties" breakdown — it's
  // implied. Only show it when there's genuinely more than one.
  const hasMultipleParties = composition.member_parties.length > 1;
  return (
    // One titled group — gender + age sit side by side; the constituent
    // parties (only when there's more than one) go full-width below.
    <section style={{ paddingTop: 28 }}>
      <h2 className="h-title">{labels.title}</h2>
      <p style={{ fontSize: 12, color: 'var(--ink-3)', maxWidth: 760, marginTop: 0 }}>
        {labels.intro}
      </p>
      <div
        className="composition-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 18,
          marginTop: 14,
        }}
      >
        <CompositionCard title={labels.gender}>
          <GenderDonut
            distribution={composition.gender_distribution}
            genderLabels={genderLabels}
            ariaBuilder={labels.gender_distribution_aria}
          />
        </CompositionCard>
        <CompositionCard title={labels.age}>
          <AgeBars
            buckets={composition.age_buckets}
            accent={groupColor}
            ageLabels={ageLabels}
            ariaBuilder={labels.age_bucket_aria}
          />
        </CompositionCard>
      </div>
      {hasMultipleParties && (
        <div style={{ marginTop: 18 }}>
          <CompositionCard title={labels.parties}>
            <PartyList
              parties={composition.member_parties}
              membersTotal={composition.members_total}
              emptyBuilder={labels.no_party_data}
            />
          </CompositionCard>
        </div>
      )}
      <style>{`
        @media (max-width: 860px) {
          .composition-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  );
}

function CompositionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        border: '1px solid var(--rule)',
        background: 'var(--paper)',
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 220,
      }}
    >
      <div className="eyebrow" style={{ marginBottom: 12 }}>
        {title}
      </div>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}

function GenderDonut({
  distribution,
  genderLabels,
  ariaBuilder,
}: {
  distribution: GroupComposition['gender_distribution'];
  genderLabels: Record<string, string>;
  ariaBuilder: (summary: string) => string;
}) {
  // Render order = canonical visual order; legend always shows the four
  // buckets including ``unknown`` so callers can't fix asymmetries by
  // hiding a category. Sums of zero are valid — donut degrades to a
  // single grey ring in that case.
  const keys: Array<'F' | 'M' | 'X' | 'unknown'> = ['F', 'M', 'X', 'unknown'];
  const total = keys.reduce((acc, k) => acc + distribution[k], 0);
  // Use a fixed virtual circumference; segment lengths are proportional.
  const R = 40;
  const C = 2 * Math.PI * R;
  let offset = 0;

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
      <svg
        width={120}
        height={120}
        viewBox="0 0 120 120"
        role="img"
        aria-label={ariaBuilder(
          keys.map((k) => `${genderLabels[k]} ${distribution[k]}`).join(', '),
        )}
      >
        <circle cx="60" cy="60" r={R} fill="none" stroke="#e5e7eb" strokeWidth="16" />
        {total > 0 &&
          keys.map((k) => {
            const v = distribution[k];
            if (v === 0) return null;
            const segLen = (v / total) * C;
            const node = (
              <circle
                key={k}
                cx="60"
                cy="60"
                r={R}
                fill="none"
                stroke={GENDER_COLORS[k]}
                strokeWidth="16"
                strokeDasharray={`${segLen} ${C - segLen}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 60 60)"
              />
            );
            offset += segLen;
            return node;
          })}
      </svg>
      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          fontSize: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        {keys.map((k) => (
          <li key={k} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              aria-hidden="true"
              style={{
                width: 10,
                height: 10,
                background: GENDER_COLORS[k],
                display: 'inline-block',
                borderRadius: 2,
              }}
            />
            <span style={{ color: 'var(--ink-2)' }}>{genderLabels[k]}</span>
            <span className="tabular" style={{ marginLeft: 'auto', color: 'var(--ink)' }}>
              {distribution[k]}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AgeBars({
  buckets,
  accent,
  ageLabels,
  ariaBuilder,
}: {
  buckets: GroupComposition['age_buckets'];
  accent: string | null;
  ageLabels: Record<string, string>;
  ariaBuilder: (label: string, value: number) => string;
}) {
  const max = Math.max(1, ...AGE_BUCKET_ORDER.map((k) => buckets[k]));
  const fill = accent ?? 'var(--ink-2)';

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${AGE_BUCKET_ORDER.length}, 1fr)`,
        gap: 8,
        alignItems: 'end',
        height: 140,
      }}
    >
      {AGE_BUCKET_ORDER.map((k) => {
        const value = buckets[k];
        const heightPct = (value / max) * 100;
        return (
          <div
            key={k}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'flex-end',
              height: '100%',
              gap: 4,
            }}
          >
            <span
              className="tabular"
              style={{ fontSize: 11, color: 'var(--ink-2)' }}
              aria-hidden={value === 0 ? 'true' : undefined}
            >
              {value}
            </span>
            <div
              role="img"
              aria-label={ariaBuilder(ageLabels[k] ?? k, value)}
              style={{
                width: '100%',
                background: value === 0 ? '#e5e7eb' : fill,
                opacity: k === 'unknown' ? 0.55 : 1,
                height: `${Math.max(2, heightPct)}%`,
                minHeight: 2,
                borderRadius: 2,
              }}
            />
            <span
              style={{
                fontSize: 10,
                color: 'var(--ink-3)',
                textAlign: 'center',
                whiteSpace: 'nowrap',
              }}
            >
              {ageLabels[k] ?? k}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function PartyList({
  parties,
  membersTotal,
  emptyBuilder,
}: {
  parties: GroupComposition['member_parties'];
  membersTotal: number;
  emptyBuilder: (count: number) => string;
}) {
  // Surface the "no party data" row explicitly when the group has
  // members but the electoral-list field is null/empty for some of
  // them — never hide it. Sum of party counts can exceed members_total
  // (coalition members count in every constituent party), so the
  // unknown count is derived from "members with no party rows at all",
  // not from membersTotal − sum(parties). We can't compute that here
  // (we'd need the raw rows), so we only show "Sense dada" when zero
  // parties were resolved.
  if (parties.length === 0) {
    return (
      <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: 0 }}>
        {emptyBuilder(membersTotal)}
      </p>
    );
  }
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, fontSize: 13 }}>
      {parties.map((p) => (
        <li
          key={p.name}
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) auto',
            padding: '6px 0',
            borderBottom: '1px solid var(--rule)',
            gap: 10,
          }}
        >
          <span style={{ color: 'var(--ink)', minWidth: 0, overflowWrap: 'anywhere' }}>{p.name}</span>
          <span className="tabular" style={{ color: 'var(--ink-2)' }}>
            {p.count}
          </span>
        </li>
      ))}
    </ul>
  );
}
