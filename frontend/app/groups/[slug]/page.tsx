import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ArrowUpRight } from 'lucide-react';

import { GroupCompositionFilter } from '@/components/GroupCompositionFilter';
import { TopicBars } from '@/components/TopicBars';
import {
  api,
  ApiError,
  type GroupComposition,
  type GroupMemberRow,
  type ParliamentaryGroupSummary,
  type Topic,
  type TopicVoteStat,
} from '@/lib/api';
import { displayGroupFullName, groupAbbreviation, groupInfo } from '@/lib/groups';

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

  let group: ParliamentaryGroupSummary;
  let members: GroupMemberRow[] = [];
  let topicStats: TopicVoteStat[] = [];
  let composition: GroupComposition | null = null;
  let allTopics: Topic[] = [];
  try {
    [group, members, topicStats, composition, allTopics] = await Promise.all([
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
    ]);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }

  const info = groupInfo(group.slug);
  const fullName = displayGroupFullName(group.slug, group.name_long);

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
  return (
    // One cohesive section, no boxed cards. Parity reads as a single
    // stacked bar; age + parties as horizontal proportion bars. The
    // previous donut + stubby vertical bars in bordered "cards" read
    // as cramped widgets pasted onto the page — this flows with it.
    <section style={{ paddingTop: 28 }}>
      <h2 className="h-title">{labels.title}</h2>
      <p style={{ fontSize: 12, color: 'var(--ink-3)', maxWidth: 760, marginTop: 0 }}>
        {labels.intro}
      </p>

      {/* Parity — a single horizontal stacked bar + inline legend. */}
      <div style={{ marginTop: 22, maxWidth: 620 }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>
          {labels.gender}
        </div>
        <GenderBar
          distribution={composition.gender_distribution}
          genderLabels={genderLabels}
          ariaBuilder={labels.gender_distribution_aria}
        />
      </div>

      {/* Age + parties — horizontal bars, side-by-side on desktop so a
          reader can scan age distribution next to the constituent-party
          breakdown that often explains it. No card chrome. */}
      <div
        className="composition-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 40,
          marginTop: 28,
        }}
      >
        <div>
          <div className="eyebrow" style={{ marginBottom: 12 }}>
            {labels.age}
          </div>
          <AgeBars
            buckets={composition.age_buckets}
            accent={groupColor}
            ageLabels={ageLabels}
            ariaBuilder={labels.age_bucket_aria}
          />
        </div>
        <div>
          <div className="eyebrow" style={{ marginBottom: 12 }}>
            {labels.parties}
          </div>
          <PartyList
            parties={composition.member_parties}
            membersTotal={composition.members_total}
            accent={groupColor}
            emptyBuilder={labels.no_party_data}
          />
        </div>
      </div>
      <style>{`
        @media (max-width: 760px) {
          .composition-grid { grid-template-columns: 1fr !important; gap: 28px !important; }
        }
      `}</style>
    </section>
  );
}

