import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import type { Route } from 'next';
import { ArrowUpRight, MapPin } from 'lucide-react';


import { GlossaryTerm } from '@/components/GlossaryTerm';
import { GroupChip } from '@/components/GroupChip';
import { PersonVotes } from '@/components/PersonVotes';
import { TopicBars } from '@/components/TopicBars';
import {
  api,
  ApiError,
  type Mandate,
  type Person,
  type PersonKPIs,
  type Topic,
  type TopicVoteStat,
} from '@/lib/api';
import { formatDayMonthYear, splitRoleSince } from '@/lib/dates';
import { displayGroupShort } from '@/lib/groups';
import { pickTopicName } from '@/lib/topics';

interface Params {
  id: string;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { id } = await params;
  const personId = Number(id);
  if (!Number.isFinite(personId)) return {};
  const t = await getTranslations('person');
  try {
    const p = await api.persons.get(personId);
    const groupBit = p.current_group_short
      ? ` · ${p.current_group_short}`
      : '';
    const constBit = p.current_constituency ? ` · ${p.current_constituency}` : '';
    const description = t('metadata_description', {
      name: p.full_name,
      groupBit,
      constBit,
    });
    return {
      title: p.full_name,
      description,
      openGraph: {
        title: p.full_name,
        description,
        type: 'profile',
      },
      twitter: {
        card: 'summary_large_image',
        title: p.full_name,
        description,
      },
    };
  } catch {
    return {};
  }
}

