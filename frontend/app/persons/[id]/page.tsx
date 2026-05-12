import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { ArrowUpRight } from 'lucide-react';


import { GlossaryTerm } from '@/components/GlossaryTerm';
import { GroupChip } from '@/components/GroupChip';
import { TopicBars } from '@/components/TopicBars';
import {
  api,
  ApiError,
  type Mandate,
  type Person,
  type PersonKPIs,
  type TopicVoteStat,
} from '@/lib/api';
import { displayGroupShort } from '@/lib/groups';

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
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  const personId = Number(id);
  if (!Number.isFinite(personId)) notFound();

  const t = await getTranslations('person');
  const locale = await getLocale();

  let person: Person;
  let mandates: Mandate[] = [];
  let topicStats: TopicVoteStat[] = [];
  let kpis: PersonKPIs;
  try {
    [person, mandates, topicStats, kpis] = await Promise.all([
      api.persons.get(personId),
      api.persons.mandates(personId),
      api.persons.topicStats(personId),
      api.persons.kpis(personId),
    ]);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }

  const wikiSearch = `https://es.wikipedia.org/w/index.php?search=${encodeURIComponent(
    person.full_name + ' diputado',
  )}`;

  return (
    <article>
      {/* Breadcrumb */}
      <div style={{ fontSize: 12, color: 'var(--ink-3)', paddingTop: 18 }}>
        <Link href="/persons" style={{ color: 'var(--ink-2)' }}>
          {t('breadcrumb_persons')}
        </Link>
      </div>

      <header
        className="person-header"
        style={{
          display: 'grid',
          gridTemplateColumns: '192px 1fr',
          gap: 28,
          paddingTop: 18,
          paddingBottom: 24,
          borderBottom: '1px solid var(--ink)',
          alignItems: 'flex-start',
        }}
      >
        {person.photo_url ? (
          // Photo is served by congreso.es with predictable dimensions; next/image
          // would require domain allowlisting + a separate optimizer pass. The
          // ficha photos are already small (~30-60 KB) and cached aggressively
          // by Caddy in front of the API.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={person.photo_url}
            alt=""
            width={192}
            height={240}
            style={{
              width: 192,
              height: 240,
              objectFit: 'cover',
              border: '1px solid var(--rule)',
              background: 'var(--paper-2)',
            }}
          />
        ) : (
          <div
            style={{
              width: 192,
              height: 240,
              border: '1px solid var(--rule)',
              background: 'var(--paper-2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 56,
              fontWeight: 600,
              color: 'var(--ink-3)',
            }}
            aria-hidden="true"
          >
            {personInitials(person.full_name)}
          </div>
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            <h1 className="h-headline" style={{ margin: 0 }}>
              {person.full_name}
            </h1>
            <span
              className="eyebrow"
              style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 600 }}
            >
              {t('person_eyebrow')}
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 8,
              fontSize: 13,
              color: 'var(--ink-2)',
            }}
          >
            {person.current_group_short && person.current_group_slug && (
              <GroupChip
                slug={person.current_group_slug}
                short={displayGroupShort(person.current_group_short)}
                color={person.current_group_color}
                size="sm"
              />
            )}
            {person.current_constituency && (
              <span>· {person.current_constituency}</span>
            )}
            {person.birth_year && (
              <span>
                · {t('born_in')} {person.birth_year}
              </span>
            )}
          </div>
          {person.role_title && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                marginTop: 10,
                padding: '6px 10px',
                background: 'var(--accent-soft)',
                color: 'var(--accent-2)',
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: '0.01em',
              }}
              title={
                person.role_kind === 'govern'
                  ? "Càrrec executiu — per convenció parlamentària no vota en la majoria de plens"
                  : person.role_kind === 'mesa'
                    ? "Membre de la Mesa del Congrés — el seu rol modifica el patró de vot"
                    : undefined
              }
            >
              {person.role_title}
            </div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 14, alignItems: 'center' }}>
            {person.biography_url ? (
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
            ) : (
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

      <PersonBio
        bioText={person.bio_text}
        commissions={person.commissions}
        labels={{
          eyebrow: t('bio_eyebrow'),
          sectionAria: t('bio_section_aria'),
          sourceNote: t('bio_source_note'),
          commissionsTitle: t('commissions_title'),
          commissionsEmpty: t('commissions_empty'),
        }}
      />

      <section style={{ paddingTop: 28 }}>
        <div className="eyebrow" style={{ marginBottom: 6 }}>
          {t('mandates_title')}
        </div>
        {mandates.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>{t('no_mandates')}</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {mandates.map((m) => (
              <li
                key={m.id}
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
                  {t('mandate_dates', {
                    from: new Date(m.start_date).toLocaleDateString(locale),
                    to: m.end_date ? new Date(m.end_date).toLocaleDateString(locale) : t('mandate_current'),
                  })}
                </span>
                {m.constituency && (
                  <span style={{ color: 'var(--ink-3)' }}>
                    {t('constituency')}: {m.constituency}
                  </span>
                )}
                {m.electoral_list_party && (
                  <span style={{ color: 'var(--ink-3)' }}>
                    {t('list')}: {m.electoral_list_party}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ paddingTop: 28 }}>
        <h2 className="h-title">{t('vote_by_topic_title')}</h2>
        <p
          style={{
            fontSize: 12,
            color: 'var(--ink-3)',
            marginTop: 0,
            marginBottom: 12,
            maxWidth: 760,
          }}
        >
          {t('vote_by_topic_subtitle')}
        </p>
        <TopicBars
          rows={topicStats}
          emptyHint={t('vote_by_topic_empty_hint')}
        />
      </section>

      <style>{`
        @media (max-width: 720px) {
          .person-header { grid-template-columns: 1fr !important; gap: 16px !important; }
          .person-header img,
          .person-header > div:first-child { width: 100% !important; max-width: 192px; }
        }
      `}</style>
    </article>
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
    <section
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        borderBottom: '1px solid var(--rule)',
      }}
    >
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
          <GlossaryTerm term="Dissidència">Dissidència</GlossaryTerm>
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
}: {
  bioText: string | null;
  commissions: string[] | null;
  labels: {
    eyebrow: string;
    sectionAria: string;
    sourceNote: string;
    commissionsTitle: string;
    commissionsEmpty: string;
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
                    {c}
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