function GenderBar({
  distribution,
  genderLabels,
  ariaBuilder,
}: {
  distribution: GroupComposition['gender_distribution'];
  genderLabels: Record<string, string>;
  ariaBuilder: (summary: string) => string;
}) {
  // Legend always lists the four buckets including ``unknown`` so an
  // asymmetry can't be hidden by dropping a category (CLAUDE.md symmetry
  // rule). A zero-total degrades to an empty grey track.
  const keys: Array<'F' | 'M' | 'X' | 'unknown'> = ['F', 'M', 'X', 'unknown'];
  const total = keys.reduce((acc, k) => acc + distribution[k], 0);
  return (
    <div>
      <div
        role="img"
        aria-label={ariaBuilder(
          keys.map((k) => `${genderLabels[k]} ${distribution[k]}`).join(', '),
        )}
        style={{
          display: 'flex',
          height: 16,
          borderRadius: 8,
          overflow: 'hidden',
          background: 'var(--paper-2)',
        }}
      >
        {total > 0 &&
          keys.map((k) => {
            const v = distribution[k];
            if (v === 0) return null;
            return (
              <div
                key={k}
                style={{
                  width: `${(v / total) * 100}%`,
                  background: GENDER_COLORS[k],
                  opacity: k === 'unknown' ? 0.55 : 1,
                }}
              />
            );
          })}
      </div>
      <ul
        style={{
          listStyle: 'none',
          margin: '12px 0 0',
          padding: 0,
          fontSize: 12,
          display: 'flex',
          flexWrap: 'wrap',
          gap: '6px 18px',
        }}
      >
        {keys.map((k) => {
          const v = distribution[k];
          const pct = total > 0 ? Math.round((v / total) * 100) : 0;
          return (
            <li key={k} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span
                aria-hidden="true"
                style={{
                  width: 9,
                  height: 9,
                  background: GENDER_COLORS[k],
                  opacity: k === 'unknown' ? 0.55 : 1,
                  display: 'inline-block',
                  borderRadius: 2,
                  flex: 'none',
                }}
              />
              <span style={{ color: 'var(--ink-2)' }}>{genderLabels[k]}</span>
              <span className="tabular" style={{ color: 'var(--ink)', fontWeight: 600 }}>
                {v}
              </span>
              <span className="tabular" style={{ color: 'var(--ink-3)' }}>
                · {pct}%
              </span>
            </li>
          );
        })}
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
  // Horizontal proportion bars (one row per bucket). Reads far better
  // than the old vertical stubs: labels are legible, zero-buckets are
  // visible as an empty track rather than a 2px sliver.
  const max = Math.max(1, ...AGE_BUCKET_ORDER.map((k) => buckets[k]));
  const fill = accent ?? 'var(--ink-2)';
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {AGE_BUCKET_ORDER.map((k) => {
        const value = buckets[k];
        const pct = (value / max) * 100;
        return (
          <li
            key={k}
            style={{
              display: 'grid',
              gridTemplateColumns: '58px minmax(0, 1fr) 28px',
              gap: 10,
              alignItems: 'center',
            }}
          >
            <span style={{ fontSize: 11, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>
              {ageLabels[k] ?? k}
            </span>
            <div
              role="img"
              aria-label={ariaBuilder(ageLabels[k] ?? k, value)}
              style={{ height: 10, borderRadius: 5, background: 'var(--paper-2)', overflow: 'hidden' }}
            >
              <div
                style={{
                  width: `${pct}%`,
                  height: '100%',
                  background: fill,
                  opacity: k === 'unknown' ? 0.5 : 1,
                  borderRadius: 5,
                  minWidth: value > 0 ? 4 : 0,
                }}
              />
            </div>
            <span
              className="tabular"
              style={{ fontSize: 12, color: 'var(--ink-2)', textAlign: 'right' }}
            >
              {value}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function PartyList({
  parties,
  membersTotal,
  accent,
  emptyBuilder,
}: {
  parties: GroupComposition['member_parties'];
  membersTotal: number;
  accent: string | null;
  emptyBuilder: (count: number) => string;
}) {
  // Same horizontal-bar language as AgeBars so the two columns read as
  // one visual family. Sum of party counts can exceed members_total
  // (coalition members count in every constituent party), so we scale
  // bars to the max single-party count, not the total.
  if (parties.length === 0) {
    return (
      <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: 0 }}>
        {emptyBuilder(membersTotal)}
      </p>
    );
  }
  const max = Math.max(1, ...parties.map((p) => p.count));
  const fill = accent ?? 'var(--ink-2)';
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {parties.map((p) => (
        <li
          key={p.name}
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) 28px',
            gap: 10,
            alignItems: 'center',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <span
              style={{
                fontSize: 12.5,
                color: 'var(--ink)',
                display: 'block',
                overflowWrap: 'anywhere',
                marginBottom: 4,
              }}
            >
              {p.name}
            </span>
            <div style={{ height: 8, borderRadius: 4, background: 'var(--paper-2)', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${(p.count / max) * 100}%`,
                  height: '100%',
                  background: fill,
                  borderRadius: 4,
                  minWidth: 4,
                }}
              />
            </div>
          </div>
          <span
            className="tabular"
            style={{ fontSize: 12, color: 'var(--ink-2)', textAlign: 'right', alignSelf: 'start' }}
          >
            {p.count}
          </span>
        </li>
      ))}
    </ul>
  );
}