export default async function PersonDetailPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<{ tab?: string; tema?: string; page?: string }>;
}) {
  const { id } = await params;
  const personId = Number(id);
  if (!Number.isFinite(personId)) notFound();
  const sp = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? '') ? (sp.tab as Tab) : 'votacions';
  const topicSlug = sp.tema && /^[a-z0-9-]+$/.test(sp.tema) ? sp.tema : null;
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);

  const t = await getTranslations('person');
  const locale = await getLocale();

  let person: Person;
  let mandates: Mandate[] = [];
  let topicStats: TopicVoteStat[] = [];
  let kpis: PersonKPIs;
  let allTopics: Topic[] = [];
  try {
    [person, mandates, topicStats, kpis, allTopics] = await Promise.all([
      api.persons.get(personId),
      api.persons.mandates(personId),
      api.persons.topicStats(personId),
      api.persons.kpis(personId),
      // Used by TopicBars to localise per-topic names.
      api.topics.list().catch(() => [] as Topic[]),
    ]);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  // The votes list behind the two vote tabs; its totals also label the tabs.
  const votesPage = await api.persons
    .votes(personId, {
      dissent: tab === 'trenca',
      topic_slug: tab === 'votacions' || tab === 'trenca' ? (topicSlug ?? undefined) : undefined,
      page: tab === 'votacions' || tab === 'trenca' ? page : 1,
    })
    .catch(() => null);

  const wikiSearch = `https://es.wikipedia.org/w/index.php?search=${encodeURIComponent(
    person.full_name + ' diputado',
  )}`;
  // Prefer the locale-matched Wikipedia URL surfaced by the Wikidata
  // enrichment worker, falling back through CA, ES, EN.
  const enrichedWiki =
    (locale === 'ca' && person.wikipedia_url_ca) ||
    (locale === 'es' && person.wikipedia_url_es) ||
    (locale === 'en' && person.wikipedia_url_en) ||
    person.wikipedia_url_ca ||
    person.wikipedia_url_es ||
    person.wikipedia_url_en ||
    null;
  const wikiSummary =
    (locale === 'ca' && person.wikipedia_summary_ca) ||
    (locale === 'es' && person.wikipedia_summary_es) ||
    (locale === 'en' && person.wikipedia_summary_en) ||
    person.wikipedia_summary_ca ||
    person.wikipedia_summary_es ||
    person.wikipedia_summary_en ||
    null;

  // The deputy's busiest topics, named in the reader's language, for the
  // filter chips of the vote tabs.
  const topicBySlug = new Map(allTopics.map((tp) => [tp.slug, tp]));
  const topicChips = [...topicStats]
    // Editorial themes only, as on every other chip of the site.
    .filter((r) => topicBySlug.get(r.topic_slug)?.kind !== 'sdg')
    .sort((a, b) => b.cast - a.cast)
    .slice(0, 8)
    .map((r) => {
      const tp = topicBySlug.get(r.topic_slug);
      return {
        slug: r.topic_slug,
        name: tp ? pickTopicName(tp, locale) : r.topic_name_ca,
        color: r.topic_color_hex,
      };
    });

  const base = `/persons/${person.id}`;
  const tabHref = (k: Tab) => (k === 'votacions' ? base : `${base}?tab=${k}`) as Route;
  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'votacions', label: t('tab_votes'), count: votesPage?.all_total },
    { key: 'trenca', label: t('tab_dissent'), count: votesPage?.dissent_total },
    { key: 'temes', label: t('tab_topics') },
    { key: 'trajectoria', label: t('tab_career') },
  ];

  return (
    <article className="dep">
      {/* Breadcrumb */}
      <div className="crumbs" style={{ fontSize: 12, color: 'var(--ink-3)', paddingTop: 18 }}>
        <Link href="/el-teu-diputat?tab=tots" style={{ color: 'var(--ink-2)' }}>
          {t('breadcrumb_persons')}
        </Link>
      </div>

      {/* The card: photo, name, party, province, role and the links out,
          in the party's colour, then the three numbers as tiles. */}
      <header className="dep-hero" style={{ ['--party' as string]: person.current_group_color ?? 'var(--ink-3)' }}>
        <div className="dep-hero__photo">
          {person.photo_url ? (
            // Served by congreso.es, small and cached; no next/image pass.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={person.photo_url} alt="" width={132} height={165} />
          ) : (
            <span aria-hidden="true">{personInitials(person.full_name)}</span>
          )}
        </div>
        <div className="dep-hero__body">
          <h1 className="dep-hero__name">{person.full_name}</h1>
          <div className="dep-hero__facts">
            {person.current_group_short && person.current_group_slug && (
              <GroupChip
                slug={person.current_group_slug}
                short={displayGroupShort(person.current_group_short)}
                color={person.current_group_color}
                size="md"
              />
            )}
            {person.current_constituency && (
              <span className="dep-hero__fact">
                <MapPin size={14} aria-hidden="true" />
                {person.current_constituency}
              </span>
            )}
            {person.birth_year && (
              <span className="dep-hero__fact">
                {t('born_in')} {person.birth_year}
              </span>
            )}
          </div>
          {person.role_title && <div className="dep-hero__role">{person.role_title}</div>}
          <div className="dep-hero__links">
            {person.biography_url && (
              <a
                href={person.biography_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: 13,
                  color: 'var(--ink)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                {t('biography_link')} <ArrowUpRight size={14} aria-hidden="true" />
              </a>
            )}
            {enrichedWiki ? (
              <a
                href={enrichedWiki}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: 13,
                  color: 'var(--ink)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                {t('wikipedia_link')} <ArrowUpRight size={14} aria-hidden="true" />
              </a>
            ) : (
              !person.biography_url && (
                <a
                  href={wikiSearch}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: 13,
                    color: 'var(--ink)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  {t('wikipedia_search')} <ArrowUpRight size={14} aria-hidden="true" />
                </a>
              )
            )}
          </div>
        </div>
      </header>

      <KpiStrip kpis={kpis} t={t} />

      {person.role_kind && (() => {
        const fullText =
          person.role_kind === 'govern'
            ? `Aquest diputat ostenta el càrrec de ${person.role_title ?? 'membre del Govern'}. Per convenció parlamentària, el President del Govern i els ministres no participen en la majoria de votacions ordinàries del Ple. Comparar els seus vots emesos amb els d'un diputat sense càrrec executiu és enganyós.`
            : `Aquest diputat és ${person.role_title ?? 'membre de la Mesa del Congrés'}. La Mesa té funcions de presidència i moderació que modifiquen el patró habitual de vot.`;
        // One-sentence summary used on mobile. The full text is one tap
        // away inside a native <details>, so transparency isn't lost —
        // just deferred. On desktop the full caveat stays inline because
        // the page has the room for it.
        const shortText =
          person.role_kind === 'govern'
            ? `${person.role_title ?? 'Membre del Govern'} — vots emesos no comparables amb un diputat regular.`
            : `${person.role_title ?? 'Membre de la Mesa'} — patró de vot diferent al d'un diputat regular.`;
        return (
          <div
            role="note"
            style={{
              marginTop: 12,
              padding: '12px 14px',
              background: 'var(--paper-2)',
              border: '1px solid var(--rule-strong)',
              borderRadius: 10,
              fontSize: 13,
              lineHeight: 1.5,
              color: 'var(--ink-2)',
            }}
          >
            {/* Desktop: full caveat inline. Mobile-only fallback below
                uses <details> so the summary collapses to one sentence
                and the long explanation expands on tap. */}
            <div className="hidden sm:block">
              <strong style={{ color: 'var(--ink)' }}>
                Avís sobre aquestes mètriques.
              </strong>{' '}
              {fullText}
            </div>
            <details className="sm:hidden">
              <summary
                style={{
                  cursor: 'pointer',
                  listStyle: 'none',
                  display: 'block',
                }}
              >
                <strong style={{ color: 'var(--ink)' }}>
                  Avís sobre aquestes mètriques.
                </strong>{' '}
                <span>{shortText}</span>{' '}
                <span style={{ color: 'var(--ink-3)' }}>…</span>
              </summary>
              <div style={{ marginTop: 8 }}>{fullText}</div>
            </details>
          </div>
        );
      })()}

      {/* Tabs: links, so each one has its own URL and works without JS. */}
      <nav className="dep-tabs dep-tabs--four" aria-label={t('tabs_aria')}>
        {tabs.map((tb) => (
          <Link
            key={tb.key}
            href={tabHref(tb.key)}
            aria-current={tab === tb.key ? 'page' : undefined}
            className={tab === tb.key ? 'is-active' : undefined}
            scroll={false}
          >
            {tb.label}
            {tb.count != null && <span className="tabular">{tb.count}</span>}
          </Link>
        ))}
      </nav>

      {(tab === 'votacions' || tab === 'trenca') && (
        <PersonVotes
          data={votesPage}
          locale={locale}
          baseHref={tab === 'trenca' ? `${base}?tab=trenca` : `${base}?`}
          topicSlug={topicSlug}
          topics={topicChips}
          dissentTab={tab === 'trenca'}
        />
      )}

      {tab === 'temes' && (
        <section className="dep-panel">
          <h2 className="h-title">{t('vote_by_topic_title')}</h2>
          <p className="dep-panel__dek">{t('vote_by_topic_subtitle')}</p>
          <StanceArc rows={topicStats} locale={locale} t={t} />
          <TopicBars
            rows={topicStats}
            emptyHint={t('vote_by_topic_empty_hint')}
            allTopics={allTopics}
          />
        </section>
      )}

      {tab === 'trajectoria' && (
        <section className="dep-panel dep-career">
          {(person.profession || person.education) && (
            <dl className="law-facts">
              {person.profession && (
                <div>
                  <dt>{t('profession_label')}</dt>
                  <dd>{person.profession}</dd>
                </div>
              )}
              {person.education && (
                <div>
                  <dt>{t('education_label')}</dt>
                  <dd>{person.education}</dd>
                </div>
              )}
            </dl>
          )}
          {wikiSummary && (
            <div className="dep-career__wiki">
              <p className="serif">{wikiSummary}</p>
              {enrichedWiki && (
                <p className="dep-career__source">
                  {t('wikipedia_attribution')}{' '}
                  <a href={enrichedWiki} target="_blank" rel="noopener noreferrer">
                    Wikipedia
                  </a>
                </p>
              )}
            </div>
          )}
          <PersonBio
            bioText={person.bio_text}
            commissions={person.commissions}
            labels={{
              eyebrow: t('bio_eyebrow'),
              sectionAria: t('bio_section_aria'),
              sourceNote: t('bio_source_note'),
              commissionsTitle: t('commissions_title'),
              commissionsEmpty: t('commissions_empty'),
              since: (date) => t('role_since', { date }),
            }}
            locale={locale}
          />
          <div style={{ paddingTop: 28 }}>
            <div className="eyebrow" style={{ marginBottom: 6 }}>
              {t('mandates_title')}
            </div>
            {mandates.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>{t('no_mandates')}</p>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {mandates.map((m) => (
                  <MandateLi
                    key={m.id}
                    mandate={m}
                    locale={locale}
                    labels={{
                      dates: t('mandate_dates', {
                        from: formatDayMonthYear(m.start_date, locale),
                        to: m.end_date ? formatDayMonthYear(m.end_date, locale) : t('mandate_current'),
                      }),
                      constituency: t('constituency'),
                      list: t('list'),
                    }}
                  />
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      <style>{`
        @media (max-width: 720px) {
          .person-header { grid-template-columns: 1fr !important; gap: 16px !important; }
          .person-header img,
          .person-header > div:first-child { width: 100% !important; max-width: 192px; }
        }
        @media (max-width: 560px) {
          /* Stance arc — on narrow viewports the topic name + phrase
             were sharing a single row, squeezing the phrase into many
             4-word lines. Stack vertically so each row gets one line
             for the topic chip and full width for the sentence. */
          .stance-arc-row {
            grid-template-columns: 1fr !important;
            gap: 4px !important;
            padding: 10px 0 !important;
          }
        }
      `}</style>
    </article>
  );
}

const TABS = ['votacions', 'trenca', 'temes', 'trajectoria'] as const;
type Tab = (typeof TABS)[number];

/** Single mandate row — extracted so both the visible-first-3 list
 *  and the inside-details "show more" list share one implementation
 *  and stay in visual lockstep. */
function MandateLi({
  mandate,
  locale: _locale,
  labels,
}: {
  mandate: Mandate;
  locale: string;
  labels: { dates: string; constituency: string; list: string };
}) {
  return (
    <li
      style={{
        borderBottom: '1px solid var(--rule)',
        padding: '10px 0',
        fontSize: 13,
        display: 'flex',
        gap: 18,
        flexWrap: 'wrap',
      }}
    >
      <span className="tabular" style={{ fontWeight: 600 }}>
        {labels.dates}
      </span>
      {mandate.constituency && (
        <span style={{ color: 'var(--ink-3)' }}>
          {labels.constituency}: {mandate.constituency}
        </span>
      )}
      {mandate.electoral_list_party && (
        <span style={{ color: 'var(--ink-3)' }}>
          {labels.list}: {mandate.electoral_list_party}
        </span>
      )}
    </li>
  );
}

/**
 * "Stance arc" — a single sentence per topic describing how the
 * deputy has voted on classified initiatives in that area. Inspired
 * by TheyWorkForYou's plain-language voting record but kept strictly
 * descriptive (no opinion words like "supported" / "opposed"): we
 * state the literal vote-choice breakdown and leave interpretation
 * to the reader.
 *
 * Only the top 5 topics by vote count are surfaced so the section
 * doesn't dwarf the bar chart that follows. Topics with fewer than
 * 3 votes are also suppressed — a single Aye carries no signal.
 */
function StanceArc({
  rows,
  locale,
  t,
}: {
  rows: TopicVoteStat[];
  locale: string;
  t: Awaited<ReturnType<typeof getTranslations<'person'>>>;
}) {
  // Cast = ayes + noes + abstentions (no_vote = absent, not counted).
  // Sort by cast desc; keep the heaviest 5; skip anything <3 votes
  // because the single-vote case isn't a "pattern".
  const ranked = [...rows]
    .filter((r) => r.cast >= 3)
    .sort((a, b) => b.cast - a.cast)
    .slice(0, 5);
  if (ranked.length === 0) return null;
  return (
    <section
      style={{
        margin: '0 0 22px',
        padding: '14px 18px',
        background: 'var(--paper-2)',
        border: '1px solid var(--rule)',
      }}
    >
      <div
        className="eyebrow"
        style={{ fontSize: 10, marginBottom: 8, color: 'var(--ink-3)' }}
      >
        {t('stance_arc_eyebrow')}
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {ranked.map((row) => {
          const name =
            (locale === 'es' && (row as { topic_name_es?: string }).topic_name_es) ||
            (locale === 'en' && (row as { topic_name_en?: string }).topic_name_en) ||
            row.topic_name_ca;
          // Pick whichever stance (Sí / No / Abst.) the deputy used
          // most often. Ties fall back to the order ayes > noes >
          // abstentions which is meaningless on its own but stable.
          const choices: { key: 'ayes' | 'noes' | 'abstentions'; n: number }[] = [
            { key: 'ayes', n: row.ayes },
            { key: 'noes', n: row.noes },
            { key: 'abstentions', n: row.abstentions },
          ];
          choices.sort((a, b) => b.n - a.n);
          const top = choices[0]!;
          const share = top.n / row.cast;
          let intensity: 'majority' | 'mostly' | 'mixed';
          if (share >= 0.75) intensity = 'majority';
          else if (share >= 0.55) intensity = 'mostly';
          else intensity = 'mixed';
          // Two parts: a short headline phrase ("Majoritàriament a
          // favor") rendered prominently, and the per-choice counts
          // rendered smaller with semantic colours below. Daniel
          // wanted the phrase to land first and the numbers to play a
          // supporting role, not the other way round — and to avoid
          // the previous "wall of comma-separated coloured digits"
          // that became hard to read across many rows.
          const phraseKey =
            intensity === 'mixed'
              ? 'stance_phrase_mixed'
              : `stance_phrase_${intensity}_${top.key}`;
          const phrase = t(phraseKey);
          return (
            <li
              key={row.topic_slug}
              className="stance-arc-row"
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 180px) minmax(0, 1fr)',
                gap: 16,
                alignItems: 'center',
                padding: '12px 0',
                borderTop: '1px solid var(--rule)',
                fontSize: 13.5,
                lineHeight: 1.4,
              }}
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontWeight: 600,
                  color: 'var(--ink)',
                  minWidth: 0,
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    background: row.topic_color_hex ?? 'var(--ink-3)',
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
                  {name}
                </span>
              </span>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: 'var(--ink)',
                    letterSpacing: '-0.005em',
                  }}
                >
                  {phrase}
                </div>
                <div
                  style={{
                    marginTop: 3,
                    fontSize: 11,
                    color: 'var(--ink-3)',
                    display: 'inline-flex',
                    alignItems: 'baseline',
                    gap: 8,
                    flexWrap: 'wrap',
                  }}
                  className="tabular"
                >
                  {row.ayes > 0 && (
                    <span style={{ color: 'var(--aye)', fontWeight: 600 }}>
                      Sí {row.ayes}
                    </span>
                  )}
                  {row.noes > 0 && (
                    <span style={{ color: 'var(--no)', fontWeight: 600 }}>
                      No {row.noes}
                    </span>
                  )}
                  {row.abstentions > 0 && (
                    <span style={{ color: 'var(--abst)', fontWeight: 600 }}>
                      Abst. {row.abstentions}
                    </span>
                  )}
                  <span style={{ color: 'var(--ink-3)' }}>
                    · {row.cast} total
                  </span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function KpiStrip({
  kpis,
  t,
}: {
  kpis: PersonKPIs;
  t: Awaited<ReturnType<typeof getTranslations<'person'>>>;
}) {
  const empty = kpis.votes_total === 0;
  if (empty) {
    return (
      <p style={{ fontSize: 13, color: 'var(--ink-3)', paddingTop: 18 }}>
        {t('kpi_no_votes_yet')}
      </p>
    );
  }
  return (
    <section className="dep-kpis">
      <div className="kpi">
        <span className="label">{t('kpi_votes_cast_label')}</span>
        <span className="value tabular">{kpis.votes_cast}</span>
        <span className="sub">{t('kpi_of_possible', { total: kpis.votes_total })}</span>
      </div>
      <div className="kpi">
        <span className="label">
          <GlossaryTerm term="Vots emesos">{t('kpi_attendance_label')}</GlossaryTerm>
        </span>
        <span className="value tabular">
          {kpis.attendance_pct === null ? '—' : `${(kpis.attendance_pct * 100).toFixed(0)}%`}
        </span>
        <span className="sub">
          {t('kpi_attendance_sub', { cast: kpis.votes_cast, total: kpis.votes_total })}
        </span>
      </div>
      <div className="kpi">
        <span className="label">
          <GlossaryTerm term="Dissidència">{t('kpi_dissidence_label')}</GlossaryTerm>
        </span>
        <span className="value tabular">
          {kpis.dissidence_pct === null ? '—' : `${(kpis.dissidence_pct * 100).toFixed(0)}%`}
        </span>
        <span className="sub">
          {kpis.dissidence_pct === null
            ? t('kpi_no_comparable')
            : t('kpi_dissents_count', { count: kpis.dissents })}
        </span>
      </div>
    </section>
  );
}

/**
 * Biography + commissions section.
 *
 * Renders below the KPI strip and above the mandates list. The whole
 * block is wrapped in a single ``<details>`` so the long-form
 * paragraph + role list collapses on demand. Following the brief:
 *
 * - **Desktop** (≥ 720px): open by default — there's room for it and
 *   the bio is one of the most useful disambiguators a user looking
 *   at a deputy page wants.
 * - **Mobile** (< 720px): closed by default — the page is already
 *   tall with KPI + topic stats, and most mobile users won't read the
 *   bio inline.
 *
 * Implementation: render ``<details open>`` on the server (open
 * everywhere), then a tiny inline script collapses it on narrow
 * viewports before paint. Pure CSS can't toggle ``<details open>``
 * because the open state is part of the DOM, not a style.
 *
 * Returns ``null`` when there's no bio and no commissions to show, so
 * the layout doesn't render an empty header.
 */
function PersonBio({
  bioText,
  commissions,
  labels,
  locale,
}: {
  locale: string;
  bioText: string | null;
  commissions: string[] | null;
  labels: {
    eyebrow: string;
    sectionAria: string;
    sourceNote: string;
    commissionsTitle: string;
    commissionsEmpty: string;
    since: (date: string) => string;
  };
}) {
  const hasBio = bioText !== null && bioText.trim().length > 0;
  const hasCommissions = Array.isArray(commissions) && commissions.length > 0;
  // Per the brief: "For empty data (bio_text NULL), don't render the
  // section at all." We extend that to "and no commissions either" —
  // if both fields are empty the section is purely chrome.
  if (!hasBio && !hasCommissions) return null;

  // Split on a blank-line boundary (the persistence format
  // ``app.ingest.congreso.photos._extract_bio_text`` produces). Falls
  // back to a single paragraph when the source didn't include any
  // ``<br>`` breaks — never throw away the text.
  const paragraphs = hasBio
    ? bioText!
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean)
    : [];

  return (
    <section
      aria-label={labels.sectionAria}
      style={{ paddingTop: 28 }}
    >
      <details id="person-bio-details" open>
        <summary
          className="person-bio-summary"
          style={{
            cursor: 'pointer',
            listStyle: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            paddingBottom: 6,
          }}
        >
          <span className="eyebrow">{labels.eyebrow}</span>
          <span
            aria-hidden="true"
            className="person-bio-chevron"
            style={{ fontSize: 14, color: 'var(--ink-3)' }}
          >
            ▾
          </span>
        </summary>
        <div style={{ paddingTop: 4 }}>
          {hasBio && (
            <div style={{ maxWidth: 760 }}>
              {paragraphs.map((p, i) => (
                <p
                  key={i}
                  style={{
                    margin: i === 0 ? '0 0 10px' : '10px 0',
                    fontSize: 14,
                    lineHeight: 1.55,
                    color: 'var(--ink)',
                  }}
                >
                  {p}
                </p>
              ))}
              <p
                style={{
                  margin: '8px 0 0',
                  fontSize: 11,
                  color: 'var(--ink-3)',
                  fontStyle: 'italic',
                }}
              >
                {labels.sourceNote}
              </p>
            </div>
          )}
          {hasCommissions && (
            <div style={{ marginTop: hasBio ? 20 : 0 }}>
              <div
                className="eyebrow"
                style={{ marginBottom: 8, fontSize: 10 }}
              >
                {labels.commissionsTitle}
              </div>
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
                {commissions!.map((c, i) => (
                  <li
                    key={i}
                    style={{
                      fontSize: 13,
                      color: 'var(--ink-2)',
                      padding: '6px 10px',
                      background: 'var(--paper-2)',
                      border: '1px solid var(--rule)',
                      borderRadius: 6,
                      lineHeight: 1.4,
                    }}
                  >
                    {(() => {
                      const { role, since } = splitRoleSince(c);
                      return (
                        <>
                          {role}
                          {since && (
                            <span style={{ display: 'block', fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>
                              {labels.since(formatDayMonthYear(since, locale))}
                            </span>
                          )}
                        </>
                      );
                    })()}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </details>
      <style>{`
        .person-bio-summary::-webkit-details-marker { display: none; }
        details#person-bio-details[open] .person-bio-chevron {
          transform: rotate(180deg);
          display: inline-block;
        }
      `}</style>
      {/*
        Close the bio details on narrow viewports before paint, so
        mobile users see it collapsed by default. We never use
        ``window.matchMedia`` inside the React tree because that would
        require a Client Component just for this one progressive
        enhancement; a one-liner inline script keeps the surrounding
        section a Server Component.
      */}
      <script
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html:
            "(function(){try{var d=document.getElementById('person-bio-details');" +
            "if(d&&window.matchMedia('(max-width: 720px)').matches){d.removeAttribute('open');}}catch(_){}})();",
        }}
      />
    </section>
  );
}

function personInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]!;
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  const last = parts[parts.length - 1]!;
  return (first.charAt(0) + last.charAt(0)).toUpperCase();
}
