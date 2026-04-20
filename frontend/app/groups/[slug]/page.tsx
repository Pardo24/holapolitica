import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { GroupBadge } from '@/components/GroupBadge';
import { TopicBars } from '@/components/TopicBars';
import {
  api,
  ApiError,
  type GroupComposition,
  type GroupMemberRow,
  type ParliamentaryGroupSummary,
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
  try {
    [group, members, topicStats, composition] = await Promise.all([
      api.groups.get(slug),
      api.groups.members(slug),
      api.groups.topicStats(slug),
      // Composition is non-essential — if it fails (e.g. older backend
      // without the endpoint), the page still renders the rest.
      api.groups.composition(slug).catch(() => null),
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
          Grups
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
          <div className="eyebrow">Grup parlamentari</div>
          <h1
            className="h-display"
            style={{ margin: '6px 0 4px', fontSize: 'clamp(32px, 4.4vw, 48px)' }}
          >
            {fullName}
          </h1>
          <div style={{ fontSize: 14, color: 'var(--ink-3)' }}>
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
              <div className="eyebrow">Marca cívica</div>
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
                <a href={info.website} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--ink)' }}>
                  {info.website.replace(/^https?:\/\//, '').replace(/\/$/, '')} ↗
                </a>
              </FactRow>
            )}
            {info?.wikipedia_url && (
              <FactRow label={t('wikipedia')}>
                <a href={info.wikipedia_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--ink)' }}>
                  Wikipedia ↗
                </a>
              </FactRow>
            )}
            {group.color_hex && (
              <FactRow label="Color identificatiu">
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
        <CompositionSection composition={composition} groupColor={group.color_hex} />
      )}

      {/* Topic-stats */}
      <section style={{ paddingTop: 28 }}>
        <h2 className="h-title">Vot per tema</h2>
        <p style={{ fontSize: 12, color: 'var(--ink-3)', maxWidth: 760, marginTop: 0 }}>
          Per cada tema, percentatge de vots emesos pels membres del grup en
          sentit afirmatiu o negatiu. Denominador: vots emesos (Sí + No + Abst.).
        </p>
        <TopicBars
          rows={topicStats}
          emptyHint="Encara no hi ha prou dades del grup en iniciatives classificades. La cobertura creixerà a mesura que carreguem sessions històriques."
        />
      </section>

      <MembersSection
        members={members}
        groupColor={group.color_hex}
        groupSlug={group.slug}
        t={t}
      />

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
        gridTemplateColumns: '110px 1fr',
        padding: '8px 0',
        borderBottom: '1px solid var(--rule)',
        fontSize: 12,
        gap: 10,
      }}
    >
      <span className="eyebrow" style={{ fontSize: 10 }}>
        {label}
      </span>
      <span style={{ color: 'var(--ink-2)' }}>{children}</span>
    </div>
  );
}

function MembersSection({
  members,
  groupSlug,
  groupColor,
  t,
}: {
  members: GroupMemberRow[];
  groupSlug: string;
  groupColor: string | null;
  t: Awaited<ReturnType<typeof getTranslations<'group'>>>;
}) {
  if (members.length === 0) {
    return (
      <section style={{ paddingTop: 28 }}>
        <h2 className="h-title">{t('members_title')}</h2>
        <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>{t('no_members')}</p>
      </section>
    );
  }

  const withRole = members.filter((m) => m.role);
  const withoutRole = members.filter((m) => !m.role);
  const featuredCount = Math.max(12 - withRole.length, 0);
  const featured = [...withRole, ...withoutRole.slice(0, featuredCount)];
  const rest = withoutRole.slice(featuredCount);

  return (
    <section style={{ paddingTop: 28 }}>
      <h2 className="h-title">
        {t('members_title')}{' '}
        <span style={{ color: 'var(--ink-3)', fontWeight: 400, fontSize: 14 }}>
          ({members.length})
        </span>
      </h2>
      <ul
        style={{
          listStyle: 'none',
          margin: '12px 0 0',
          padding: 0,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 8,
        }}
      >
        {featured.map((m) => (
          <MemberRow key={m.person_id} member={m} groupSlug={groupSlug} groupColor={groupColor} />
        ))}
      </ul>
      {rest.length > 0 && (
        <details style={{ marginTop: 14 }}>
          <summary
            style={{
              cursor: 'pointer',
              fontSize: 13,
              color: 'var(--ink-2)',
              padding: '6px 12px',
              border: '1px solid var(--rule)',
              display: 'inline-block',
              listStyle: 'none',
            }}
          >
            {t('show_rest', { count: rest.length })}
          </summary>
          <ul
            style={{
              listStyle: 'none',
              marginTop: 12,
              padding: 0,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: 8,
            }}
          >
            {rest.map((m) => (
              <MemberRow key={m.person_id} member={m} groupSlug={groupSlug} groupColor={groupColor} />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
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

const GENDER_LABELS: Record<string, string> = {
  F: 'Dones',
  M: 'Homes',
  X: 'Altres',
  unknown: 'Sense dada',
};

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
const AGE_LABELS: Record<string, string> = {
  '<30': 'Menys de 30',
  '30-39': '30-39',
  '40-49': '40-49',
  '50-59': '50-59',
  '60+': '60 o més',
  unknown: 'Sense dada',
};

function CompositionSection({
  composition,
  groupColor,
}: {
  composition: GroupComposition;
  groupColor: string | null;
}) {
  return (
    <section style={{ paddingTop: 28 }}>
      <h2 className="h-title">Composició demogràfica</h2>
      <p style={{ fontSize: 12, color: 'var(--ink-3)', maxWidth: 760, marginTop: 0 }}>
        Distribució dels membres actuals del grup. Les categories &laquo;Sense
        dada&raquo; es mostren sempre — el buit és un fet sobre les fonts
        públiques, no una omissió.
      </p>
      <div
        className="composition-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 18,
          marginTop: 14,
        }}
      >
        <CompositionCard title="Gènere">
          <GenderDonut distribution={composition.gender_distribution} />
        </CompositionCard>
        <CompositionCard title="Edat">
          <AgeBars buckets={composition.age_buckets} accent={groupColor} />
        </CompositionCard>
        <CompositionCard title="Partits que el formen">
          <PartyList
            parties={composition.member_parties}
            membersTotal={composition.members_total}
          />
        </CompositionCard>
      </div>
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
}: {
  distribution: GroupComposition['gender_distribution'];
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
        aria-label={`Distribució de gènere: ${keys
          .map((k) => `${GENDER_LABELS[k]} ${distribution[k]}`)
          .join(', ')}`}
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
            <span style={{ color: 'var(--ink-2)' }}>{GENDER_LABELS[k]}</span>
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
}: {
  buckets: GroupComposition['age_buckets'];
  accent: string | null;
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
              aria-label={`${AGE_LABELS[k]}: ${value}`}
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
              {AGE_LABELS[k]}
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
}: {
  parties: GroupComposition['member_parties'];
  membersTotal: number;
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
        Sense dada de partit electoral per a cap dels {membersTotal} membres.
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
            gridTemplateColumns: '1fr auto',
            padding: '6px 0',
            borderBottom: '1px solid var(--rule)',
            gap: 10,
          }}
        >
          <span style={{ color: 'var(--ink)' }}>{p.name}</span>
          <span className="tabular" style={{ color: 'var(--ink-2)' }}>
            {p.count}
          </span>
        </li>
      ))}
    </ul>
  );
}

function MemberRow({
  member,
  groupSlug,
  groupColor,
}: {
  member: GroupMemberRow;
  groupSlug: string;
  groupColor: string | null;
}) {
  return (
    <li>
      <Link
        href={`/persons/${member.person_id}`}
        prefetch={false}
        style={{
          display: 'flex',
          gap: 10,
          padding: 10,
          border: '1px solid var(--rule)',
          background: 'var(--paper)',
          textDecoration: 'none',
          color: 'inherit',
        }}
      >
        <GroupBadge slug={groupSlug} color={groupColor} size="xs" link={false} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{member.full_name}</div>
          <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>
            {member.constituency}
            {member.role && (
              <>
                {member.constituency ? ' · ' : ''}
                <span style={{ fontStyle: 'italic' }}>{member.role}</span>
              </>
            )}
          </div>
        </div>
      </Link>
    </li>
  );
}
